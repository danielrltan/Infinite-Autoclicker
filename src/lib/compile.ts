// Step Builder model + compiler. One "Add step", then pick the action per step.
// Steps *generate* a timeline (SPEC §6, §F1); built and recorded macros share
// the same `MacroEvent[]` format and one playback engine.

import type { MacroEvent, MouseButton } from "./types";

export type ClickType = "left" | "right" | "middle" | "double";
export type ScrollDir = "up" | "down" | "left" | "right";
export type StepAction = "click" | "drag" | "scroll" | "key" | "wait" | "record";

/** A single, flat step. `action` selects which fields are used + shown. */
export interface Step {
  id: string;
  action: StepAction;
  /** seconds before this step runs */
  delayBefore: number;
  /** seconds; adds uniform(0, jitter) to the delay when rolled at play time */
  delayJitter: number;

  // click
  x: number;
  y: number;
  clickType: ClickType;
  count: number;
  returnCursor: boolean;

  // drag
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  button: MouseButton;
  durationMs: number;

  // scroll
  scrollDir: ScrollDir;
  scrollAmount: number;

  // key
  keyCode: string;

  // wait
  waitMs: number;

  // record (inline-recorded snippet)
  events: MacroEvent[];
}

export const ACTION_LABELS: Record<StepAction, string> = {
  click: "Click",
  drag: "Drag",
  scroll: "Scroll",
  key: "Key press",
  wait: "Wait",
  record: "Recorded action",
};

let idCounter = 0;
export function newId(prefix = "step"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.floor(Math.random() * 1e6)}`;
}

export function newStep(action: StepAction = "click", x = 0, y = 0): Step {
  return {
    id: newId(),
    action,
    delayBefore: 1,
    delayJitter: 0,
    x,
    y,
    clickType: "left",
    count: 1,
    returnCursor: false,
    fromX: x,
    fromY: y,
    toX: x,
    toY: y,
    button: "left",
    durationMs: 400,
    scrollDir: "down",
    scrollAmount: 3,
    keyCode: "Space",
    waitMs: 1000,
    events: [],
  };
}

function scrollDelta(dir: ScrollDir, amount: number): { dx: number; dy: number } {
  switch (dir) {
    case "up":
      return { dx: 0, dy: amount };
    case "down":
      return { dx: 0, dy: -amount };
    case "right":
      return { dx: amount, dy: 0 };
    case "left":
      return { dx: -amount, dy: 0 };
  }
}

function snippetDuration(events: MacroEvent[]): number {
  let max = 0;
  for (const e of events) {
    let end = e.t;
    if (e.kind === "drag") end += e.duration_ms;
    if (end > max) max = end;
  }
  return max;
}

export interface CompileOpts {
  home?: { x: number; y: number };
  rollJitter?: boolean;
}

/** Compile ordered steps into a timeline of events. */
export function compileSteps(steps: Step[], opts: CompileOpts = {}): MacroEvent[] {
  const out: MacroEvent[] = [];
  let t = 0;
  for (const step of steps) {
    const jitter = opts.rollJitter ? Math.random() * step.delayJitter : 0;
    t += Math.round((step.delayBefore + jitter) * 1000);

    switch (step.action) {
      case "click": {
        const button: MouseButton =
          step.clickType === "double" ? "left" : step.clickType;
        const count = step.clickType === "double" ? 2 : Math.max(1, step.count);
        out.push({ t, kind: "click", button, x: step.x, y: step.y, count });
        if (step.returnCursor && opts.home) {
          out.push({ t, kind: "move", x: opts.home.x, y: opts.home.y });
        }
        break;
      }
      case "drag": {
        out.push({
          t,
          kind: "drag",
          button: step.button,
          from: [step.fromX, step.fromY],
          to: [step.toX, step.toY],
          duration_ms: step.durationMs,
        });
        t += step.durationMs;
        break;
      }
      case "scroll": {
        const { dx, dy } = scrollDelta(step.scrollDir, step.scrollAmount);
        out.push({ t, kind: "scroll", x: step.x, y: step.y, dx, dy });
        break;
      }
      case "key": {
        out.push({ t, kind: "key", code: step.keyCode, action: "press" });
        out.push({ t, kind: "key", code: step.keyCode, action: "release" });
        break;
      }
      case "wait": {
        t += step.waitMs;
        break;
      }
      case "record": {
        for (const ev of step.events) {
          out.push({ ...ev, t: t + ev.t });
        }
        t += snippetDuration(step.events);
        break;
      }
    }
  }
  return out;
}

/** Total compiled duration in ms (for the timeline scale). */
export function timelineDuration(events: MacroEvent[]): number {
  let max = 0;
  for (const e of events) {
    let end = e.t;
    if (e.kind === "drag") end += e.duration_ms;
    if (end > max) max = end;
  }
  return max;
}
