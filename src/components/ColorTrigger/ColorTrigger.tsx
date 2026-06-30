import { useState } from "react";
import { Pipette, Crosshair, Play } from "lucide-react";
import { useApp } from "@/store";
import { ipc } from "@/lib/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, Section } from "@/components/ui/card";
import { Field, FieldRow } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rgbToHex } from "@/lib/utils";
import type { MouseButton, Rect, Rgb } from "@/lib/types";

/**
 * Color Trigger (owner request). Detects a target color anywhere in a region and
 * clicks the largest matching blob's centroid — stays locked on rotating /
 * shrinking / overlapping targets that defeat template matching.
 */
export function ColorTrigger() {
  const { status, colorClicks, startColorTrigger, stopColorTrigger, toast } = useApp();

  const [color, setColor] = useState<Rgb>({ r: 255, g: 220, b: 0 });
  const [tolerance, setTolerance] = useState(60);
  const [minBlob, setMinBlob] = useState(40);
  const [interval, setIntervalMs] = useState(120);
  const [button, setButton] = useState<MouseButton>("left");
  const [moveBefore, setMoveBefore] = useState(true);
  const [useRegion, setUseRegion] = useState(false);
  const [region, setRegion] = useState<Rect>({ x: 0, y: 0, w: 800, h: 600 });
  const [lastFound, setLastFound] = useState<string | null>(null);

  const running = status === "playing" && colorClicks !== null;

  const cfg = () => ({
    target: color,
    tolerance,
    region: useRegion ? region : null,
    min_blob_px: minBlob,
  });

  const pick = async () => {
    try {
      const rgb = await ipc.captureCursorColor();
      if (rgb) {
        setColor(rgb);
        toast(`Picked ${rgbToHex(rgb)}`, "success");
      } else {
        toast("Could not read the pixel under the cursor", "warn");
      }
    } catch (e) {
      toast(`${e}`, "error");
    }
  };

  const test = async () => {
    try {
      const blob = await ipc.findColorOnce(cfg());
      if (blob) {
        setLastFound(`Found at ${blob.x}, ${blob.y} (${blob.area}px)`);
        toast(`Target found at ${blob.x}, ${blob.y}`, "success");
      } else {
        setLastFound("No matching blob found");
        toast("No match — widen tolerance or lower min size", "warn");
      }
    } catch (e) {
      toast(`${e}`, "error");
    }
  };

  const start = () =>
    startColorTrigger({
      match: cfg(),
      interval_ms: interval,
      button,
      move_before_click: moveBefore,
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <Section title="Match">
          <Field label="Target color">
            <div className="flex items-center gap-2">
              <label
                className="relative h-9 w-9 shrink-0 cursor-pointer rounded-control border border-border"
                style={{ background: rgbToHex(color) }}
                title="Choose a color"
              >
                <input
                  type="color"
                  aria-label="Choose target color"
                  value={rgbToHex(color)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setColor({
                      r: parseInt(v.slice(1, 3), 16),
                      g: parseInt(v.slice(3, 5), 16),
                      b: parseInt(v.slice(5, 7), 16),
                    });
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <span className="tabular flex-1 text-ui text-text">{rgbToHex(color)}</span>
              <Tooltip label="Pick color under the cursor">
                <Button size="icon" variant="outline" aria-label="Pick color under the cursor" onClick={pick}>
                  <Pipette className="h-4 w-4" />
                </Button>
              </Tooltip>
            </div>
          </Field>
          <Field label="Color tolerance" value={tolerance}>
            <Slider min={0} max={200} step={1} value={[tolerance]} onValueChange={(v) => setTolerance(v[0] ?? 0)} />
          </Field>
          <Field label="Min blob size" value={`${minBlob}px`}>
            <Slider min={1} max={500} step={1} value={[minBlob]} onValueChange={(v) => setMinBlob(v[0] ?? 1)} />
          </Field>
        </Section>

        <Section title="Click">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Interval (ms)">
              <Input
                type="number"
                min={10}
                className="tabular"
                value={interval}
                onChange={(e) => setIntervalMs(Math.max(10, parseInt(e.target.value) || 10))}
              />
            </Field>
            <Field label="Button">
              <Select value={button} onValueChange={(v) => setButton(v as MouseButton)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                  <SelectItem value="middle">Middle</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <FieldRow label="Move cursor before clicking">
            <Switch checked={moveBefore} onCheckedChange={setMoveBefore} />
          </FieldRow>
        </Section>
      </div>

      <Section
        title="Screen region"
        action={<Switch checked={useRegion} onCheckedChange={setUseRegion} />}
      >
        {useRegion && (
          <div className="grid grid-cols-4 gap-3">
            {(["x", "y", "w", "h"] as const).map((k) => (
              <Field key={k} label={k.toUpperCase()}>
                <Input
                  type="number"
                  className="tabular"
                  value={region[k]}
                  onChange={(e) => setRegion({ ...region, [k]: parseInt(e.target.value) || 0 })}
                />
              </Field>
            ))}
          </div>
        )}
      </Section>

      <Card className="flex items-center gap-2 p-3">
        <Button variant="outline" onClick={test}>
          <Crosshair className="h-4 w-4" /> Test detection
        </Button>
        {lastFound && <span className="tabular text-body text-muted">{lastFound}</span>}
        <div className="flex-1" />
        {running ? (
          <Button variant="destructive" onClick={stopColorTrigger}>
            Stop · {colorClicks} clicks
          </Button>
        ) : (
          <Button variant="play" onClick={start}>
            <Play className="h-4 w-4" /> Start color trigger
          </Button>
        )}
      </Card>
    </div>
  );
}
