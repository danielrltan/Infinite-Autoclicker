import { useMemo } from "react";
import { useApp } from "@/store";
import { timelineDuration } from "@/lib/compile";
import { fmtMs } from "@/lib/utils";
import type { MacroEvent } from "@/lib/types";

const VB_W = 1000;
const VB_H = 100;

/**
 * The signature element (SPEC §10): a horizontal, scrubbable time track that is
 * simultaneously the live recording view, the editor overview, and the playback
 * progress indicator. Clicks render as ticks, motion as a faint connecting line,
 * key events as labeled marks; a playhead sweeps during playback.
 */
export function Timeline() {
  const { events, status, progress, recording } = useApp();
  const duration = useMemo(() => timelineDuration(events), [events]);

  const xOf = (t: number) => (duration > 0 ? (t / duration) * VB_W : 0);

  // Normalize motion Y for a meaningful path shape.
  const { yMin, ySpan } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of events) {
      const y = eventY(e);
      if (y == null) continue;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    if (!isFinite(lo)) return { yMin: 0, ySpan: 1 };
    return { yMin: lo, ySpan: Math.max(1, hi - lo) };
  }, [events]);
  const yOf = (y: number) => 15 + ((y - yMin) / ySpan) * (VB_H - 30);

  const motionPoints = useMemo(() => {
    const pts: string[] = [];
    for (const e of events) {
      const y = eventY(e);
      if (e.kind === "move" && y != null) pts.push(`${xOf(e.t)},${yOf(y)}`);
    }
    return pts.join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, duration, yMin, ySpan]);

  const playheadEvent =
    progress && progress.totalEvents > 0 ? events[progress.event] : undefined;
  const playheadT = playheadEvent ? playheadEvent.t : null;

  const isEmpty = events.length === 0;

  return (
    <div className="rounded-card border border-border bg-surface">
      <div className="flex items-center justify-between px-3 pt-2 text-xs text-muted">
        <span>Event timeline</span>
        <span className="tabular">
          {events.length} {events.length === 1 ? "event" : "events"}
          {duration > 0 && ` · ${fmtMs(duration)}`}
        </span>
      </div>
      <div className="relative h-32 px-1 pb-2">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted">
            {recording.active
              ? "Recording… your actions will appear here."
              : "Record your actions or add a click to begin."}
          </div>
        ) : (
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Timeline with ${events.length} events spanning ${fmtMs(duration)}`}
          >
            {/* baseline */}
            <line
              x1={0}
              y1={VB_H / 2}
              x2={VB_W}
              y2={VB_H / 2}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* motion path */}
            {motionPoints && (
              <polyline
                points={motionPoints}
                fill="none"
                stroke="var(--muted)"
                strokeOpacity={0.5}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* event marks */}
            {events.map((e, i) => (
              <Mark key={i} e={e} x={xOf(e.t)} y={eventY(e)} yOf={yOf} />
            ))}
            {/* playhead */}
            {playheadT != null && status === "playing" && (
              <line
                x1={xOf(playheadT)}
                y1={0}
                x2={xOf(playheadT)}
                y2={VB_H}
                stroke="var(--play)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                style={{ transition: "x 0.1s linear" }}
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

function Mark({
  e,
  x,
  y,
  yOf,
}: {
  e: MacroEvent;
  x: number;
  y: number | null;
  yOf: (y: number) => number;
}) {
  if (e.kind === "key") {
    return (
      <circle cx={x} cy={20} r={3} fill="var(--accent)" vectorEffect="non-scaling-stroke" />
    );
  }
  if (e.kind === "drag") {
    return (
      <line
        x1={x}
        y1={VB_H / 2}
        x2={x}
        y2={VB_H / 2 - 18}
        stroke="var(--warn)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (e.kind === "move") {
    return y == null ? null : (
      <circle cx={x} cy={yOf(y)} r={1} fill="var(--muted)" />
    );
  }
  // down / up / click ticks
  const color =
    e.kind === "click" ? "var(--accent)" : "var(--text)";
  return (
    <line
      x1={x}
      y1={VB_H / 2 - 14}
      x2={x}
      y2={VB_H / 2 + 14}
      stroke={color}
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function eventY(e: MacroEvent): number | null {
  if (e.kind === "move" || e.kind === "down" || e.kind === "up" || e.kind === "click")
    return e.y;
  if (e.kind === "drag") return e.from[1];
  return null;
}
