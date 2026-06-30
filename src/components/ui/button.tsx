import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-ui font-medium " +
    "transition-[background-color,border-color,transform] duration-150 select-none active:translate-y-px " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg hover:bg-accent-hover",
        secondary: "bg-surface text-text border border-border hover:bg-border/50",
        outline:
          "border border-border bg-transparent text-text hover:bg-border/50",
        ghost: "bg-transparent text-text hover:bg-border/50",
        destructive: "bg-record text-white hover:brightness-110",
        record: "bg-record text-white hover:brightness-110",
        play: "bg-play text-white hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-body",
        md: "h-9 px-4",
        lg: "h-10 px-5",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

// eslint-disable-next-line react-refresh/only-export-components
export { buttonVariants };
