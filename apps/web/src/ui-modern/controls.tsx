import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onInput: (v: number) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const fmt = props.format ?? ((v: number) => String(v));
  return (
    <div class="field">
      <div class="field-head">
        <label for={id}>{props.label}</label>
        <output for={id}>{fmt(props.value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onInput={(e) => props.onInput(Number((e.target as HTMLInputElement).value))}
      />
      {props.hint && <p class="hint">{props.hint}</p>}
    </div>
  );
}

export function Switch(props: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class={`switch${props.disabled ? " disabled" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
      />
      <span class="track" aria-hidden="true">
        <span class="thumb" />
      </span>
      <span>{props.label}</span>
    </label>
  );
}

export function Select<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: string; group?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const groups = new Map<string, { value: T; label: string }[]>();
  for (const o of props.options) {
    const g = o.group ?? "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(o);
  }
  const parse = (raw: string) => (typeof props.value === "number" ? (Number(raw) as T) : (raw as T));
  return (
    <div class="field">
      <label for={id} class="field-label">
        {props.label}
      </label>
      <select
        id={id}
        value={String(props.value)}
        disabled={props.disabled}
        onChange={(e) => props.onChange(parse((e.target as HTMLSelectElement).value))}
      >
        {[...groups.entries()].map(([g, opts]) =>
          g ? (
            <optgroup label={g} key={g}>
              {opts.map((o) => (
                <option value={String(o.value)} key={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            opts.map((o) => (
              <option value={String(o.value)} key={String(o.value)}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
    </div>
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="field">
      <span class="field-label">{props.label}</span>
      <div class="seg" role="radiogroup" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={props.value === o.value}
            class={props.value === o.value ? "on" : ""}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Card(props: {
  title: string;
  enabled?: boolean;
  onToggle?: (v: boolean) => void;
  badge?: ComponentChildren;
  children: ComponentChildren;
  id?: string;
}) {
  const off = props.enabled === false;
  return (
    <section class={`card${off ? " off" : ""}`} id={props.id}>
      <header class="card-head">
        <h2>{props.title}</h2>
        {props.badge}
        {props.onToggle && (
          <Switch label={props.enabled ? "On" : "Off"} checked={!!props.enabled} onChange={props.onToggle} />
        )}
      </header>
      <div class="card-body">{props.children}</div>
    </section>
  );
}

/** A slider over a few fixed choices, with a tick and a label above and below each stop. */
export function SteppedSlider<T extends number>(props: {
  label: string;
  value: T;
  steps: { value: T; above: string; below: string }[];
  captions?: { above: string; below: string };
  format?: (v: T) => string;
  onInput: (v: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const last = props.steps.length - 1;
  const index = Math.max(
    0,
    props.steps.findIndex((s) => s.value === props.value),
  );
  // stop centres line up with the thumb centre at each end of the track
  const left = (i: number) => `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${i / last})`;
  const labels = (key: "above" | "below") => (
    <div class="stepped-labels" aria-hidden="true">
      {props.steps.map((s, i) => (
        <span
          key={i}
          style={{ left: left(i) }}
          class={i === index ? "on" : ""}
          onClick={() => !props.disabled && props.onInput(s.value)}
        >
          {s[key]}
        </span>
      ))}
    </div>
  );
  return (
    <div class="field stepped">
      <div class="field-head">
        <label for={id}>{props.label}</label>
        <output for={id}>{props.format ? props.format(props.value) : String(props.value)}</output>
      </div>
      <div class="stepped-grid">
        <span class="stepped-cap">{props.captions?.above}</span>
        {labels("above")}
        <span />
        <div class="stepped-track">
          {props.steps.map((_, i) => (
            <span key={i} class="stepped-tick" style={{ left: left(i) }} />
          ))}
          <input
            id={id}
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            disabled={props.disabled}
            aria-valuetext={props.format ? props.format(props.value) : undefined}
            onInput={(e) => props.onInput(props.steps[Number((e.target as HTMLInputElement).value)].value)}
          />
        </div>
        <span class="stepped-cap">{props.captions?.below}</span>
        {labels("below")}
      </div>
    </div>
  );
}
