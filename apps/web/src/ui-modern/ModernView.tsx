import { useEffect, useState } from "preact/hooks";
import { effectiveWindow, presets, type FilterStageConfig, type PresetName } from "@ncspec/dsp";
import { RATES, type Controller } from "../controller.ts";
import type { Stats } from "../audio/protocol.ts";
import { Spectrum } from "../viz/Spectrum.tsx";
import { Spectrogram } from "../viz/Spectrogram.tsx";
import { FilterResponse } from "../viz/FilterResponse.tsx";
import { Credits } from "../Credits.tsx";
import { Card, Segmented, Select, Slider, SteppedSlider, Switch } from "./controls.tsx";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const db = (v: number) => (v <= 0 ? "-inf dB" : `${(20 * Math.log10(v)).toFixed(1)} dB`);

export function ModernView({ c }: { c: Controller }) {
  const { config, update } = c;
  const [showCredits, setShowCredits] = useState(false);
  const speechClips = c.clips.filter((x) => x.kind !== "noise");
  const noiseClips = c.clips.filter((x) => x.kind === "noise");

  return (
    <div class="modern">
      <header class="topbar">
        <div class="brand">
          <h1>nc-spec-sub</h1>
          <p>Noise compensation by quantile-based noise estimation and non-linear spectral subtraction (NLSS)</p>
        </div>
        <div class="topbar-actions">
          <div class="seg" role="tablist" aria-label="View">
            <button role="tab" aria-selected="true" class="on">
              Modern
            </button>
            <button role="tab" aria-selected="false" onClick={() => c.setView("legacy")}>
              2001
            </button>
          </div>
          <button
            class={`primary big${c.running ? " stop" : ""}`}
            disabled={c.busy}
            onClick={() => (c.running ? c.stop() : c.start())}
          >
            {c.running ? "Stop" : "Start"}
          </button>
        </div>
      </header>

      {c.error && (
        <div class="banner error" role="alert">
          <span>{c.error}</span>
          <button class="ghost" onClick={() => c.setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <main class="layout">
        <div class="col controls">
          <Card title="Source">
            <Segmented
              label="Input"
              value={c.sourceKind}
              options={[
                { value: "clip", label: "Clip" },
                { value: "file", label: "Your file" },
                { value: "mic", label: "Microphone" },
              ]}
              onChange={(k) => c.selectSource(k)}
            />
            {c.sourceKind === "clip" && (
              <Select
                label="Clip (looped)"
                value={c.clipId}
                options={speechClips.map((x) => ({ value: x.id, label: x.label, group: x.group }))}
                onChange={(id) => c.selectSource("clip", { clipId: id })}
              />
            )}
            {c.sourceKind === "file" && (
              <div class="field">
                <label class="field-label" for="upload">
                  Audio file (looped)
                </label>
                <input
                  id="upload"
                  type="file"
                  accept="audio/*,.wav"
                  onChange={(e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) c.selectSource("file", { file: f });
                  }}
                />
                {c.file && <p class="hint">{c.file.name}</p>}
              </div>
            )}
            {c.sourceKind === "mic" && (
              <p class="hint warn">
                Use headphones: the processed microphone is played back live and loudspeakers will feed back.
              </p>
            )}
            <div class="row">
              <Select
                label="Sample rate"
                value={c.rate}
                options={RATES.map((r) => ({
                  value: r,
                  label: `${r / 1000} kHz${r === 8000 ? " (telephone, 2001)" : ""}`,
                }))}
                onChange={c.setRate}
              />
              <Slider
                label="Monitor volume"
                value={c.monitorVolume}
                min={0}
                max={1}
                step={0.05}
                format={pct}
                onInput={(v) => c.setMonitor(c.monitorOn, v)}
              />
            </div>
            <div class="row">
              <Switch label="Play to speakers" checked={c.monitorOn} onChange={(v) => c.setMonitor(v)} />
              <Switch
                label="Bypass (A/B)"
                checked={config.bypass}
                onChange={(v) => update((x) => void (x.bypass = v))}
              />
            </div>
          </Card>

          <Card title="Preset">
            <Select
              label="Start from"
              value={c.preset}
              options={[
                { value: "custom", label: "Custom (current settings)" },
                ...(Object.keys(presets) as PresetName[]).map((k) => ({ value: k, label: presets[k].label })),
              ]}
              onChange={(v) => v !== "custom" && c.applyPreset(v as PresetName)}
            />
            {c.preset !== "custom" && <p class="hint">{presets[c.preset].description}</p>}
            <div class="row buttons">
              <button onClick={c.exportConfig}>Save settings</button>
              <label class="button">
                Load settings
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) c.importConfig(f);
                  }}
                />
              </label>
            </div>
          </Card>

          <Card title="1. Gain">
            <Slider
              label="Input gain"
              value={config.gain}
              min={0}
              max={3}
              step={0.05}
              format={(v) => `${v.toFixed(2)}x  (${db(v)})`}
              onInput={(v) => update((x) => void (x.gain = v))}
            />
          </Card>

          <Card
            title="2. Add noise"
            enabled={config.noise.enabled}
            onToggle={(v) => update((x) => void (x.noise.enabled = v))}
          >
            <Select
              label="Noise clip (looped)"
              value={config.noise.clip}
              options={[
                ...noiseClips.map((x) => ({ value: x.id, label: x.label, group: x.group })),
                ...(config.noise.clip.startsWith("file:")
                  ? [{ value: config.noise.clip, label: config.noise.clip.slice(5), group: "Your file" }]
                  : []),
              ]}
              onChange={(id) => update((x) => void (x.noise.clip = id))}
            />
            <label class="button small-file">
              Use your own noise file…
              <input
                type="file"
                accept="audio/*,.wav"
                hidden
                onChange={(e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) c.loadNoiseFile(f);
                }}
              />
            </label>
            <Slider
              label="Level"
              value={config.noise.level}
              min={0}
              max={3}
              step={0.05}
              format={(v) => `${v.toFixed(2)}x`}
              onInput={(v) => update((x) => void (x.noise.level = v))}
            />
          </Card>

          <NlssCard c={c} />

          {[0, 1].map((i) => (
            <FilterCard key={i} index={i as 0 | 1} c={c} />
          ))}

          <Card title="6. Output">
            <Switch
              label="Soft limiter (instead of the 2001 integer wrap-around)"
              checked={config.limiter}
              onChange={(v) => update((x) => void (x.limiter = v))}
            />
          </Card>
        </div>

        <div class="col viz">
          <Card title="Spectrum">
            <Spectrum engine={c.engine} />
            <StatusLine c={c} />
          </Card>
          <Card title="Spectrogram">
            <Spectrogram engine={c.engine} />
          </Card>
          <Card title="Filters">
            <FilterResponse filters={config.filters} sampleRate={c.rate} />
          </Card>
          <Card title="Export">
            <div class="row buttons">
              <button onClick={c.toggleRecording} disabled={!c.running} class={c.recording ? "rec on" : "rec"}>
                {c.recording ? "Stop and save recording" : "Record output"}
              </button>
              <button onClick={c.exportProcessed} disabled={c.busy || c.sourceKind === "mic"}>
                Process whole clip and download
              </button>
            </div>
            {c.exportProgress !== null && <progress value={c.exportProgress} max={1} />}
            <p class="hint">
              Recording captures what you hear. The offline export runs the current settings over the whole clip, faster
              than real time, with the processing delay removed.
            </p>
          </Card>
        </div>
      </main>

      <footer class="foot">
        <p>Everything runs in your browser; no audio leaves your device.</p>
        <button class="ghost" onClick={() => setShowCredits(!showCredits)}>
          {showCredits ? "Hide credits" : "Credits and licences"}
        </button>
        {showCredits && <Credits />}
      </footer>
    </div>
  );
}

