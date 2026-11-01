/**
 * IIR filter design: analog prototype (zeros, poles, gain), frequency transformation,
 * bilinear transform with pre-warping, then second-order sections (SOS).
 * The steps follow scipy.signal (buttap, cheb1ap, cheb2ap, lp2lp_zpk, lp2hp_zpk,
 * bilinear_zpk, zpk2sos), re-written in TypeScript so the project needs no Python.
 */

export type FilterKind = "butter" | "cheby1" | "cheby2";
export type FilterResponse = "lowpass" | "highpass";

export interface FilterSpec {
  kind: FilterKind;
  response: FilterResponse;
  /** Cutoff in Hz. Butterworth: -3 dB point. Chebyshev I: passband edge (-ripple dB). Chebyshev II: stopband edge. */
  cutoffHz: number;
  /** 1 to 20. */
  order: number;
  /** Chebyshev I passband ripple in dB. */
  rippleDb?: number;
  /**
   * Butterworth only: attenuation at the cutoff, in dB (default 3.0103, the half-power point).
   * The 2001 filter bank used this meaning for its "dB" field (1 or 3 dB).
   */
  attenuationDb?: number;
  /** Chebyshev II stopband attenuation in dB. */
  stopbandDb?: number;
}

/** One second-order section, a0 = 1: H(z) = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2). */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

// ---------------------------------------------------------------- complex helpers

interface C {
  re: number;
  im: number;
}
const c = (re: number, im = 0): C => ({ re, im });
const add = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
const sub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
const mul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const scale = (a: C, s: number): C => c(a.re * s, a.im * s);
const neg = (a: C): C => c(-a.re, -a.im);
const abs = (a: C): number => Math.hypot(a.re, a.im);
const prod = (xs: C[]): C => xs.reduce((acc, x) => mul(acc, x), c(1));

interface Zpk {
  z: C[];
  p: C[];
  k: number;
}

// ---------------------------------------------------------------- analog prototypes

function oddRange(n: number): number[] {
  // scipy: arange(-N+1, N, 2)
  const out: number[] = [];
  for (let m = -n + 1; m < n; m += 2) out.push(m);
  return out;
}

function buttap(n: number): Zpk {
  const p = oddRange(n).map((m) => {
    const t = (Math.PI * m) / (2 * n);
    return c(-Math.cos(t), -Math.sin(t)); // -exp(j t)
  });
  return { z: [], p, k: 1 };
}

function cheb1ap(n: number, rippleDb: number): Zpk {
  const eps = Math.sqrt(10 ** (0.1 * rippleDb) - 1);
  const mu = Math.asinh(1 / eps) / n;
  const p = oddRange(n).map((m) => {
    const theta = (Math.PI * m) / (2 * n);
    // -sinh(mu + j theta)
    return c(-Math.sinh(mu) * Math.cos(theta), -Math.cosh(mu) * Math.sin(theta));
  });
  let k = prod(p.map(neg)).re;
  if (n % 2 === 0) k /= Math.sqrt(1 + eps * eps);
  return { z: [], p, k };
}

function cheb2ap(n: number, stopbandDb: number): Zpk {
  const de = 1 / Math.sqrt(10 ** (0.1 * stopbandDb) - 1);
  const mu = Math.asinh(1 / de) / n;
  const ms: number[] = [];
  if (n % 2 === 1) {
    for (let m = -n + 1; m < 0; m += 2) ms.push(m);
    for (let m = 2; m < n; m += 2) ms.push(m);
  } else {
    ms.push(...oddRange(n));
  }
  const z = ms.map((m) => c(0, 1 / Math.sin((m * Math.PI) / (2 * n))));
  const p = oddRange(n).map((m) => {
    const t = (Math.PI * m) / (2 * n);
    const pr = -Math.cos(t);
    const pi = -Math.sin(t);
    return div(c(1), c(Math.sinh(mu) * pr, Math.cosh(mu) * pi));
  });
  const k = div(prod(p.map(neg)), prod(z.map(neg))).re;
  return { z, p, k };
}

// ---------------------------------------------------------------- transforms

function lp2lp(f: Zpk, wo: number): Zpk {
  const degree = f.p.length - f.z.length;
  return { z: f.z.map((x) => scale(x, wo)), p: f.p.map((x) => scale(x, wo)), k: f.k * wo ** degree };
}

function lp2hp(f: Zpk, wo: number): Zpk {
  const degree = f.p.length - f.z.length;
  const z = f.z.map((x) => div(c(wo), x));
  const p = f.p.map((x) => div(c(wo), x));
  for (let i = 0; i < degree; i++) z.push(c(0));
  const k = f.k * div(prod(f.z.map(neg)), prod(f.p.map(neg))).re;
  return { z, p, k };
}

function bilinear(f: Zpk, fs: number): Zpk {
  const fs2 = c(2 * fs);
  const degree = f.p.length - f.z.length;
  const z = f.z.map((x) => div(add(fs2, x), sub(fs2, x)));
  const p = f.p.map((x) => div(add(fs2, x), sub(fs2, x)));
  for (let i = 0; i < degree; i++) z.push(c(-1));
  const k = f.k * div(prod(f.z.map((x) => sub(fs2, x))), prod(f.p.map((x) => sub(fs2, x)))).re;
  return { z, p, k };
}

// ---------------------------------------------------------------- zpk -> sos

const IM_EPS = 1e-10;

/** Splits roots into conjugate pairs (positive imaginary member kept) and real roots. */
function splitRoots(roots: C[]): { pairs: C[]; reals: number[] } {
  const pairs = roots.filter((r) => r.im > IM_EPS);
  const reals = roots.filter((r) => Math.abs(r.im) <= IM_EPS).map((r) => r.re);
  return { pairs, reals };
}

