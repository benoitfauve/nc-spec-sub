import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { designFilter, isStable, response, FilterDesignError, type Biquad } from "../src/iir-design.ts";
import { BiquadCascade } from "../src/biquad.ts";
import { parseFilt, parseFiltName } from "../src/legacy-filt.ts";

const db = (s: Biquad[], f: number, fs: number) => 20 * Math.log10(response(s, f, fs).mag);

describe("filter design: analytic checks", () => {
  const fs = 8000;
  for (const order of [1, 2, 3, 4, 6, 8, 10]) {
    it(`Butterworth order ${order}: -3 dB at cutoff, unity passband, stable`, () => {
      const lp = designFilter({ kind: "butter", response: "lowpass", cutoffHz: 1000, order }, fs);
      expect(db(lp, 1000, fs)).toBeCloseTo(-3.0103, 3);
      expect(db(lp, 0, fs)).toBeCloseTo(0, 6);
      expect(isStable(lp)).toBe(true);
      const hp = designFilter({ kind: "butter", response: "highpass", cutoffHz: 600, order }, fs);
      expect(db(hp, 600, fs)).toBeCloseTo(-3.0103, 3);
      expect(db(hp, fs / 2, fs)).toBeCloseTo(0, 6);
      expect(isStable(hp)).toBe(true);
    });

    it(`Chebyshev I order ${order}: -ripple at the passband edge, ripple bounded`, () => {
      const rp = 0.5;
      const hp = designFilter({ kind: "cheby1", response: "highpass", cutoffHz: 300, order, rippleDb: rp }, fs);
      expect(db(hp, 300, fs)).toBeCloseTo(-rp, 3);
      for (let f = 320; f < fs / 2; f += 37) {
        const v = db(hp, f, fs);
        expect(v).toBeLessThanOrEqual(1e-6);
        expect(v).toBeGreaterThanOrEqual(-rp - 1e-6);
      }
      expect(isStable(hp)).toBe(true);
    });

    it(`Chebyshev II order ${order}: stopband below -rs`, () => {
      const rs = 40;
      const lp = designFilter({ kind: "cheby2", response: "lowpass", cutoffHz: 1500, order, stopbandDb: rs }, fs);
      expect(db(lp, 0, fs)).toBeCloseTo(0, 5);
      for (let f = 1510; f < fs / 2; f += 41) expect(db(lp, f, fs)).toBeLessThanOrEqual(-rs + 1e-6);
      expect(isStable(lp)).toBe(true);
    });
  }

  it("Butterworth attenuationDb moves the cutoff to the -A dB point", () => {
    const s = designFilter({ kind: "butter", response: "highpass", cutoffHz: 800, order: 6, attenuationDb: 1 }, fs);
    expect(db(s, 800, fs)).toBeCloseTo(-1, 3);
  });

  it("rejects cutoffs outside (0, Nyquist)", () => {
    expect(() => designFilter({ kind: "butter", response: "lowpass", cutoffHz: 0, order: 2 }, fs)).toThrow(FilterDesignError);
    expect(() => designFilter({ kind: "butter", response: "lowpass", cutoffHz: 4000, order: 2 }, fs)).toThrow(FilterDesignError);
  });
});

describe("BiquadCascade", () => {
  it("block processing equals one-shot processing (state carried across blocks)", () => {
    const s = designFilter({ kind: "cheby1", response: "highpass", cutoffHz: 300, order: 10, rippleDb: 0.1 }, 8000);
    const x = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i * 0.37) + 0.3 * Math.cos(i * 1.9));
    const one = x.slice();
    new BiquadCascade(s).process(one);
    const blocks = x.slice();
    const f = new BiquadCascade(s);
    for (let i = 0; i < 1000; i += 128) f.process(blocks.subarray(i, Math.min(1000, i + 128)));
    for (let i = 0; i < 1000; i++) expect(blocks[i]).toBeCloseTo(one[i], 6);
  });
});

// Dev-only: compare with the 1,344 coefficient files of the 2001 filter bank (private, not committed).
const bankDir = process.env.NCSPEC_2001_FILTERS ?? join(import.meta.dirname, "../../../testdata/private/2001/filters");
describe.skipIf(!existsSync(bankDir))("2001 filter bank", () => {
  it("our designs reproduce every .filt file (poles, a1/a2) to 1e-6", () => {
    const files = readdirSync(bankDir).filter((f) => f.endsWith(".filt"));
    let checked = 0;
    const skipped: string[] = [];
    const empty: string[] = [];
    for (const file of files) {
      const name = parseFiltName(file);
      if (!name || !Number.isFinite(Number(name.db))) {
        skipped.push(file);
        continue;
      }
      if (name.cutoffHz <= 0 || name.cutoffHz >= 4000) {
        skipped.push(file);
        continue;
      }
      const legacy = parseFilt(readFileSync(join(bankDir, file), "utf8"));
      if (legacy.length === 0) {
        // 24 files of the 2001 bank are empty (bug B13 in the review)
        empty.push(file);
        continue;
      }
      const ours = designFilter(
        {
          kind: name.kind,
          response: name.response,
          cutoffHz: name.cutoffHz,
          order: name.order,
          rippleDb: Number(name.db),
          attenuationDb: name.kind === "butter" ? Number(name.db) : undefined,
        },
        8000,
      );
      const key = (s: Biquad[]) => s.map((x) => [x.a1, x.a2]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const a = key(legacy);
      const b = key(ours);
      expect(b.length, file).toBe(a.length);
      a.forEach((p, i) => {
        expect(Math.abs(p[0] - b[i][0]), file).toBeLessThan(1e-6);
        expect(Math.abs(p[1] - b[i][1]), file).toBeLessThan(1e-6);
      });
      checked++;
    }
    // 33 files at 0 Hz, 4 at 4000 Hz (Nyquist) and the "x" typo file are not designable
    expect(checked).toBe(1282);
    expect(skipped.length).toBe(38);
    expect(empty.length).toBe(24);
  });
});