function NlssCard({ c }: { c: Controller }) {
  const n = c.config.nlss;
  const set = (f: (x: typeof n) => void) => c.update((x) => f(x.nlss));
  return (
    <Card
      title="3. Non-linear spectral subtraction (NLSS)"
      enabled={n.enabled}
      onToggle={(v) => set((x) => void (x.enabled = v))}
    >
      <div class="row">
        <Slider
          label="Estimation interval"
          value={n.intervalS}
          min={0.1}
          max={2}
          step={0.1}
          format={(v) => `${v.toFixed(1)} s`}
          onInput={(v) => set((x) => void (x.intervalS = v))}
        />
        <Slider
          label="Quantile"
          value={n.quantile}
          min={0.05}
          max={0.95}
          step={0.05}
          format={(v) => (v === 0.5 ? "0.50 (median)" : v.toFixed(2))}
          onInput={(v) => set((x) => void (x.quantile = v))}
        />
      </div>
      <Slider
        label="Estimation factor α (over-subtraction)"
        value={n.alpha}
        min={0}
        max={5}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onInput={(v) => set((x) => void (x.alpha = v))}
        hint="0.25 was best for speech recognition in the papers; 1 to 2 usually sounds best."
      />
      <Slider
        label="Noise floor β"
        value={n.beta}
        min={0}
        max={0.2}
        step={0.005}
        format={(v) => v.toFixed(3)}
        onInput={(v) => set((x) => void (x.beta = v))}
        hint="A small floor masks musical noise, at the cost of some residual noise."
      />
      <div class="row">
        <Switch
          label="Smooth the estimate"
          checked={n.smoothEstimate}
          onChange={(v) => set((x) => void (x.smoothEstimate = v))}
        />
        <Switch
          label="Median-filter the spectrum"
          checked={n.medianFilter}
          onChange={(v) => set((x) => void (x.medianFilter = v))}
        />
        <Switch
          label="Overlap frames (50%)"
          checked={n.overlap > 0}
          onChange={(v) => set((x) => void (x.overlap = v ? 0.5 : 0))}
        />
        <Switch
          label="Tapered window"
          checked={effectiveWindow(n) === "sqrtHann"}
          disabled={n.overlap === 0}
          onChange={(v) => set((x) => void (x.window = v ? "sqrtHann" : "rectangular"))}
        />
      </div>
      <SteppedSlider
        label="Shift percentage"
        value={n.estimatesPerBlock}
        steps={[1, 2, 3, 4].map((v) => ({ value: v, above: String(v), below: String(Math.round(100 / v)) }))}
        captions={{ above: "estimates", below: "shift %" }}
        format={(v) => `${Math.round(100 / v)}%, ${v} estimate${v > 1 ? "s" : ""} per frame`}
        onInput={(v) => set((x) => void (x.estimatesPerBlock = v))}
      />
    </Card>
  );
}

