import { useState } from "react";
import { browserCodeToIac } from "@/lib/keymap";
import { cn } from "@/lib/utils";

/** A button that captures the next key press as a platform-neutral code. */
export function CaptureButton({
  value,
  onCapture,
  className,
  ariaLabel = "Capture key",
}: {
  value: string;
  onCapture: (code: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [listening, setListening] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={(e) => {
        if (!listening) return;
        e.preventDefault();
        const code = browserCodeToIac(e.nativeEvent);
        if (code) {
          onCapture(code);
          setListening(false);
        }
      }}
      className={cn(
        "tabular h-9 rounded-control border bg-bg px-3 text-ui transition-colors",
        listening ? "border-accent text-accent" : "border-border text-text",
        className,
      )}
    >
      {listening ? "Press a key…" : value}
    </button>
  );
}
