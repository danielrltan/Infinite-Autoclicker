// Step Builder model + compiler. Steps *generate* a timeline (SPEC §6, §F1).
// One playback engine, one file format: built and recorded macros are both just
// `MacroEvent[]`.

import type { MacroEvent, MouseButton } from "./types";

export type ClickType = "left" | "right" | "middle" | "double";

export interface ClickStep {
  id: string;
  kind: "click";
  x: number;
  y: number;
  clickType: ClickType;
  count: number;
  /** seconds */
  delayBefore: number;
  /** seconds; adds uniform(0, jitter) to the delay when rolled at play time */
  delayJitter: number;
  returnCursor: boolean;
}

export interface DragStep {
  id: string;
  kind: "drag";
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  button: MouseButton;
  /** how long the press-hold-move takes (ms) */
  durationMs: number;
  delayBefore: number;
  delayJitter: number;
}

export type Step = ClickStep | DragStep;

export interface CompileOpts {
  /** Cursor home position; used to honor "return cursor after click". */
  home?: { x: number; y: number };
  /** Roll per-step delay jitter (true at play time, false for deterministic display/save). */
  rollJitter?: boolean;
}

let idCounter = 0;
export function newId(prefix = "step"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.floor(Math.random() * 1e6)}`;
}

export function newClickStep(x = 0, y = 0): ClickStep {
  return {
    id: newId(),
    kind: "click",
    x,
    y,
    clickType: "left",
    count: 1,
    delayBefore: 1,
    delayJitter: 0,
    returnCursor: false,
  };
}

export function newDragStep(): DragStep {
  return {
    id: newId(),
    kind: "drag",
    fromX: 0,
    fromY: 0,
    toX: 0,
    toY: 0,
    button: "left",
    durationMs: 400,
    delayBefore: 1,
    delayJitter: 0,
  };
}

/** Compile an ordered list of steps into a timeline of events. */
export function compileSteps(steps: Step[], opts: CompileOpts = {}): MacroEvent[] {
  const out: MacroEvent[] = [];
  let t = 0;
  for (const step of steps) {
    const jitter = opts.rollJitter ? Math.random() * step.delayJitter : 0;
    t += Math.round((step.delayBefore + jitter) * 1000);

    if (step.kind === "click") {
      const button: MouseButton =
        step.clickType === "double" ? "left" : step.clickType;
      const count = step.clickType === "double" ? 2 : Math.max(1, step.count);
      out.push({ t, kind: "click", button, x: step.x, y: step.y, count });
      if (step.returnCursor && opts.home) {
        out.push({ t, kind: "move", x: opts.home.x, y: opts.home.y });
      }
    } else {
      out.push({
        t,
        kind: "drag",
        button: step.button,
        from: [step.fromX, step.fromY],
        to: [step.toX, step.toY],
        duration_ms: step.durationMs,
      });
      // Advance virtual clock past the drag so the next step's delay is additive.
      t += step.durationMs;
    }
  }
  return out;
}

/** Total compiled duration in ms (for the timeline scale). */
export function timelineDuration(events: MacroEvent[]): number {
  if (events.length === 0) return 0;
  let max = 0;
  for (const e of events) {
    let end = e.t;
    if (e.kind === "drag") end += e.duration_ms;
    if (max < end) max = end;
  }
  return max;
}
