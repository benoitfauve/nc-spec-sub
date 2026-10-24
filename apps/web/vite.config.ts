import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import preact from "@preact/preset-vite";
import { build, defineConfig, type Plugin } from "vite";
import { generateSynthetic, writeWav, type SyntheticName } from "../../packages/dsp/src/index.ts";

const root = resolve(import.meta.dirname, "../..");

/** Synthetic test clips are generated at build time, not committed (CC0, same code as `ncspec gen-synthetic`). */
const SYNTH_RATE = 16000;
const SYNTH_SECONDS = 5;
const synthNames: SyntheticName[] = ["white", "pink", "a440", "sweep", "pulses"];
const synthCache = new Map<string, Uint8Array>();

function synthWav(name: SyntheticName): Uint8Array {
  let wav = synthCache.get(name);
  if (!wav) {
    wav = writeWav(generateSynthetic(name, SYNTH_RATE, SYNTH_SECONDS), SYNTH_RATE);
    synthCache.set(name, wav);
  }
  return wav;
}

interface ClipSource {
  group: string;
  /** Folder of .wav files, or the list of clips to generate. */
  dir?: string;
  synth?: SyntheticName[];
  prefix: string;
  label: (name: string) => string;
  kind: (name: string) => "speech" | "noise" | "test";
  private?: boolean;
}

const legacyLabels: Record<string, string> = {
  "throwitaway.noisy": "Throw it away (noisy speech)",
  A440: "A440 tone",
  whitenoise: "White noise",
  "0mph": "Car 0 mph",
  "20mph": "Car 20 mph",
  "30mph": "Car 30 mph",
  "50mph": "Car 50 mph",
  "70mph": "Car 70 mph",
  "70": "Car 70 mph (excerpt)",
  "carnoise-filtered": "Car noise, filtered",
};

const sources: ClipSource[] = [
  {
    group: "2001 recordings (CC BY 4.0)",
    dir: join(root, "testdata/2001"),
    prefix: "2001",
    label: (n) => legacyLabels[n] ?? n,
    kind: (n) => (/mph|^70$|carnoise|whitenoise/.test(n) ? "noise" : n === "A440" ? "test" : "speech"),
  },
  {
    group: "MUSAN noise (CC BY 4.0, see Credits)",
    dir: join(root, "testdata/noise-musan"),
    prefix: "musan",
    label: (n) => n.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
    kind: () => "noise",
  },
  {
    group: "Synthetic (CC0)",
    synth: synthNames,
    prefix: "synthetic",
    label: (n) => ({ white: "White noise", pink: "Pink noise", a440: "A440 tone", sweep: "Log sweep", pulses: "Speech-like bursts" })[n] ?? n,
    kind: (n) => (n === "white" || n === "pink" ? "noise" : "test"),
  },
];

function scanClips() {
  const clips: { id: string; label: string; group: string; kind: string; url: string; private: boolean }[] = [];
  const files: { url: string; data: () => Uint8Array }[] = [];
  for (const s of sources) {
    const entries: { name: string; data: () => Uint8Array }[] = [];
    if (s.synth) {
      for (const n of s.synth) entries.push({ name: n, data: () => synthWav(n) });
    } else if (s.dir && existsSync(s.dir)) {
      const dir = s.dir;
      for (const f of readdirSync(dir).sort()) {
        if (!f.toLowerCase().endsWith(".wav")) continue;
        entries.push({ name: f.slice(0, -4), data: () => readFileSync(join(dir, f)) });
      }
    }
    for (const { name, data } of entries) {
      const url = `audio/${s.prefix}/${name}.wav`;
      clips.push({ id: `${s.prefix}/${name}`, label: s.label(name), group: s.group, kind: s.kind(name), url, private: !!s.private });
      files.push({ url, data });
    }
  }
  return { clips, files };
}

/** Serves the test clips in dev and copies them into the build, with a manifest. */
function audioClips(): Plugin {
  return {
    name: "ncspec-audio-clips",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0].replace(/^\//, "");
        if (url === "audio/manifest.json") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(scanClips().clips));
          return;
        }
        if (url.startsWith("audio/")) {
          const hit = scanClips().files.find((f) => f.url === decodeURIComponent(url));
          if (hit) {
            res.setHeader("Content-Type", "audio/wav");
            res.end(hit.data());
            return;
          }
        }
        next();
      });
    },
    generateBundle() {
      const { clips, files } = scanClips();
      this.emitFile({ type: "asset", fileName: "audio/manifest.json", source: JSON.stringify(clips) });
      for (const f of files) this.emitFile({ type: "asset", fileName: f.url, source: f.data() });
    },
  };
}

/**
 * AudioWorklet module URL. In builds, Vite's `?worker&url` bundles the processor on its
 * own. In dev, that URL would load Vite's client inside the worklet scope (which has no
 * `URL`, `document`, ...), so we serve a self-contained bundle instead.
 */
function workletProcessor(): Plugin {
  const VIRTUAL = "virtual:ncspec-processor-url";
  const DEV_PATH = "/__ncspec/processor.js";
  const entry = resolve(import.meta.dirname, "src/audio/processor.ts");
  let isDev = false;
  return {
    name: "ncspec-worklet-processor",
    configResolved(cfg) {
      isDev = cfg.command === "serve";
    },
    resolveId(id) {
      return id === VIRTUAL ? "\0" + VIRTUAL : null;
    },
    load(id) {
      if (id !== "\0" + VIRTUAL) return null;
      return isDev ? `export default ${JSON.stringify(DEV_PATH)};` : `export { default } from ${JSON.stringify(entry + "?worker&url")};`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if ((req.url ?? "").split("?")[0] !== DEV_PATH) return next();
        try {
          const out = await build({
            configFile: false,
            logLevel: "silent",
            build: { write: false, minify: false, lib: { entry, formats: ["es"], fileName: "processor" } },
          });
          const outputs = Array.isArray(out) ? out : [out];
          const chunk = outputs.flatMap((o) => ("output" in o ? o.output : [])).find((c) => c.type === "chunk");
          res.setHeader("Content-Type", "text/javascript");
          res.end(chunk && "code" in chunk ? chunk.code : "");
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [preact(), audioClips(), workletProcessor()],
  worker: { format: "es" },
  server: { fs: { allow: [root] } },
  build: { target: "es2022" },
});
