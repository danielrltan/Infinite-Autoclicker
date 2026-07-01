import { Trash2, Eraser } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtMs } from "@/lib/utils";
import type { MacroEvent } from "@/lib/types";

export function EventList() {
  const {
    recordedEvents,
    deleteRecordedEvent,
    clearRecording,
    progress,
    status,
    settings,
  } = useApp();

  if (recordedEvents.length === 0) {
    return (
      <EmptyState
        title="No recorded events"
        description={`Press Record (${settings.hotkeys.record_toggle}) and perform some actions.`}
      />
    );
  }

  const activeIndex =
    status === "playing" && progress ? progress.event : -1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-overline font-semibold uppercase text-muted">
          <span className="tabular">{recordedEvents.length}</span> recorded events
        </span>
        <Button size="sm" variant="ghost" onClick={clearRecording}>
          <Eraser className="h-4 w-4" /> Clear recording
        </Button>
      </div>
      <div className="max-h-[40vh] overflow-auto rounded-card border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface text-xs text-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">Time</th>
            <th className="px-3 py-2 text-left font-medium">Event</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {recordedEvents.map((e, i) => (
            <tr
              key={i}
              className={
                i === activeIndex
                  ? "bg-play/10 rail-play"
                  : "odd:bg-surface/40 hover:bg-surface"
              }
            >
              <td className="tabular px-3 py-1.5 text-muted">{i + 1}</td>
              <td className="tabular px-3 py-1.5 text-muted">{fmtMs(e.t)}</td>
              <td className="tabular px-3 py-1.5">{eventLabel(e)}</td>
              <td className="px-3 py-1.5 text-right">
                <IconButton
                  label={`Delete event ${i + 1}`}
                  variant="danger"
                  onClick={() => deleteRecordedEvent(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function eventLabel(e: MacroEvent): string {
  switch (e.kind) {
    case "move":
      return `Move → ${e.x}, ${e.y}`;
    case "down":
      return `${cap(e.button)} down @ ${e.x}, ${e.y}`;
    case "up":
      return `${cap(e.button)} up @ ${e.x}, ${e.y}`;
    case "click":
      return `${cap(e.button)} click ×${e.count} @ ${e.x}, ${e.y}`;
    case "drag":
      return `Drag ${e.from[0]},${e.from[1]} → ${e.to[0]},${e.to[1]} (${e.duration_ms}ms)`;
    case "key":
      return `Key ${e.code} ${e.action}`;
    case "scroll":
      return `Scroll ${e.dy > 0 ? "up" : e.dy < 0 ? "down" : e.dx > 0 ? "right" : "left"} @ ${e.x}, ${e.y}`;
    case "wait":
      return `Wait ${e.ms}ms`;
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
