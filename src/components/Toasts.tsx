import { useApp } from "@/store";

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto rounded-control border px-3 py-2 text-sm shadow-pop animate-fade-in ${cls(t.kind)}`}
        >
          {t.msg}
        </div>
      ))}
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
