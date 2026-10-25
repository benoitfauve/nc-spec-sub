import { useEffect, useRef } from "preact/hooks";
import { Pipeline, response, type FilterStageConfig } from "@ncspec/dsp";
import { cssVar, fitCanvas } from "./canvas.ts";

const DB_MIN = -80;
const DB_MAX = 10;

/** Magnitude response of filter 1, filter 2 and their cascade. */
export function FilterResponse({
  filters,
  sampleRate,
}: {
  filters: [FilterStageConfig, FilterStageConfig];
  sampleRate: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const { ctx, w, h } = fitCanvas(canvas);
      const designs = filters.map((f) => Pipeline.design(f, sampleRate).sections);
      const nyq = sampleRate / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.font = "11px system-ui, sans-serif";
      ctx.strokeStyle = cssVar(canvas, "--grid", "#ddd");
      ctx.fillStyle = cssVar(canvas, "--muted", "#888");
      ctx.lineWidth = 1;
      for (let db = DB_MIN; db <= DB_MAX; db += 20) {
        const y = 6 + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * (h - 22);
        ctx.beginPath();
        ctx.moveTo(32, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
        ctx.fillText(`${db}`, 2, y + 4);
      }
      const step = nyq > 10000 ? 4000 : nyq > 5000 ? 2000 : 1000;
      for (let f = step; f < nyq; f += step) {
        const x = 32 + (f / nyq) * (w - 32);
        ctx.fillText(`${f / 1000}k`, x - 8, h - 3);
      }
      const curve = (sections: (typeof designs)[number][], color: string, width: number, dash: number[]) => {
        if (sections.every((s) => s.length === 0)) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        const n = Math.max(64, w - 32);
        for (let i = 0; i <= n; i++) {
          const f = (i / n) * nyq;
          let mag = 1;
          for (const s of sections) if (s.length) mag *= response(s, f, sampleRate).mag;
          const db = Math.max(DB_MIN, Math.min(DB_MAX, 20 * Math.log10(Math.max(mag, 1e-9))));
          const x = 32 + (i / n) * (w - 32);
          const y = 6 + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * (h - 22);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      curve([designs[0]], cssVar(canvas, "--series-f1", "#16a34a"), 1.25, [4, 3]);
      curve([designs[1]], cssVar(canvas, "--series-f2", "#9333ea"), 1.25, [4, 3]);
      curve(designs, cssVar(canvas, "--series-out", "#2563eb"), 2, []);
      if (designs.every((d) => d.length === 0)) {
        ctx.fillStyle = cssVar(canvas, "--muted", "#888");
        ctx.font = "13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Both filters are off (or their cutoff is out of range)", 16 + w / 2, h / 2);
        ctx.textAlign = "start";
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [filters, sampleRate]);

  return (
    <figure class="plot">
      <canvas ref={ref} class="plot-canvas short" aria-label="Filter magnitude response" />
      <figcaption class="legend">
        <span class="key key-f1">filter 1</span>
        <span class="key key-f2">filter 2</span>
        <span class="key key-out">cascade</span>
        <span class="muted">dB</span>
      </figcaption>
    </figure>
  );
}
