/** Periodic Hann window: sums to 1 at 50% overlap, as required by overlap-add. */
export function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/**
 * Square root of the periodic Hann window. Used for both analysis and synthesis:
 * the product is a Hann window, so 50% overlap-add reconstructs the input exactly.
 */
export function sqrtHann(n: number): Float32Array {
  const w = hann(n);
  for (let i = 0; i < n; i++) w[i] = Math.sqrt(w[i]);
  return w;
}

export function rectangular(n: number): Float32Array {
  return new Float32Array(n).fill(1);
}
