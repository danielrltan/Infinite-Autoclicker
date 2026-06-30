import { Play, Square, Dot, FilePlus2, Save } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings } from "@/components/Settings/Settings";
import { LibraryButton } from "@/components/Library/Library";
import { Tooltip } from "@/components/ui/tooltip";
import { isMacroTab, tabLabel } from "@/lib/tabs";
import { fmtClock } from "@/lib/utils";

export function TopBar() {
  const {
    status,
    recording,
    play,
    stop,
    macroName,
    setMacroName,
    newMacro,
    saveCurrent,
    dirty,
    tab,
  } = useApp();

  const isPlaying = status === "playing";
  const isRecording = recording.active;
  const macroTab = isMacroTab(tab);

  return (
    <header className="flex h-12 shrink-0 items-center border-b border-border bg-bg">
      <div className="shell-col flex items-center gap-3">
        {/* Zone 1 — transport + status */}
        {isPlaying ? (
          <Button variant="destructive" size="sm" onClick={stop}>
            <Square className="h-4 w-4 fill-current" /> Stop
          </Button>
        ) : macroTab ? (
          <Button variant="play" size="sm" onClick={play} disabled={isRecording}>
            <Play className="h-4 w-4 fill-current" /> Play
          </Button>
        ) : null}
        <StatusPill />
        <div className="mx-1 h-5 w-px bg-border" />

        {/* Zone 2 — context identity */}
        {macroTab ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${dirty ? "bg-warn" : "bg-transparent"}`}
              aria-hidden
            />
            <Input
              aria-label="Macro name"
              value={macroName}
              onChange={(e) => setMacroName(e.target.value)}
              placeholder="Untitled macro"
              className="h-8 w-[240px] border-transparent bg-transparent px-1.5 text-ui font-medium hover:border-border focus:bg-surface"
            />
          </div>
        ) : (
          <h1 className="truncate text-title font-semibold text-text">
            {tabLabel(tab)}
          </h1>
        )}

        {/* Zone 3 — utilities */}
        <div className="ml-auto flex items-center gap-1.5">
          {isRecording && (
            <span className="tabular flex items-center gap-1.5 text-body text-record">
              <Dot className="h-5 w-5 animate-pulse-rec fill-current" />
              {fmtClock(recording.elapsedMs)} · {recording.count}
            </span>
          )}
          {macroTab && (
            <>
              <LibraryButton />
              <Tooltip label="New macro">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="New macro"
                  onClick={newMacro}
                >
                  <FilePlus2 className="h-5 w-5" />
                </Button>
              </Tooltip>
              <Tooltip label={dirty ? "Save (unsaved changes)" : "Save"}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Save macro"
                  onClick={saveCurrent}
                  className={dirty ? "text-warn" : undefined}
                >
                  <Save className="h-5 w-5" />
                </Button>
              </Tooltip>
              <div className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          <Settings />
        </div>
      </div>
    </header>
  );
}

function StatusPill() {
  const { status, progress, colorClicks } = useApp();
  const map: Record<string, { text: string; cls: string }> = {
    idle: { text: "Idle", cls: "bg-surface text-muted" },
    recording: { text: "Recording", cls: "bg-record/15 text-record" },
    playing: { text: "Playing", cls: "bg-play/15 text-play" },
    scheduled: { text: "Scheduled", cls: "bg-warn/15 text-warn" },
  };
  const s = map[status] ?? { text: "Idle", cls: "bg-surface text-muted" };
  let detail = "";
  if (status === "playing" && progress && progress.totalEvents > 0) {
    detail = ` · loop ${progress.loop + 1}${
      progress.totalLoops ? `/${progress.totalLoops}` : ""
    }`;
  } else if (status === "playing" && colorClicks !== null) {
    detail = ` · ${colorClicks} clicks`;
  }
  return (
    <span
      className={`tabular rounded-full px-3 py-1 text-label font-medium ${s.cls}`}
    >
      {s.text}
      {detail}
    </span>
  );
}
