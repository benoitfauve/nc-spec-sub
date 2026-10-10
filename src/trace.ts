// Runs spectral subtraction and saves its internals for plotting (see notebooks/).
// Usage: node src/trace.ts in.wav out-dir [--alpha 2] [--beta 0.01]
//
// Writes to out-dir:
//   meta.json                  sizes, sample rate and parameters
//   power.f32 noise.f32 gain.f32   float32, little-endian, [frames][bins] row-major
//   clean.wav                  the denoised output

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readWav, writeWav } from "./wav.ts";
import { defaults, frameSetup, spectralSubtract } from "./specsub.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    alpha: { type: "string" },
    beta: { type: "string" },
  },
});

if (positionals.length !== 2) {
  console.error(`usage: node src/trace.ts in.wav out-dir [--alpha ${defaults.alpha}] [--beta ${defaults.beta}]`);
  process.exit(1);
}

const [inPath, outDir] = positionals;
const opts = {
  alpha: values.alpha !== undefined ? Number(values.alpha) : defaults.alpha,
  beta: values.beta !== undefined ? Number(values.beta) : defaults.beta,
};

const { fs, x } = readWav(inPath);
const setup = frameSetup(fs, opts);
const frames = x.length >= setup.n ? Math.floor((x.length - setup.n) / setup.hop) + 1 : 0;

const power = new Float32Array(frames * setup.bins);
const noise = new Float32Array(frames * setup.bins);
const gain = new Float32Array(frames * setup.bins);
let f = 0;

const y = spectralSubtract(x, fs, opts, (t) => {
  power.set(t.power, f * setup.bins);
  noise.set(t.noise, f * setup.bins);
  gain.set(t.gain, f * setup.bins);
  f++;
});

mkdirSync(outDir, { recursive: true });
const save = (name: string, a: Float32Array) => writeFileSync(join(outDir, name), new Uint8Array(a.buffer));
save("power.f32", power);
save("noise.f32", noise);
save("gain.f32", gain);
writeWav(join(outDir, "clean.wav"), { fs, x: y });
writeFileSync(
  join(outDir, "meta.json"),
  JSON.stringify({ input: inPath, fs, samples: x.length, frames, ...setup, ...opts }, null, 2) + "\n",
);

console.log(`${inPath} -> ${outDir}: ${frames} frames x ${setup.bins} bins, alpha=${opts.alpha}, beta=${opts.beta}`);
