#!/usr/bin/env node
/**
 * ncspec: command-line front end of nc-spec-sub. Uses the same TypeScript DSP core as
 * the web app (Node >= 23.6 runs the .ts sources directly).
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  designFilter,
  generateSynthetic,
  isStable,
  magnitudeDb,
  mergeConfig,
  mixAtSnr,
  Pipeline,
  presetConfig,
  presets,
  readWav,
  resample,
  setByPath,
  snrDb,
  toMono,
  writeWav,
  type FilterKind,
  type FilterResponse,
  type PipelineConfig,
  type PresetName,
  type SyntheticName,
} from "@ncspec/dsp";

const HELP = `ncspec: noise compensation by quantile-based noise estimation and spectral subtraction

Usage:
  ncspec process <in.wav> -o <out.wav> [options]   process one file
  ncspec batch <in-dir> <out-dir> [options]        process every .wav in a folder
  ncspec design [filter options]                   print a filter's sections and response
  ncspec presets [--json]                          list presets (or print them as JSON)
  ncspec info <file.wav>                           print format and levels
  ncspec gen-synthetic [--out dir] [--rate Hz] [--seconds s]
                                                   write CC0 test signals (white, pink, a440, sweep, pulses)

Processing options:
  --preset <name>        listening (default), paper, legacy-2001
  --config <file.json>   partial or full PipelineConfig, merged over the preset
  --set key=value        override one setting, repeatable (e.g. --set nlss.alpha=2 --set filters.0.enabled=true)
  --noise <file.wav>     noise clip to inject (enables noise injection; level from --set noise.level=..)
  --snr <dB>             with --noise: mix the noise offline at this SNR instead of a fixed level
  --rate <Hz>            resample the input to this rate before processing (default: keep)
  --keep-latency         do not compensate the processing delay (default: output aligned with input)
  --float                write 32-bit float WAV (default 16-bit PCM)
  --clean <file.wav>     reference clean signal: print SNR before and after

Filter options (design):
  --kind butter|cheby1|cheby2  --response lowpass|highpass  --cutoff <Hz>  --order <n>
  --ripple <dB>  --stopband <dB>  --attenuation <dB>  --rate <Hz> (default 8000)  --points <n>
`;

type Opts = Record<string, string | boolean | string[] | undefined>;

function fail(msg: string): never {
  process.stderr.write(`[FAIL] ${msg}\n`);
  process.exit(1);
}

function loadMono(path: string): { x: Float32Array; rate: number } {
  const wav = readWav(new Uint8Array(readFileSync(path)));
  return { x: toMono(wav.channels), rate: wav.sampleRate };
}

function buildConfig(opts: Opts): PipelineConfig {
  const presetName = (opts.preset as string | undefined) ?? "listening";
  if (!(presetName in presets)) fail(`unknown preset "${presetName}" (known: ${Object.keys(presets).join(", ")})`);
  let cfg = presetConfig(presetName as PresetName);
  if (opts.config) cfg = mergeConfig(cfg, JSON.parse(readFileSync(opts.config as string, "utf8")));
  for (const s of (opts.set as string[] | undefined) ?? []) {
    try {
      cfg = setByPath(cfg, s);
    } catch (e) {
      fail((e as Error).message);
    }
  }
  return cfg;
}

function processFile(inPath: string, outPath: string, opts: Opts): void {
  let cfg = buildConfig(opts); // validate settings before reading files
  let { x, rate } = loadMono(inPath);
  if (opts.rate) {
    const target = Number(opts.rate);
    if (!(target > 0)) fail(`invalid --rate ${opts.rate}`);
    x = resample(x, rate, target);
    rate = target;
  }
  let noise: Float32Array | null = null;
  if (opts.noise) {
    const n = loadMono(opts.noise as string);
    noise = resample(n.x, n.rate, rate);
    if (opts.snr !== undefined) {
      x = mixAtSnr(x, noise, Number(opts.snr));
      noise = null;
      cfg = mergeConfig(cfg, { noise: { enabled: false } });
    } else {
      cfg = mergeConfig(cfg, { noise: { enabled: true } });
    }
  }
  const pipeline = new Pipeline(rate, cfg);
  pipeline.setNoise(noise);
  const t0 = performance.now();
  const y = opts["keep-latency"] ? pipeline.processAll(x) : pipeline.processAligned(x);
  const ms = performance.now() - t0;
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, writeWav(y, rate, opts.float ? "float32" : "pcm16"));
  const seconds = x.length / rate;
  const status = pipeline.getFilterStatus();
  process.stdout.write(
    `[OK] ${basename(inPath)} -> ${outPath}  ${seconds.toFixed(2)} s @ ${rate} Hz, ` +
      `${(seconds / (ms / 1000)).toFixed(0)}x real time, filters: ${status.join("/")}` +
      (pipeline.clipped ? `, ${pipeline.clipped} samples limited` : "") +
      "\n",
  );
  if (opts.clean) {
    const c = loadMono(opts.clean as string);
    const clean = c.rate === rate ? c.x : resample(c.x, c.rate, rate);
    process.stdout.write(`     SNR before ${snrDb(clean, x).toFixed(2)} dB, after ${snrDb(clean, y).toFixed(2)} dB\n`);
  }
}

function cmdDesign(opts: Opts): void {
  const rate = Number(opts.rate ?? 8000);
  const spec = {
    kind: ((opts.kind as string) ?? "cheby1") as FilterKind,
    response: ((opts.response as string) ?? "highpass") as FilterResponse,
    cutoffHz: Number(opts.cutoff ?? 300),
    order: Number(opts.order ?? 4),
    rippleDb: opts.ripple !== undefined ? Number(opts.ripple) : undefined,
    stopbandDb: opts.stopband !== undefined ? Number(opts.stopband) : undefined,
    attenuationDb: opts.attenuation !== undefined ? Number(opts.attenuation) : undefined,
  };
  let sections;
  try {
    sections = designFilter(spec, rate);
  } catch (e) {
    fail((e as Error).message);
  }
  process.stdout.write(`${JSON.stringify(spec)} @ ${rate} Hz, ${isStable(sections) ? "stable" : "UNSTABLE"}\n`);
  process.stdout.write("section        b0             b1             b2             a1             a2\n");
  sections.forEach((s, i) => {
    const f = (v: number) => v.toExponential(6).padStart(14);
    process.stdout.write(`${String(i).padStart(7)} ${f(s.b0)} ${f(s.b1)} ${f(s.b2)} ${f(s.a1)} ${f(s.a2)}\n`);
  });
  const points = Number(opts.points ?? 17);
  const mag = magnitudeDb(sections, rate, points);
  process.stdout.write("\nfrequency (Hz)   magnitude (dB)\n");
  for (let i = 0; i < points; i++) {
    const fhz = (i / (points - 1)) * (rate / 2);
    process.stdout.write(`${fhz.toFixed(0).padStart(14)}   ${mag[i].toFixed(2).padStart(12)}\n`);
  }
}

function cmdPresets(opts: Opts): void {
  if (opts.json) {
    const all = Object.fromEntries(Object.entries(presets).map(([k, v]) => [k, v.config]));
    process.stdout.write(JSON.stringify(all, null, 2) + "\n");
    return;
  }
  for (const [name, p] of Object.entries(presets)) {
    process.stdout.write(`${name.padEnd(12)} ${p.label}\n${"".padEnd(12)} ${p.description}\n`);
  }
  process.stdout.write(`\nDefault configuration: ncspec presets --json, or see packages/dsp/src/config.ts\n`);
}

function cmdInfo(path: string): void {
  const wav = readWav(new Uint8Array(readFileSync(path)));
  const x = toMono(wav.channels);
  let peak = 0;
  let sum = 0;
  for (const v of x) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const rms = Math.sqrt(sum / Math.max(1, x.length));
  const dbfs = (v: number) => (20 * Math.log10(Math.max(v, 1e-12))).toFixed(1);
  process.stdout.write(
    `${path}: ${wav.channels.length} ch, ${wav.sampleRate} Hz, ${(x.length / wav.sampleRate).toFixed(2)} s, ` +
      `peak ${dbfs(peak)} dBFS, RMS ${dbfs(rms)} dBFS\n`,
  );
}

function cmdGenSynthetic(opts: Opts): void {
  const out = (opts.out as string) ?? "testdata/synthetic";
  const rate = Number(opts.rate ?? 16000);
  const seconds = Number(opts.seconds ?? 5);
  mkdirSync(out, { recursive: true });
  for (const name of ["white", "pink", "a440", "sweep", "pulses"] as SyntheticName[]) {
    const file = join(out, `${name}.wav`);
    writeFileSync(file, writeWav(generateSynthetic(name, rate, seconds), rate));
    process.stdout.write(`[OK] ${file}\n`);
  }
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      preset: { type: "string" },
      config: { type: "string" },
      set: { type: "string", multiple: true },
      noise: { type: "string" },
      snr: { type: "string" },
      rate: { type: "string" },
      clean: { type: "string" },
      "keep-latency": { type: "boolean" },
      float: { type: "boolean" },
      json: { type: "boolean" },
      kind: { type: "string" },
      response: { type: "string" },
      cutoff: { type: "string" },
      order: { type: "string" },
      ripple: { type: "string" },
      stopband: { type: "string" },
      attenuation: { type: "string" },
      points: { type: "string" },
      seconds: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const opts = values as Opts;
  const [cmd, ...args] = positionals;
  if (!cmd || opts.help) {
    process.stdout.write(HELP);
    return;
  }
  switch (cmd) {
    case "process": {
      if (!args[0] || !opts.out) fail("usage: ncspec process <in.wav> -o <out.wav>");
      processFile(args[0], opts.out as string, opts);
      break;
    }
    case "batch": {
      const [inDir, outDir] = args;
      if (!inDir || !outDir) fail("usage: ncspec batch <in-dir> <out-dir>");
      const files = readdirSync(inDir).filter((f) => extname(f).toLowerCase() === ".wav" && statSync(join(inDir, f)).isFile());
      if (files.length === 0) fail(`no .wav files in ${inDir}`);
      for (const f of files) processFile(join(inDir, f), join(outDir, f), opts);
      break;
    }
    case "design":
      cmdDesign(opts);
      break;
    case "presets":
      cmdPresets(opts);
      break;
    case "info":
      if (!args[0]) fail("usage: ncspec info <file.wav>");
      for (const f of args) cmdInfo(f);
      break;
    case "gen-synthetic":
      cmdGenSynthetic(opts);
      break;
    default:
      fail(`unknown command "${cmd}" (try --help)`);
  }
}

try {
  main();
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  fail(err.code === "ENOENT" ? `file not found: ${err.path}` : err.message);
}
