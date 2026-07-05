import * as React from "react";
import { X } from "lucide-react";
import { useApp, type Toast } from "@/store";

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: () => void }) {
  const duration = t.durationMs ?? (t.action ? 8000 : 3500);
  const [paused, setPaused] = React.useState(false);
  const [width, setWidth] = React.useState(100);

  // Component owns the dismiss timer so we can pause it on hover/focus - the
  // undo window must not expire while the user reaches for it.
  React.useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(onDismiss, duration);
    const raf = requestAnimationFrame(() => setWidth(0));
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  return (
    <div
      role="status"
      aria-live={t.kind === "error" ? "assertive" : "polite"}
      onMouseEnter={() => {
        setPaused(true);
        setWidth(100);
      }}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => {
        setPaused(true);
        setWidth(100);
      }}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-control border px-3 py-2 text-sm shadow-pop animate-fade-in ${cls(
        t.kind,
      )}`}
    >
      <span className="min-w-0">{t.msg}</span>

      {t.action ? (
        <button
          type="button"
          onClick={() => {
            void t.action!.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded-[4px] px-2 py-0.5 text-xs font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-current"
        >
          {t.action.label}
        </button>
      ) : null}

      <button
        type="button"
        aria-label="Dismiss notification"
        title="Dismiss"
        onClick={onDismiss}
        className="shrink-0 rounded-[4px] p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {t.action ? (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 bg-current opacity-40"
          style={{
            width: `${width}%`,
            transition: paused ? "none" : `width ${duration}ms linear`,
          }}
        />
      ) : null}
    </div>
  );
}

function cls(kind: string) {
  switch (kind) {
    case "success":
      return "border-play/40 bg-play/10 text-play";
    case "error":
      return "border-record/40 bg-record/10 text-record";
    case "warn":
      return "border-warn/40 bg-warn/10 text-warn";
    default:
      return "border-border bg-bg text-text";
  }
}
