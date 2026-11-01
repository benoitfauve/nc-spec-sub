/**
 * In-place radix-2 complex FFT with precomputed twiddles and bit-reversal table.
 * Sizes must be powers of two. Allocation happens only in the constructor, so the
 * transform is safe to call from an audio thread.
 */
export class FFT {
  readonly size: number;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((2 * Math.PI * i) / size);
    }
    // Bit-reversal permutation (see LeetCode 190, "Reverse Bits").
    const bits = Math.log2(size);
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  /** Forward transform, X[k] = sum x[n] e^{-j 2 pi k n / N}. No scaling. */
  forward(re: Float32Array | Float64Array, im: Float32Array | Float64Array): void {
    this.transform(re, im, -1);
  }

  /** Inverse transform, scaled by 1/N so that inverse(forward(x)) == x. */
  inverse(re: Float32Array | Float64Array, im: Float32Array | Float64Array): void {
    this.transform(re, im, 1);
    const s = 1 / this.size;
    for (let i = 0; i < this.size; i++) {
      re[i] *= s;
      im[i] *= s;
    }
  }

  private transform(re: Float32Array | Float64Array, im: Float32Array | Float64Array, sign: number): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = sign * this.sin[k * step];
          const a = start + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}

/** Smallest power of two >= n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Power of two closest (in log scale) to n. */
export function nearestPow2(n: number): number {
  return 2 ** Math.round(Math.log2(n));
}
