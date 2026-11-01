import type { Biquad } from "./iir-design.ts";

/**
 * Reader for the 2001 coefficient files (`Filters/{freq}_{order}_{dB}_{B|C}{H|L}.filt`).
 * One line per section: `index a1 a2 b0 b1 b2` with a0 = 1.
 */
export function parseFilt(text: string): Biquad[] {
  const nums = text
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((v) => Number.isFinite(v));
  const sections: Biquad[] = [];
  for (let i = 0; i + 5 < nums.length; i += 6) {
    sections.push({ a1: nums[i + 1], a2: nums[i + 2], b0: nums[i + 3], b1: nums[i + 4], b2: nums[i + 5] });
  }
  return sections;
}

/**
 * Applies the 2001 gain normalisation, b /= 4 / (1 - a1 + a2): unity gain at Nyquist,
 * which is only correct for high-pass sections (see review, bug B4).
 */
export function normaliseLegacy(sections: Biquad[]): Biquad[] {
  return sections.map((s) => {
    const k = 4 / (1 - s.a1 + s.a2);
    return { ...s, b0: s.b0 / k, b1: s.b1 / k, b2: s.b2 / k };
  });
}

export interface FiltName {
  cutoffHz: number;
  order: number;
  db: string;
  kind: "butter" | "cheby1";
  response: "lowpass" | "highpass";
}

/** Parses `600_2_0.1_CH` (with or without `.filt`). Returns null for names that do not match. */
export function parseFiltName(name: string): FiltName | null {
  const m = /^(\d+)_(\d+)_([\d.]+)_([BC])([HL])(?:\.filt)?$/.exec(name.split("/").pop() ?? "");
  if (!m) return null;
  return {
    cutoffHz: Number(m[1]),
    order: Number(m[2]),
    db: m[3],
    kind: m[4] === "B" ? "butter" : "cheby1",
    response: m[5] === "H" ? "highpass" : "lowpass",
  };
}
