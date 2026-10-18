import type { FilterKind, FilterResponse, FilterSpec } from "./iir-design.ts";
import type { NlssParams } from "./nlss.ts";

export interface FilterStageConfig {
  enabled: boolean;
  kind: FilterKind;
  response: FilterResponse;
  cutoffHz: number;
  order: number;
  /** Chebyshev I passband ripple (dB). */
  rippleDb: number;
  /** Chebyshev II stopband attenuation (dB). */
  stopbandDb: number;
  /** Butterworth attenuation at the cutoff (dB); 3 is the usual -3 dB point. */
  attenuationDb: number;
}

export interface NoiseStageConfig {
  enabled: boolean;
  /** Clip id from the audio manifest (e.g. "2001/70mph", "musan/wind"); the buffer is supplied separately. */
  clip: string;
  /** Linear level applied to the noise clip (0 to 3 in the 2001 UI). */
  level: number;
}

export interface PipelineConfig {
  /** Output = input, everything else ignored. */
  bypass: boolean;
  /** Linear input gain (0 to 3 in the 2001 UI). */
  gain: number;
  noise: NoiseStageConfig;
  nlss: NlssParams & { enabled: boolean };
  filters: [FilterStageConfig, FilterStageConfig];
  /** Soft limiter at the output (instead of the 2001 integer wrap-around). */
  limiter: boolean;
}

export type PresetName = "listening" | "paper" | "legacy-2001";

const legacyFilters = (): [FilterStageConfig, FilterStageConfig] => [
  { enabled: false, kind: "cheby1", response: "highpass", cutoffHz: 600, order: 2, rippleDb: 0.1, stopbandDb: 40, attenuationDb: 3 },
  { enabled: false, kind: "cheby1", response: "highpass", cutoffHz: 300, order: 6, rippleDb: 0.1, stopbandDb: 40, attenuationDb: 3 },
];

export const presets: Record<PresetName, { label: string; description: string; config: PipelineConfig }> = {
  listening: {
    label: "Listening",
    description: "Tapered windows with 50% overlap-add, over-subtraction and a spectral floor tuned for low musical noise.",
    config: {
      bypass: false,
      gain: 1,
      noise: { enabled: false, clip: "2001/70mph", level: 1 },
      nlss: {
        enabled: true,
        window: "sqrtHann",
        overlap: 0.5,
        frameMs: 32,
        intervalS: 1.0,
        estimatesPerBlock: 1,
        quantile: 0.5,
        alpha: 1.5,
        beta: 0.02,
        smoothEstimate: true,
        medianFilter: true,
      },
      filters: legacyFilters(),
      limiter: true,
    },
  },
  paper: {
    label: "Paper (Eurospeech 2001 / DSP 2002)",
    description: "0.5 s median estimate at a 16 ms rate, noise scalar 0.25, no floor, smoothed estimate and median-filtered spectrum: the ASR-optimal set-up.",
    config: {
      bypass: false,
      gain: 1,
      noise: { enabled: false, clip: "2001/70mph", level: 1 },
      nlss: {
        enabled: true,
        window: "sqrtHann",
        overlap: 0.5,
        frameMs: 32,
        intervalS: 0.5,
        estimatesPerBlock: 1,
        quantile: 0.5,
        alpha: 0.25,
        beta: 0,
        smoothEstimate: true,
        medianFilter: true,
      },
      filters: legacyFilters(),
      limiter: true,
    },
  },
  "legacy-2001": {
    label: "2001 demo defaults",
    description: "The state of the 2001 dialog at start-up: rectangular 32 ms blocks, 1 s interval, 50% shift, alpha 1, no floor.",
    config: {
      bypass: false,
      gain: 1,
      noise: { enabled: false, clip: "2001/70mph", level: 1 },
      nlss: {
        enabled: false,
        window: "rectangular",
        overlap: 0,
        frameMs: 32,
        intervalS: 1.0,
        estimatesPerBlock: 2,
        quantile: 0.5,
        alpha: 1,
        beta: 0,
        smoothEstimate: false,
        medianFilter: false,
      },
      filters: legacyFilters(),
      limiter: false,
    },
  },
};

/**
 * Deep copy of a config. JSON-based on purpose: structuredClone is not available in
 * AudioWorkletGlobalScope, and configs are plain JSON data.
 */
export function cloneConfig(c: PipelineConfig): PipelineConfig {
  return JSON.parse(JSON.stringify(c)) as PipelineConfig;
}

export function defaultConfig(): PipelineConfig {
  return cloneConfig(presets.listening.config);
}

export function presetConfig(name: PresetName): PipelineConfig {
  const p = presets[name];
  if (!p) throw new Error(`unknown preset "${name}" (known: ${Object.keys(presets).join(", ")})`);
  return cloneConfig(p.config);
}

