import type { FilterStatus, PipelineConfig } from "@ncspec/dsp";

/** Messages from the main thread to the AudioWorklet. */
export type ToWorklet =
  | { type: "config"; config: PipelineConfig }
  | { type: "noise"; buffer: Float32Array | null }
  | { type: "record"; on: boolean }
  | { type: "reset" };

/** Analysis snapshot posted by the worklet about 20 times per second. */
export interface Stats {
  sampleRate: number;
  frameSize: number;
  /** Magnitude spectra (frameSize/2 + 1 bins), same window and scale as the NLSS analysis. */
  inSpectrum: Float32Array;
  outSpectrum: Float32Array;
  noiseEstimate: Float32Array;
  nlssEnabled: boolean;
  inLevel: { rms: number; peak: number };
  outLevel: { rms: number; peak: number };
  clipped: number;
  filterStatus: [FilterStatus, FilterStatus];
  latency: number;
  estimatorCapacity: number;
}

/** Messages from the worklet to the main thread. */
export type FromWorklet = { type: "stats"; stats: Stats } | { type: "chunk"; samples: Float32Array };

export const PROCESSOR_NAME = "ncspec-processor";
