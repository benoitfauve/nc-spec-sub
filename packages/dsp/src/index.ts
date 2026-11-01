export { FFT, nextPow2, nearestPow2 } from "./fft.ts";
export { hann, sqrtHann, rectangular } from "./window.ts";
export { SlidingQuantile } from "./quantile.ts";
export {
  designFilter,
  response,
  magnitudeDb,
  isStable,
  FilterDesignError,
  type Biquad,
  type FilterKind,
  type FilterResponse,
  type FilterSpec,
} from "./iir-design.ts";
export { BiquadCascade } from "./biquad.ts";
export { parseFilt, parseFiltName, normaliseLegacy, type FiltName } from "./legacy-filt.ts";
export {
  Nlss,
  defaultNlssParams,
  nlssNeedsRebuild,
  type NlssParams,
  type NlssWindow,
  type NlssOverlap,
  effectiveWindow,
} from "./nlss.ts";
export { SpectrumMonitor } from "./monitor.ts";
export { readWav, writeWav, toMono, type WavData } from "./wav.ts";
export { resample } from "./resample.ts";
export {
  presets,
  defaultConfig,
  presetConfig,
  mergeConfig,
  clampConfig,
  cloneConfig,
  setByPath,
  filterSpec,
  type PipelineConfig,
  type FilterStageConfig,
  type NoiseStageConfig,
  type PresetName,
} from "./config.ts";
export { Pipeline, softClip, type FilterStatus } from "./pipeline.ts";
export { generateSynthetic, type SyntheticName, mixAtSnr, snrDb } from "./signals.ts";
export {
  spectralSubtract,
  frameSetup,
  defaults as specSubDefaults,
  type SpecSubOptions,
  type FrameSetup,
  type FrameTrace,
} from "./specsub.ts";