type Quad = [number, number, number]; // polynomial 1 + c1 z^-1 + c2 z^-2 coefficients [1, c1, c2]

function quadFromPair(r: C): Quad {
  return [1, -2 * r.re, r.re * r.re + r.im * r.im];
}
function quadFromReals(r1: number, r2?: number): Quad {
  if (r2 === undefined) return [1, -r1, 0];
  return [1, -(r1 + r2), r1 * r2];
}

/** Root groups (one quadratic each), with a representative location for pairing. */
function groupRoots(roots: C[]): { quad: Quad; loc: C }[] {
  const { pairs, reals } = splitRoots(roots);
  const groups = pairs.map((r) => ({ quad: quadFromPair(r), loc: r }));
  reals.sort((a, b) => Math.abs(b) - Math.abs(a));
  for (let i = 0; i < reals.length; i += 2) {
    const r2 = i + 1 < reals.length ? reals[i + 1] : undefined;
    groups.push({ quad: quadFromReals(reals[i], r2), loc: c(reals[i]) });
  }
  return groups;
}

function zpk2sos(f: Zpk): Biquad[] {
  const poles = groupRoots(f.p);
  const zeros = groupRoots(f.z);
  // Poles closest to the unit circle first, each paired with its nearest zero group.
  poles.sort((a, b) => abs(b.loc) - abs(a.loc));
  const sections: Biquad[] = [];
  for (const pg of poles) {
    let best = -1;
    let bestDist = Infinity;
    zeros.forEach((zg, i) => {
      const d = abs(sub(zg.loc, pg.loc));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    const zq: Quad = best >= 0 ? zeros.splice(best, 1)[0].quad : [1, 0, 0];
    sections.push({ b0: zq[0], b1: zq[1], b2: zq[2], a1: pg.quad[1], a2: pg.quad[2] });
  }
  // Process from the pole furthest from the unit circle (scipy ordering): reverse.
  sections.reverse();
  if (sections.length > 0) {
    sections[0].b0 *= f.k;
    sections[0].b1 *= f.k;
    sections[0].b2 *= f.k;
  }
  return sections;
}

// ---------------------------------------------------------------- public API

export class FilterDesignError extends Error {}

/** Designs a digital IIR filter as a cascade of biquads. Throws FilterDesignError when the spec is invalid. */
export function designFilter(spec: FilterSpec, sampleRate: number): Biquad[] {
  const nyquist = sampleRate / 2;
  const order = Math.round(spec.order);
  if (!(order >= 1 && order <= 20)) throw new FilterDesignError(`order must be 1..20, got ${spec.order}`);
  if (!(spec.cutoffHz > 0 && spec.cutoffHz < nyquist)) {
    throw new FilterDesignError(`cutoff must be in (0, ${nyquist}) Hz, got ${spec.cutoffHz}`);
  }
  let proto: Zpk;
  switch (spec.kind) {
    case "butter":
      proto = buttap(order);
      break;
    case "cheby1": {
      const rp = spec.rippleDb ?? 1;
      if (!(rp > 0)) throw new FilterDesignError("rippleDb must be > 0");
      proto = cheb1ap(order, rp);
      break;
    }
    case "cheby2": {
      const rs = spec.stopbandDb ?? 40;
      if (!(rs > 0)) throw new FilterDesignError("stopbandDb must be > 0");
      proto = cheb2ap(order, rs);
      break;
    }
  }
  let warped = 2 * sampleRate * Math.tan((Math.PI * spec.cutoffHz) / sampleRate);
  if (spec.kind === "butter" && spec.attenuationDb !== undefined) {
    // |H|^2 = 1 / (1 + (w/wc)^2n): move wc so that the cutoff sits at -attenuationDb.
    const a = spec.attenuationDb;
    if (!(a > 0)) throw new FilterDesignError("attenuationDb must be > 0");
    const ratio = (10 ** (a / 10) - 1) ** (1 / (2 * order));
    warped = spec.response === "lowpass" ? warped / ratio : warped * ratio;
  }
  const analog = spec.response === "lowpass" ? lp2lp(proto, warped) : lp2hp(proto, warped);
  return zpk2sos(bilinear(analog, sampleRate));
}

/** Complex response of a biquad cascade at `freqHz`. */
export function response(sections: Biquad[], freqHz: number, sampleRate: number): { mag: number; phase: number } {
  const w = (2 * Math.PI * freqHz) / sampleRate;
  const z1 = c(Math.cos(w), -Math.sin(w)); // z^-1
  const z2 = mul(z1, z1);
  let h = c(1);
  for (const s of sections) {
    const num = add(add(c(s.b0), scale(z1, s.b1)), scale(z2, s.b2));
    const den = add(add(c(1), scale(z1, s.a1)), scale(z2, s.a2));
    h = mul(h, div(num, den));
  }
  return { mag: abs(h), phase: Math.atan2(h.im, h.re) };
}

/** Magnitude response in dB at `points` linearly spaced frequencies from 0 to Nyquist. */
export function magnitudeDb(sections: Biquad[], sampleRate: number, points = 256): Float32Array {
  const out = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const f = (i / (points - 1)) * (sampleRate / 2);
    out[i] = 20 * Math.log10(Math.max(response(sections, f, sampleRate).mag, 1e-12));
  }
  return out;
}

/** True when all poles lie strictly inside the unit circle. */
export function isStable(sections: Biquad[]): boolean {
  // For 1 + a1 z^-1 + a2 z^-2: stable iff |a2| < 1 and |a1| < 1 + a2.
  return sections.every((s) => Math.abs(s.a2) < 1 && Math.abs(s.a1) < 1 + s.a2);
}
