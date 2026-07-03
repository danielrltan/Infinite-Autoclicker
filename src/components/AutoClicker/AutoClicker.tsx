import { useState } from "react";
import { Square, Crosshair, MousePointerClick } from "lucide-react";
import { useApp } from "@/store";
import { ipc } from "@/lib/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented";
import { CaptureButton } from "@/components/ui/capture-button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MouseButton } from "@/lib/types";

function splitMs(ms: number) {
  return {
    h: Math.floor(ms / 3_600_000),
    m: Math.floor(ms / 60_000) % 60,
    s: Math.floor(ms / 1000) % 60,
    ms: ms % 1000,
  };
}

/**
 * The namesake, as one inline card (no popup): interval + every option + Start.
 * Drives the dedicated fast auto-click engine, separate from the macro player.
 */
export function AutoClicker() {
  const { autoclick, setAutoclick, startAutoclick, stop, status, colorClicks, settings } =
    useApp();
  const running = status === "playing" && colorClicks !== null;
  const init = splitMs(autoclick.interval_ms);
  const [h, setH] = useState(init.h);
  const [m, setM] = useState(init.m);
  const [s, setS] = useState(init.s);
  const [ms, setMs] = useState(init.ms);

  const writeInterval = (hh: number, mm: number, ss: number, mss: number) => {
    const total = hh * 3_600_000 + mm * 60_000 + ss * 1000 + mss;
    setAutoclick({ ...autoclick, interval_ms: Math.max(0, total) });
  };

  const clickType =
    autoclick.clicks_per_event >= 3 ? "3" : autoclick.clicks_per_event === 2 ? "2" : "1";
  const keyMode = autoclick.key_code != null;

  const pick = async () => {
    const pos = await ipc.captureCursor();
    setAutoclick({ ...autoclick, use_fixed_pos: true, x: pos.x, y: pos.y });
  };

  return (
    <Card className="space-y-4 p-4">
      {/* Interval + primary action */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex items-center gap-2 pb-2">
            <MousePointerClick className="h-4 w-4 text-accent" />
            <span className="text-overline font-semibold uppercase text-muted">
              Auto-click
            </span>
          </div>

          <div>
            <h3 className="mb-1.5 text-overline font-medium uppercase text-muted">
              Click interval
            </h3>
            <div className="flex items-end gap-1">
              <TimeField unit="h" value={h} onChange={(v) => { setH(v); writeInterval(v, m, s, ms); }} />
              <Colon />
              <TimeField unit="m" value={m} onChange={(v) => { setM(v); writeInterval(h, v, s, ms); }} />
              <Colon />
              <TimeField unit="s" value={s} onChange={(v) => { setS(v); writeInterval(h, m, v, ms); }} />
              <Colon />
              <TimeField unit="ms" value={ms} onChange={(v) => { setMs(v); writeInterval(h, m, s, v); }} wide />
            </div>
          </div>

          <div className="tabular pb-1.5 text-2xl font-semibold leading-none text-text">
            {autoclick.interval_ms.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-muted">ms</span>
          </div>
        </div>

        <Button
          size="lg"
          variant={running ? "destructive" : "play"}
          onClick={running ? stop : startAutoclick}
          className="h-11 min-w-[8rem] justify-center gap-2 text-ui font-semibold"
        >
          {running ? (
            <>
              <Square className="h-4 w-4 fill-current" /> Stop
              {colorClicks !== null && ` · ${colorClicks}`}
            </>
          ) : (
            <>
              <MousePointerClick className="h-4 w-4" /> Start
              <Kbd className="ml-0.5 border-white/20 bg-white/15 text-white/90">
                {settings.hotkeys.autoclick_toggle}
              </Kbd>
            </>
          )}
        </Button>
      </div>

      {/* Every option, inline */}
      <div className="grid gap-x-6 gap-y-4 border-t border-border/60 pt-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Action">
          <Select
            value={keyMode ? "key" : "mouse"}
            onValueChange={(v) =>
              setAutoclick({
                ...autoclick,
                key_code: v === "key" ? (autoclick.key_code ?? "KeyE") : null,
              })
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mouse">Mouse click</SelectItem>
              <SelectItem value="key">Press key</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label={keyMode ? "Key (recorded)" : "Mouse button"}>
          {keyMode ? (
            <CaptureButton
              value={autoclick.key_code ?? ""}
              onCapture={(code) => setAutoclick({ ...autoclick, key_code: code })}
              className="w-full"
            />
          ) : (
            <Select
              value={autoclick.button}
              onValueChange={(v) => setAutoclick({ ...autoclick, button: v as MouseButton })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={keyMode ? "Press type" : "Click type"}>
          <Select
            value={clickType}
            onValueChange={(v) => setAutoclick({ ...autoclick, clicks_per_event: parseInt(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Single</SelectItem>
              <SelectItem value="2">Double</SelectItem>
              <SelectItem value="3">Triple</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Repeat">
          <div className="flex items-center gap-2">
            <SegmentedControl
              value={autoclick.repeat === 0 ? "inf" : "n"}
              onChange={(v) =>
                setAutoclick({ ...autoclick, repeat: v === "inf" ? 0 : autoclick.repeat || 50 })
              }
              options={[
                { value: "inf", label: "Until stopped" },
                { value: "n", label: "Count" },
              ]}
            />
            <Input
              type="number"
              min={1}
              className="tabular h-9 w-16"
              disabled={autoclick.repeat === 0}
              value={autoclick.repeat === 0 ? 50 : autoclick.repeat}
              onChange={(e) =>
                setAutoclick({ ...autoclick, repeat: Math.max(1, parseInt(e.target.value) || 1) })
              }
            />
          </div>
        </Field>

        {!keyMode && (
          <Field label="Cursor position">
            <div className="flex items-center gap-2">
              <SegmentedControl
                value={autoclick.use_fixed_pos ? "fixed" : "current"}
                onChange={(v) => setAutoclick({ ...autoclick, use_fixed_pos: v === "fixed" })}
                options={[
                  { value: "current", label: "Current" },
                  { value: "fixed", label: "Fixed" },
                ]}
              />
              {autoclick.use_fixed_pos && (
                <>
                  <Input
                    type="number"
                    aria-label="X"
                    className="tabular h-9 w-16"
                    value={autoclick.x}
                    onChange={(e) => setAutoclick({ ...autoclick, x: parseInt(e.target.value) || 0 })}
                  />
                  <Input
                    type="number"
                    aria-label="Y"
                    className="tabular h-9 w-16"
                    value={autoclick.y}
                    onChange={(e) => setAutoclick({ ...autoclick, y: parseInt(e.target.value) || 0 })}
                  />
                  <Button size="icon" variant="outline" aria-label="Pick location" title="Pick location" onClick={pick}>
                    <Crosshair className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </Field>
        )}

        <Field label="Randomized delay" value={`±${Math.round(autoclick.jitter_time_pct * 100)}%`}>
          <Slider
            min={0}
            max={50}
            step={1}
            value={[Math.round(autoclick.jitter_time_pct * 100)]}
            onValueChange={(v) => setAutoclick({ ...autoclick, jitter_time_pct: (v[0] ?? 0) / 100 })}
          />
        </Field>
      </div>
    </Card>
  );
}

function TimeField({
  unit,
  value,
  onChange,
  wide,
}: {
  unit: string;
  value: number;
  onChange: (n: number) => void;
  wide?: boolean;
}) {
  return (
    <label className="flex flex-col items-center gap-1">
      <Input
        type="number"
        min={0}
        className={`tabular h-10 ${wide ? "w-14" : "w-11"} px-0 text-center text-base font-medium`}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
      />
      <span className="text-overline font-medium uppercase text-muted">{unit}</span>
    </label>
  );
}

const Colon = () => <span className="pb-6 text-base text-muted">:</span>;
