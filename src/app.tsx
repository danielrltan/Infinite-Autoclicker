import { Square, Circle } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { RunBar } from "@/components/RunBar";
import { Toasts } from "@/components/Toasts";
import { Banners } from "@/components/Onboarding/Banners";
import { AutoClicker } from "@/components/AutoClicker/AutoClicker";
import { StepList } from "@/components/StepBuilder/StepBuilder";
import { Inspector } from "@/components/Inspector";

/**
 * One screen. The auto-clicker sits up top as its own card; below it the
 * sequence lives as a master/detail pair (table + step editor), and the RunBar
 * runs it. Color detection is a step; no tabs, no popups, no pages.
 */
export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
        <Banners />
        <TopBar />

        <main className="min-h-0 flex-1 overflow-y-auto py-4">
          <div className="shell-col space-y-4">
            <AutoClicker />

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_minmax(360px,400px)]">
              <div className="min-w-0 space-y-3">
                <SequenceHeader />
                <StepList />
              </div>
              {/* Sticky + height-bounded so a tall editor scrolls in-panel and
                  never clips behind the run bar. */}
              <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1">
                <Inspector />
              </div>
            </div>
          </div>
        </main>

        <RunBar />
        <StatusBar />
        <Toasts />
      </div>
    </TooltipProvider>
  );
}

/** Steps section header: count on the left, recording controls on the right. */
function SequenceHeader() {
  const {
    steps,
    recordMode,
    setRecordMode,
    captureKeyboard,
    setCaptureKeyboard,
    recording,
    toggleRecord,
    settings,
  } = useApp();
  const recKey = settings.hotkeys.record_toggle;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-overline font-semibold uppercase text-muted">
        Steps · <span className="tabular">{steps.length}</span>
      </span>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {recording.active ? (
          <Button variant="record" size="sm" onClick={toggleRecord}>
            <Square className="h-4 w-4 fill-current" /> Stop ({recKey})
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={toggleRecord}>
            <Circle className="h-4 w-4 fill-record text-record" /> Record ({recKey})
          </Button>
        )}
        <label className="flex items-center gap-2 text-label font-medium text-muted">
          <Switch
            checked={recordMode === "full_motion"}
            onCheckedChange={(on) => setRecordMode(on ? "full_motion" : "clicks_only")}
            disabled={recording.active}
          />
          Capture motion
        </label>
        <label className="flex items-center gap-2 text-label font-medium text-muted">
          <Switch
            checked={captureKeyboard}
            onCheckedChange={setCaptureKeyboard}
            disabled={recording.active}
          />
          Capture keyboard
        </label>
      </div>
    </div>
  );
}
