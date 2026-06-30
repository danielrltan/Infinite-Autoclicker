import {
  Crosshair,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Circle,
  Square,
} from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { CaptureButton } from "@/components/ui/capture-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTION_LABELS, type Step, type StepAction } from "@/lib/compile";
import { cn } from "@/lib/utils";

export function StepBuilder() {
  const {
    steps,
    selectedStepId,
    setSelectedStepId,
    addStep,
    deleteStep,
    duplicateStep,
    moveStep,
  } = useApp();

  const selected = steps.find((s) => s.id === selectedStepId) ?? null;

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_360px]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-overline font-semibold uppercase text-muted">
            Steps · <span className="tabular">{steps.length}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={() => addStep("click")}>
            <Plus className="h-4 w-4" /> Add step
          </Button>
        </div>

        {steps.length === 0 ? (
          <EmptyState
            title="No steps yet"
            description="Add a step, then choose its action and coordinate."
          />
        ) : (
          <ul className="max-h-[52vh] space-y-1 overflow-auto pr-1">
            {steps.map((s, i) => (
              <li key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedStepId(s.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedStepId(s.id)}
                  className={cn(
                    "group flex items-center gap-2 rounded-control border px-3 py-2 text-ui transition-colors",
                    s.id === selectedStepId
                      ? "rail-accent border-accent bg-surface"
                      : "border-transparent hover:border-border hover:bg-surface",
                  )}
                >
                  <span className="tabular w-5 text-right text-label text-muted/70">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">{stepSummary(s)}</span>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <IconButton label="Move up" onClick={() => moveStep(s.id, -1)}>
                      <ChevronUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Move down" onClick={() => moveStep(s.id, 1)}>
                      <ChevronDown className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Duplicate" onClick={() => duplicateStep(s.id)}>
                      <Copy className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Delete" variant="danger" onClick={() => deleteStep(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="self-start rounded-card border border-border bg-surface p-4 lg:sticky lg:top-3">
        {selected ? (
          <StepEditor step={selected} />
        ) : (
          <p className="text-body text-muted">Select a step to edit it.</p>
        )}
      </div>
    </div>
  );
}

function StepEditor({ step }: { step: Step }) {
  const { updateStep, captureCursorInto } = useApp();
  const set = (p: Partial<Step>) => updateStep(step.id, p);

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
          <Coord xLabel="X" yLabel="Y" x={step.x} y={step.y} onX={(x) => set({ x })} onY={(y) => set({ y })} onCapture={() => captureCursorInto("click")} />
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
        <Field label="Key" hint="Taps the key (press + release).">
          <CaptureButton value={step.keyCode} onCapture={(keyCode) => set({ keyCode })} className="w-full" />
        </Field>
      )}

      {step.action === "wait" && (
        <NumField label="Wait (ms)" value={step.waitMs} min={0} step={50} onChange={(waitMs) => set({ waitMs })} />
      )}

      {step.action === "record" && <RecordField step={step} />}

      <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
        <NumField label="Delay before (s)" value={step.delayBefore} step={0.1} min={0} onChange={(delayBefore) => set({ delayBefore })} />
        <NumField label="Delay jitter (s)" value={step.delayJitter} step={0.1} min={0} onChange={(delayJitter) => set({ delayJitter })} />
      </div>
    </div>
  );
}

function RecordField({ step }: { step: Step }) {
  const { recordIntoStep, recording } = useApp();
  return (
    <div className="space-y-2">
      {recording.active ? (
        <Button size="sm" variant="record" onClick={() => recordIntoStep(step.id)}>
          <Square className="h-4 w-4 fill-current" /> Stop recording ({recording.count})
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => recordIntoStep(step.id)}>
          <Circle className="h-4 w-4 fill-record text-record" />
          {step.events.length > 0 ? "Re-record" : "Record actions"}
        </Button>
      )}
      <p className="text-body text-muted">
        {step.events.length > 0
          ? `${step.events.length} events recorded — replayed inline at this point.`
          : "Records your live input and replays it as part of this macro."}
      </p>
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
  captureLabel = "Capture cursor (F6)",
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

function stepSummary(s: Step): string {
  switch (s.action) {
    case "click": {
      const type = s.clickType === "double" ? "Double-click" : `${cap(s.clickType)} click`;
      return `${type} at ${s.x}, ${s.y}`;
    }
    case "drag":
      return `Drag ${s.fromX},${s.fromY} → ${s.toX},${s.toY}`;
    case "scroll":
      return `Scroll ${s.scrollDir} ×${s.scrollAmount} at ${s.x}, ${s.y}`;
    case "key":
      return `Press ${s.keyCode}`;
    case "wait":
      return `Wait ${s.waitMs} ms`;
    case "record":
      return `Recorded action (${s.events.length} events)`;
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
