/** Deterministic test signals (dedicated to the public domain, CC0) and SNR helpers. */

export type SyntheticName = "white" | "pink" | "a440" | "sweep" | "pulses";

/** Small deterministic PRNG (mulberry32), so generated files are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximately Gaussian sample (sum of 4 uniforms, unit variance). */
function gauss(r: () => number): number {
  return (r() + r() + r() + r() - 2) * Math.sqrt(3);
}

export function generateSynthetic(name: SyntheticName, sampleRate: number, seconds: number, seed = 1): Float32Array {
  const n = Math.round(sampleRate * seconds);
  const x = new Float32Array(n);
  const r = rng(seed);
  switch (name) {
    case "white":
      for (let i = 0; i < n; i++) x[i] = 0.1 * gauss(r);
      break;
    case "pink": {
      // Paul Kellet's economy pink filter on white noise
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = gauss(r);
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        x[i] = 0.05 * (b0 + b1 + b2 + w * 0.1848);
      }
      break;
    }
    case "a440":
      for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      break;
    case "sweep": {
      // logarithmic sweep from 50 Hz to 0.45 * fs
      const f0 = 50;
      const f1 = 0.45 * sampleRate;
      const k = Math.log(f1 / f0);
      for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        x[i] = 0.5 * Math.sin(((2 * Math.PI * f0 * seconds) / k) * (Math.exp((k * t) / seconds) - 1));
      }
      break;
    }
    case "pulses": {
      // speech-like on/off bursts of harmonic tones (0.4 s on, 0.6 s off), for estimator tests
      for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        const on = t % 1 < 0.4;
        if (!on) continue;
        const f0 = 120 + 30 * Math.sin(2 * Math.PI * 0.7 * t);
        let v = 0;
        for (let h = 1; h <= 10; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
        x[i] = 0.15 * v;
      }
      break;
    }
  }
  return x;
}

function power(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return s / Math.max(1, x.length);
}

/** Returns signal + noise, with the noise (looped as needed) scaled to the target SNR in dB. */
export function mixAtSnr(signal: Float32Array, noise: Float32Array, snr: number): Float32Array {
  const looped = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) looped[i] = noise[i % noise.length];
  const ps = power(signal);
  const pn = power(looped);
  const scale = pn > 0 ? Math.sqrt(ps / (pn * 10 ** (snr / 10))) : 0;
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i] + scale * looped[i];
  return out;
}

/** SNR in dB of `test` against the reference `clean` (same alignment and length). */
export function snrDb(clean: Float32Array, test: Float32Array): number {
  const n = Math.min(clean.length, test.length);
  let ps = 0;
  let pe = 0;
  for (let i = 0; i < n; i++) {
    ps += clean[i] * clean[i];
    const e = test[i] - clean[i];
    pe += e * e;
  }
  return 10 * Math.log10(ps / Math.max(pe, 1e-20));
}
