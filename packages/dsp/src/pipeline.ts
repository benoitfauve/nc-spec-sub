import { BiquadCascade } from "./biquad.ts";
import { clampConfig, cloneConfig, defaultConfig, filterSpec, type FilterStageConfig, type PipelineConfig } from "./config.ts";
import { designFilter, FilterDesignError, type Biquad } from "./iir-design.ts";
import { SpectrumMonitor } from "./monitor.ts";
import { Nlss, nlssNeedsRebuild } from "./nlss.ts";

export type FilterStatus = "off" | "ok" | "invalid";

/** Soft limiter: linear up to 0.9, then a tanh knee that never exceeds 1. */
export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= 0.9) return x;
  return Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}

/**
 * The full chain: gain → noise injection → NLSS → filter 1 → filter 2 → limiter.
 * Works on blocks of any size; all buffers are allocated in the constructor or on
 * configuration changes, never in process(), so it can run inside an AudioWorklet.
 */
export class Pipeline {
  readonly sampleRate: number;
  private config: PipelineConfig;
  private nlss: Nlss;
  private readonly filters: [BiquadCascade, BiquadCascade];
  private readonly filterStatus: [FilterStatus, FilterStatus] = ["off", "off"];
  private readonly filterKeys: [string, string] = ["", ""];
  private noise: Float32Array | null = null;
  private noisePos = 0;
  private scratch: Float32Array;
  inMonitor: SpectrumMonitor;
  outMonitor: SpectrumMonitor;
  /** Samples clipped by the limiter (or exceeding full scale without it) since the last read. */
  clipped = 0;

  constructor(sampleRate: number, config: PipelineConfig = defaultConfig(), blockSize = 128) {
    this.sampleRate = sampleRate;
    this.config = clampConfig(cloneConfig(config));
    this.nlss = new Nlss(sampleRate, this.config.nlss);
    this.filters = [new BiquadCascade(), new BiquadCascade()];
    this.scratch = new Float32Array(blockSize);
    this.inMonitor = new SpectrumMonitor(this.nlss.frameSize);
    this.outMonitor = new SpectrumMonitor(this.nlss.frameSize);
    this.updateFilters();
  }

  getConfig(): PipelineConfig {
    return cloneConfig(this.config);
  }

  setConfig(next: PipelineConfig): void {
    const prev = this.config;
    this.config = clampConfig(cloneConfig(next));
    if (nlssNeedsRebuild(prev.nlss, this.config.nlss)) {
      this.nlss = new Nlss(this.sampleRate, this.config.nlss);
      if (this.nlss.frameSize !== this.inMonitor.size) {
        this.inMonitor = new SpectrumMonitor(this.nlss.frameSize);
        this.outMonitor = new SpectrumMonitor(this.nlss.frameSize);
      }
    } else {
      this.nlss.setParams(this.config.nlss);
    }
    this.updateFilters();
  }

  /** Noise clip at this pipeline's sample rate (resample beforehand), or null. */
  setNoise(buffer: Float32Array | null): void {
    this.noise = buffer && buffer.length > 0 ? buffer : null;
    this.noisePos = 0;
  }

  /** Clears all internal state (filters, NLSS, noise position). */
  reset(): void {
    this.filters.forEach((f) => f.reset());
    this.nlss.reset();
    this.noisePos = 0;
  }

  get frameSize(): number {
    return this.nlss.frameSize;
  }

  get noiseEstimate(): Float32Array {
    return this.nlss.noiseEstimate;
  }

  get estimatorCapacity(): number {
    return this.nlss.estimatorCapacity;
  }

  /** Delay in samples introduced by the current configuration. */
  get latency(): number {
    return !this.config.bypass && this.config.nlss.enabled ? this.nlss.latency : 0;
  }

  getFilterStatus(): [FilterStatus, FilterStatus] {
    return [this.filterStatus[0], this.filterStatus[1]];
  }

  /** Designed sections of each filter stage (empty when off or invalid). */
  static design(f: FilterStageConfig, sampleRate: number): { sections: Biquad[]; status: FilterStatus } {
    if (!f.enabled) return { sections: [], status: "off" };
    try {
      return { sections: designFilter(filterSpec(f), sampleRate), status: "ok" };
    } catch (e) {
      if (e instanceof FilterDesignError) return { sections: [], status: "invalid" };
      throw e;
    }
  }

  private updateFilters(): void {
    for (let i = 0; i < 2; i++) {
      const f = this.config.filters[i];
      const key = JSON.stringify(f);
      if (key === this.filterKeys[i]) continue;
      this.filterKeys[i] = key;
      const { sections, status } = Pipeline.design(f, this.sampleRate);
      this.filters[i].setSections(sections);
      this.filterStatus[i] = status;
    }
  }

  /** Processes `input` into `output` (same length; may be the same array). */
  process(input: Float32Array, output: Float32Array): void {
    const n = input.length;
    const c = this.config;
    this.inMonitor.push(input, n);
    if (c.bypass) {
      if (output !== input) output.set(input);
      this.outMonitor.push(output, n);
      return;
    }
    if (this.scratch.length < n) this.scratch = new Float32Array(n); // only when the block size grows
    const buf = this.scratch;

    const g = c.gain;
    for (let i = 0; i < n; i++) buf[i] = input[i] * g;

    if (c.noise.enabled && this.noise) {
      const nz = this.noise;
      const lvl = c.noise.level;
      let p = this.noisePos;
      for (let i = 0; i < n; i++) {
        buf[i] += lvl * nz[p];
        if (++p === nz.length) p = 0;
      }
      this.noisePos = p;
    }

    const view = n === buf.length ? buf : buf.subarray(0, n);
    if (c.nlss.enabled) this.nlss.process(view, view, n);
    if (this.filterStatus[0] === "ok") this.filters[0].process(view, n);
    if (this.filterStatus[1] === "ok") this.filters[1].process(view, n);

    let clipped = 0;
    if (c.limiter) {
      for (let i = 0; i < n; i++) {
        const v = view[i];
        if (Math.abs(v) > 0.9) clipped++;
        output[i] = softClip(v);
      }
    } else {
      for (let i = 0; i < n; i++) {
        const v = view[i];
        if (Math.abs(v) > 1) clipped++;
        output[i] = v;
      }
    }
    this.clipped += clipped;
    this.outMonitor.push(output, n);
  }

  /** Convenience for offline use: processes a whole signal in blocks. */
  processAll(input: Float32Array, blockSize = 1024, onProgress?: (fraction: number) => void): Float32Array {
    const out = new Float32Array(input.length);
    const inBlock = new Float32Array(blockSize);
    const outBlock = new Float32Array(blockSize);
    for (let start = 0; start < input.length; start += blockSize) {
      const len = Math.min(blockSize, input.length - start);
      const src = len === blockSize ? inBlock : new Float32Array(len);
      const dst = len === blockSize ? outBlock : new Float32Array(len);
      src.set(input.subarray(start, start + len));
      this.process(src, dst);
      out.set(dst, start);
      onProgress?.((start + len) / input.length);
    }
    return out;
  }

  /**
   * Offline processing with the latency removed: the input is padded with `latency`
   * zeros and the output is shifted back, so input and output line up sample by sample.
   */
  processAligned(input: Float32Array, blockSize = 1024): Float32Array {
    const lat = this.latency;
    const padded = new Float32Array(input.length + lat);
    padded.set(input);
    return this.processAll(padded, blockSize).subarray(lat);
  }
}
