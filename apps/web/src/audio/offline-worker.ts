/** Web Worker: processes a whole clip with the shared Pipeline, faster than real time. */
import { Pipeline, type PipelineConfig } from "@ncspec/dsp";

export interface OfflineRequest {
  input: Float32Array;
  noise: Float32Array | null;
  sampleRate: number;
  config: PipelineConfig;
}

export type OfflineResponse = { type: "progress"; fraction: number } | { type: "done"; output: Float32Array; clipped: number };

self.onmessage = (e: MessageEvent<OfflineRequest>) => {
  const { input, noise, sampleRate, config } = e.data;
  const pipeline = new Pipeline(sampleRate, config);
  pipeline.setNoise(noise);
  const lat = pipeline.latency;
  const padded = new Float32Array(input.length + lat);
  padded.set(input);
  let last = 0;
  const all = pipeline.processAll(padded, 4096, (f) => {
    if (f - last > 0.05) {
      last = f;
      (self as unknown as Worker).postMessage({ type: "progress", fraction: f } satisfies OfflineResponse);
    }
  });
  const output = all.slice(lat);
  (self as unknown as Worker).postMessage({ type: "done", output, clipped: pipeline.clipped } satisfies OfflineResponse, [output.buffer]);
};
