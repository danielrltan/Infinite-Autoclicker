import { useApp } from "@/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export function RunControls() {
  const { repeat, setRepeat, speed, setSpeed, jitter, setJitter } = useApp();

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Repeat (0 = infinite)</Label>
          <Input
            type="number"
            min={0}
            className="tabular"
            value={repeat}
            onChange={(e) => setRepeat(Math.max(0, parseInt(e.target.value) || 0))}
          />
        </div>
        <div className="space-y-1">
          <Label>Speed: {speed.toFixed(2)}×</Label>
          <Slider
            min={0.25}
            max={4}
            step={0.25}
            value={[speed]}
            onValueChange={(v) => setSpeed(v[0] ?? 1)}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-muted">
          Humanization (jitter) — natural variation, not an anti-cheat bypass
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <JitterField
            label={`Position ±${jitter.position_radius_px}px`}
            value={jitter.position_radius_px}
            max={50}
            onChange={(v) => setJitter({ ...jitter, position_radius_px: v })}
          />
          <JitterField
            label={`Timing ±${Math.round(jitter.timing_pct * 100)}%`}
            value={Math.round(jitter.timing_pct * 100)}
            max={50}
            onChange={(v) => setJitter({ ...jitter, timing_pct: v / 100 })}
          />
          <JitterField
            label={`Path ±${jitter.path_deviation_px}px`}
            value={jitter.path_deviation_px}
            max={30}
            onChange={(v) => setJitter({ ...jitter, path_deviation_px: v })}
          />
        </div>
      </div>
    </div>
  );
}

function JitterField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Slider min={0} max={max} step={1} value={[value]} onValueChange={(v) => onChange(v[0] ?? 0)} />
    </div>
  );
}
