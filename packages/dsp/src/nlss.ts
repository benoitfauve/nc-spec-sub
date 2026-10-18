import { FFT, nearestPow2 } from "./fft.ts";
import { SlidingQuantile } from "./quantile.ts";
import { rectangular, sqrtHann } from "./window.ts";

/**
 * Analysis and synthesis window. "sqrtHann" needs overlap to reconstruct the input,
 * so without overlap the frames are always rectangular.
 */
export type NlssWindow = "sqrtHann" | "rectangular";

/** Frame overlap: 0.5 is 50% overlap-add (hop N/2), 0 is contiguous blocks (hop N). */
export type NlssOverlap = 0 | 0.5;

export interface NlssParams {
  window: NlssWindow;
  overlap: NlssOverlap;
  /** Frame length in ms, rounded to a power of two in samples (32 ms gives 256 at 8 kHz). */
  frameMs: number;
  /** Length of the noise estimation interval in seconds. */
  intervalS: number;
  /**
   * Noise estimates per hop, 1 to 4 (shift 100%, 50%, 33%, 25% of the hop). Extra
   * estimates come from windows that end inside the hop; only the last one is output.
   */
  estimatesPerBlock: number;
  /** Quantile of the sorted spectra used as noise estimate (0.5 = median). */
  quantile: number;
  /** Over-subtraction factor (estimation factor, the paper's noise scalar). */
  alpha: number;
  /** Spectral floor, as a fraction of the noisy power. */
  beta: number;
  /** Smooth the noise estimate across frequency (3-bin average) before subtraction. */
  smoothEstimate: boolean;
  /** Median filter the processed magnitude across frequency (3 bins). */
  medianFilter: boolean;
}

export const defaultNlssParams: NlssParams = {
  window: "sqrtHann",
  overlap: 0.5,
  frameMs: 32,
  intervalS: 0.5,
  estimatesPerBlock: 1,
  quantile: 0.5,
  alpha: 1,
  beta: 0.02,
  smoothEstimate: true,
  medianFilter: true,
};

/** Parameters that require the analysis state to be rebuilt when they change. */
export function nlssNeedsRebuild(a: NlssParams, b: NlssParams): boolean {
  return (
    effectiveWindow(a) !== effectiveWindow(b) ||
    a.overlap !== b.overlap ||
    a.frameMs !== b.frameMs ||
    a.intervalS !== b.intervalS ||
    a.estimatesPerBlock !== b.estimatesPerBlock
  );
}

/** The window actually used: tapered windows only with overlap. */
export function effectiveWindow(p: NlssParams): NlssWindow {
  return p.overlap > 0 ? p.window : "rectangular";
}

/**
 * Non-linear spectral subtraction with quantile-based noise estimation, streaming.
 * Latency is exactly one frame (`frameSize` samples) for every framing.
 * No allocation after construction.
 */
export class Nlss {
  readonly sampleRate: number;
  readonly frameSize: number;
  readonly hop: number;
  readonly bins: number;
  params: NlssParams;

  private readonly fft: FFT;
  private readonly window: Float32Array;
  private readonly olaScale: number;
  private readonly quantile: SlidingQuantile;
  /** History of the last 2 frames of input (legacy needs the previous block too). */
  private readonly history: Float32Array;
  private histPos = 0; // next write index in the ring; also the index of the oldest sample
  private sinceFrame = 0;
  private readonly outAcc: Float32Array;
  private readonly outQueue: Float32Array;
  private queuePos = 0;

  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly mag: Float32Array;
  private readonly est: Float32Array;
  private readonly tmp: Float32Array;
  private readonly proc: Float32Array;
  /** Latest noise estimate (magnitude per bin), for display. */
  readonly noiseEstimate: Float32Array;
  /** Latest noisy magnitude spectrum, for display (same scale as noiseEstimate). */
  readonly inputSpectrum: Float32Array;

  constructor(sampleRate: number, params: NlssParams) {
    this.sampleRate = sampleRate;
    this.params = { ...params };
    this.frameSize = Math.max(32, nearestPow2((params.frameMs / 1000) * sampleRate));
    const n = this.frameSize;
    this.hop = params.overlap > 0 ? n / 2 : n;
    this.bins = n / 2 + 1;
    this.fft = new FFT(n);
    this.window = effectiveWindow(params) === "sqrtHann" ? sqrtHann(n) : rectangular(n);
    // Overlap-add gain of analysis x synthesis windows, constant over time for these
    // windows: sum of w^2 spread over one hop (1 for sqrt-Hann at 50%, 2 for rectangular at 50%).
    let w2 = 0;
    for (let j = 0; j < n; j++) w2 += this.window[j] * this.window[j];
    this.olaScale = this.hop / w2;

    // 2001: sizeq = int(ne * te / 0.032 + 1), with 0.032 = block duration (the hop)
    const hopPeriod = this.hop / sampleRate;
    const ne = clampEstimates(params.estimatesPerBlock);
    const capacity = Math.max(1, Math.floor((ne * params.intervalS) / hopPeriod + 1));
    this.quantile = new SlidingQuantile(this.bins, capacity);

    this.history = new Float32Array(2 * n);
    this.outAcc = new Float32Array(n);
    this.outQueue = new Float32Array(this.hop);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.mag = new Float32Array(this.bins);
    this.est = new Float32Array(this.bins);
    this.tmp = new Float32Array(this.bins);
    this.proc = new Float32Array(this.bins);
    this.noiseEstimate = new Float32Array(this.bins);
    this.inputSpectrum = new Float32Array(this.bins);
  }

