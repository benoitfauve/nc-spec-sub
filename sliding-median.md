# Sliding median on a sorted window

The noise estimate is, for every frequency bin, the median of that bin's power over
the last 0.5 s (31 frames at 8 kHz). Every 16 ms one frame enters the window and the
oldest one leaves. This note explains how `SlidingQuantile` (`src/quantile.ts`) keeps
that median up to date without sorting the window again on each frame.

## The problem

For one bin, the window holds the last `m` values. On each frame:

1. the oldest value leaves the window,
2. a new value enters,
3. we read the median (or any other quantile).

This is the classic *sliding window median* problem (LeetCode 480). It runs once per
bin, so 129 times per frame for a 256-point FFT.

## Naive approach: sort every time

Copy the `m` values and sort them, then read the middle element.

- Cost per bin and frame: `O(m log m)` comparisons, plus an `O(m)` copy.
- It throws away information: the window was already sorted on the previous frame,
  and only two values changed.

That is what the first draft did, and it is a good reference to test against.

## Idea: keep the window sorted

Since only one value leaves and one enters, keep each bin's window **sorted** at all
times and update it in place:

- **Remove** the oldest value: find it by binary search, then shift everything after
  it one place to the left.
- **Insert** the new value: find its slot by binary search, then shift everything
  after the slot one place to the right, and write the value.
- **Query**: the window is sorted, so the `q`-quantile is the element at index
  `floor(q * count)`. The median is `q = 0.5`.

To know *which* value is the oldest, the class also keeps the frames in arrival order
in a ring buffer (`history`). The sorted copy (`sorted`) is what gets searched and
shifted.

## The two binary searches

Both work on a half-open range `[lo, hi)` of a sorted array.

```ts
// First index with a[i] >= v.
function lowerBound(a, lo, hi, v) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// First index with a[i] > v.
function upperBound(a, lo, hi, v) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
```

The only difference is `<` versus `<=`, which matters when the array holds equal values.

- **Removal uses `lowerBound`.** The oldest value is known to be in the window, so the
  first index with `a[i] >= old` holds a copy of `old`. If there are several equal
  copies it removes the first one, which is fine: equal values are interchangeable.
- **Insertion uses `upperBound`.** The new value goes after any equal values already
  there. `lowerBound` would also give a correct sorted array; `upperBound` just
  moves slightly fewer elements when there are ties.

`(lo + hi) >>> 1` is the midpoint computed as an unsigned shift, so it never goes
negative.

## Worked example

One bin, window size `m = 5`. Values arrived in the order 4, 1, 7, 3, 5, so:

```
history (arrival order): [4, 1, 7, 3, 5]      oldest = 4
sorted:                  [1, 3, 4, 5, 7]      median = sorted[2] = 4
```

A new value `2` arrives.

**Remove 4.** `lowerBound(sorted, 0, 5, 4)` returns 2. Shift `sorted[3..5)` left by one
(`copyWithin(2, 3, 5)`):

```
before: [1, 3, 4, 5, 7]
after:  [1, 3, 5, 7, 7]    length is now 4, the last slot is stale
         └──────────┘
```

**Insert 2.** `upperBound(sorted, 0, 4, 2)` returns 1. Shift `sorted[1..4)` right by one
(`copyWithin(2, 1, 4)`), then write `sorted[1] = 2`:

```
shift:  [1, 3, 3, 5, 7]
write:  [1, 2, 3, 5, 7]
```

**Query.** `floor(0.5 * 5) = 2`, so the median is `sorted[2] = 3`.

Check: the window now holds `{1, 7, 3, 5, 2}`, sorted `1, 2, 3, 5, 7`, median 3.

## Filling up

During the first `m - 1` frames the window is not full yet. Nothing is removed; the
new value is only inserted, and `count` grows by one. The query index uses `count`,
so the quantile is always taken over the values actually present.

## Memory layout

```
history: [capacity][bins]   one row per frame, in arrival order (ring buffer)
sorted:  [bins][capacity]   one sorted window per bin, stored contiguously
```

- `history` is frame-major because a whole frame is written at once, and the oldest
  frame is the row at `head` once the buffer is full.
- `sorted` is bin-major so that each bin's window is one contiguous block. That lets
  the shifts use `copyWithin`, which is a native memory move.
- Both arrays are allocated once in the constructor. `push()` and `query()` never
  allocate, which matters later for real-time audio (no garbage collection pauses in
  the audio thread).

## Cost

Per bin and frame, with `m = 31`:

| | Comparisons | Element moves |
|---|---|---|
| Sort every time | about `m log2 m`, roughly 150 | `m` to copy, plus the sort's own |
| Sorted window | `2 log2 m`, roughly 10 | at most `2 (m - 1)`, as two `copyWithin` calls |

The shifts are `O(m)` in theory, but for a window this small a memory move is very
cheap. Measured on the 15 s `70mph.wav` (8 kHz) for the whole program, FFTs
included: about 99 ms with the plain sort, about 39 ms with the sorted window.

## Why not two heaps?

The textbook LeetCode 480 answer uses a max-heap for the lower half and a min-heap for
the upper half, with lazy deletion for values that leave the window. It is `O(log m)`
per update, but:

- it only gives the median, while the sorted window gives any quantile for free,
  which the full project uses (its `quantile` parameter);
- removing an arbitrary value from a heap needs lazy deletion and a hash map, which
  is more code and more memory;
- with `m` around 30, the sorted array's `O(m)` move is faster in practice.

For a much larger window (thousands of values) an order-statistic tree or a skip list
would win, but that is not the case here.

## Relation to the papers

This is the "efficient" update from Evans, Mason and Fauve, *Efficient real-time noise
estimation without explicit speech, non-speech detection*, DSP 2002, also used in the
2001 real-time demo. The draft stores power in double precision
(`Float64Array`); the full project stores magnitudes as `Float32Array` to halve the
memory. The median gives the same result either way, because squaring does not change
the order of non-negative values.
