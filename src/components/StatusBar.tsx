import { useApp } from "@/store";
import { Kbd } from "@/components/ui/kbd";

export function StatusBar() {
  const { settings } = useApp();
  const h = settings.hotkeys;
  return (
    <footer className="shrink-0 border-t border-border bg-surface text-overline text-muted">
      <div className="shell-col flex items-center gap-4 py-1.5">
        <Hint k={h.record_toggle} label="Rec" />
        <Hint k={h.play_stop_toggle} label="Play" />
        <Hint k={h.autoclick_toggle} label="Auto-click" />
        <Hint k={h.panic} label="Panic" />
      </div>
    </footer>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Kbd>{k}</Kbd>
      {label}
    </span>
  );
}
