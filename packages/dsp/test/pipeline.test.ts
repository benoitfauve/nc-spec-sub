import { describe, expect, it } from "vitest";
import { Nlss, defaultNlssParams, type NlssParams } from "../src/nlss.ts";
import { Pipeline, softClip } from "../src/pipeline.ts";
import { defaultConfig, mergeConfig, presetConfig, presets, setByPath, type PresetName } from "../src/config.ts";
import { generateSynthetic, mixAtSnr, snrDb } from "../src/signals.ts";

const params = (p: Partial<NlssParams>): NlssParams => ({ ...defaultNlssParams, ...p });

const framings: [string, Partial<NlssParams>][] = [
  ["sqrt-Hann, 50% overlap", { window: "sqrtHann", overlap: 0.5 }],
  ["rectangular, 50% overlap", { window: "rectangular", overlap: 0.5 }],
  ["rectangular blocks, 2 estimates", { window: "rectangular", overlap: 0, estimatesPerBlock: 2 }],
  ["sqrt-Hann, 50% overlap, 3 estimates", { window: "sqrtHann", overlap: 0.5, estimatesPerBlock: 3 }],
];

function runNlss(nlss: Nlss, x: Float32Array, block = 128): Float32Array {
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += block) {
    const end = Math.min(x.length, i + block);
    nlss.process(x.subarray(i, end), y.subarray(i, end), end - i);
  }
  return y;
}

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
}

