import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "tabular rounded border border-border bg-bg px-1.5 py-0.5 text-overline text-muted",
        className,
      )}
      {...props}
    />
  );
}
