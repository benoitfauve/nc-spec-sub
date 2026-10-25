// oxlint-disable-next-line typescript/triple-slash-reference -- AudioWorkletGlobalScope globals, not a module
/// <reference path="./worklet-globals.d.ts" />
/**
 * AudioWorklet processor: runs the shared DSP Pipeline on 128-frame quanta.
 * Loaded through Vite's `?worker&url`, so it is bundled with @ncspec/dsp.
 */
import { defaultConfig, Pipeline, type PipelineConfig } from "@ncspec/dsp";
import { PROCESSOR_NAME, type FromWorklet, type Stats, type ToWorklet } from "./protocol.ts";

class NcspecProcessor extends AudioWorkletProcessor {
  private pipeline: Pipeline;
  private recording = false;
  private sinceStats = 0;
  private readonly statsEvery: number;
  private silence = new Float32Array(128);

  constructor(options: { processorOptions?: { config?: PipelineConfig } }) {
    super();
    this.pipeline = new Pipeline(sampleRate, options.processorOptions?.config ?? defaultConfig());
    this.statsEvery = Math.round(sampleRate / 20);
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => {
      const msg = e.data;
      switch (msg.type) {
        case "config":
          this.pipeline.setConfig(msg.config);
          break;
        case "noise":
          this.pipeline.setNoise(msg.buffer);
          break;
        case "record":
          this.recording = msg.on;
          break;
        case "reset":
          this.pipeline.reset();
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const n = out[0].length;
    let input = inputs[0]?.[0];
    if (!input || input.length !== n) {
      if (this.silence.length !== n) this.silence = new Float32Array(n);
      input = this.silence;
    }
    this.pipeline.process(input, out[0]);
    for (let ch = 1; ch < out.length; ch++) out[ch].set(out[0]);

    if (this.recording) {
      const chunk = out[0].slice();
      this.post({ type: "chunk", samples: chunk }, [chunk.buffer]);
    }
    this.sinceStats += n;
    if (this.sinceStats >= this.statsEvery) {
      this.sinceStats = 0;
      this.postStats();
    }
    return true;
  }

  private postStats(): void {
    const p = this.pipeline;
    const bins = p.inMonitor.size / 2 + 1;
    const inSpectrum = new Float32Array(bins);
    const outSpectrum = new Float32Array(bins);
    p.inMonitor.spectrum(inSpectrum);
    p.outMonitor.spectrum(outSpectrum);
    const noiseEstimate = p.noiseEstimate.slice();
    const cfg = p.getConfig();
    const stats: Stats = {
      sampleRate,
      frameSize: p.frameSize,
      inSpectrum,
      outSpectrum,
      noiseEstimate,
      nlssEnabled: cfg.nlss.enabled && !cfg.bypass,
      inLevel: p.inMonitor.takeLevels(),
      outLevel: p.outMonitor.takeLevels(),
      clipped: p.clipped,
      filterStatus: p.getFilterStatus(),
      latency: p.latency,
      estimatorCapacity: p.estimatorCapacity,
    };
    p.clipped = 0;
    this.post({ type: "stats", stats }, [inSpectrum.buffer, outSpectrum.buffer, noiseEstimate.buffer]);
  }

  private post(msg: FromWorklet, transfer: ArrayBuffer[]): void {
    this.port.postMessage(msg, transfer);
  }
}

registerProcessor(PROCESSOR_NAME, NcspecProcessor);
