import { FFT } from "./fft.ts";
import { sqrtHann } from "./window.ts";

/**
 * Keeps the last `size` samples of a signal and computes a magnitude spectrum on
 * demand, with the same window and scale as the NLSS analysis, so that input, output
 * and noise estimate can be plotted on one axis. Also tracks peak and RMS levels.
 */
export class SpectrumMonitor {
  readonly size: number;
  private readonly ring: Float32Array;
  private pos = 0;
  private readonly fft: FFT;
  private readonly window: Float32Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private sumSq = 0;
  private count = 0;
  private peakAbs = 0;

  constructor(size: number) {
    this.size = size;
    this.ring = new Float32Array(size);
    this.fft = new FFT(size);
    this.window = sqrtHann(size);
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
  }

  push(buf: Float32Array, n = buf.length): void {
    for (let i = 0; i < n; i++) {
      const v = buf[i];
      this.ring[this.pos] = v;
      this.pos = this.pos + 1 === this.size ? 0 : this.pos + 1;
      this.sumSq += v * v;
      const a = Math.abs(v);
      if (a > this.peakAbs) this.peakAbs = a;
    }
    this.count += n;
  }

  /** Magnitude spectrum (size/2 + 1 bins) of the most recent `size` samples. */
  spectrum(out: Float32Array): void {
    const { size, ring, window, re, im } = this;
    let idx = this.pos;
    for (let j = 0; j < size; j++) {
      re[j] = ring[idx] * window[j];
      im[j] = 0;
      if (++idx === size) idx = 0;
    }
    this.fft.forward(re, im);
    for (let k = 0; k <= size / 2; k++) out[k] = Math.hypot(re[k], im[k]);
  }

  /** RMS and peak since the last call, then resets the accumulators. */
  takeLevels(): { rms: number; peak: number } {
    const rms = this.count ? Math.sqrt(this.sumSq / this.count) : 0;
    const peak = this.peakAbs;
    this.sumSq = 0;
    this.count = 0;
    this.peakAbs = 0;
    return { rms, peak };
  }
}
