import { useApp } from "@/store";

export function StatusBar() {
  const { settings } = useApp();
  const h = settings.hotkeys;
  return (
    <footer className="flex items-center gap-4 border-t border-border bg-surface px-4 py-1.5 text-[11px] text-muted">
      <Hint k={h.record_toggle} label="Rec" />
      <Hint k={h.play_stop_toggle} label="Play" />
      <Hint k={h.capture_cursor} label="Capture" />
      <Hint k={h.panic} label="Panic" />
      <span className="ml-auto">No network · no telemetry</span>
    </footer>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="tabular rounded border border-border bg-bg px-1.5 py-0.5">{k}</kbd>
      {label}
    </span>
  );
}
