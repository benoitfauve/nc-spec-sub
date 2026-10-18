import { describe, expect, it } from "vitest";
import { SlidingQuantile } from "../src/quantile.ts";
import { spectralSubtract, frameSetup } from "../src/specsub.ts";
import { generateSynthetic } from "../src/signals.ts";

describe("Float32 median window", () => {
  // The window is stored in single precision (see sliding-median.md): the median it
  // returns must be the double-precision median rounded to single precision.
  it("picks the same value as a double-precision sort", () => {
    const bins = 129;
    const cap = 31;
    const q = new SlidingQuantile(bins, cap);
    const out = new Float32Array(bins);
    const frames: Float64Array[] = [];
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let f = 0; f < 200; f++) {
      // power-like values over a wide dynamic range, many close to each other
      const frame = Float64Array.from({ length: bins }, () => 10 ** (-8 * rand()) * (1 + 1e-7 * rand()));
      frames.push(frame);
      q.push(frame);
      q.query(0.5, out);
      const win = frames.slice(-cap);
      for (let k = 0; k < bins; k++) {
        const sorted = win.map((fr) => fr[k]).sort((a, b) => a - b);
        expect(out[k]).toBe(Math.fround(sorted[Math.floor(0.5 * sorted.length)]));
      }
    }
  });
});

describe("spectralSubtract", () => {
  it("removes most of a stationary tone", () => {
    const fs = 8000;
    const x = Float32Array.from({ length: 3 * fs }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / fs));
    const y = spectralSubtract(x, fs, { alpha: 2, beta: 0.001, warmup: "zeros" });
    const { histLen, hop } = frameSetup(fs);
    const start = 2 * histLen * hop; // after the median window has filled up
    let ex = 0;
    let ey = 0;
    for (let i = start; i < x.length - 256; i++) {
      ex += x[i] * x[i];
      ey += y[i] * y[i];
    }
    expect(10 * Math.log10(ey / ex)).toBeLessThan(-20);
  });

  it("keeps the signal when alpha is 0", () => {
    const fs = 8000;
    const x = generateSynthetic("white", fs, 1, 5);
    const y = spectralSubtract(x, fs, { alpha: 0 });
    for (let i = 256; i < x.length - 256; i++) expect(y[i]).toBeCloseTo(x[i], 6);
  });
});
