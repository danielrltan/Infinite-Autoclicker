import { Circle, Play, Square, Dot, FilePlus2, Save } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings } from "@/components/Settings/Settings";
import { LibraryButton } from "@/components/Library/Library";
import { Tooltip } from "@/components/ui/tooltip";
import { fmtClock } from "@/lib/utils";

export function TopBar() {
  const {
    status,
    recording,
    play,
    stop,
    toggleRecord,
    macroName,
    setMacroName,
    newMacro,
    saveCurrent,
    dirty,
  } = useApp();

  const isPlaying = status === "playing";
  const isRecording = recording.active;

  return (
    <header className="flex items-center gap-3 border-b border-border bg-bg px-4 py-2.5">
      {isRecording ? (
        <Button variant="record" onClick={toggleRecord}>
          <Square className="h-4 w-4 fill-current" /> Stop
        </Button>
      ) : (
        <Button variant="secondary" onClick={toggleRecord} disabled={isPlaying}>
          <Circle className="h-4 w-4 fill-record text-record" /> Record
        </Button>
      )}

      {isPlaying ? (
        <Button variant="destructive" onClick={stop}>
          <Square className="h-4 w-4 fill-current" /> Stop
        </Button>
      ) : (
        <Button variant="play" onClick={play} disabled={isRecording}>
          <Play className="h-4 w-4 fill-current" /> Play
        </Button>
      )}

      <StatusPill />

      <Input
        aria-label="Macro name"
        value={macroName}
        onChange={(e) => setMacroName(e.target.value)}
        className="ml-2 max-w-[240px]"
      />

      <div className="ml-auto flex items-center gap-2">
        {isRecording && (
          <span className="tabular flex items-center gap-1.5 text-sm text-record">
            <Dot className="h-5 w-5 animate-pulse-rec fill-current" />
            {fmtClock(recording.elapsedMs)} · {recording.count}
          </span>
        )}
        <LibraryButton />
        <Tooltip label="New macro">
          <Button variant="ghost" size="icon" aria-label="New macro" onClick={newMacro}>
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
        <Settings />
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
    <span className={`tabular rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}>
      {s.text}
      {detail}
    </span>
  );
}
