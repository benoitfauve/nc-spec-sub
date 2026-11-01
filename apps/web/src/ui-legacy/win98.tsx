import type { ComponentChildren, CSSProperties } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { icoToDataUrl } from "./ico.ts";

/** Dialog units to pixels for 8 pt MS Sans Serif at 96 dpi (as in record.rc). */
export const DLU_X = 1.5;
export const DLU_Y = 1.625;

export interface Rect {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export function pos({ x, y, w, h }: Rect): CSSProperties {
  return {
    left: `${Math.round(x * DLU_X)}px`,
    top: `${Math.round(y * DLU_Y)}px`,
    ...(w !== undefined ? { width: `${Math.round(w * DLU_X)}px` } : {}),
    ...(h !== undefined ? { height: `${Math.round(h * DLU_Y)}px` } : {}),
  };
}

/** Etched frame with its title sitting on the top edge (the line stops behind the title). */
export function GroupBox({ title, at }: { title: string; at: Rect }) {
  return (
    <div class="w-group" style={pos(at)} role="group" aria-label={title}>
      <span class="w-group-title">{title}</span>
    </div>
  );
}

export function Text({ at, children, align }: { at: Rect; children: ComponentChildren; align?: "center" }) {
  return (
    <div class="w-text" style={{ ...pos(at), textAlign: align }}>
      {children}
    </div>
  );
}

export function Sunken({ at, children }: { at: Rect; children: ComponentChildren }) {
  return (
    <div class="w-sunken" style={pos(at)}>
      {children}
    </div>
  );
}

export function Button(props: {
  at: Rect;
  children: ComponentChildren;
  onClick: () => void;
  isDefault?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      class={`w-button${props.isDefault ? " default" : ""}`}
      style={pos(props.at)}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      <span>{props.children}</span>
    </button>
  );
}

export function Check(props: { at: Rect; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="w-check" style={pos(props.at)}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
      />
      <i aria-hidden="true" />
      <span>{props.label}</span>
    </label>
  );
}

export function Combo<T extends string | number>(props: {
  at: Rect;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const current = props.options.find((o) => o.value === props.value);
  const parse = (raw: string) => (typeof props.value === "number" ? (Number(raw) as T) : (raw as T));
  return (
    <div class="w-combo" style={{ ...pos({ x: props.at.x, y: props.at.y, w: props.at.w }) }}>
      <span class="w-combo-text">{current?.label ?? String(props.value)}</span>
      <span class="w-combo-arrow" aria-hidden="true">
        <i />
      </span>
      <select
        aria-label={props.label}
        value={String(props.value)}
        onChange={(e) => props.onChange(parse((e.target as HTMLSelectElement).value))}
      >
        {props.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Horizontal Win32 scrollbar used as a slider, like the 2001 dialog (arrows step, track pages, thumb drags). */
export function ScrollBar(props: {
  at: Rect;
  value: number;
  min: number;
  max: number;
  step: number;
  page?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { min, max, step } = props;
  const page = props.page ?? step * 5;
  const h = Math.round((props.at.h ?? 8) * DLU_Y);
  const w = Math.round((props.at.w ?? 50) * DLU_X);
  const track = w - 2 * h;
  const thumb = h;
  const frac = (Math.min(max, Math.max(min, props.value)) - min) / (max - min || 1);
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  const set = (v: number) => {
    const s = Number(snap(v).toFixed(6));
    if (s !== props.value) props.onChange(s);
  };

  const onTrack = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const scale = rect.width / track;
    const x = (e.clientX - rect.left) / scale;
    const thumbX = frac * (track - thumb);
    set(x < thumbX ? props.value - page : props.value + page);
  };
  const onThumb = (e: PointerEvent) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const trackEl = el.parentElement!;
    const move = (ev: PointerEvent) => {
      const rect = trackEl.getBoundingClientRect();
      const scale = rect.width / track;
      const x = (ev.clientX - rect.left) / scale - thumb / 2;
      set(min + (Math.min(track - thumb, Math.max(0, x)) / (track - thumb)) * (max - min));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") set(props.value - step);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") set(props.value + step);
    else if (e.key === "PageDown") set(props.value - page);
    else if (e.key === "PageUp") set(props.value + page);
    else if (e.key === "Home") set(min);
    else if (e.key === "End") set(max);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={ref}
      class="w-scroll"
      style={pos(props.at)}
      role="slider"
      tabIndex={0}
      aria-label={props.label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={props.value}
      onKeyDown={onKey}
    >
      <button
        class="w-arrow"
        style={{ width: `${h}px` }}
        tabIndex={-1}
        aria-label="decrease"
        onClick={() => set(props.value - step)}
      >
        <i class="left" />
      </button>
      <div class="w-track" onPointerDown={onTrack}>
        <div
          class="w-thumb"
          style={{ width: `${thumb}px`, left: `${frac * (track - thumb)}px` }}
          onPointerDown={onThumb}
        />
      </div>
      <button
        class="w-arrow"
        style={{ width: `${h}px` }}
        tabIndex={-1}
        aria-label="increase"
        onClick={() => set(props.value + step)}
      >
        <i class="right" />
      </button>
    </div>
  );
}

export function Icon({ src, at, size = 32, alt }: { src: string; at: Rect; size?: number; alt: string }) {
  const url = useIco(src, size);
  return url ? <img class="w-icon" style={pos(at)} src={url} width={size} height={size} alt={alt} /> : null;
}

export function useIco(src: string, size = 32): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    icoToDataUrl(src, size)
      .then((u) => live && setUrl(u))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [src, size]);
  return url;
}
