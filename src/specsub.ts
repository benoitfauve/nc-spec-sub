// Spectral subtraction with a running-median noise estimate
// (no explicit speech / non-speech detection, after Evans & Mason, Eurospeech 2001).

import { fft } from "./fft.ts";

export interface SpecSubOptions {
  alpha: number; // over-subtraction factor applied to the noise power
  beta: number; // spectral floor, as a fraction of the noisy power
  frameMs: number; // analysis frame length (rounded to a power of two in samples)
  medianSec: number; // length of the median history
}

export const defaults: SpecSubOptions = {
  alpha: 2,
  beta: 0.01,
  frameMs: 32,
  medianSec: 0.5,
};

export function spectralSubtract(x: Float64Array, fs: number, opts: Partial<SpecSubOptions> = {}): Float64Array {
  const { alpha, beta, frameMs, medianSec } = { ...defaults, ...opts };

  const n = 1 << Math.round(Math.log2((frameMs / 1000) * fs)); // 256 at 8 kHz
  const hop = n / 2; // 50% overlap: 16 ms at 8 kHz
  const histLen = Math.max(1, Math.round(medianSec / (hop / fs))); // 31 frames at 8 kHz
  const bins = n / 2 + 1;

  // sqrt-periodic-Hann on analysis and synthesis: the product is a Hann window,
  // which sums to 1 at 50% overlap, so overlap-add needs no extra gain.
  const win = Float64Array.from({ length: n }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)));

  const history: Float64Array[] = []; // past power spectra, oldest first
  const noise = new Float64Array(bins);
  const column = new Float64Array(histLen);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const y = new Float64Array(x.length + n);

  for (let start = 0; start + n <= x.length; start += hop) {
    for (let i = 0; i < n; i++) {
      re[i] = x[start + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);

    const power = new Float64Array(bins);
    for (let k = 0; k < bins; k++) power[k] = re[k] * re[k] + im[k] * im[k];

    // Noise estimate: per-bin median of the last histLen frames, current included.
    history.push(power);
    if (history.length > histLen) history.shift();
    const m = history.length;
    for (let k = 0; k < bins; k++) {
      for (let f = 0; f < m; f++) column[f] = history[f][k];
      noise[k] = column.subarray(0, m).sort()[m >> 1];
    }

    // Power subtraction with a floor, applied as a real gain so the noisy phase is kept.
    for (let k = 0; k < bins; k++) {
      const p = power[k];
      const clean = Math.max(p - alpha * noise[k], beta * p);
      const g = p > 0 ? Math.sqrt(clean / p) : 0;
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < n / 2) {
        re[n - k] = re[k]; // keep the spectrum Hermitian so the output is real
        im[n - k] = -im[k];
      }
    }

    fft(re, im, true);
    for (let i = 0; i < n; i++) y[start + i] += re[i] * win[i];
  }

  return y.subarray(0, x.length);
}