function FilterCard({ index, c }: { index: 0 | 1; c: Controller }) {
  const f = c.config.filters[index];
  const set = (m: (x: FilterStageConfig) => void) => c.update((x) => m(x.filters[index]));
  const nyq = c.rate / 2;
  return (
    <Card
      title={`${4 + index}. Filter ${index + 1}`}
      enabled={f.enabled}
      onToggle={(v) => set((x) => void (x.enabled = v))}
    >
      <div class="row">
        <Select
          label="Type"
          value={f.kind}
          options={[
            { value: "butter", label: "Butterworth" },
            { value: "cheby1", label: "Chebyshev I" },
            { value: "cheby2", label: "Chebyshev II" },
          ]}
          onChange={(v) => set((x) => void (x.kind = v))}
        />
        <Select
          label="Response"
          value={f.response}
          options={[
            { value: "highpass", label: "High-pass" },
            { value: "lowpass", label: "Low-pass" },
          ]}
          onChange={(v) => set((x) => void (x.response = v))}
        />
        <Select
          label="Order"
          value={f.order}
          options={[1, 2, 3, 4, 5, 6, 8, 10, 12].map((o) => ({ value: o, label: String(o) }))}
          onChange={(v) => set((x) => void (x.order = v))}
        />
      </div>
      <Slider
        label="Cutoff"
        value={Math.min(f.cutoffHz, nyq - 50)}
        min={50}
        max={nyq - 50}
        step={50}
        format={(v) => `${v} Hz`}
        onInput={(v) => set((x) => void (x.cutoffHz = v))}
      />
      {f.kind === "cheby1" && (
        <Slider
          label="Passband ripple"
          value={f.rippleDb}
          min={0.1}
          max={3}
          step={0.1}
          format={(v) => `${v.toFixed(1)} dB`}
          onInput={(v) => set((x) => void (x.rippleDb = v))}
        />
      )}
      {f.kind === "cheby2" && (
        <Slider
          label="Stopband attenuation"
          value={f.stopbandDb}
          min={10}
          max={80}
          step={1}
          format={(v) => `${v} dB`}
          onInput={(v) => set((x) => void (x.stopbandDb = v))}
        />
      )}
      {f.kind === "butter" && (
        <Slider
          label="Attenuation at cutoff"
          value={f.attenuationDb}
          min={0.5}
          max={6}
          step={0.5}
          format={(v) => `${v.toFixed(1)} dB`}
          onInput={(v) => set((x) => void (x.attenuationDb = v))}
        />
      )}
    </Card>
  );
}

function StatusLine({ c }: { c: Controller }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let last = 0;
    return c.engine.onStats((st) => {
      const now = performance.now();
      if (now - last > 250) {
        last = now;
        setS(st);
      }
    });
  }, [c.engine]);
  if (!s || !c.running) return <p class="status muted">Press Start to begin.</p>;
  const dbfs = (v: number) => (v > 0 ? `${(20 * Math.log10(v)).toFixed(0)}` : "-inf");
  const status = s.filterStatus.map((x, i) => `F${i + 1} ${x}`).join(", ");
  return (
    <p class="status">
      <span>{s.sampleRate} Hz</span>
      <span>
        frame {s.frameSize} ({((s.frameSize / s.sampleRate) * 1000).toFixed(0)} ms)
      </span>
      <span>estimator {s.estimatorCapacity} frames</span>
      <span>delay {((s.latency / s.sampleRate) * 1000).toFixed(0)} ms</span>
      <span>
        in {dbfs(s.inLevel.rms)} / out {dbfs(s.outLevel.rms)} dBFS
      </span>
      <span>{status}</span>
      {s.clipped > 0 && <span class="warn">limiting</span>}
    </p>
  );
}
