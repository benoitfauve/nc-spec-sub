import { useEffect, useRef, useState } from "preact/hooks";
import type { Engine } from "../audio/engine.ts";
import type { Stats } from "../audio/protocol.ts";
import { colormap, fitCanvas, magDb } from "./canvas.ts";

const DB_MIN = -100;
const DB_MAX = -10;
const COL_PX = 3;

/** Scrolling spectrogram of the input or the output (one column per stats message, ~20/s). */
export function Spectrogram({ engine }: { engine: Engine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [which, setWhich] = useState<"out" | "in">("out");
  const whichRef = useRef(which);
  whichRef.current = which;

  useEffect(() => {
    const draw = (s: Stats) => {
      const canvas = ref.current;
      if (!canvas) return;
      const { ctx, w, h } = fitCanvas(canvas);
      const dpr = window.devicePixelRatio || 1;
      // scroll left by one column (in device pixels)
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(canvas, -COL_PX * dpr, 0);
      ctx.restore();
      const data = whichRef.current === "out" ? s.outSpectrum : s.inSpectrum;
      const bins = data.length;
      for (let y = 0; y < h; y++) {
        const k = Math.min(bins - 1, Math.floor(((h - 1 - y) / (h - 1)) * (bins - 1)));
        const db = magDb(data[k], s.frameSize);
        const [r, g, b] = colormap((db - DB_MIN) / (DB_MAX - DB_MIN));
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(w - COL_PX, y, COL_PX, 1);
      }
    };
    return engine.onStats(draw);
  }, [engine]);

  return (
    <figure class="plot">
      <canvas ref={ref} class="plot-canvas spectrogram" aria-label="Spectrogram" />
      <figcaption class="legend">
        <span class="seg">
          <button class={which === "out" ? "on" : ""} onClick={() => setWhich("out")}>
            Output
          </button>
          <button class={which === "in" ? "on" : ""} onClick={() => setWhich("in")}>
            Input
          </button>
        </span>
        <span class="muted">0 Hz at the bottom, Nyquist at the top, about 5 s across</span>
      </figcaption>
    </figure>
  );
}