describe("NLSS", () => {
  for (const [name, framing] of framings) {
    it(`${name}: with alpha = 0 it is a pure delay of one frame`, () => {
      const nlss = new Nlss(
        8000,
        params({ ...framing, alpha: 0, beta: 0, smoothEstimate: false, medianFilter: false }),
      );
      expect(nlss.frameSize).toBe(256);
      const x = generateSynthetic("pink", 8000, 0.5, 11);
      const y = runNlss(nlss, x, 100);
      const d = nlss.latency;
      expect(d).toBe(256);
      for (let i = d + 300; i < x.length; i += 13) expect(y[i]).toBeCloseTo(x[i - d], 5);
    });
  }

  it("block size does not change the result", () => {
    const p = params({ alpha: 2, beta: 0.01 });
    const x = mixAtSnr(generateSynthetic("pulses", 8000, 2), generateSynthetic("white", 8000, 2, 5), 5);
    const a = runNlss(new Nlss(8000, p), x, 128);
    const b = runNlss(new Nlss(8000, p), x, 37);
    for (let i = 0; i < x.length; i++) expect(b[i]).toBeCloseTo(a[i], 6);
  });

  for (const [name, framing] of framings) {
    it(`${name}: attenuates stationary noise by more than 8 dB`, () => {
      const nlss = new Nlss(8000, params({ ...framing, alpha: 2, beta: 0.001, intervalS: 0.5 }));
      const noise = generateSynthetic("white", 8000, 4, 9);
      const y = runNlss(nlss, noise);
      const half = noise.length / 2;
      const reduction = 20 * Math.log10(rms(noise, half) / rms(y, half));
      expect(reduction).toBeGreaterThan(8);
    });
  }

  it("improves SNR on speech-like bursts in white noise", () => {
    const clean = generateSynthetic("pulses", 8000, 6);
    const noisy = mixAtSnr(clean, generateSynthetic("white", 8000, 6, 4), 0);
    const p = new Pipeline(8000, presetConfig("listening"));
    const out = p.processAligned(noisy);
    const skip = 8000; // let the estimator settle
    const before = snrDb(clean.subarray(skip), noisy.subarray(skip));
    const after = snrDb(clean.subarray(skip), out.subarray(skip));
    expect(after).toBeGreaterThan(before + 3);
  });

  it("the 2001 quantile vector size matches the dialog formula", () => {
    // 2001: sizeq = int(ne * te / 0.032 + 1); ne = 2, te = 1.0 -> 63
    const nlss = new Nlss(8000, params({ window: "rectangular", overlap: 0, estimatesPerBlock: 2, intervalS: 1 }));
    expect(nlss.estimatorCapacity).toBe(63);
  });

  it("a tapered window without overlap falls back to rectangular blocks", () => {
    const p = params({ window: "sqrtHann", overlap: 0, alpha: 2, beta: 0.01 });
    const x = mixAtSnr(generateSynthetic("pulses", 8000, 1), generateSynthetic("white", 8000, 1, 5), 5);
    const a = runNlss(new Nlss(8000, p), x);
    const b = runNlss(new Nlss(8000, { ...p, window: "rectangular" }), x);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe("Pipeline", () => {
  it("bypass is the identity", () => {
    const cfg = { ...defaultConfig(), bypass: true };
    const p = new Pipeline(8000, cfg);
    const x = generateSynthetic("pink", 8000, 0.2);
    expect(Array.from(p.processAll(x, 128))).toEqual(Array.from(x));
  });

  it("all off with gain 1 and no limiter is the identity", () => {
    const cfg = presetConfig("legacy-2001"); // NLSS, filters and noise off
    const p = new Pipeline(8000, cfg);
    const x = generateSynthetic("pink", 8000, 0.2);
    const y = p.processAll(x, 128);
    for (let i = 0; i < x.length; i++) expect(y[i]).toBeCloseTo(x[i], 7);
  });

  it("the limiter keeps the output within [-1, 1]", () => {
    const cfg = mergeConfig(presetConfig("legacy-2001"), { gain: 3, limiter: true });
    const y = new Pipeline(8000, cfg).processAll(generateSynthetic("a440", 8000, 0.2));
    expect(Math.max(...Array.from(y).map(Math.abs))).toBeLessThanOrEqual(1);
    expect(softClip(0.5)).toBe(0.5);
    expect(softClip(5)).toBeLessThanOrEqual(1);
  });

  it("noise injection loops the clip at the given level", () => {
    const cfg = mergeConfig(presetConfig("legacy-2001"), { noise: { enabled: true, level: 0.5 } });
    const p = new Pipeline(8000, cfg);
    p.setNoise(Float32Array.from([1, -1, 0.5]));
    const y = p.processAll(new Float32Array(7), 4);
    expect(Array.from(y)).toEqual([0.5, -0.5, 0.25, 0.5, -0.5, 0.25, 0.5]);
  });

  it("invalid filter specs are reported and bypassed", () => {
    const cfg = mergeConfig(presetConfig("legacy-2001"), {
      filters: [{ enabled: true, cutoffHz: 0 }, { enabled: true }],
    });
    const p = new Pipeline(8000, cfg);
    expect(p.getFilterStatus()).toEqual(["invalid", "ok"]);
  });

  it("presets are valid and survive a JSON round trip", () => {
    for (const name of Object.keys(presets) as PresetName[]) {
      const c = presetConfig(name);
      expect(mergeConfig(defaultConfig(), JSON.parse(JSON.stringify(c)))).toEqual(c);
      expect(() => new Pipeline(16000, c)).not.toThrow();
    }
  });

  it("settings saved with the old framing field are translated", () => {
    const old = mergeConfig(defaultConfig(), { nlss: { framing: "legacy2001", estimatesPerBlock: 3 } });
    expect(old.nlss).toMatchObject({ window: "rectangular", overlap: 0, estimatesPerBlock: 3 });
    const ola = mergeConfig(presetConfig("legacy-2001"), { nlss: { framing: "modern", estimatesPerBlock: 2 } });
    expect(ola.nlss).toMatchObject({ window: "sqrtHann", overlap: 0.5, estimatesPerBlock: 1 });
  });

  it("setByPath parses values and rejects unknown keys", () => {
    let c = defaultConfig();
    c = setByPath(c, "nlss.alpha=2.5");
    c = setByPath(c, "filters.1.enabled=true");
    c = setByPath(c, "noise.clip=musan/wind");
    expect(c.nlss.alpha).toBe(2.5);
    expect(c.filters[1].enabled).toBe(true);
    expect(c.noise.clip).toBe("musan/wind");
    expect(() => setByPath(c, "nlss.nope=1")).toThrow();
    expect(() => setByPath(c, "nlss.alpha=abc")).toThrow();
  });
});
