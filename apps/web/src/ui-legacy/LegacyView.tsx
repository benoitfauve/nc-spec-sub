import { useEffect, useRef, useState } from "preact/hooks";
import { effectiveWindow, Pipeline, type FilterStageConfig } from "@ncspec/dsp";
import type { Controller } from "../controller.ts";
import { Credits } from "../Credits.tsx";
import { Button, Check, Combo, GroupBox, Icon, ScrollBar, Sunken, Text, useIco, DLU_X, DLU_Y } from "./win98.tsx";
import crestUrl from "./assets/swansea-crest.png";
import sigUrl from "./assets/sig-logo.png";
import appIco from "./assets/app.ico?url";
import micIco from "./assets/mic.ico?url";
import fileIco from "./assets/file.ico?url";
import foundIco from "./assets/found.ico?url";
import notFoundIco from "./assets/not-found.ico?url";
import "./legacy.css";

/** Dialog client size: IDD_RECORD_DIALOG is 360 x 402 dialog units. */
const CLIENT_W = Math.round(360 * DLU_X);
const CLIENT_H = Math.round(402 * DLU_Y);

const withCurrent = <T extends number | string>(list: { value: T; label: string }[], value: T, label: string) =>
  list.some((o) => o.value === value) ? list : [...list, { value, label }];

/**
 * Re-creation of the 2001 "Noise Compensation" dialog (record.rc, IDD_RECORD_DIALOG),
 * control for control, driving the same engine and settings as the modern view.
 */
