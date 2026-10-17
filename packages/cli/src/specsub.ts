// CLI: node packages/cli/src/specsub.ts in.wav out.wav [--alpha 2] [--beta 0.01]

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { readWav, toMono, writeWav } from "../../dsp/src/wav.ts";
import { defaults, spectralSubtract } from "../../dsp/src/specsub.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    alpha: { type: "string" },
    beta: { type: "string" },
    warmup: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || positionals.length !== 2) {
  console.log(
    `usage: node packages/cli/src/specsub.ts in.wav out.wav [--alpha ${defaults.alpha}] [--beta ${defaults.beta}] [--warmup grow|zeros]`,
  );
  process.exit(values.help ? 0 : 1);
}

const [inPath, outPath] = positionals;
const alpha = values.alpha !== undefined ? Number(values.alpha) : defaults.alpha;
const beta = values.beta !== undefined ? Number(values.beta) : defaults.beta;
const warmup = values.warmup ?? defaults.warmup;
if (warmup !== "grow" && warmup !== "zeros") {
  console.error(`--warmup must be grow or zeros, got ${warmup}`);
  process.exit(1);
}

const wav = readWav(new Uint8Array(readFileSync(inPath)));
const fs = wav.sampleRate;
const x = toMono(wav.channels);
const t0 = performance.now();
const y = spectralSubtract(x, fs, { alpha, beta, warmup });
const ms = performance.now() - t0;
writeFileSync(outPath, writeWav(Float32Array.from(y), fs));

console.log(
  `${inPath} -> ${outPath}: ${fs} Hz, ${(x.length / fs).toFixed(2)} s, ` +
    `alpha=${alpha}, beta=${beta}, warmup=${warmup}, ${ms.toFixed(0)} ms`,
);
