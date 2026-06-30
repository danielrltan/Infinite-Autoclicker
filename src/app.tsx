import { Sparkles } from "lucide-react";
import { useApp } from "@/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TopBar } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { Toasts } from "@/components/Toasts";
import { Banners } from "@/components/Onboarding/Banners";
import { Library } from "@/components/Library/Library";
import { Timeline } from "@/components/Timeline/Timeline";
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
        <div className="flex min-h-0 flex-1">
          <Library />
          <main className="min-w-0 flex-1 overflow-auto p-4">
            <div className="mx-auto max-w-4xl space-y-4">
              <Timeline />

              <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                <TabsList>
                  <TabsTrigger value="steps">Steps</TabsTrigger>
                  <TabsTrigger value="recorded">Recorded events</TabsTrigger>
                  <TabsTrigger value="color">
                    <Sparkles className="h-3.5 w-3.5" /> Color trigger
                  </TabsTrigger>
                  <TabsTrigger value="schedule">Schedule</TabsTrigger>
                </TabsList>

                <TabsContent value="steps">
                  <StepBuilder />
                </TabsContent>
                <TabsContent value="recorded">
                  <EventList />
                </TabsContent>
                <TabsContent value="color">
                  <ColorTrigger />
                </TabsContent>
                <TabsContent value="schedule">
                  <Scheduler />
                </TabsContent>
              </Tabs>

              {(tab === "steps" || tab === "recorded") && <RunControls />}
            </div>
          </main>
        </div>
        <StatusBar />
        <Toasts />
      </div>
    </TooltipProvider>
  );
}