export function LegacyView({ c }: { c: Controller }) {
  const [about, setAbout] = useState(false);
  const [scale, setScale] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const noiseInput = useRef<HTMLInputElement>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const appIcon = useIco(appIco, 16);
  const { config, update } = c;

  useEffect(() => {
    const fit = () => {
      const s = Math.min((window.innerWidth - 24) / (CLIENT_W + 8), (window.innerHeight - 24) / (CLIENT_H + 70));
      setScale(Math.max(0.5, Math.min(1.6, s)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => c.engine.onStats((s) => setCapacity(s.estimatorCapacity)), [c.engine]);

  const inputClips = c.clips.filter((x) => x.kind !== "noise");
  const noiseClips = c.clips.filter((x) => x.kind === "noise");
  const fileMode = c.sourceKind !== "mic";
  const fileValue = c.sourceKind === "file" && c.file ? `file:${c.file.name}` : c.clipId;
  const fileOptions = withCurrent(
    inputClips.map((x) => ({ value: x.id, label: x.id.startsWith("2001/") ? `${x.id.slice(5)}.wav` : x.label })),
    fileValue,
    c.file?.name ?? fileValue,
  );

  const n = config.nlss;
  // 2001 display: "Size of Quantile Vector" (the dialog showed ne*te/0.032 + 2; we show the size really used)
  const quantileSize = capacity ?? Math.floor((n.estimatesPerBlock * n.intervalS) / 0.032 + 1);

  return (
    <div class="legacy-desktop">
      <div
        class="legacy-scaler"
        style={{
          transform: `scale(${scale})`,
          width: `${CLIENT_W + 8}px`,
          height: `${CLIENT_H + 70}px`,
          marginBottom: `${(scale - 1) * (CLIENT_H + 70)}px`,
        }}
      >
        <div class="w-window" role="dialog" aria-label="Noise Compensation">
          <div class="w-title">
            <button class="w-sysicon" onClick={() => setAbout(true)} title="About record..." aria-label="About">
              {appIcon && <img src={appIcon} width={16} height={16} alt="" />}
            </button>
            <span class="w-caption">Noise Compensation</span>
            <span class="w-cbtn" aria-hidden="true">
              _
            </span>
            <span class="w-cbtn" aria-hidden="true">
              □
            </span>
            <button
              class="w-cbtn close"
              onClick={() => c.setView("modern")}
              title="Back to the modern view"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div class="w-client" style={{ width: `${CLIENT_W}px`, height: `${CLIENT_H}px` }}>
            <GroupBox title="Volume" at={{ x: 14, y: 61, w: 328, h: 77 }} />
            <GroupBox title="Spectral Filtering" at={{ x: 13, y: 145, w: 303, h: 120 }} />
            <GroupBox title="NLSS" at={{ x: 13, y: 271, w: 304, h: 108 }} />

            <img
              class="w-bitmap"
              src={crestUrl}
              alt="University of Wales Swansea crest"
              style={{ left: "8px", top: "15px" }}
            />
            <Text at={{ x: 79, y: 10, w: 100, h: 8 }}>University of Wales Swansea</Text>
            <Text at={{ x: 79, y: 22, w: 100, h: 8 }}>Speech and Image Group</Text>
            <img
              class="w-bitmap"
              src={sigUrl}
              alt="Speech and Image Group logo"
              style={{ left: "293px", top: "11px" }}
            />
            <Text at={{ x: 78, y: 45, w: 110, h: 8 }}>Real-time&nbsp; Noise Compensation</Text>
            <Button
              at={{ x: 299, y: 7, w: 50, h: 14 }}
              isDefault
              onClick={() => c.setView("modern")}
              title="Back to the modern view"
            >
              Exit
            </Button>
            <Button
              at={{ x: 270, y: 32, w: 68, h: 26 }}
              onClick={() => (c.running ? c.stop() : c.start())}
              disabled={c.busy}
            >
              <u>S</u>
              {c.running ? "top Processing" : "tart Processing"}
            </Button>

            {/* Volume */}
            <Check
              at={{ x: 21, y: 82, w: 54, h: 10 }}
              label="Mic/File IP :"
              checked={fileMode}
              onChange={(v) => c.selectSource(v ? (c.file ? "file" : "clip") : "mic")}
            />
            <Icon
              src={fileMode ? fileIco : micIco}
              at={{ x: 25, y: 92 }}
              alt={fileMode ? "file input" : "microphone input"}
            />
            <Combo
              label="Input file"
              at={{ x: 77, y: 80, w: 80 }}
              value={fileValue}
              options={fileOptions}
              onChange={(id) =>
                id.startsWith("file:") ? c.selectSource("file") : c.selectSource("clip", { clipId: id })
              }
            />
            <Button at={{ x: 164, y: 80, w: 37, h: 14 }} onClick={() => fileInput.current?.click()}>
              Open
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,.wav"
              hidden
              onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) c.selectSource("file", { file: f });
              }}
            />
            <ScrollBar
              label="Gain"
              at={{ x: 208, y: 82, w: 91, h: 8 }}
              value={config.gain}
              min={0}
              max={3}
              step={0.1}
              page={0.5}
              onChange={(v) => update((x) => void (x.gain = v))}
            />
            <Sunken at={{ x: 307, y: 79, w: 24, h: 16 }}>&nbsp;{config.gain.toFixed(1)}</Sunken>

            <Check
              at={{ x: 22, y: 115, w: 42, h: 10 }}
              label="  Noise :"
              checked={config.noise.enabled}
              onChange={(v) => update((x) => void (x.noise.enabled = v))}
            />
            <Combo
              label="Noise file"
              at={{ x: 77, y: 114, w: 80 }}
              value={config.noise.clip}
              options={withCurrent(
                noiseClips.map((x) => ({
                  value: x.id,
                  label: x.id.startsWith("2001/") ? `${x.id.slice(5)}.wav` : `${x.id.split("/")[1]}.wav`,
                })),
                config.noise.clip,
                config.noise.clip.replace(/^file:/, ""),
              )}
              onChange={(id) => update((x) => void (x.noise.clip = id))}
            />
            <Button at={{ x: 163, y: 113, w: 37, h: 14 }} onClick={() => noiseInput.current?.click()}>
              Open
            </Button>
            <input
              ref={noiseInput}
              type="file"
              accept="audio/*,.wav"
              hidden
              onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) c.loadNoiseFile(f);
              }}
            />
            <ScrollBar
              label="Noise level"
              at={{ x: 208, y: 116, w: 92, h: 8 }}
              value={config.noise.level}
              min={0}
              max={3}
              step={0.1}
              page={0.5}
              onChange={(v) => update((x) => void (x.noise.level = v))}
            />
            <Sunken at={{ x: 307, y: 112, w: 24, h: 16 }}>&nbsp;{config.noise.level.toFixed(1)}</Sunken>

            {/* Spectral filtering */}
            <Text at={{ x: 72, y: 162, w: 14, h: 8 }}>H/L</Text>
            <Text at={{ x: 123, y: 162, w: 34, h: 8 }}>Frequency</Text>
            <Text at={{ x: 185, y: 162, w: 18, h: 8 }}>Order</Text>
            <Text at={{ x: 222, y: 162, w: 10, h: 8 }}>Db</Text>
            <Text at={{ x: 264, y: 162, w: 17, h: 8 }}>Type</Text>
            <FilterRow c={c} index={0} y={181} checkAt={{ x: 21, y: 183, w: 33, h: 10 }} iconY={196} />
            <FilterRow c={c} index={1} y={219} checkAt={{ x: 22, y: 221, w: 33, h: 10 }} iconY={233} />

            {/* NLSS */}
            <Check
              at={{ x: 27, y: 296, w: 42, h: 10 }}
              label="On / Off"
              checked={n.enabled}
              onChange={(v) => update((x) => void (x.nlss.enabled = v))}
            />
            <Text at={{ x: 86, y: 283, w: 72, h: 8 }}>Estimation Interval (s)</Text>
            <Text at={{ x: 161, y: 283, w: 70, h: 8 }}>Shift Percentage (%)</Text>
            <Text at={{ x: 237, y: 283, w: 78, h: 8 }}>Size of Quantile Vector</Text>
            <Combo
              label="Estimation interval"
              at={{ x: 105, y: 295, w: 27 }}
              value={n.intervalS}
              options={withCurrent(
                [0.2, 0.4, 0.6, 0.8, 1.0].map((v) => ({ value: v, label: v.toFixed(1) })),
                n.intervalS,
                n.intervalS.toFixed(1),
              )}
              onChange={(v) => update((x) => void (x.nlss.intervalS = v))}
            />
            <Combo
              label="Shift percentage"
              at={{ x: 175, y: 295, w: 30 }}
              value={n.estimatesPerBlock}
              options={[
                { value: 1, label: "100" },
                { value: 2, label: "50" },
                { value: 3, label: "33" },
                { value: 4, label: "25" },
              ]}
              onChange={(v) => update((x) => void (x.nlss.estimatesPerBlock = v))}
            />
            <Sunken at={{ x: 259, y: 294, w: 21, h: 14 }}>&nbsp;{quantileSize}</Sunken>
            <Text at={{ x: 46, y: 328, w: 78, h: 8 }}>Estimation Factor [0,10]</Text>
            <ScrollBar
              label="Estimation factor"
              at={{ x: 126, y: 327, w: 110, h: 10 }}
              value={n.alpha}
              min={0}
              max={10}
              step={0.05}
              page={0.5}
              onChange={(v) => update((x) => void (x.nlss.alpha = v))}
            />
            <Sunken at={{ x: 241, y: 325, w: 27, h: 13 }}>&nbsp;{n.alpha.toFixed(2)}</Sunken>
            <Text at={{ x: 65, y: 351, w: 56, h: 8 }}>Noise Floor [0,1]</Text>
            <ScrollBar
              label="Noise floor"
              at={{ x: 126, y: 349, w: 110, h: 10 }}
              value={n.beta}
              min={0}
              max={0.5}
              step={0.005}
              page={0.05}
              onChange={(v) => update((x) => void (x.nlss.beta = v))}
            />
            <Sunken at={{ x: 241, y: 348, w: 28, h: 13 }}>&nbsp;{n.beta.toFixed(3)}</Sunken>
          </div>
        </div>
        <p class="legacy-note">
          How it started: the MFC (Visual C++) app from 2001, for the work of Evans, Mason and Fauve on quantile-based
          noise estimation (
          <a href="https://doi.org/10.21437/Eurospeech.2001-271" target="_blank" rel="noreferrer">
            Eurospeech 2001
          </a>
          ,{" "}
          <a href="https://doi.org/10.1109/ICDSP.2002.1028255" target="_blank" rel="noreferrer">
            DSP 2002
          </a>
          ). Processing:{" "}
          {n.overlap > 0
            ? `${effectiveWindow(n) === "sqrtHann" ? "sqrt-Hann" : "rectangular"} frames, 50% overlap-add`
            : "rectangular blocks, no overlap"}
          , {c.rate / 1000} kHz.{" "}
          <button class="linkish" onClick={() => c.setView("modern")}>
            Modern view
          </button>
        </p>
      </div>

      {about && (
        <div class="w-modal" role="dialog" aria-label="About record" onClick={() => setAbout(false)}>
          <div class="w-window about" onClick={(e) => e.stopPropagation()}>
            <div class="w-title">
              <span class="w-caption">About record</span>
              <button class="w-cbtn close" onClick={() => setAbout(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div class="about-body">
              <div class="about-head">
                {appIcon && <img src={appIcon} width={32} height={32} alt="" style={{ imageRendering: "pixelated" }} />}
                <div>
                  <p>record Version 1.0</p>
                  <p>Copyright (C) 1998</p>
                  <p>Re-created in 2026 as nc-spec-sub (web, TypeScript)</p>
                </div>
                <button class="w-button static" onClick={() => setAbout(false)}>
                  <span>OK</span>
                </button>
              </div>
              <Credits />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  c,
  index,
  y,
  checkAt,
  iconY,
}: {
  c: Controller;
  index: 0 | 1;
  y: number;
  checkAt: { x: number; y: number; w: number; h: number };
  iconY: number;
}) {
  const f = c.config.filters[index];
  const set = (m: (x: FilterStageConfig) => void) => c.update((x) => m(x.filters[index]));
  const status = Pipeline.design({ ...f, enabled: true }, c.rate).status;
  const found = status === "ok";
  const dbValue = f.kind === "butter" ? f.attenuationDb : f.rippleDb;
  const dbOptions = withCurrent(
    [0.1, 0.3, 0.5, 1, 3].map((v) => ({ value: v, label: String(v) })),
    dbValue,
    String(dbValue),
  );
  const typeOptions = withCurrent(
    [
      { value: "butter", label: "Butterworth" },
      { value: "cheby1", label: "Chebychev" },
    ],
    f.kind,
    "Chebychev II",
  );
  const label = `File ${index + 1}`;
  return (
    <>
      <Check at={checkAt} label={label} checked={f.enabled} onChange={(v) => set((x) => void (x.enabled = v))} />
      <Icon
        src={found ? foundIco : notFoundIco}
        at={{ x: 35, y: iconY }}
        alt={found ? "filter available" : "filter not available"}
      />
      <Combo
        label={`${label} high or low`}
        at={{ x: 63, y, w: 33 }}
        value={f.response}
        options={[
          { value: "lowpass", label: "Low" },
          { value: "highpass", label: "High" },
        ]}
        onChange={(v) => set((x) => void (x.response = v))}
      />
      <Sunken at={{ x: 121, y: y + (index === 0 ? 0 : 1), w: 39, h: 13 }}>&nbsp;{f.cutoffHz} Hz</Sunken>
      <ScrollBar
        label={`${label} frequency`}
        at={{ x: 100, y: y + 19 + (index === 0 ? 0 : 2), w: 78, h: 8 }}
        value={f.cutoffHz}
        min={0}
        max={4000}
        step={50}
        page={500}
        onChange={(v) => set((x) => void (x.cutoffHz = v))}
      />
      <Combo
        label={`${label} order`}
        at={{ x: 184, y: y + (index === 0 ? 0 : 1), w: 24 }}
        value={f.order}
        options={withCurrent(
          [2, 4, 6, 8, 10].map((o) => ({ value: o, label: String(o) })),
          f.order,
          String(f.order),
        )}
        onChange={(v) => set((x) => void (x.order = v))}
      />
      <Combo
        label={`${label} dB`}
        at={{ x: 215, y, w: 27 }}
        value={dbValue}
        options={dbOptions}
        onChange={(v) =>
          set((x) => {
            if (x.kind === "butter") x.attenuationDb = v;
            else x.rippleDb = v;
          })
        }
      />
      <Combo
        label={`${label} type`}
        at={{ x: 251, y, w: 55 }}
        value={f.kind}
        options={typeOptions}
        onChange={(v) => set((x) => void (x.kind = v))}
      />
      <Text at={{ x: 255, y: y + 16, w: 52, h: 10 }}>{found ? `${label} found` : `${label} not found`}</Text>
    </>
  );
}
