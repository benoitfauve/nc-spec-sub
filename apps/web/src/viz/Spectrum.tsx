import { useEffect, useRef } from "preact/hooks";
import type { Engine } from "../audio/engine.ts";
import type { Stats } from "../audio/protocol.ts";
import { cssVar, fitCanvas, magDb } from "./canvas.ts";

const DB_MIN = -100;
const DB_MAX = 0;

/** Input, output and noise-estimate spectra on one axis (same window and scale). */
export function Spectrum({ engine }: { engine: Engine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const smoothed = useRef<{ in: Float32Array; out: Float32Array } | null>(null);

  useEffect(() => {
    const draw = (s: Stats) => {
      const canvas = ref.current;
      if (!canvas) return;
      const { ctx, w, h } = fitCanvas(canvas);
      const bins = s.inSpectrum.length;
      // light temporal smoothing for readability
      let sm = smoothed.current;
      if (!sm || sm.in.length !== bins) sm = smoothed.current = { in: s.inSpectrum.slice(), out: s.outSpectrum.slice() };
      for (let k = 0; k < bins; k++) {
        sm.in[k] = 0.6 * sm.in[k] + 0.4 * s.inSpectrum[k];
        sm.out[k] = 0.6 * sm.out[k] + 0.4 * s.outSpectrum[k];
      }
      const grid = cssVar(canvas, "--grid", "#ddd");
      const text = cssVar(canvas, "--muted", "#888");
      ctx.clearRect(0, 0, w, h);
      ctx.font = "11px system-ui, sans-serif";
      ctx.lineWidth = 1;
      ctx.strokeStyle = grid;
      ctx.fillStyle = text;
      for (let db = DB_MIN; db <= DB_MAX; db += 20) {
        const y = 6 + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * (h - 22);
        ctx.beginPath();
        ctx.moveTo(32, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
        ctx.fillText(`${db}`, 2, y + 4);
      }
      const nyq = s.sampleRate / 2;
      const step = nyq > 10000 ? 4000 : nyq > 5000 ? 2000 : 1000;
      for (let f = step; f < nyq; f += step) {
        const x = 32 + (f / nyq) * (w - 32);
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h - 16);
        ctx.stroke();
        ctx.fillText(`${f / 1000}k`, x - 8, h - 3);
      }
      const plot = (data: Float32Array, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let k = 0; k < bins; k++) {
          const x = 32 + (k / (bins - 1)) * (w - 32);
          const db = Math.max(DB_MIN, Math.min(DB_MAX, magDb(data[k], s.frameSize)));
          const y = 6 + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * (h - 22);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      plot(sm.in, cssVar(canvas, "--series-in", "#9aa"), 1.25);
      plot(sm.out, cssVar(canvas, "--series-out", "#2563eb"), 1.75);
      if (s.nlssEnabled) plot(s.noiseEstimate, cssVar(canvas, "--series-noise", "#e8590c"), 1.5);
    };
    return engine.onStats(draw);
  }, [engine]);

  return (
    <figure class="plot">
      <canvas ref={ref} class="plot-canvas" aria-label="Spectrum: input, output and noise estimate" />
      <figcaption class="legend">
        <span class="key key-in">input</span>
        <span class="key key-out">output</span>
        <span class="key key-noise">noise estimate</span>
        <span class="muted">dB (full-scale sine about 0 dB)</span>
      </figcaption>
    </figure>
  );
}
