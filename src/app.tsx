import { Square, Circle } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TABS } from "@/lib/tabs";
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
          <div className="border-b border-border bg-bg">
            <div className="shell-col">
              <TabsList className="-ml-2.5 h-auto gap-1 rounded-none bg-transparent p-0">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="gap-1.5 rounded-none border-b-2 border-transparent px-2.5 py-2.5 text-ui text-muted shadow-none data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-text data-[state=active]:shadow-none"
                  >
                    {t.icon}
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          <main className="min-h-0 flex-1 overflow-auto py-4">
            <div className="shell-col">
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
    settings,
  } = useApp();
  const recKey = settings.hotkeys.record_toggle;
  return (
    <Card className="flex flex-wrap items-center gap-4 p-3">
      {recording.active ? (
        <Button variant="record" size="sm" onClick={toggleRecord}>
          <Square className="h-4 w-4 fill-current" /> Stop ({recKey})
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={toggleRecord}>
          <Circle className="h-4 w-4 fill-record text-record" /> Record ({recKey})
        </Button>
      )}
      <div className="ml-auto flex items-center gap-4">
        <SegmentedControl
          value={recordMode}
          onChange={setRecordMode}
          disabled={recording.active}
          options={[
            { value: "clicks_only", label: "Clicks only" },
            { value: "full_motion", label: "Full motion" },
          ]}
        />
        <label className="flex items-center gap-2 text-label font-medium text-muted">
          Capture keyboard
          <Switch
            checked={captureKeyboard}
            onCheckedChange={setCaptureKeyboard}
            disabled={recording.active}
          />
        </label>
      </div>
    </Card>
  );
}
