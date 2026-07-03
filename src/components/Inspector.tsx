import { MousePointer2 } from "lucide-react";
import { useApp } from "@/store";
import { StepEditor } from "@/components/StepBuilder/StepBuilder";

/**
 * Right rail: the detail view of the master-detail pair. Edits the step selected
 * in the table; run options + schedule live in the RunBar, not here.
 */
export function Inspector() {
  const { steps, selectedStepId } = useApp();
  const selected = steps.find((s) => s.id === selectedStepId) ?? null;

  if (!selected) {
    return (
      <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border p-8 text-center">
        <MousePointer2 className="h-5 w-5 text-muted/60" />
        <p className="text-ui font-medium text-text">Nothing selected</p>
        <p className="text-body text-muted">
          Select a step from the table to edit it.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <StepEditor step={selected} />
    </div>
  );
}
