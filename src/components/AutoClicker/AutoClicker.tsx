import { useState } from "react";
import { Square, Crosshair, MousePointerClick } from "lucide-react";
import { useApp } from "@/store";
import { ipc } from "@/lib/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, Section } from "@/components/ui/card";
import { Field, FieldRow } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented";
import { CaptureButton } from "@/components/ui/capture-button";
import { Kbd } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { MouseButton } from "@/lib/types";

function splitMs(ms: number) {
  return {
    h: Math.floor(ms / 3_600_000),
    m: Math.floor(ms / 60_000) % 60,
    s: Math.floor(ms / 1000) % 60,
    ms: ms % 1000,
  };
}

/** OP Auto Clicker's main window: interval, options, repeat, position, Start/Stop. */
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
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Hero — interval + big readout */}
      <Card>
        <div className="flex items-end justify-between gap-6">
          <div>
            <h3 className="mb-2 text-overline font-semibold uppercase text-muted">
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
          <div className="tabular text-3xl font-semibold leading-none text-text">
            {autoclick.interval_ms.toLocaleString()}
            <span className="ml-1 text-base font-normal text-muted">ms</span>
          </div>
        </div>
      </Card>

      {/* Options + repeat — one dense card */}
      <Section
        title="Click options"
        bodyClassName="p-0 space-y-0 divide-y divide-border/60"
      >
        <FieldRow label="Action" className="px-4">
          <Select
            value={keyMode ? "key" : "mouse"}
            onValueChange={(v) =>
              setAutoclick({
                ...autoclick,
                key_code: v === "key" ? (autoclick.key_code ?? "KeyE") : null,
              })
            }
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mouse">Mouse click</SelectItem>
              <SelectItem value="key">Press key</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label={keyMode ? "Key" : "Mouse button"} className="px-4">
          {keyMode ? (
            <CaptureButton
              value={autoclick.key_code ?? ""}
              onCapture={(code) => setAutoclick({ ...autoclick, key_code: code })}
              className="w-40"
            />
          ) : (
            <Select
              value={autoclick.button}
              onValueChange={(v) => setAutoclick({ ...autoclick, button: v as MouseButton })}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FieldRow>

        <FieldRow label={keyMode ? "Press type" : "Click type"} className="px-4">
          <Select
            value={clickType}
            onValueChange={(v) => setAutoclick({ ...autoclick, clicks_per_event: parseInt(v) })}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Single</SelectItem>
              <SelectItem value="2">Double</SelectItem>
              <SelectItem value="3">Triple</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Repeat" className="px-4">
          <div className="flex items-center gap-3">
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
              className="tabular h-9 w-20"
              disabled={autoclick.repeat === 0}
              value={autoclick.repeat === 0 ? 50 : autoclick.repeat}
              onChange={(e) =>
                setAutoclick({ ...autoclick, repeat: Math.max(1, parseInt(e.target.value) || 1) })
              }
            />
            <span className="text-body text-muted">times</span>
          </div>
        </FieldRow>
      </Section>

      {/* Position + randomize — balanced, no dead space */}
      <div className={keyMode ? "" : "grid grid-cols-2 items-start gap-3"}>
        {!keyMode && (
          <Section title="Cursor position">
            <SegmentedControl
              value={autoclick.use_fixed_pos ? "fixed" : "current"}
              onChange={(v) =>
                setAutoclick({ ...autoclick, use_fixed_pos: v === "fixed" })
              }
              options={[
                { value: "current", label: "Current" },
                { value: "fixed", label: "Fixed" },
              ]}
            />
            {autoclick.use_fixed_pos && (
              <div className="flex items-end gap-2">
                <Field label="X" className="flex-1">
                  <Input
                    type="number"
                    className="tabular"
                    value={autoclick.x}
                    onChange={(e) => setAutoclick({ ...autoclick, x: parseInt(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Y" className="flex-1">
                  <Input
                    type="number"
                    className="tabular"
                    value={autoclick.y}
                    onChange={(e) => setAutoclick({ ...autoclick, y: parseInt(e.target.value) || 0 })}
                  />
                </Field>
                <Button size="icon" variant="outline" aria-label="Pick location" title="Pick location" onClick={pick}>
                  <Crosshair className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Section>
        )}

        <Section title="Randomized delay">
          <Field label="Time" value={`±${Math.round(autoclick.jitter_time_pct * 100)}%`}>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[Math.round(autoclick.jitter_time_pct * 100)]}
              onValueChange={(v) => setAutoclick({ ...autoclick, jitter_time_pct: (v[0] ?? 0) / 100 })}
            />
          </Field>
          {!keyMode && autoclick.use_fixed_pos && (
            <Field label="Position" value={`±${autoclick.jitter_pos_px}px`}>
              <Slider
                min={0}
                max={50}
                step={1}
                value={[autoclick.jitter_pos_px]}
                onValueChange={(v) => setAutoclick({ ...autoclick, jitter_pos_px: v[0] ?? 0 })}
              />
            </Field>
          )}
        </Section>
      </div>

      {/* Primary action — the only Play on this tab */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/85 px-4 py-3 backdrop-blur">
        <Button
          size="lg"
          variant={running ? "destructive" : "play"}
          onClick={running ? stop : startAutoclick}
          className="h-11 w-full justify-center gap-2 text-ui font-semibold"
        >
          {running ? (
            <>
              <Square className="h-4 w-4 fill-current" /> Stop
            </>
          ) : (
            <>
              <MousePointerClick className="h-4 w-4" /> Start
            </>
          )}
          <Kbd className="ml-1 border-white/20 bg-white/15 text-white/90">
            {settings.hotkeys.play_stop_toggle}
          </Kbd>
        </Button>
      </div>
    </div>
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
        className={`tabular h-11 ${wide ? "w-16" : "w-12"} px-0 text-center text-lg font-medium`}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
      />
      <span className="text-overline font-medium uppercase text-muted">{unit}</span>
    </label>
  );
}

const Colon = () => <span className="pb-6 text-lg text-muted">:</span>;