  get latency(): number {
    return this.frameSize;
  }

  get estimatorCapacity(): number {
    return this.quantile.capacity;
  }

  /** Updates parameters that do not need a rebuild (alpha, beta, quantile, options). */
  setParams(p: NlssParams): void {
    this.params = { ...p };
  }

  reset(): void {
    this.history.fill(0);
    this.histPos = 0;
    this.outAcc.fill(0);
    this.outQueue.fill(0);
    this.queuePos = 0;
    this.sinceFrame = 0;
    this.quantile.reset();
  }

  /** Processes `n` samples from `input` into `output` (may be the same buffer). */
  process(input: Float32Array, output: Float32Array, n = input.length): void {
    const N = this.frameSize;
    const H = this.hop;
    const hist = this.history;
    const L = 2 * N;
    for (let i = 0; i < n; i++) {
      // ring of the last 2N samples
      hist[this.histPos] = input[i];
      this.histPos = this.histPos + 1 === L ? 0 : this.histPos + 1;
      output[i] = this.outQueue[this.queuePos++];
      if (++this.sinceFrame === H) {
        this.sinceFrame = 0;
        this.processFrame();
        // the first hop samples of the accumulator are complete
        this.outQueue.set(this.outAcc.subarray(0, H));
        this.outAcc.copyWithin(0, H);
        this.outAcc.fill(0, N - H);
        this.queuePos = 0;
      }
    }
  }

  private analyse(offset: number): void {
    // Windowed frame starting `offset` samples after the oldest sample of the 2N history
    // (offset N = the newest N samples) into re/im; magnitude into mag.
    const N = this.frameSize;
    const L = 2 * N;
    const { re, im, window, history } = this;
    let idx = (this.histPos + offset) % L;
    for (let j = 0; j < N; j++) {
      re[j] = history[idx] * window[j];
      im[j] = 0;
      if (++idx === L) idx = 0;
    }
    this.fft.forward(re, im);
    for (let k = 0; k < this.bins; k++) this.mag[k] = Math.hypot(re[k], im[k]);
  }

  private processFrame(): void {
    const N = this.frameSize;
    const H = this.hop;
    const p = this.params;
    // Estimation windows ending at j*H/ne inside the last hop (as in 2001, where the hop is
    // the whole block); the last one (j = ne) is the newest frame, which is then processed.
    const ne = clampEstimates(p.estimatesPerBlock);
    for (let j = 1; j <= ne; j++) {
      this.analyse(N - H + Math.floor((j * H) / ne));
      this.quantile.push(this.mag);
    }
    this.quantile.query(p.quantile, this.est);
    if (p.smoothEstimate) smooth3(this.est, this.tmp, this.bins);
    this.noiseEstimate.set(this.est);
    this.inputSpectrum.set(this.mag);

    // Power spectral subtraction with spectral floor (Berouti), noisy phase kept.
    const { mag, est, proc, re, im } = this;
    for (let k = 0; k < this.bins; k++) {
      const px = mag[k] * mag[k];
      const pn = est[k] * est[k];
      const diff = px - p.alpha * pn;
      const floor = p.beta * px;
      proc[k] = Math.sqrt(diff > floor ? diff : floor);
    }
    if (p.medianFilter) median3(proc, this.tmp, this.bins);
    for (let k = 0; k < this.bins; k++) {
      const g = mag[k] > 1e-12 ? proc[k] / mag[k] : 0;
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < N / 2) {
        // keep Hermitian symmetry so the inverse is real
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
    this.fft.inverse(re, im);
    const w = this.window;
    const acc = this.outAcc;
    const s = this.olaScale;
    for (let j = 0; j < N; j++) acc[j] += re[j] * w[j] * s;
  }
}

function clampEstimates(ne: number): number {
  return Math.max(1, Math.min(4, Math.round(ne)));
}

function smooth3(a: Float32Array, tmp: Float32Array, n: number): void {
  tmp.set(a.subarray(0, n));
  for (let k = 0; k < n; k++) {
    const l = tmp[k > 0 ? k - 1 : k];
    const r = tmp[k < n - 1 ? k + 1 : k];
    a[k] = (l + tmp[k] + r) / 3;
  }
}

function median3(a: Float32Array, tmp: Float32Array, n: number): void {
  tmp.set(a.subarray(0, n));
  for (let k = 1; k < n - 1; k++) {
    const x = tmp[k - 1];
    const y = tmp[k];
    const z = tmp[k + 1];
    a[k] = Math.max(Math.min(x, y), Math.min(Math.max(x, y), z));
  }
}
