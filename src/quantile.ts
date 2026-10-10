// Running quantile over the last `capacity` frames, independently for each bin.
//
// Every bin keeps its window sorted, so a new frame costs one removal and one
// insertion per bin instead of a full sort (the "efficient" update of Evans, Mason,
// Fauve, DSP 2002). See sliding-median.md. Compare with LeetCode 480 "Sliding Window Median".
//
// Memory is allocated once; push() and query() never allocate.

export class SlidingQuantile {
  readonly bins: number;
  readonly capacity: number;
  private readonly history: Float64Array; // ring buffer [capacity][bins], arrival order
  private readonly sorted: Float64Array; // [bins][capacity], first `count` entries of each bin sorted
  private head = 0; // next ring slot to write (holds the oldest frame once full)
  private count = 0;

  constructor(bins: number, capacity: number) {
    if (capacity < 1) throw new Error("capacity must be >= 1");
    this.bins = bins;
    this.capacity = capacity;
    this.history = new Float64Array(bins * capacity);
    this.sorted = new Float64Array(bins * capacity);
  }

  get size(): number {
    return this.count;
  }

  push(frame: ArrayLike<number>): void {
    const { bins, capacity, history, sorted } = this;
    const full = this.count === capacity;
    for (let k = 0; k < bins; k++) {
      const base = k * capacity;
      let len = this.count;
      if (full) {
        // Remove the oldest value: find it, shift the tail left over it.
        const old = history[this.head * bins + k];
        const idx = lowerBound(sorted, base, base + len, old);
        sorted.copyWithin(idx, idx + 1, base + len);
        len--;
      }
      // Insert the new value: find its slot, shift the tail right, write it.
      const v = frame[k];
      const pos = upperBound(sorted, base, base + len, v);
      sorted.copyWithin(pos + 1, pos, base + len);
      sorted[pos] = v;
      history[this.head * bins + k] = v;
    }
    this.head = (this.head + 1) % capacity;
    if (!full) this.count++;
  }

  /** Writes the q-quantile (0..1) of each bin into `out`. Zeros if empty. */
  query(q: number, out: Float64Array): void {
    const { bins, capacity, sorted } = this;
    if (this.count === 0) {
      out.fill(0, 0, bins);
      return;
    }
    const idx = Math.min(this.count - 1, Math.max(0, Math.floor(q * this.count)));
    for (let k = 0; k < bins; k++) out[k] = sorted[k * capacity + idx];
  }
}

// First index in a[lo, hi) with a[i] >= v.
function lowerBound(a: Float64Array, lo: number, hi: number, v: number): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// First index in a[lo, hi) with a[i] > v.
function upperBound(a: Float64Array, lo: number, hi: number, v: number): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
