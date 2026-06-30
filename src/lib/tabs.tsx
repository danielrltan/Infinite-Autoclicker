import type { ReactNode } from "react";
import {
  MousePointerClick,
  ListOrdered,
  Circle,
  Sparkles,
  Clock,
} from "lucide-react";
import type { Tab } from "@/store";

export interface TabMeta {
  value: Tab;
  label: string;
  kind: "macro" | "config";
  icon: ReactNode;
}

export const TABS: TabMeta[] = [
  { value: "autoclick", label: "Auto Clicker", kind: "config", icon: <MousePointerClick className="h-4 w-4" /> },
  { value: "steps", label: "Steps", kind: "macro", icon: <ListOrdered className="h-4 w-4" /> },
  { value: "recorded", label: "Recorder", kind: "macro", icon: <Circle className="h-4 w-4" /> },
  { value: "color", label: "Color Trigger", kind: "config", icon: <Sparkles className="h-4 w-4" /> },
  { value: "schedule", label: "Scheduler", kind: "config", icon: <Clock className="h-4 w-4" /> },
];

export const isMacroTab = (t: Tab) =>
  TABS.find((x) => x.value === t)?.kind === "macro";
export const tabLabel = (t: Tab) =>
  TABS.find((x) => x.value === t)?.label ?? "";
