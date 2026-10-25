import { writeWav, type PipelineConfig } from "@ncspec/dsp";
import processorUrl from "virtual:ncspec-processor-url";
import OfflineWorker from "./offline-worker.ts?worker";
import type { OfflineRequest, OfflineResponse } from "./offline-worker.ts";
import { PROCESSOR_NAME, type FromWorklet, type Stats, type ToWorklet } from "./protocol.ts";

export interface Clip {
  id: string;
  label: string;
  group: string;
  kind: "speech" | "noise" | "test";
  url: string;
  private: boolean;
}

export type Source = { type: "mic" } | { type: "clip"; id: string } | { type: "file"; file: File };

export async function loadManifest(): Promise<Clip[]> {
  try {
    const res = await fetch("audio/manifest.json");
    if (!res.ok) return [];
    return (await res.json()) as Clip[];
  } catch {
    return [];
  }
}

type StatsListener = (s: Stats) => void;

/**
 * Owns the AudioContext and the processing graph:
 *   source (mic | looped clip | uploaded file) → worklet (Pipeline) → monitor gain → speakers
 * The context is recreated when the sample rate changes.
 */
export class Engine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private monitor: GainNode | null = null;
  private sourceNode: AudioNode | null = null;
  private micStream: MediaStream | null = null;
  private listeners = new Set<StatsListener>();
  private recordChunks: Float32Array[] = [];
  private config: PipelineConfig;
  private noiseBuffer: Float32Array | null = null;
  private noiseId: string | null = null;
  private decodeCache = new Map<string, Float32Array>();
  private clips: Clip[] = [];
  private userNoise = new Map<string, File>();
  private monitorVolume = 0.8;
  private monitorOn = true;
  running = false;
  /** Mono input of the current clip/file source, at the context rate (for offline export). */
  currentInput: { name: string; samples: Float32Array } | null = null;

  constructor(config: PipelineConfig) {
    this.config = structuredClone(config);
  }

  setClips(clips: Clip[]): void {
    this.clips = clips;
  }

  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  onStats(fn: StatsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Creates (or re-creates) the context at `rate`. Must be followed by a user gesture before audio flows. */
  private async ensureContext(rate: number): Promise<AudioContext> {
    if (this.ctx && this.ctx.sampleRate === rate && this.node) return this.ctx;
    await this.closeContext();
    const ctx = new AudioContext({ sampleRate: rate, latencyHint: "interactive" });
    await ctx.audioWorklet.addModule(processorUrl);
    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { config: this.config },
    });
    node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
      const msg = e.data;
      if (msg.type === "stats") this.listeners.forEach((l) => l(msg.stats));
      else if (msg.type === "chunk") this.recordChunks.push(msg.samples);
    };
    const monitor = ctx.createGain();
    monitor.gain.value = this.monitorOn ? this.monitorVolume : 0;
    node.connect(monitor).connect(ctx.destination);
    this.ctx = ctx;
    this.node = node;
    this.monitor = monitor;
    this.decodeCache.clear();
    if (this.noiseId) await this.setNoiseClip(this.noiseId);
    return ctx;
  }

  private async closeContext(): Promise<void> {
    this.disconnectSource();
    if (this.ctx) await this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.node = null;
    this.monitor = null;
  }

  private post(msg: ToWorklet, transfer: Transferable[] = []): void {
    this.node?.port.postMessage(msg, transfer);
  }

  setConfig(config: PipelineConfig): void {
    this.config = structuredClone(config);
    this.post({ type: "config", config: this.config });
  }

  setMonitor(on: boolean, volume: number): void {
    this.monitorOn = on;
    this.monitorVolume = volume;
    if (this.monitor && this.ctx) this.monitor.gain.setTargetAtTime(on ? volume : 0, this.ctx.currentTime, 0.02);
  }

  /** Decodes a clip or file to mono at the context rate (the browser resamples). */
  async decode(key: string, data: () => Promise<ArrayBuffer>, rate: number): Promise<Float32Array> {
    const ctx = await this.ensureContext(rate);
    const cacheKey = `${key}@${ctx.sampleRate}`;
    const hit = this.decodeCache.get(cacheKey);
    if (hit) return hit;
    const audio = await ctx.decodeAudioData(await data());
    const mono = new Float32Array(audio.length);
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const d = audio.getChannelData(ch);
      for (let i = 0; i < mono.length; i++) mono[i] += d[i] / audio.numberOfChannels;
    }
    this.decodeCache.set(cacheKey, mono);
    return mono;
  }

  private clipData(id: string): () => Promise<ArrayBuffer> {
    const clip = this.clips.find((c) => c.id === id);
    if (!clip) throw new Error(`unknown clip ${id}`);
    return async () => {
      const res = await fetch(clip.url);
      if (!res.ok) throw new Error(`could not load ${clip.url}`);
      return res.arrayBuffer();
    };
  }

  /** Registers a user-provided noise file; returns its clip id ("file:<name>"). */
  addNoiseFile(file: File): string {
    const id = `file:${file.name}`;
    this.userNoise.set(id, file);
    return id;
  }

  /** Selects the noise clip injected by the pipeline (null to clear). */
  async setNoiseClip(id: string | null): Promise<void> {
    this.noiseId = id;
    if (!this.ctx) return; // loaded when the context is created
    const userFile = id ? this.userNoise.get(id) : undefined;
    if (!id || (!userFile && !this.clips.some((c) => c.id === id))) {
      this.noiseBuffer = null;
      this.post({ type: "noise", buffer: null });
      return;
    }
    const buf = userFile
      ? await this.decode(
          `${id}:${userFile.size}:${userFile.lastModified}`,
          () => userFile.arrayBuffer(),
          this.ctx.sampleRate,
        )
      : await this.decode(`clip:${id}`, this.clipData(id), this.ctx.sampleRate);
    this.noiseBuffer = buf;
    const copy = buf.slice();
    this.post({ type: "noise", buffer: copy }, [copy.buffer]);
  }

  private disconnectSource(): void {
    if (this.sourceNode) {
      try {
        if (this.sourceNode instanceof AudioBufferSourceNode) this.sourceNode.stop();
      } catch {
        /* already stopped */
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  /** Starts processing from `source` at `rate`. Call from a user gesture (autoplay policy). */
  async start(source: Source, rate: number): Promise<void> {
    const ctx = await this.ensureContext(rate);
    await ctx.resume();
    this.disconnectSource();
    this.post({ type: "reset" });
    if (source.type === "mic") {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access needs HTTPS or localhost.");
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      try {
        this.sourceNode = ctx.createMediaStreamSource(this.micStream);
      } catch (e) {
        this.micStream.getTracks().forEach((t) => t.stop());
        this.micStream = null;
        throw new Error(
          `This browser cannot connect the microphone to a ${rate} Hz context (${(e as Error).message}). ` +
            "Try 48000 Hz, or another browser.",
        );
      }
      this.currentInput = null;
    } else {
      const samples =
        source.type === "clip"
          ? await this.decode(`clip:${source.id}`, this.clipData(source.id), rate)
          : await this.decode(
              `file:${source.file.name}:${source.file.size}:${source.file.lastModified}`,
              () => source.file.arrayBuffer(),
              rate,
            );
      const name = source.type === "clip" ? source.id.split("/").pop()! : source.file.name.replace(/\.[^.]+$/, "");
      this.currentInput = { name, samples };
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start();
      this.sourceNode = src;
    }
    this.sourceNode.connect(this.node!);
    this.running = true;
  }

  async stop(): Promise<void> {
    this.disconnectSource();
    await this.ctx?.suspend();
    this.running = false;
  }

  startRecording(): void {
    this.recordChunks = [];
    this.post({ type: "record", on: true });
  }

  /** Stops recording and returns the processed audio as a WAV file. */
  stopRecording(): Blob | null {
    this.post({ type: "record", on: false });
    const total = this.recordChunks.reduce((n, c) => n + c.length, 0);
    if (!total || !this.ctx) return null;
    const all = new Float32Array(total);
    let o = 0;
    for (const c of this.recordChunks) {
      all.set(c, o);
      o += c.length;
    }
    this.recordChunks = [];
    return new Blob([writeWav(all, this.ctx.sampleRate) as Uint8Array<ArrayBuffer>], { type: "audio/wav" });
  }

  /** Processes the current clip/file offline (Web Worker) and returns a WAV file. */
  processOffline(onProgress: (f: number) => void): Promise<{ blob: Blob; name: string; clipped: number }> {
    const input = this.currentInput;
    const rate = this.ctx?.sampleRate;
    if (!input || !rate) return Promise.reject(new Error("Start a clip or file source first."));
    return new Promise((resolve, reject) => {
      const worker = new OfflineWorker();
      worker.onmessage = (e: MessageEvent<OfflineResponse>) => {
        const msg = e.data;
        if (msg.type === "progress") onProgress(msg.fraction);
        else {
          worker.terminate();
          const blob = new Blob([writeWav(msg.output, rate) as Uint8Array<ArrayBuffer>], { type: "audio/wav" });
          resolve({ blob, name: `${input.name}.processed.wav`, clipped: msg.clipped });
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message));
      };
      const req: OfflineRequest = {
        input: input.samples.slice(),
        noise: this.config.noise.enabled && this.noiseBuffer ? this.noiseBuffer.slice() : null,
        sampleRate: rate,
        config: this.config,
      };
      worker.postMessage(req, [req.input.buffer, ...(req.noise ? [req.noise.buffer] : [])]);
    });
  }
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
