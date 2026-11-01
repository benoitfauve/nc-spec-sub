import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { defaultConfig, mergeConfig, presetConfig, type PipelineConfig, type PresetName } from "@ncspec/dsp";
import { download, Engine, loadManifest, type Clip, type Source } from "./audio/engine.ts";

export type View = "modern" | "legacy";
export const RATES = [8000, 16000, 48000] as const;

const STORE_KEY = "ncspec.state.v1";

interface Persisted {
  config: PipelineConfig;
  view: View;
  rate: number;
  clipId: string;
  monitorOn: boolean;
  monitorVolume: number;
}

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function savePersisted(p: Persisted): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* private mode or blocked storage: ignore */
  }
}

/** State and actions shared by the modern and the legacy UI. */
export function useController() {
  const initial = useMemo(loadPersisted, []);
  const [config, setConfigState] = useState<PipelineConfig>(() =>
    initial.config ? mergeConfig(defaultConfig(), initial.config) : defaultConfig(),
  );
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const [view, setView] = useState<View>((params.get("view") as View | null) ?? initial.view ?? "modern");
  const [rate, setRateState] = useState<number>(initial.rate ?? 8000);
  const [clips, setClips] = useState<Clip[]>([]);
  const [sourceKind, setSourceKind] = useState<"mic" | "clip" | "file">("clip");
  const [clipId, setClipId] = useState<string>(initial.clipId ?? "2001/throwitaway.noisy");
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [monitorOn, setMonitorOnState] = useState(initial.monitorOn ?? true);
  const [monitorVolume, setMonitorVolumeState] = useState(initial.monitorVolume ?? 0.8);
  const [preset, setPreset] = useState<PresetName | "custom">("custom");

  const startRef = useRef<(() => void) | null>(null);
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) engineRef.current = new Engine(config);
  const engine = engineRef.current;

  useEffect(() => {
    loadManifest().then((list) => {
      engine.setClips(list);
      setClips(list);
      // fall back to a clip that exists
      const speech = list.filter((c) => c.kind !== "noise");
      if (speech.length && !list.some((c) => c.id === clipId)) setClipId(speech[0].id);
      if (!list.some((c) => c.id === config.noise.clip)) {
        const n = list.find((c) => c.kind === "noise");
        if (n) update((x) => void (x.noise.clip = n.id));
      }
      // ?autostart starts processing the selected clip (needs an autoplay-permissive browser setting)
      if (params.has("autostart")) startRef.current?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    savePersisted({ config, view, rate, clipId, monitorOn, monitorVolume });
  }, [config, view, rate, clipId, monitorOn, monitorVolume]);

  useEffect(() => {
    engine.setNoiseClip(config.noise.clip).catch((e) => setError(String(e.message ?? e)));
  }, [config.noise.clip, clips, engine]);

  // Latest config, so that several updates in the same tick build on each other.
  const configRef = useRef(config);

  function setConfig(next: PipelineConfig, fromPreset: PresetName | "custom" = "custom") {
    configRef.current = next;
    setConfigState(next);
    setPreset(fromPreset);
    engine.setConfig(next);
  }

  function update(mutator: (c: PipelineConfig) => void) {
    const next = structuredClone(configRef.current);
    mutator(next);
    setConfig(next);
  }

  function applyPreset(name: PresetName) {
    const p = presetConfig(name);
    // keep the user's noise clip choice
    p.noise.clip = configRef.current.noise.clip;
    setConfig(p, name);
  }

  function currentSource(kind = sourceKind): Source {
    if (kind === "mic") return { type: "mic" };
    if (kind === "file" && file) return { type: "file", file };
    return { type: "clip", id: clipId };
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message ?? String(e));
      setRunning(engine.running);
    } finally {
      setBusy(false);
    }
  }

  const start = (kind = sourceKind) =>
    run(async () => {
      await engine.start(currentSource(kind), rate);
      engine.setConfig(configRef.current);
      engine.setMonitor(monitorOn, monitorVolume);
      setRunning(true);
    });

  startRef.current = () => void start();

  const stop = () =>
    run(async () => {
      if (recording) toggleRecording();
      await engine.stop();
      setRunning(false);
    });

  /** Restarts with a new source if running. */
  function selectSource(kind: "mic" | "clip" | "file", opts: { clipId?: string; file?: File } = {}) {
    setSourceKind(kind);
    if (opts.clipId) setClipId(opts.clipId);
    if (opts.file) setFile(opts.file);
    if (running) {
      const src: Source =
        kind === "mic"
          ? { type: "mic" }
          : kind === "file" && (opts.file ?? file)
            ? { type: "file", file: (opts.file ?? file)! }
            : { type: "clip", id: opts.clipId ?? clipId };
      run(async () => {
        await engine.start(src, rate);
        setRunning(true);
      });
    }
  }

  function setRate(r: number) {
    setRateState(r);
    if (running) {
      run(async () => {
        await engine.start(currentSource(), r);
        engine.setConfig(configRef.current);
        engine.setMonitor(monitorOn, monitorVolume);
        setRunning(true);
      });
    }
  }

  function setMonitor(on: boolean, volume = monitorVolume) {
    setMonitorOnState(on);
    setMonitorVolumeState(volume);
    engine.setMonitor(on, volume);
  }

  function toggleRecording() {
    if (!recording) {
      engine.startRecording();
      setRecording(true);
    } else {
      setRecording(false);
      const blob = engine.stopRecording();
      if (blob) download(blob, `ncspec-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`);
    }
  }

  const exportProcessed = () =>
    run(async () => {
      if (!engine.currentInput) {
        if (sourceKind === "mic")
          throw new Error("Offline export works on a clip or a file. Use Record for the microphone.");
        await engine.start(currentSource(), rate);
        engine.setConfig(configRef.current);
        engine.setMonitor(monitorOn, monitorVolume);
        setRunning(true);
      }
      setExportProgress(0);
      try {
        const { blob, name } = await engine.processOffline((f) => setExportProgress(f));
        download(blob, name);
      } finally {
        setExportProgress(null);
      }
    });

  /** Uses a user file as the injected noise. */
  function loadNoiseFile(f: File) {
    const id = engine.addNoiseFile(f);
    update((x) => {
      x.noise.clip = id;
      x.noise.enabled = true;
    });
  }

  function exportConfig() {
    download(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }), "ncspec-config.json");
  }

  async function importConfig(f: File) {
    try {
      setConfig(mergeConfig(defaultConfig(), JSON.parse(await f.text())));
    } catch (e) {
      setError(`Could not read ${f.name}: ${(e as Error).message}`);
    }
  }

  return {
    engine,
    config,
    update,
    setConfig,
    preset,
    applyPreset,
    view,
    setView,
    rate,
    setRate,
    clips,
    sourceKind,
    clipId,
    file,
    selectSource,
    running,
    busy,
    error,
    setError,
    start,
    stop,
    recording,
    toggleRecording,
    exportProcessed,
    exportProgress,
    exportConfig,
    importConfig,
    loadNoiseFile,
    monitorOn,
    monitorVolume,
    setMonitor,
  };
}

export type Controller = ReturnType<typeof useController>;
