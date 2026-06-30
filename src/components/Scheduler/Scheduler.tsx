import { useState } from "react";
import { X, Clock } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtClock } from "@/lib/utils";
import type { Schedule, ScheduleInfo, Weekday } from "@/lib/types";

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function Scheduler() {
  const { schedules, armSchedule, cancelSchedule, settings } = useApp();
  const [mode, setMode] = useState<"once" | "interval" | "weekly">("once");

  const [onceAt, setOnceAt] = useState("");
  const [everyN, setEveryN] = useState(5);
  const [everyUnit, setEveryUnit] = useState<"min" | "hour">("min");
  const [days, setDays] = useState<Weekday[]>([]);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  const arm = () => {
    let s: Schedule;
    if (mode === "once") {
      if (!onceAt) return;
      s = { kind: "once", at_ms: new Date(onceAt).getTime() };
    } else if (mode === "interval") {
      const ms = everyN * (everyUnit === "min" ? 60_000 : 3_600_000);
      s = { kind: "interval", every_ms: ms, start_at_ms: null };
    } else {
      s = { kind: "weekly", days, hour, minute };
    }
    void armSchedule(s);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
        Scheduled runs require the app to stay open.
      </div>

      <div className="space-y-3 rounded-card border border-border bg-surface p-3">
        <div className="space-y-1">
          <Label>Trigger</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">One-shot (date & time)</SelectItem>
              <SelectItem value="interval">Interval</SelectItem>
              {settings.weekly_recurrence_enabled && (
                <SelectItem value="weekly">Weekly</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {mode === "once" && (
          <div className="space-y-1">
            <Label>Run at</Label>
            <Input
              type="datetime-local"
              className="tabular w-64"
              value={onceAt}
              onChange={(e) => setOnceAt(e.target.value)}
            />
          </div>
        )}

        {mode === "interval" && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label>Every</Label>
              <Input
                type="number"
                min={1}
                className="tabular w-24"
                value={everyN}
                onChange={(e) => setEveryN(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <Select value={everyUnit} onValueChange={(v) => setEveryUnit(v as "min" | "hour")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="min">minutes</SelectItem>
                <SelectItem value="hour">hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {mode === "weekly" && settings.weekly_recurrence_enabled && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setDays((prev) =>
                      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                    )
                  }
                  className={`rounded-control border px-2 py-1 text-xs uppercase ${
                    days.includes(d)
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border hover:bg-surface"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label>Hour</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  className="tabular w-20"
                  value={hour}
                  onChange={(e) => setHour(clamp(parseInt(e.target.value) || 0, 0, 23))}
                />
              </div>
              <div className="space-y-1">
                <Label>Minute</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  className="tabular w-20"
                  value={minute}
                  onChange={(e) => setMinute(clamp(parseInt(e.target.value) || 0, 0, 59))}
                />
              </div>
            </div>
          </div>
        )}

        <Button size="sm" onClick={arm}>
          <Clock className="h-4 w-4" /> Arm schedule
        </Button>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-muted">Armed schedules</div>
        {schedules.length === 0 ? (
          <p className="text-sm text-muted">None armed.</p>
        ) : (
          <ul className="space-y-1">
            {schedules.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-control border border-border px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate">
                  {s.macro_name} · {scheduleLabel(s)}
                </span>
                <span className="tabular mr-2 text-muted">{countdown(s)}</span>
                <button
                  aria-label="Cancel schedule"
                  title="Cancel"
                  onClick={() => cancelSchedule(s.id)}
                  className="rounded-[4px] p-1 text-muted hover:bg-border/50 hover:text-record"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function scheduleLabel(s: ScheduleInfo): string {
  const sc = s.schedule;
  if (sc.kind === "once") return `once @ ${new Date(sc.at_ms).toLocaleString()}`;
  if (sc.kind === "interval") return `every ${Math.round(sc.every_ms / 60000)} min`;
  return `weekly ${sc.days.join(",")} ${sc.hour}:${String(sc.minute).padStart(2, "0")}`;
}

function countdown(s: ScheduleInfo): string {
  if (s.next_run_ms == null) return "—";
  const ms = s.next_run_ms - Date.now();
  if (ms <= 0) return "now";
  return `in ${fmtClock(ms)}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
