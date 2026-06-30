import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { browserCodeToIac } from "@/lib/keymap";
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-2">
        <Button size="sm" onClick={() => addStep("click")}>
          <Plus className="h-4 w-4" /> Add step
        </Button>

        {steps.length === 0 ? (
          <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted">
            No steps yet. Add a step, then choose its action and coordinate.
          </p>
        ) : (
          <ul className="space-y-1">
            {steps.map((s, i) => (
              <li key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedStepId(s.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedStepId(s.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-control border px-3 py-2 text-sm transition-colors",
                    s.id === selectedStepId
                      ? "border-accent bg-surface"
                      : "border-border hover:bg-surface",
                  )}
                >
                  <span className="tabular w-6 text-muted">{i + 1}</span>
                  <span className="flex-1 truncate">{stepSummary(s)}</span>
                  <div className="flex items-center gap-0.5">
                    <IconBtn label="Move up" onClick={() => moveStep(s.id, -1)}>
                      <ChevronUp className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label="Move down" onClick={() => moveStep(s.id, 1)}>
                      <ChevronDown className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label="Duplicate" onClick={() => duplicateStep(s.id)}>
                      <Copy className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label="Delete" onClick={() => deleteStep(s.id)}>
                      <Trash2 className="h-4 w-4 text-record" />
                    </IconBtn>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-card border border-border bg-surface p-3">
        {selected ? (
          <StepEditor step={selected} />
        ) : (
          <p className="text-sm text-muted">Select a step to edit it.</p>
        )}
      </div>
    </div>
  );
}

function StepEditor({ step }: { step: Step }) {
  const { updateStep, captureCursorInto } = useApp();
  const set = (p: Partial<Step>) => updateStep(step.id, p);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Action</Label>
        <Select
          value={step.action}
          onValueChange={(v) => set({ action: v as StepAction })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ACTION_LABELS) as StepAction[]).map((a) => (
              <SelectItem key={a} value={a}>
                {ACTION_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
          <div className="space-y-1">
            <Label>Click type</Label>
            <Select value={step.clickType} onValueChange={(v) => set({ clickType: v as Step["clickType"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left click</SelectItem>
                <SelectItem value="right">Right click</SelectItem>
                <SelectItem value="middle">Middle click</SelectItem>
                <SelectItem value="double">Double click</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {step.clickType !== "double" && (
            <NumField label="Click count" value={step.count} min={1} onChange={(count) => set({ count })} />
          )}
          <label className="flex items-center justify-between">
            <Label>Return cursor after click</Label>
            <Switch checked={step.returnCursor} onCheckedChange={(returnCursor) => set({ returnCursor })} />
          </label>
        </>
      )}

      {step.action === "drag" && (
        <>
          <Coord
            xLabel="From X"
            yLabel="From Y"
            x={step.fromX}
            y={step.fromY}
            onX={(fromX) => set({ fromX })}
            onY={(fromY) => set({ fromY })}
            onCapture={() => captureCursorInto("dragFrom")}
            captureLabel="Capture start"
          />
          <Coord
            xLabel="To X"
            yLabel="To Y"
            x={step.toX}
            y={step.toY}
            onX={(toX) => set({ toX })}
            onY={(toY) => set({ toY })}
            onCapture={() => captureCursorInto("dragTo")}
            captureLabel="Capture end"
          />
          <div className="space-y-1">
            <Label>Button</Label>
            <Select value={step.button} onValueChange={(v) => set({ button: v as Step["button"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumField label="Move duration (ms)" value={step.durationMs} min={0} step={50} onChange={(durationMs) => set({ durationMs })} />
        </>
      )}

      {step.action === "scroll" && (
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
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Direction</Label>
              <Select value={step.scrollDir} onValueChange={(v) => set({ scrollDir: v as Step["scrollDir"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="up">Up</SelectItem>
                  <SelectItem value="down">Down</SelectItem>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumField label="Amount (notches)" value={step.scrollAmount} min={1} onChange={(scrollAmount) => set({ scrollAmount })} />
          </div>
        </>
      )}

      {step.action === "key" && <KeyField step={step} set={set} />}

      {step.action === "wait" && (
        <NumField label="Wait (ms)" value={step.waitMs} min={0} step={50} onChange={(waitMs) => set({ waitMs })} />
      )}

      {step.action === "record" && <RecordField step={step} />}

      {/* Common delay fields (all actions) */}
      <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
        <NumField label="Delay before (s)" value={step.delayBefore} step={0.1} min={0} onChange={(delayBefore) => set({ delayBefore })} />
        <NumField label="Delay jitter (s)" value={step.delayJitter} step={0.1} min={0} onChange={(delayJitter) => set({ delayJitter })} />
      </div>
    </div>
  );
}

function KeyField({ step, set }: { step: Step; set: (p: Partial<Step>) => void }) {
  const [listening, setListening] = useState(false);
  return (
    <div className="space-y-1">
      <Label>Key</Label>
      <button
        onClick={() => setListening(true)}
        onBlur={() => setListening(false)}
        onKeyDown={(e) => {
          if (!listening) return;
          e.preventDefault();
          const code = browserCodeToIac(e.nativeEvent);
          if (code) {
            set({ keyCode: code });
            setListening(false);
          }
        }}
        className={`tabular h-9 w-full rounded-control border px-3 text-sm ${listening ? "border-accent text-accent" : "border-border"}`}
      >
        {listening ? "Press a key…" : step.keyCode}
      </button>
      <p className="text-xs text-muted">Taps the key (press + release).</p>
    </div>
  );
}

function RecordField({ step }: { step: Step }) {
  const { recordIntoStep, recording } = useApp();
  const isRecordingThis = recording.active;
  return (
    <div className="space-y-2">
      {isRecordingThis ? (
        <Button size="sm" variant="record" onClick={() => recordIntoStep(step.id)}>
          <Square className="h-4 w-4 fill-current" /> Stop recording ({recording.count})
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => recordIntoStep(step.id)}>
          <Circle className="h-4 w-4 fill-record text-record" />
          {step.events.length > 0 ? "Re-record" : "Record actions"}
        </Button>
      )}
      <p className="text-xs text-muted">
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
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        className="tabular"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded-[4px] p-1 text-muted transition-colors hover:bg-border/50 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </button>
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
