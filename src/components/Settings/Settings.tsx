import { useEffect, useState } from "react";
import { Settings as SettingsIcon, AlertTriangle, Check } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { browserCodeToIac } from "@/lib/keymap";
import type { HotkeyConfig, Settings as SettingsType, ThemePref } from "@/lib/types";

export function Settings() {
  const { settings, saveSettings, sessionType, permissions } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SettingsType>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const conflicts = findConflicts(draft.hotkeys);

  const save = () => {
    void saveSettings(draft);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings" title="Settings">
          <SettingsIcon className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes apply when you save.</DialogDescription>
        </DialogHeader>

        <Section title="Appearance">
          <Row label="Theme">
            <Select
              value={draft.theme}
              onValueChange={(v) => setDraft({ ...draft, theme: v as ThemePref })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </Section>

        <Section title="Hotkeys">
          {conflicts.length > 0 && (
            <div className="flex items-center gap-2 rounded-control bg-warn/10 px-2 py-1.5 text-xs text-warn">
              <AlertTriangle className="h-3.5 w-3.5" />
              {conflicts[0]}
            </div>
          )}
          <HotkeyRow
            label="Record toggle"
            value={draft.hotkeys.record_toggle}
            onChange={(record_toggle) =>
              setDraft({ ...draft, hotkeys: { ...draft.hotkeys, record_toggle } })
            }
          />
          <HotkeyRow
            label="Play / Stop"
            value={draft.hotkeys.play_stop_toggle}
            onChange={(play_stop_toggle) =>
              setDraft({ ...draft, hotkeys: { ...draft.hotkeys, play_stop_toggle } })
            }
          />
          <HotkeyRow
            label="Capture cursor"
            value={draft.hotkeys.capture_cursor}
            onChange={(capture_cursor) =>
              setDraft({ ...draft, hotkeys: { ...draft.hotkeys, capture_cursor } })
            }
          />
          <HotkeyRow
            label="Panic / abort"
            value={draft.hotkeys.panic}
            onChange={(panic) =>
              setDraft({ ...draft, hotkeys: { ...draft.hotkeys, panic } })
            }
          />
        </Section>

        <Section title="Failsafe">
          <Row label="Panic hotkey enabled">
            <Switch
              checked={draft.failsafe.panic_enabled}
              onCheckedChange={(panic_enabled) =>
                setDraft({ ...draft, failsafe: { ...draft.failsafe, panic_enabled } })
              }
            />
          </Row>
          <Row label="Corner failsafe (slam mouse into a corner to stop)">
            <Switch
              checked={draft.failsafe.corner_failsafe_enabled}
              onCheckedChange={(corner_failsafe_enabled) =>
                setDraft({
                  ...draft,
                  failsafe: { ...draft.failsafe, corner_failsafe_enabled },
                })
              }
            />
          </Row>
        </Section>

        <Section title="Playback">
          <Row label={`Default speed: ${draft.default_speed.toFixed(2)}×`}>
            <div className="w-40">
              <Slider
                min={0.25}
                max={4}
                step={0.25}
                value={[draft.default_speed]}
                onValueChange={(v) => setDraft({ ...draft, default_speed: v[0] ?? 1 })}
              />
            </div>
          </Row>
        </Section>

        <Section title="Advanced">
          <Row label="Launch on system startup">
            <Switch
              checked={draft.launch_on_startup}
              onCheckedChange={(launch_on_startup) =>
                setDraft({ ...draft, launch_on_startup })
              }
            />
          </Row>
          <Row label="Enable weekly recurrence in scheduler">
            <Switch
              checked={draft.weekly_recurrence_enabled}
              onCheckedChange={(weekly_recurrence_enabled) =>
                setDraft({ ...draft, weekly_recurrence_enabled })
              }
            />
          </Row>
        </Section>

        {sessionType === "macos" && (
          <Section title="macOS permissions">
            <PermRow label="Accessibility (playback)" ok={permissions.accessibility} />
            <PermRow label="Input Monitoring (recording)" ok={permissions.input_monitoring} />
          </Section>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HotkeyRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const [listening, setListening] = useState(false);
  return (
    <Row label={label}>
      <button
        onClick={() => setListening(true)}
        onBlur={() => setListening(false)}
        onKeyDown={(e) => {
          if (!listening) return;
          e.preventDefault();
          const code = browserCodeToIac(e.nativeEvent);
          if (code) {
            onChange(code);
            setListening(false);
          }
        }}
        className={`tabular h-9 w-40 rounded-control border px-3 text-sm ${
          listening ? "border-accent text-accent" : "border-border"
        }`}
      >
        {listening ? "Press a key…" : value}
      </button>
    </Row>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm text-text">{label}</Label>
      {children}
    </div>
  );
}

function PermRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className={ok ? "flex items-center gap-1 text-play" : "text-warn"}>
        {ok ? (
          <>
            <Check className="h-4 w-4" /> Granted
          </>
        ) : (
          "Not granted"
        )}
      </span>
    </div>
  );
}

function findConflicts(h: HotkeyConfig): string[] {
  const entries: [string, string][] = [
    ["Record toggle", h.record_toggle],
    ["Play/Stop", h.play_stop_toggle],
    ["Capture cursor", h.capture_cursor],
    ["Panic", h.panic],
  ];
  const out: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!;
      const b = entries[j]!;
      if (a[1] === b[1]) out.push(`${a[0]} and ${b[0]} are both ${a[1]}`);
    }
  }
  return out;
}
