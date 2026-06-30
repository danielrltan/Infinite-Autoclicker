import { Crosshair, Copy, Trash2, ChevronUp, ChevronDown, Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { ClickStep, DragStep, Step } from "@/lib/compile";

export function StepBuilder() {
  const {
    steps,
    selectedStepId,
    setSelectedStepId,
    addClickStep,
    addDragStep,
    deleteStep,
    duplicateStep,
    moveStep,
  } = useApp();

  const selected = steps.find((s) => s.id === selectedStepId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={addClickStep}>
            <Plus className="h-4 w-4" /> Click step
          </Button>
          <Button size="sm" variant="secondary" onClick={addDragStep}>
            <Plus className="h-4 w-4" /> Drag step
          </Button>
        </div>

        {steps.length === 0 ? (
          <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted">
            No steps yet. Add a click to build a sequence.
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
          selected.kind === "click" ? (
            <ClickEditor step={selected} />
          ) : (
            <DragEditor step={selected} />
          )
        ) : (
          <p className="text-sm text-muted">Select a step to edit it.</p>
        )}
      </div>
    </div>
  );
}

function ClickEditor({ step }: { step: ClickStep }) {
  const { updateStep, captureCursorInto } = useApp();
  const set = (p: Partial<ClickStep>) => updateStep(step.id, p as Partial<Step>);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Click step</h3>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="X" value={step.x} onChange={(x) => set({ x })} />
        <NumField label="Y" value={step.y} onChange={(y) => set({ y })} />
      </div>
      <Button size="sm" variant="outline" onClick={() => captureCursorInto("click")}>
        <Crosshair className="h-4 w-4" /> Capture cursor (F6)
      </Button>
      <div className="space-y-1">
        <Label>Click type</Label>
        <Select
          value={step.clickType}
          onValueChange={(v) => set({ clickType: v as ClickStep["clickType"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="right">Right</SelectItem>
            <SelectItem value="middle">Middle</SelectItem>
            <SelectItem value="double">Double (left)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {step.clickType !== "double" && (
        <NumField
          label="Click count"
          value={step.count}
          min={1}
          onChange={(count) => set({ count })}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumField
          label="Delay before (s)"
          value={step.delayBefore}
          step={0.1}
          min={0}
          onChange={(delayBefore) => set({ delayBefore })}
        />
        <NumField
          label="Delay jitter (s)"
          value={step.delayJitter}
          step={0.1}
          min={0}
          onChange={(delayJitter) => set({ delayJitter })}
        />
      </div>
      <label className="flex items-center justify-between">
        <Label>Return cursor after click</Label>
        <Switch
          checked={step.returnCursor}
          onCheckedChange={(returnCursor) => set({ returnCursor })}
        />
      </label>
    </div>
  );
}

function DragEditor({ step }: { step: DragStep }) {
  const { updateStep, captureCursorInto } = useApp();
  const set = (p: Partial<DragStep>) => updateStep(step.id, p as Partial<Step>);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Drag step</h3>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="From X" value={step.fromX} onChange={(fromX) => set({ fromX })} />
        <NumField label="From Y" value={step.fromY} onChange={(fromY) => set({ fromY })} />
      </div>
      <Button size="sm" variant="outline" onClick={() => captureCursorInto("dragFrom")}>
        <Crosshair className="h-4 w-4" /> Capture start
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="To X" value={step.toX} onChange={(toX) => set({ toX })} />
        <NumField label="To Y" value={step.toY} onChange={(toY) => set({ toY })} />
      </div>
      <Button size="sm" variant="outline" onClick={() => captureCursorInto("dragTo")}>
        <Crosshair className="h-4 w-4" /> Capture end
      </Button>
      <div className="space-y-1">
        <Label>Button</Label>
        <Select value={step.button} onValueChange={(v) => set({ button: v as DragStep["button"] })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="right">Right</SelectItem>
            <SelectItem value="middle">Middle</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <NumField
        label="Move duration (ms)"
        value={step.durationMs}
        min={0}
        step={50}
        onChange={(durationMs) => set({ durationMs })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumField
          label="Delay before (s)"
          value={step.delayBefore}
          step={0.1}
          min={0}
          onChange={(delayBefore) => set({ delayBefore })}
        />
        <NumField
          label="Delay jitter (s)"
          value={step.delayJitter}
          step={0.1}
          min={0}
          onChange={(delayJitter) => set({ delayJitter })}
        />
      </div>
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
  if (s.kind === "click") {
    const type = s.clickType === "double" ? "Double-click" : `${cap(s.clickType)} click`;
    return `${type} at ${s.x}, ${s.y} · ${s.delayBefore}s${s.count > 1 && s.clickType !== "double" ? ` ×${s.count}` : ""}`;
  }
  return `Drag ${s.fromX},${s.fromY} → ${s.toX},${s.toY} · ${s.durationMs}ms`;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
