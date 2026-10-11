// Spectral subtraction with a running-median noise estimate
// (no explicit speech / non-speech detection, after Evans & Mason, Eurospeech 2001).

import { fft } from "./fft.ts";
import { SlidingQuantile } from "./quantile.ts";

export interface SpecSubOptions {
  alpha: number; // over-subtraction factor applied to the noise power
  beta: number; // spectral floor, as a fraction of the noisy power
  frameMs: number; // analysis frame length (rounded to a power of two in samples)
  medianSec: number; // length of the median history
  // How the median window starts: "grow" uses only the frames seen so far;
  // "zeros" starts with a window full of zeros, as the 2001 demo did (nlss.cpp).
  warmup: "grow" | "zeros";
}

export const defaults: SpecSubOptions = {
  alpha: 2,
  beta: 0.01,
  frameMs: 32,
  medianSec: 0.5,
  warmup: "grow",
};

export interface FrameSetup {
  n: number; // FFT / frame length in samples
  hop: number; // frame step in samples
  histLen: number; // frames in the median history
  bins: number; // one-sided spectrum size, n / 2 + 1
}

export function frameSetup(fs: number, opts: Partial<SpecSubOptions> = {}): FrameSetup {
  const { frameMs, medianSec } = { ...defaults, ...opts };
  const n = 1 << Math.round(Math.log2((frameMs / 1000) * fs)); // 256 at 8 kHz
  const hop = n / 2; // 50% overlap: 16 ms at 8 kHz
  const histLen = Math.max(1, Math.round(medianSec / (hop / fs))); // 31 frames at 8 kHz
  return { n, hop, histLen, bins: n / 2 + 1 };
}

// Per-frame view of the internals, for inspection (see trace.ts).
// The arrays are reused between frames: copy them if you keep them.
export interface FrameTrace {
  start: number; // first input sample of the frame
  power: Float64Array; // noisy power |X|^2
  noise: Float64Array; // noise estimate N (running median of power)
  gain: Float64Array; // amplitude gain applied to X
}

export function spectralSubtract(
  x: Float64Array,
  fs: number,
  opts: Partial<SpecSubOptions> = {},
  onFrame?: (frame: FrameTrace) => void,
): Float64Array {
  const { alpha, beta, warmup } = { ...defaults, ...opts };
  const { n, hop, histLen, bins } = frameSetup(fs, opts);

  // sqrt-periodic-Hann on analysis and synthesis: the product is a Hann window,
  // which sums to 1 at 50% overlap, so overlap-add needs no extra gain.
  const win = Float64Array.from({ length: n }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)));

  const history = new SlidingQuantile(bins, histLen); // past power spectra, sorted per bin
  if (warmup === "zeros") {
    const silence = new Float64Array(bins);
    for (let i = 0; i < histLen; i++) history.push(silence);
  }
  const power = new Float64Array(bins);
  const noise = new Float64Array(bins);
  const gain = new Float64Array(bins);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const y = new Float64Array(x.length + n);

  for (let start = 0; start + n <= x.length; start += hop) {
    for (let i = 0; i < n; i++) {
      re[i] = x[start + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);

    for (let k = 0; k < bins; k++) power[k] = re[k] * re[k] + im[k] * im[k];

    // Noise estimate: per-bin median of the last histLen frames, current included.
    history.push(power);
    history.query(0.5, noise);

    // Power subtraction with a floor, applied as a real gain so the noisy phase is kept.
    for (let k = 0; k < bins; k++) {
      const p = power[k];
      const clean = Math.max(p - alpha * noise[k], beta * p);
      const g = p > 0 ? Math.sqrt(clean / p) : 0;
      gain[k] = g;
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < n / 2) {
        re[n - k] = re[k]; // keep the spectrum Hermitian so the output is real
        im[n - k] = -im[k];
      }
    }

    onFrame?.({ start, power, noise, gain });

    fft(re, im, true);
    for (let i = 0; i < n; i++) y[start + i] += re[i] * win[i];
  }

  return y.subarray(0, x.length);
}
