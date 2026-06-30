import * as React from "react";
import { cn } from "@/lib/utils";

/** Plain surface container. `self-start` ⇒ never stretches to a taller grid sibling. */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "self-start rounded-card border border-border bg-surface p-4",
        className,
      )}
      {...props}
    />
  );
}

/** Titled shell: overline header band + padded body. Collapses to header-only when childless. */
export function Section({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const hasBody = children != null && children !== false;
  return (
    <section
      className={cn(
        "self-start rounded-card border border-border bg-surface",
        className,
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-2.5",
          hasBody && "border-b border-border/60",
        )}
      >
        <h3 className="text-overline font-semibold uppercase text-muted">
          {title}
        </h3>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {hasBody && (
        <div className={cn("space-y-4 p-4", bodyClassName)}>{children}</div>
      )}
    </section>
  );
}
