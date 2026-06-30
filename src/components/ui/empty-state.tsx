import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-border p-8 text-center",
        className,
      )}
    >
      {icon && <div className="mb-2 flex justify-center text-muted/60">{icon}</div>}
      <p className="text-ui font-medium text-text">{title}</p>
      {description && <p className="mt-1 text-body text-muted">{description}</p>}
    </div>
  );
}
