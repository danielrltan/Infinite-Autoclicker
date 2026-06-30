import {
  MousePointerClick,
  ListOrdered,
  Circle,
  Sparkles,
  Clock,
  Square,
  Dot,
} from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtClock } from "@/lib/utils";
import { TopBar } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { Toasts } from "@/components/Toasts";
import { Banners } from "@/components/Onboarding/Banners";
import { Timeline } from "@/components/Timeline/Timeline";
import { AutoClicker } from "@/components/AutoClicker/AutoClicker";
import { StepBuilder } from "@/components/StepBuilder/StepBuilder";
import { EventList } from "@/components/EventList/EventList";
import { RunControls } from "@/components/RunControls";
import { ColorTrigger } from "@/components/ColorTrigger/ColorTrigger";
import { Scheduler } from "@/components/Scheduler/Scheduler";
import type { Tab } from "@/store";

const TABS: { value: Tab; label: string; icon: React.ReactNode }[] = [
  { value: "autoclick", label: "Auto Clicker", icon: <MousePointerClick className="h-4 w-4" /> },
  { value: "steps", label: "Steps", icon: <ListOrdered className="h-4 w-4" /> },
  { value: "recorded", label: "Recorder", icon: <Circle className="h-4 w-4" /> },
  { value: "color", label: "Color Trigger", icon: <Sparkles className="h-4 w-4" /> },
  { value: "schedule", label: "Scheduler", icon: <Clock className="h-4 w-4" /> },
];

export default function App() {
  const { tab, setTab } = useApp();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
        <Banners />
        <TopBar />

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-border bg-bg px-3">
            <TabsList className="h-auto gap-1 rounded-none bg-transparent p-0">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-muted shadow-none data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-text data-[state=active]:shadow-none"
                >
                  {t.icon}
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <main className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mx-auto max-w-4xl">
              <TabsContent value="autoclick" className="mt-0">
                <AutoClicker />
              </TabsContent>

              <TabsContent value="steps" className="mt-0 space-y-4">
                <Timeline />
                <StepBuilder />
                <RunControls />
              </TabsContent>

              <TabsContent value="recorded" className="mt-0 space-y-4">
                <Timeline />
                <RecorderControls />
                <EventList />
                <RunControls />
              </TabsContent>

              <TabsContent value="color" className="mt-0">
                <ColorTrigger />
              </TabsContent>

              <TabsContent value="schedule" className="mt-0">
                <Scheduler />
              </TabsContent>
            </div>
          </main>
        </Tabs>

        <StatusBar />
        <Toasts />
      </div>
    </TooltipProvider>
  );
}

/** Record button + capture options shown above the recorded-events list. */
function RecorderControls() {
  const {
    recordMode,
    setRecordMode,
    captureKeyboard,
    setCaptureKeyboard,
    recording,
    toggleRecord,
  } = useApp();
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-3 text-sm">
      {recording.active ? (
        <Button variant="record" onClick={toggleRecord}>
          <Square className="h-4 w-4 fill-current" /> Stop (F9)
        </Button>
      ) : (
        <Button variant="secondary" onClick={toggleRecord}>
          <Circle className="h-4 w-4 fill-record text-record" /> Record (F9)
        </Button>
      )}
      {recording.active && (
        <span className="tabular flex items-center gap-1.5 text-record">
          <Dot className="h-5 w-5 animate-pulse-rec fill-current" />
          {fmtClock(recording.elapsedMs)} · {recording.count} events
        </span>
      )}
      <span className="text-xs font-medium text-muted">Capture</span>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="capmode"
          checked={recordMode === "clicks_only"}
          onChange={() => setRecordMode("clicks_only")}
          disabled={recording.active}
        />
        Clicks only
      </label>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="capmode"
          checked={recordMode === "full_motion"}
          onChange={() => setRecordMode("full_motion")}
          disabled={recording.active}
        />
        Full motion
      </label>
      <label className="ml-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={captureKeyboard}
          onChange={(e) => setCaptureKeyboard(e.target.checked)}
          disabled={recording.active}
        />
        Capture keyboard
      </label>
    </div>
  );
}
