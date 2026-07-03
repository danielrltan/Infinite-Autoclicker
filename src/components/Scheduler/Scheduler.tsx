import { useState } from "react";
import { X, Clock, AlertTriangle } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
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
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2 rounded-card border border-warn/40 bg-warn/10 px-3 py-2 text-body text-warn">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Scheduled runs require the app to stay open.
      </div>

      <Section title="New schedule">
        <Field label="Trigger">
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="once">One-shot (date &amp; time)</SelectItem>
              <SelectItem value="interval">Interval</SelectItem>
              {settings.weekly_recurrence_enabled && (
                <SelectItem value="weekly">Weekly</SelectItem>
              )}
            </SelectContent>
          </Select>
        </Field>

        {mode === "once" && (
          <Field label="Run at">
            <Input
              type="datetime-local"
              className="tabular"
              value={onceAt}
              onChange={(e) => setOnceAt(e.target.value)}
            />
          </Field>
        )}

        {mode === "interval" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Every">
              <Input
                type="number"
                min={1}
                className="tabular"
                value={everyN}
                onChange={(e) => setEveryN(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </Field>
            <Field label="Unit">
              <Select value={everyUnit} onValueChange={(v) => setEveryUnit(v as "min" | "hour")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="min">minutes</SelectItem>
                  <SelectItem value="hour">hours</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        {mode === "weekly" && settings.weekly_recurrence_enabled && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setDays((prev) =>
                      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                    )
                  }
                  className={`tabular w-10 rounded-control border py-1.5 text-body font-medium uppercase transition-colors ${
                    days.includes(d)
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border text-muted hover:border-muted hover:text-text"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hour">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  className="tabular"
                  value={hour}
                  onChange={(e) => setHour(clamp(parseInt(e.target.value) || 0, 0, 23))}
                />
              </Field>
              <Field label="Minute">
                <Input
                  type="number"
                  min={0}
                  max={59}
                  className="tabular"
                  value={minute}
                  onChange={(e) => setMinute(clamp(parseInt(e.target.value) || 0, 0, 59))}
                />
              </Field>
            </div>
          </div>
        )}

        <Button size="sm" onClick={arm}>
          <Clock className="h-4 w-4" /> Arm schedule
        </Button>
      </Section>

      <Section
        title="Armed schedules"
        action={<span className="tabular text-label text-muted">{schedules.length}</span>}
        bodyClassName={
          schedules.length === 0
            ? "p-0"
            : "p-0 space-y-0 divide-y divide-border/60"
        }
      >
        {schedules.length === 0 ? (
          <EmptyState className="border-0" title="No schedules armed yet." />
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-ui">
              <span className="flex-1 truncate">
                <span className="text-text">{s.macro_name}</span>
                <span className="text-muted"> · {scheduleLabel(s)}</span>
              </span>
              <span className="tabular text-label text-muted">{countdown(s)}</span>
              <IconButton
                label="Cancel schedule"
                variant="danger"
                onClick={() => cancelSchedule(s.id)}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          ))
        )}
      </Section>
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
  if (s.next_run_ms == null) return "";
  const ms = s.next_run_ms - Date.now();
  if (ms <= 0) return "now";
  return `in ${fmtClock(ms)}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
