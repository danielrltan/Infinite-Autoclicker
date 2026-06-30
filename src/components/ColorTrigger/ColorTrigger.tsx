import { useState } from "react";
import { Pipette, Crosshair, Play } from "lucide-react";
import { useApp } from "@/store";
import { ipc } from "@/lib/ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
        toast("No matching blob — widen tolerance or lower min size", "warn");
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
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-surface p-3 text-xs text-muted">
        Picks targets by <strong className="text-text">color</strong>, not a static
        image — so it tracks popups that spin, shrink, or overlap. Click the center
        of the largest matching blob on an interval.
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-card border border-border bg-surface p-3">
          <Label>Target color</Label>
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-control border border-border"
              style={{ background: rgbToHex(color) }}
              aria-label={`Target color ${rgbToHex(color)}`}
            />
            <span className="tabular text-sm">{rgbToHex(color)}</span>
            <input
              type="color"
              aria-label="Pick color"
              value={rgbToHex(color)}
              onChange={(e) => {
                const v = e.target.value;
                setColor({
                  r: parseInt(v.slice(1, 3), 16),
                  g: parseInt(v.slice(3, 5), 16),
                  b: parseInt(v.slice(5, 7), 16),
                });
              }}
              className="h-9 w-12 cursor-pointer rounded-control border border-border bg-bg"
            />
          </div>
          <Button size="sm" variant="outline" onClick={pick}>
            <Pipette className="h-4 w-4" /> Eyedropper: color under cursor
          </Button>
          <p className="text-xs text-muted">
            Hover the target on screen, then click the eyedropper.
          </p>
        </div>

        <div className="space-y-3 rounded-card border border-border bg-surface p-3">
          <div className="space-y-1">
            <Label>Color tolerance: {tolerance}</Label>
            <Slider min={0} max={200} step={1} value={[tolerance]} onValueChange={(v) => setTolerance(v[0] ?? 0)} />
          </div>
          <div className="space-y-1">
            <Label>Min blob size: {minBlob}px</Label>
            <Slider min={1} max={500} step={1} value={[minBlob]} onValueChange={(v) => setMinBlob(v[0] ?? 1)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Interval (ms)</Label>
              <Input
                type="number"
                min={10}
                className="tabular"
                value={interval}
                onChange={(e) => setIntervalMs(Math.max(10, parseInt(e.target.value) || 10))}
              />
            </div>
            <div className="space-y-1">
              <Label>Button</Label>
              <Select value={button} onValueChange={(v) => setButton(v as MouseButton)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                  <SelectItem value="middle">Middle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center justify-between">
            <Label>Move cursor to target before clicking</Label>
            <Switch checked={moveBefore} onCheckedChange={setMoveBefore} />
          </label>
        </div>
      </div>

      <div className="space-y-2 rounded-card border border-border bg-surface p-3">
        <label className="flex items-center justify-between">
          <Label>Limit to a screen region</Label>
          <Switch checked={useRegion} onCheckedChange={setUseRegion} />
        </label>
        {useRegion && (
          <div className="grid grid-cols-4 gap-2">
            {(["x", "y", "w", "h"] as const).map((k) => (
              <div key={k} className="space-y-1">
                <Label>{k.toUpperCase()}</Label>
                <Input
                  type="number"
                  className="tabular"
                  value={region[k]}
                  onChange={(e) =>
                    setRegion({ ...region, [k]: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={test}>
          <Crosshair className="h-4 w-4" /> Test detection
        </Button>
        {running ? (
          <Button variant="destructive" onClick={stopColorTrigger}>
            Stop ({colorClicks} clicks)
          </Button>
        ) : (
          <Button variant="play" onClick={start}>
            <Play className="h-4 w-4" /> Start color trigger
          </Button>
        )}
        {lastFound && <span className="tabular text-xs text-muted">{lastFound}</span>}
      </div>
    </div>
  );
}
