import { describe, expect, it } from "vitest";
import { FFT } from "../src/fft.ts";
import { SlidingQuantile } from "../src/quantile.ts";
import { hann } from "../src/window.ts";
import { readWav, writeWav } from "../src/wav.ts";
import { resample } from "../src/resample.ts";
import { generateSynthetic } from "../src/signals.ts";

describe("FFT", () => {
  it("matches a naive DFT", () => {
    const n = 64;
    const x = generateSynthetic("white", 8000, n / 8000, 7);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    new FFT(n).forward(re, im);
    for (let k = 0; k < n; k++) {
      let sr = 0;
      let si = 0;
      for (let t = 0; t < n; t++) {
        sr += x[t] * Math.cos((-2 * Math.PI * k * t) / n);
        si += x[t] * Math.sin((-2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(sr, 9);
      expect(im[k]).toBeCloseTo(si, 9);
    }
  });

  it("inverse(forward(x)) == x", () => {
    const n = 256;
    const x = generateSynthetic("pink", 8000, n / 8000, 3);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    const fft = new FFT(n);
    fft.forward(re, im);
    fft.inverse(re, im);
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(x[i], 9);
      expect(im[i]).toBeCloseTo(0, 9);
    }
  });

  it("rejects non powers of two", () => {
    expect(() => new FFT(100)).toThrow();
  });
});

describe("periodic Hann", () => {
  it("sums to 1 at 50% overlap", () => {
    const n = 256;
    const w = hann(n);
    for (let i = 0; i < n / 2; i++) expect(w[i] + w[i + n / 2]).toBeCloseTo(1, 6);
  });
});

describe("SlidingQuantile", () => {
  it("matches a brute-force sort over a sliding window", () => {
    const bins = 5;
    const cap = 7;
    const q = new SlidingQuantile(bins, cap);
    const frames: number[][] = [];
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = new Float32Array(bins);
    for (let f = 0; f < 40; f++) {
      // include ties on purpose
      const frame = Array.from({ length: bins }, () => Math.round(rand() * 6));
      frames.push(frame);
      q.push(frame);
      for (const quant of [0, 0.25, 0.5, 0.9]) {
        q.query(quant, out);
        const win = frames.slice(-cap);
        for (let k = 0; k < bins; k++) {
          const sorted = win.map((fr) => fr[k]).sort((a, b) => a - b);
          const idx = Math.min(sorted.length - 1, Math.floor(quant * sorted.length));
          expect(out[k]).toBe(sorted[idx]);
        }
      }
    }
  });
});

describe("WAV", () => {
  it("round-trips 16-bit PCM and float32", () => {
    const x = generateSynthetic("a440", 8000, 0.1);
    const pcm = readWav(writeWav(x, 8000, "pcm16"));
    expect(pcm.sampleRate).toBe(8000);
    expect(pcm.channels[0].length).toBe(x.length);
    for (let i = 0; i < x.length; i++) expect(Math.abs(pcm.channels[0][i] - x[i])).toBeLessThan(1 / 32000);
    const fl = readWav(writeWav([x, x], 16000, "float32"));
    expect(fl.channels.length).toBe(2);
    expect(fl.sampleRate).toBe(16000);
    expect(Array.from(fl.channels[1])).toEqual(Array.from(x));
  });
});

describe("resample", () => {
  it("keeps a low tone and its length ratio", () => {
    const x = generateSynthetic("a440", 16000, 0.5);
    const y = resample(x, 16000, 8000);
    expect(y.length).toBe(4000);
    // compare against a 440 Hz tone at 8 kHz, away from the edges
    for (let i = 200; i < 3800; i += 97) {
      expect(y[i]).toBeCloseTo(0.5 * Math.sin((2 * Math.PI * 440 * i) / 8000), 2);
    }
  });
});