export function filterSpec(f: FilterStageConfig): FilterSpec {
  return {
    kind: f.kind,
    response: f.response,
    cutoffHz: f.cutoffHz,
    order: f.order,
    rippleDb: f.rippleDb,
    stopbandDb: f.stopbandDb,
    attenuationDb: f.kind === "butter" ? f.attenuationDb : undefined,
  };
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Deep-merges a partial config (e.g. parsed JSON) over a base config; unknown keys are ignored. */
export function mergeConfig(base: PipelineConfig, partial: unknown): PipelineConfig {
  const out = cloneConfig(base) as unknown as Json;
  merge(out, migrate(partial) as Json);
  return clampConfig(out as unknown as PipelineConfig);
}

/** Settings saved before the framing was split into window and overlap. */
function migrate(partial: unknown): unknown {
  const nlss = (partial as { nlss?: Record<string, unknown> } | null)?.nlss;
  if (!nlss || typeof nlss !== "object" || !("framing" in nlss)) return partial;
  const { framing, ...rest } = nlss;
  const framed =
    framing === "legacy2001"
      ? { window: "rectangular", overlap: 0 }
      : // the old overlap-add framing ignored estimatesPerBlock: one estimate per hop
        { window: "sqrtHann", overlap: 0.5, estimatesPerBlock: 1 };
  return { ...(partial as object), nlss: { ...rest, ...framed } };
}

function merge(target: Json, src: Json): void {
  if (src === null || typeof src !== "object" || target === null || typeof target !== "object") return;
  for (const key of Object.keys(src)) {
    if (!(key in (target as object))) continue;
    const t = (target as Record<string, Json>)[key];
    const s = (src as Record<string, Json>)[key];
    if (t !== null && typeof t === "object") merge(t, s);
    else if (typeof s === typeof t) (target as Record<string, Json>)[key] = s;
  }
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

/** Keeps numbers in safe ranges (the UI ranges are narrower). */
export function clampConfig(c: PipelineConfig): PipelineConfig {
  c.gain = clamp(c.gain, 0, 10);
  c.noise.level = clamp(c.noise.level, 0, 10);
  const n = c.nlss;
  n.frameMs = clamp(n.frameMs, 4, 128);
  n.intervalS = clamp(n.intervalS, 0.05, 5);
  n.estimatesPerBlock = Math.round(clamp(n.estimatesPerBlock, 1, 4));
  n.quantile = clamp(n.quantile, 0, 1);
  n.alpha = clamp(n.alpha, 0, 20);
  n.beta = clamp(n.beta, 0, 1);
  if (n.window !== "sqrtHann" && n.window !== "rectangular") n.window = "sqrtHann";
  n.overlap = n.overlap > 0 ? 0.5 : 0;
  for (const f of c.filters) {
    f.order = Math.round(clamp(f.order, 1, 20));
    f.rippleDb = clamp(f.rippleDb, 0.01, 10);
    f.stopbandDb = clamp(f.stopbandDb, 1, 120);
    f.attenuationDb = clamp(f.attenuationDb, 0.01, 20);
  }
  return c;
}

/** Sets a value by dotted path, e.g. "nlss.alpha=2" or "filters.0.cutoffHz=300". Parses numbers and booleans. */
export function setByPath(c: PipelineConfig, assignment: string): PipelineConfig {
  const eq = assignment.indexOf("=");
  if (eq < 0) throw new Error(`expected key=value, got "${assignment}"`);
  const path = assignment.slice(0, eq).split(".");
  const raw = assignment.slice(eq + 1);
  let value: Json = raw;
  if (raw === "true" || raw === "false") value = raw === "true";
  else if (raw !== "" && Number.isFinite(Number(raw))) value = Number(raw);
  const partial: Record<string, Json> = {};
  let cur: Record<string, Json> = partial;
  path.forEach((key, i) => {
    if (i === path.length - 1) cur[key] = value;
    else cur = cur[key] = {} as Record<string, Json>;
  });
  const current = getByPath(c, path);
  if (current === undefined || (current !== null && typeof current === "object")) {
    throw new Error(`unknown setting "${path.join(".")}"`);
  }
  if (typeof current !== typeof value) {
    // allow strings that look like numbers for string fields (e.g. clip ids)
    if (typeof current === "string") value = raw;
    else throw new Error(`"${path.join(".")}" expects a ${typeof current}, got "${raw}"`);
  }
  if (typeof current === "string") {
    let cur2: Record<string, Json> = partial;
    path.forEach((key, i) => {
      if (i === path.length - 1) cur2[key] = raw;
      else cur2 = cur2[key] as Record<string, Json>;
    });
  }
  return mergeConfig(c, partial);
}

function getByPath(c: PipelineConfig, path: string[]): unknown {
  let cur: unknown = c;
  for (const k of path) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined;
  return cur;
}
