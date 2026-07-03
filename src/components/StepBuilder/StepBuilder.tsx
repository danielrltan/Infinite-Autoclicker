import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Crosshair,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Circle,
  Pipette,
  SquareDashed,
  GripVertical,
  X,
} from "lucide-react";
import { useApp } from "@/store";
import { ipc } from "@/lib/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { CaptureButton } from "@/components/ui/capture-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTION_LABELS,
  summarizeRecording,
  type Step,
  type StepAction,
} from "@/lib/compile";
import { cn, rgbToHex } from "@/lib/utils";
import type { Rect } from "@/lib/types";

/** The sequence, as a scannable data table (à la a classic auto-clicker's action
 *  list). Rows select for the Inspector, multi-select for bulk actions, and
 *  drag (or the arrows) to reorder — reorders slide via a FLIP animation. */
export function StepList() {
  const {
    steps,
    selectedStepId,
    setSelectedStepId,
    addStep,
    deleteStep,
    duplicateStep,
    moveStep,
    reorderSteps,
    deleteSteps,
    duplicateSteps,
  } = useApp();

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const lastClick = useRef<number | null>(null);

  // FLIP: slide rows from their previous positions to the new ones after a
  // reorder, so the change is visible. Only animate on an actual order change
  // (not when the bulk bar shifts the table).
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const prevOrder = useRef<string>("");
  useLayoutEffect(() => {
    const order = steps.map((s) => s.id).join(",");
    const changed = order !== prevOrder.current;
    const rows = rowRefs.current;
    const next = new Map<string, DOMRect>();
    rows.forEach((el, id) => {
      el.style.transition = "none";
      el.style.transform = "";
      next.set(id, el.getBoundingClientRect());
    });
    if (changed) {
      rows.forEach((el, id) => {
        const p = prevRects.current.get(id);
        const n = next.get(id);
        if (p && n) {
          const dy = p.top - n.top;
          if (Math.abs(dy) > 0.5) {
            el.style.transform = `translateY(${dy}px)`;
            requestAnimationFrame(() => {
              el.style.transition = "transform 180ms ease";
              el.style.transform = "";
            });
          }
        }
      });
    }
    prevRects.current = next;
    prevOrder.current = order;
  });

  const selCount = steps.filter((s) => selected.has(s.id)).length;
  const allSelected = steps.length > 0 && selCount === steps.length;

  const toggleOne = (id: string, idx: number, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClick.current != null) {
        const lo = Math.min(lastClick.current, idx);
        const hi = Math.max(lastClick.current, idx);
        for (let k = lo; k <= hi; k++) {
          const sid = steps[k]?.id;
          if (sid) next.add(sid);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClick.current = idx;
  };
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(steps.map((s) => s.id)));
  const clearSel = () => setSelected(new Set());
  const bulkDelete = () => { deleteSteps([...selected]); clearSel(); };
  const bulkDuplicate = () => { duplicateSteps([...selected]); clearSel(); };

  const onDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) {
      reorderSteps(
        steps.findIndex((s) => s.id === dragId),
        steps.findIndex((s) => s.id === targetId),
      );
    }
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="space-y-2">
      {selCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-accent/40 bg-accent/10 px-3 py-2 text-ui">
          <span className="font-medium text-text">{selCount} selected</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={bulkDuplicate}>
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSel}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {steps.length === 0 ? (
        <p className="px-1 py-8 text-center text-body text-muted">
          No steps yet. Add one, or record your actions, to build a sequence.
        </p>
      ) : (
        <div className="overflow-hidden rounded-card border border-border">
          <table className="w-full border-collapse text-ui">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-overline uppercase text-muted [&>th]:border-b [&>th]:border-border [&>th]:py-2 [&>th]:font-semibold">
                <th className="w-9 px-2">
                  <input
                    type="checkbox"
                    aria-label="Select all steps"
                    className="h-4 w-4 cursor-pointer accent-accent align-middle"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="w-6" aria-label="Drag handle" />
                <th className="w-8 pr-2 text-right">#</th>
                <th className="whitespace-nowrap px-3 text-left">Action</th>
                <th className="w-16 px-3 text-right">X</th>
                <th className="w-16 px-3 text-right">Y</th>
                <th className="w-20 px-3 text-right">Delay</th>
                <th className="w-full px-3 text-left">Details</th>
                <th className="w-px" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => {
                const c = rowCells(s);
                const active = s.id === selectedStepId;
                const isSel = selected.has(s.id);
                return (
                  <tr
                    key={s.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(s.id, el);
                      else rowRefs.current.delete(s.id);
                    }}
                    tabIndex={0}
                    draggable
                    onDragStart={() => setDragId(s.id)}
                    onDragEnter={() => setOverId(s.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(s.id)}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                    onClick={() => setSelectedStepId(s.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedStepId(s.id)}
                    className={cn(
                      "group border-b border-border/50 transition-colors [&>td]:py-2 [&>td]:align-middle",
                      active
                        ? "bg-surface"
                        : isSel
                          ? "bg-accent/5"
                          : "hover:bg-surface/60",
                      overId === s.id && dragId && dragId !== s.id && "border-t-2 border-t-accent",
                      dragId === s.id && "opacity-40",
                    )}
                  >
                    <td
                      className={cn("px-2", active && "rail-accent")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select step ${i + 1}`}
                        className="h-4 w-4 cursor-pointer accent-accent align-middle"
                        checked={isSel}
                        onChange={() => {}}
                        onClick={(e) => { e.stopPropagation(); toggleOne(s.id, i, e.shiftKey); }}
                      />
                    </td>
                    <td className="cursor-grab text-muted/40 active:cursor-grabbing" title="Drag to reorder">
                      <GripVertical className="h-4 w-4" />
                    </td>
                    <td className="tabular pr-2 text-right text-label text-muted/70">
                      {i + 1}
                    </td>
                    <td className="whitespace-nowrap px-3">
                      <span className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ACTION_DOT[s.action])} />
                        <span className="font-medium text-text">{c.action}</span>
                      </span>
                    </td>
                    <td className="tabular px-3 text-right text-muted">{numCell(c.x)}</td>
                    <td className="tabular px-3 text-right text-muted">{numCell(c.y)}</td>
                    <td className="tabular whitespace-nowrap px-3 text-right text-muted">{c.delay}</td>
                    <td className="w-full px-3">
                      <span className="tabular block truncate text-muted">{c.details}</span>
                    </td>
                    <td className="w-px whitespace-nowrap pr-1.5">
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <IconButton label="Move up" onClick={(e) => { e.stopPropagation(); moveStep(s.id, -1); }}>
                          <ChevronUp className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Move down" onClick={(e) => { e.stopPropagation(); moveStep(s.id, 1); }}>
                          <ChevronDown className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateStep(s.id); }}>
                          <Copy className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Delete" variant="danger" onClick={(e) => { e.stopPropagation(); deleteStep(s.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={() => addStep("click")}
        className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-border py-2.5 text-ui font-medium text-muted transition-colors hover:border-muted hover:bg-surface hover:text-text"
      >
        <Plus className="h-4 w-4" /> Add step
      </button>
    </div>
  );
}

const ACTION_DOT: Record<StepAction, string> = {
  click: "bg-accent",
  color: "bg-accent",
  drag: "bg-warn",
  scroll: "bg-play",
  key: "bg-text",
  wait: "bg-muted",
  record: "bg-muted",
};

const numCell = (n: number | null) => (n == null ? "" : n.toLocaleString());

/** One table row's cells, split into columns (vs. the single-line summary). */
function rowCells(s: Step): {
  action: string;
  x: number | null;
  y: number | null;
  delay: string;
  details: string;
} {
  const delay =
    s.delayBefore > 0 || s.delayJitter > 0
      ? `${s.delayBefore}s${s.delayJitter > 0 ? ` ±${s.delayJitter}` : ""}`
      : "";
  const clickLabel =
    s.clickType === "double" ? "Double click" : `${cap(s.clickType)} click`;

  switch (s.action) {
    case "click":
      return {
        action: clickLabel,
        x: s.x,
        y: s.y,
        delay,
        details: [s.count > 1 ? `×${s.count}` : "", s.returnCursor ? "return cursor" : ""]
          .filter(Boolean)
          .join(" · "),
      };
    case "drag":
      return { action: "Drag", x: s.fromX, y: s.fromY, delay, details: `→ ${s.toX}, ${s.toY} · ${s.durationMs}ms` };
    case "scroll":
      return { action: "Scroll", x: s.x, y: s.y, delay, details: `${SCROLL_ARROW[s.scrollDir]} ×${s.scrollAmount}` };
    case "key":
      return { action: "Key press", x: null, y: null, delay, details: s.keyCode };
    case "wait":
      return { action: "Wait", x: null, y: null, delay, details: `${s.waitMs} ms` };
    case "color":
      return { action: `${clickLabel} color`, x: null, y: null, delay, details: rgbToHex(s.matchColor) };
    case "record": {
      const summary = summarizeRecording(s.events);
      return {
        action: "Recorded",
        x: null,
        y: null,
        delay,
        details: s.events.length === 0 ? "empty" : summary || `${s.events.length} events`,
      };
    }
  }
}

const SCROLL_ARROW: Record<Step["scrollDir"], string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

/** Inspector body: edit the selected step. Exported for the right column. */
export function StepEditor({ step }: { step: Step }) {
  const { updateStep, captureCursorInto, toast } = useApp();
  const set = (p: Partial<Step>) => updateStep(step.id, p);
  const captureLabel = "Capture cursor";
  const pickColor = async () => {
    const rgb = await ipc.captureCursorColor().catch(() => null);
    if (rgb) {
      set({ matchColor: rgb });
      toast(`Picked ${rgbToHex(rgb)}`, "success");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <h3 className="text-overline font-semibold uppercase text-muted">Edit step</h3>
        <span className="tabular text-body text-muted">{ACTION_LABELS[step.action]}</span>
      </div>

      <Field label="Action">
        <Select value={step.action} onValueChange={(v) => set({ action: v as StepAction })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(ACTION_LABELS) as StepAction[]).map((a) => (
              <SelectItem key={a} value={a}>
                {ACTION_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {step.action === "click" && (
        <>
          <Coord
            xLabel="X"
            yLabel="Y"
            x={step.x}
            y={step.y}
            onX={(x) => set({ x })}
            onY={(y) => set({ y })}
            onCapture={() => captureCursorInto("click")}
            captureLabel={captureLabel}
          />
          <Field label="Click type">
            <Select value={step.clickType} onValueChange={(v) => set({ clickType: v as Step["clickType"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left click</SelectItem>
                <SelectItem value="right">Right click</SelectItem>
                <SelectItem value="middle">Middle click</SelectItem>
                <SelectItem value="double">Double click</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {step.clickType !== "double" && (
            <NumField label="Click count" value={step.count} min={1} onChange={(count) => set({ count })} />
          )}
          <label className="flex items-center justify-between">
            <span className="text-label font-medium text-muted">Return cursor after click</span>
            <Switch checked={step.returnCursor} onCheckedChange={(returnCursor) => set({ returnCursor })} />
          </label>
        </>
      )}

      {step.action === "drag" && (
        <>
          <Coord xLabel="From X" yLabel="From Y" x={step.fromX} y={step.fromY} onX={(fromX) => set({ fromX })} onY={(fromY) => set({ fromY })} onCapture={() => captureCursorInto("dragFrom")} captureLabel="Capture start" />
          <Coord xLabel="To X" yLabel="To Y" x={step.toX} y={step.toY} onX={(toX) => set({ toX })} onY={(toY) => set({ toY })} onCapture={() => captureCursorInto("dragTo")} captureLabel="Capture end" />
          <Field label="Button">
            <Select value={step.button} onValueChange={(v) => set({ button: v as Step["button"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <NumField label="Move duration (ms)" value={step.durationMs} min={0} step={50} onChange={(durationMs) => set({ durationMs })} />
        </>
      )}

      {step.action === "scroll" && (
        <>
          <Coord xLabel="X" yLabel="Y" x={step.x} y={step.y} onX={(x) => set({ x })} onY={(y) => set({ y })} onCapture={() => captureCursorInto("click")} captureLabel={captureLabel} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Direction">
              <Select value={step.scrollDir} onValueChange={(v) => set({ scrollDir: v as Step["scrollDir"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="up">Up</SelectItem>
                  <SelectItem value="down">Down</SelectItem>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <NumField label="Amount (notches)" value={step.scrollAmount} min={1} onChange={(scrollAmount) => set({ scrollAmount })} />
          </div>
        </>
      )}

      {step.action === "key" && (
        <Field label="Key">
          <CaptureButton value={step.keyCode} onCapture={(keyCode) => set({ keyCode })} className="w-full" />
        </Field>
      )}

      {step.action === "wait" && (
        <NumField label="Wait (ms)" value={step.waitMs} min={0} step={50} onChange={(waitMs) => set({ waitMs })} />
      )}

      {step.action === "color" && (
        <>
          <Field label="Target color">
            <div className="flex items-center gap-2">
              <span
                className="h-8 w-8 shrink-0 rounded-control border border-border"
                style={{ background: rgbToHex(step.matchColor) }}
              />
              <span className="tabular flex-1 text-body text-muted">
                {rgbToHex(step.matchColor)}
              </span>
              <Button size="sm" variant="outline" onClick={pickColor}>
                <Pipette className="h-4 w-4" /> Pick
              </Button>
            </div>
          </Field>
          <Field label={`Tolerance · ${step.tolerance}`}>
            <Slider
              value={[step.tolerance]}
              min={0}
              max={200}
              step={1}
              onValueChange={(v) => set({ tolerance: v[0] ?? 0 })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Min blob (px)" value={step.minBlob} min={1} onChange={(minBlob) => set({ minBlob })} />
            <Field label="Click type">
              <Select value={step.clickType} onValueChange={(v) => set({ clickType: v as Step["clickType"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left click</SelectItem>
                  <SelectItem value="right">Right click</SelectItem>
                  <SelectItem value="middle">Middle click</SelectItem>
                  <SelectItem value="double">Double click</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <NumField
            label="Wait for color (ms, 0 = one try then skip)"
            value={step.colorTimeoutMs}
            min={0}
            step={100}
            onChange={(colorTimeoutMs) => set({ colorTimeoutMs })}
          />
          <label className="flex items-center justify-between">
            <span className="text-label font-medium text-muted">Move to color before clicking</span>
            <Switch checked={step.moveBefore} onCheckedChange={(moveBefore) => set({ moveBefore })} />
          </label>
          <ColorRegions step={step} />
        </>
      )}

      {step.action === "record" && <RecordField step={step} />}

      <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
        <NumField label="Delay before (s)" value={step.delayBefore} step={0.1} min={0} onChange={(delayBefore) => set({ delayBefore })} />
        <NumField label="Delay jitter (s)" value={step.delayJitter} step={0.1} min={0} onChange={(delayJitter) => set({ delayJitter })} />
      </div>
    </div>
  );
}

/**
 * Search regions + a live "test detection" probe for a color step — the two
 * things the standalone Color Trigger had that the step lacked. Regions limit
 * (and speed up) the scan; empty = whole screen.
 */
function ColorRegions({ step }: { step: Step }) {
  const { updateStep, toast } = useApp();
  const [capturing, setCapturing] = useState(false);
  const [lastFound, setLastFound] = useState<string | null>(null);
  // The region:captured listener fires long after mount — read regions through a
  // ref so appends never clobber earlier ones with a stale closure.
  const regionsRef = useRef<Rect[]>(step.regions);
  regionsRef.current = step.regions;

  useEffect(() => {
    const pending = Promise.all([
      listen<Rect>("region:captured", (e) => {
        updateStep(step.id, { regions: [...regionsRef.current, e.payload] });
        setCapturing(false);
      }),
      listen("region:capture-cancelled", () => setCapturing(false)),
    ]);
    return () => {
      void pending.then((us) => us.forEach((u) => u()));
    };
  }, [step.id, updateStep]);

  const beginCapture = async () => {
    setCapturing(true);
    await ipc.startRegionCapture();
  };
  const cancelCapture = async () => {
    setCapturing(false);
    await ipc.cancelRegionCapture();
  };
  const removeRegion = (i: number) =>
    updateStep(step.id, { regions: step.regions.filter((_, j) => j !== i) });

  const test = async () => {
    try {
      const blob = await ipc.findColorOnce({
        target: step.matchColor,
        tolerance: step.tolerance,
        regions: step.regions,
        min_blob_px: step.minBlob,
      });
      if (blob) {
        setLastFound(`Found at ${blob.x}, ${blob.y} (${blob.area}px)`);
        toast(`Target found at ${blob.x}, ${blob.y}`, "success");
      } else {
        setLastFound("No matching blob found");
        toast("No match. Widen tolerance or lower min size", "warn");
      }
    } catch (e) {
      toast(`${e}`, "error");
    }
  };

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-label font-medium text-muted">
          Search regions{step.regions.length > 0 ? ` · ${step.regions.length}` : ""}
        </span>
        {capturing ? (
          <Button size="sm" variant="destructive" onClick={cancelCapture}>
            Cancel
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={beginCapture}>
            <SquareDashed className="h-4 w-4" /> Add region
          </Button>
        )}
      </div>

      {capturing ? (
        <p className="text-body text-muted">
          Drag a rectangle anywhere on screen. Press{" "}
          <span className="tabular text-text">Esc</span> to cancel.
        </p>
      ) : step.regions.length === 0 ? (
        <p className="text-body text-muted">Scanning the whole screen.</p>
      ) : (
        <ul className="space-y-1">
          {step.regions.map((r, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-control border border-border px-2.5 py-1.5 text-body"
            >
              <span className="tabular flex-1 text-muted">
                {r.w}×{r.h} at {r.x}, {r.y}
              </span>
              <IconButton
                label={`Remove region ${i + 1}`}
                variant="danger"
                onClick={() => removeRegion(i)}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={test}>
          <Crosshair className="h-4 w-4" /> Test detection
        </Button>
        {lastFound && <span className="tabular text-body text-muted">{lastFound}</span>}
      </div>
    </div>
  );
}

function RecordField({ step }: { step: Step }) {
  const { recordIntoStep, recording } = useApp();
  return (
    <div className="space-y-2">
      {recording.active ? (
        <div className="flex items-center gap-2 rounded-control border border-record/40 bg-record/10 px-3 py-2 text-body text-record">
          <span className="h-2 w-2 shrink-0 animate-pulse-rec rounded-full bg-record" />
          Recording… {recording.count} events (stop from the toolbar)
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => recordIntoStep(step.id)}>
          <Circle className="h-4 w-4 fill-record text-record" />
          {step.events.length > 0 ? "Re-record" : "Record actions"}
        </Button>
      )}
      {!recording.active && step.events.length > 0 && (
        <p className="tabular text-body text-muted">
          {step.events.length} events recorded
        </p>
      )}
    </div>
  );
}

function Coord({
  xLabel,
  yLabel,
  x,
  y,
  onX,
  onY,
  onCapture,
  captureLabel = "Capture cursor",
}: {
  xLabel: string;
  yLabel: string;
  x: number;
  y: number;
  onX: (n: number) => void;
  onY: (n: number) => void;
  onCapture: () => void;
  captureLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <NumField label={xLabel} value={x} onChange={onX} />
        <NumField label={yLabel} value={y} onChange={onY} />
      </div>
      <Button size="sm" variant="outline" onClick={onCapture}>
        <Crosshair className="h-4 w-4" /> {captureLabel}
      </Button>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        className="tabular"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </Field>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
