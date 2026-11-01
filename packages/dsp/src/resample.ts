/**
 * Windowed-sinc resampler (Hann window, 16 zero crossings each side). The low-pass
 * cutoff follows the lower of the two rates, so downsampling does not alias.
 * Meant for offline use (noise clips, CLI); O(n * taps).
 */
export function resample(x: Float32Array, fromRate: number, toRate: number, halfWidth = 16): Float32Array {
  if (fromRate === toRate) return x.slice();
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.round(x.length * ratio));
  const out = new Float32Array(outLen);
  const cutoff = Math.min(1, ratio); // relative to the input Nyquist
  const support = halfWidth / cutoff; // in input samples
  for (let i = 0; i < outLen; i++) {
    const t = i / ratio; // position in input samples
    const start = Math.max(0, Math.ceil(t - support));
    const end = Math.min(x.length - 1, Math.floor(t + support));
    let acc = 0;
    let norm = 0;
    for (let j = start; j <= end; j++) {
      const d = (j - t) * cutoff;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / halfWidth);
      const k = sinc * w;
      acc += x[j] * k;
      norm += k;
    }
    out[i] = norm !== 0 ? acc / norm : 0;
  }
  return out;
}
