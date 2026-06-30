import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Stacked: label (+ optional right-aligned value) → control → optional hint. */
export function Field({
  label,
  value,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {value === undefined ? (
        <Label htmlFor={htmlFor}>{label}</Label>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={htmlFor}>{label}</Label>
          <span className="tabular text-label text-muted">{value}</span>
        </div>
      )}
      {children}
      {hint && <p className="text-body text-muted">{hint}</p>}
    </div>
  );
}

/** Row: label (+ optional description) left, control right. For switches/compact controls. */
export function FieldRow({
  label,
  description,
  className,
  children,
}: {
  label: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2", className)}>
      <div className="min-w-0 space-y-0.5">
        <Label>{label}</Label>
        {description && <p className="text-body text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
