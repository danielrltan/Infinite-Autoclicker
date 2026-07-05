import { Play, Square, SlidersHorizontal, CalendarClock } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RunControls } from "@/components/RunControls";
import { Scheduler } from "@/components/Scheduler/Scheduler";

/**
 * The single, always-visible transport. One Play (runs the sequence) and one
 * Stop that halts everything - sequence, auto-click, color, or a recording -
 * via stopEverything → core.stop_all(). Run options + scheduling hang off it in
 * popovers so they're one click away without cluttering the workspace.
 */
export function RunBar() {
  const {
    status,
    recording,
    play,
    stopEverything,
    steps,
    repeat,
    speed,
    progress,
    colorClicks,
    settings,
    schedules,
  } = useApp();

  // Recording isn't a run, so the transport doesn't own it - the toolbar's
  // Record ⇄ Stop (and F5) is the single recording control. Play just parks
  // while recording so it can't fire mid-capture.
  const running = status === "playing";
  const key = settings.hotkeys.play_stop_toggle;

  return (
    <div className="shrink-0 border-t border-border bg-bg">
      <div className="shell-col flex items-center gap-3 py-2.5">
        {running ? (
          <Button variant="destructive" size="lg" onClick={stopEverything} className="gap-2">
            <Square className="h-4 w-4 fill-current" /> Stop
            <Kbd className="ml-0.5 border-white/20 bg-white/15 text-white/90">{key}</Kbd>
          </Button>
        ) : (
          <Button variant="play" size="lg" onClick={play} disabled={recording.active} className="gap-2">
            <Play className="h-4 w-4 fill-current" /> Play
            <Kbd className="ml-0.5 border-white/20 bg-white/15 text-white/90">{key}</Kbd>
          </Button>
        )}

        <span className="tabular truncate text-body text-muted">{readout()}</span>

        <div className="ml-auto flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm">
                <SlidersHorizontal className="h-4 w-4" /> Run
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" side="top">
              <RunControls />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm">
                <CalendarClock className="h-4 w-4" /> Schedule
                {schedules.length > 0 && (
                  <span className="tabular rounded-full bg-warn/15 px-1.5 text-label font-medium text-warn">
                    {schedules.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="max-h-[75vh] w-[26rem] overflow-y-auto" side="top">
              <Scheduler />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );

  function readout(): string {
    if (recording.active) return "Recording…";
    if (status === "playing" && progress && progress.totalEvents > 0) {
      const loops = progress.totalLoops ? `/${progress.totalLoops}` : "";
      return `Loop ${progress.loop + 1}${loops} · event ${progress.event + 1}/${progress.totalEvents}`;
    }
    if (status === "playing" && colorClicks !== null) {
      return `${colorClicks} ${colorClicks === 1 ? "click" : "clicks"}`;
    }
    const count = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
    const rep = repeat === 0 ? "∞" : `×${repeat}`;
    return `${count} · repeat ${rep} · ${speed.toFixed(2)}×`;
  }
}
