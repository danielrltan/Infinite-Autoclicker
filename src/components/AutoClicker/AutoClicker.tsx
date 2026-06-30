import { useState } from "react";
import { Square, Crosshair, MousePointerClick } from "lucide-react";
import { useApp } from "@/store";
import { ipc } from "@/lib/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { browserCodeToIac } from "@/lib/keymap";
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
  const { autoclick, setAutoclick, startAutoclick, stop, status, colorClicks, toast } =
    useApp();
  const running = status === "playing";
  const init = splitMs(autoclick.interval_ms);
  const [h, setH] = useState(init.h);
  const [m, setM] = useState(init.m);
  const [s, setS] = useState(init.s);
  const [ms, setMs] = useState(init.ms);
  const [listening, setListening] = useState(false);

  const writeInterval = (hh: number, mm: number, ss: number, mss: number) => {
    const total = hh * 3_600_000 + mm * 60_000 + ss * 1000 + mss;
    setAutoclick({ ...autoclick, interval_ms: Math.max(0, total) });
  };

  const clickType =
    autoclick.clicks_per_event >= 3 ? "3" : autoclick.clicks_per_event === 2 ? "2" : "1";

  const pick = async () => {
    const pos = await ipc.captureCursor();
    setAutoclick({ ...autoclick, use_fixed_pos: true, x: pos.x, y: pos.y });
    toast(`Picked ${pos.x}, ${pos.y}`, "success");
  };

  const keyMode = autoclick.key_code != null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Click interval */}
      <Section title="Click interval">
        <div className="grid grid-cols-4 gap-2">
          <TimeField label="Hours" value={h} onChange={(v) => { setH(v); writeInterval(v, m, s, ms); }} />
          <TimeField label="Mins" value={m} onChange={(v) => { setM(v); writeInterval(h, v, s, ms); }} />
          <TimeField label="Seconds" value={s} onChange={(v) => { setS(v); writeInterval(h, m, v, ms); }} />
          <TimeField label="Milliseconds" value={ms} onChange={(v) => { setMs(v); writeInterval(h, m, s, v); }} />
        </div>
        <p className="text-xs text-muted">
          Delay between clicks: <span className="tabular">{autoclick.interval_ms} ms</span>
          {autoclick.interval_ms === 0 && " (as fast as possible)"}
        </p>
      </Section>

      {/* Click options */}
      <Section title="Click options">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Action">
            <Select
              value={keyMode ? "key" : "mouse"}
              onValueChange={(v) =>
                setAutoclick({ ...autoclick, key_code: v === "key" ? (autoclick.key_code ?? "KeyE") : null })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mouse">Mouse click</SelectItem>
                <SelectItem value="key">Press key</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {keyMode ? (
            <Field label="Key">
              <button
                onClick={() => setListening(true)}
                onBlur={() => setListening(false)}
                onKeyDown={(e) => {
                  if (!listening) return;
                  e.preventDefault();
                  const code = browserCodeToIac(e.nativeEvent);
                  if (code) {
                    setAutoclick({ ...autoclick, key_code: code });
                    setListening(false);
                  }
                }}
                className={`tabular h-9 w-full rounded-control border px-3 text-sm ${listening ? "border-accent text-accent" : "border-border"}`}
              >
                {listening ? "Press a key…" : autoclick.key_code}
              </button>
            </Field>
          ) : (
            <Field label="Mouse button">
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
            </Field>
          )}

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
        </div>
      </Section>

      {/* Click repeat */}
      <Section title="Click repeat">
        <div className="space-y-2">
          <Radio
            checked={autoclick.repeat === 0}
            onSelect={() => setAutoclick({ ...autoclick, repeat: 0 })}
            label="Repeat until stopped"
          />
          <div className="flex items-center gap-2">
            <Radio
              checked={autoclick.repeat !== 0}
              onSelect={() => setAutoclick({ ...autoclick, repeat: autoclick.repeat || 50 })}
              label="Repeat"
            />
            <Input
              type="number"
              min={1}
              className="tabular h-8 w-24"
              disabled={autoclick.repeat === 0}
              value={autoclick.repeat === 0 ? 50 : autoclick.repeat}
              onChange={(e) =>
                setAutoclick({ ...autoclick, repeat: Math.max(1, parseInt(e.target.value) || 1) })
              }
            />
            <span className="text-sm text-muted">times</span>
          </div>
        </div>
      </Section>

      {/* Cursor position (mouse mode only) */}
      {!keyMode && (
        <Section title="Cursor position">
          <div className="space-y-2">
            <Radio
              checked={!autoclick.use_fixed_pos}
              onSelect={() => setAutoclick({ ...autoclick, use_fixed_pos: false })}
              label="Current location"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Radio
                checked={autoclick.use_fixed_pos}
                onSelect={() => setAutoclick({ ...autoclick, use_fixed_pos: true })}
                label="Fixed:"
              />
              <Input
                type="number"
                className="tabular h-8 w-20"
                disabled={!autoclick.use_fixed_pos}
                value={autoclick.x}
                onChange={(e) => setAutoclick({ ...autoclick, x: parseInt(e.target.value) || 0 })}
                aria-label="X"
              />
              <Input
                type="number"
                className="tabular h-8 w-20"
                disabled={!autoclick.use_fixed_pos}
                value={autoclick.y}
                onChange={(e) => setAutoclick({ ...autoclick, y: parseInt(e.target.value) || 0 })}
                aria-label="Y"
              />
              <Button size="sm" variant="outline" onClick={pick}>
                <Crosshair className="h-4 w-4" /> Pick location
              </Button>
            </div>
          </div>
        </Section>
      )}

      {/* Humanization (Murgee random delay) */}
      <Section title="Randomized delay (optional)">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={`Random delay ±${Math.round(autoclick.jitter_time_pct * 100)}%`}>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[Math.round(autoclick.jitter_time_pct * 100)]}
              onValueChange={(v) => setAutoclick({ ...autoclick, jitter_time_pct: (v[0] ?? 0) / 100 })}
            />
          </Field>
          {!keyMode && autoclick.use_fixed_pos && (
            <Field label={`Position ±${autoclick.jitter_pos_px}px`}>
              <Slider
                min={0}
                max={50}
                step={1}
                value={[autoclick.jitter_pos_px]}
                onValueChange={(v) => setAutoclick({ ...autoclick, jitter_pos_px: v[0] ?? 0 })}
              />
            </Field>
          )}
        </div>
      </Section>

      {/* Start / Stop */}
      <div className="flex items-center gap-3">
        {running ? (
          <Button size="lg" variant="destructive" onClick={stop}>
            <Square className="h-4 w-4 fill-current" /> Stop (F8)
          </Button>
        ) : (
          <Button size="lg" variant="play" onClick={startAutoclick}>
            <MousePointerClick className="h-4 w-4" /> Start (F8)
          </Button>
        )}
        {running && colorClicks !== null && (
          <span className="tabular text-sm text-muted">{colorClicks} clicks</span>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-card border border-border bg-surface p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        className="tabular"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
      />
    </div>
  );
}

function Radio({ checked, onSelect, label }: { checked: boolean; onSelect: () => void; label: string }) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex items-center gap-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full border ${checked ? "border-accent" : "border-border"}`}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      {label}
    </button>
  );
}
