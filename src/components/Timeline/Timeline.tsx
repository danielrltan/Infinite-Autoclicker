import { useMemo, useState } from "react";
import { useApp } from "@/store";
import { timelineDuration } from "@/lib/compile";
import { fmtMs } from "@/lib/utils";
import type { MacroEvent } from "@/lib/types";

const VB_W = 1000;
const VB_H = 100;

/**
 * The signature element (SPEC §10): a horizontal, scrubbable time track that is
 * the live recording view, the editor overview, and the playback progress
 * indicator at once. Clicks render as ticks, motion as a faint line, key/scroll
 * as marks; a playhead sweeps during playback.
 */
export function Timeline() {
  const { events, status, progress, recording } = useApp();
  const duration = useMemo(() => timelineDuration(events), [events]);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const xOf = (t: number) => (duration > 0 ? (t / duration) * VB_W : 0);

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
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        <div className="flex items-center gap-2">
          <h3 className="text-title font-medium text-text">Event timeline</h3>
          {recording.active && (
            <span className="flex items-center gap-1.5 rounded-full bg-record/15 px-2 py-0.5 text-body font-medium text-record">
              <span className="h-1.5 w-1.5 animate-pulse-rec rounded-full bg-record" />
              REC
            </span>
          )}
        </div>
        <span className="tabular text-label text-muted">
          {events.length} {events.length === 1 ? "event" : "events"}
          {duration > 0 && ` · ${fmtMs(duration)}`}
        </span>
      </div>

      {/* Track (recessed viewport) */}
      <div
        className="relative m-2 h-44 rounded-control bg-bg px-1 ring-1 ring-inset ring-border"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHoverX(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-ui font-medium text-text">
              {recording.active ? "Recording…" : "Nothing here yet"}
            </p>
            <p className="mt-1 text-body text-muted">
              {recording.active
                ? "Your actions appear here as you go."
                : "Record your actions or add a step to begin."}
            </p>
          </div>
        ) : (
          <>
            <svg
              className="h-full w-full"
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`Timeline with ${events.length} events spanning ${fmtMs(duration)}`}
            >
              {/* vertical gridlines */}
              {[0.25, 0.5, 0.75].map((p) => (
                <line
                  key={p}
                  x1={VB_W * p}
                  y1={0}
                  x2={VB_W * p}
                  y2={VB_H}
                  stroke="var(--border)"
                  strokeOpacity={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {/* baseline */}
              <line
                x1={0}
                y1={VB_H / 2}
                x2={VB_W}
                y2={VB_H / 2}
                stroke="var(--border)"
                vectorEffect="non-scaling-stroke"
              />
              {motionPoints && (
                <polyline
                  points={motionPoints}
                  fill="none"
                  stroke="var(--muted)"
                  strokeOpacity={0.65}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {events.map((e, i) => (
                <Mark key={i} e={e} x={xOf(e.t)} y={eventY(e)} yOf={yOf} />
              ))}
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

            {/* Scrub indicator */}
            {hoverX != null && (
              <div
                className="pointer-events-none absolute inset-y-0"
                style={{ left: `${hoverX * 100}%` }}
              >
                <div className="h-full w-px bg-muted/70" />
                <span className="tabular absolute top-1 -translate-x-1/2 rounded bg-bg px-1 text-overline text-muted ring-1 ring-border">
                  {fmtMs(hoverX * duration)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Ruler */}
      {duration > 0 && (
        <div className="tabular flex justify-between px-3 pb-1 text-overline text-muted">
          <span>0:00</span>
          <span>{fmtMs(duration / 2)}</span>
          <span>{fmtMs(duration)}</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-border px-3 py-1.5 text-overline text-muted">
        <LegendDot className="bg-accent" label="Click" />
        <LegendDot className="bg-warn" label="Drag" />
        <LegendDot className="bg-play" label="Scroll" />
        <LegendDot className="bg-muted" label="Move" />
        <LegendDot className="bg-accent" label="Key" />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${className}`} />
      {label}
    </span>
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
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (e.kind === "scroll") {
    return (
      <circle
        cx={x}
        cy={20}
        r={3}
        fill="none"
        stroke="var(--play)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (e.kind === "move") {
    return y == null ? null : <circle cx={x} cy={yOf(y)} r={1} fill="var(--muted)" />;
  }
  // down / up / click ticks
  const color = e.kind === "click" ? "var(--accent)" : "var(--text)";
  return (
    <line
      x1={x}
      y1={VB_H / 2 - 14}
      x2={x}
      y2={VB_H / 2 + 14}
      stroke={color}
      strokeWidth={2.5}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function eventY(e: MacroEvent): number | null {
  if (
    e.kind === "move" ||
    e.kind === "down" ||
    e.kind === "up" ||
    e.kind === "click" ||
    e.kind === "scroll"
  )
    return e.y;
  if (e.kind === "drag") return e.from[1];
  return null;
}
