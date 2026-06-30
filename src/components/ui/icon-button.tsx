import * as React from "react";
import { cn } from "@/lib/utils";

export function IconButton({
  label,
  variant = "default",
  className,
  onClick,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "rounded-control p-1 text-muted transition-colors",
        variant === "danger"
          ? "hover:bg-record/10 hover:text-record"
          : "hover:bg-border/50 hover:text-text",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
