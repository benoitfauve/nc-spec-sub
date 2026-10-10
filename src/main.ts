// CLI: node src/main.ts in.wav out.wav [--alpha 2] [--beta 0.01]

import { parseArgs } from "node:util";
import { readWav, writeWav } from "./wav.ts";
import { defaults, spectralSubtract } from "./specsub.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    alpha: { type: "string" },
    beta: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || positionals.length !== 2) {
  console.log(`usage: node src/main.ts in.wav out.wav [--alpha ${defaults.alpha}] [--beta ${defaults.beta}]`);
  process.exit(values.help ? 0 : 1);
}

const [inPath, outPath] = positionals;
const alpha = values.alpha !== undefined ? Number(values.alpha) : defaults.alpha;
const beta = values.beta !== undefined ? Number(values.beta) : defaults.beta;

const { fs, x } = readWav(inPath);
const t0 = performance.now();
const y = spectralSubtract(x, fs, { alpha, beta });
const ms = performance.now() - t0;
writeWav(outPath, { fs, x: y });

console.log(
  `${inPath} -> ${outPath}: ${fs} Hz, ${(x.length / fs).toFixed(2)} s, ` +
    `alpha=${alpha}, beta=${beta}, ${ms.toFixed(0)} ms`,
);
