import { useApp } from "@/store";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";

/** Run options for the sequence. Rendered inside the RunBar's "Run" popover. */
export function RunControls() {
  const { repeat, setRepeat, speed, setSpeed, jitter, setJitter } = useApp();

  return (
    <div className="space-y-4">
      <h3 className="text-overline font-semibold uppercase text-muted">
        Run controls
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repeat" hint="0 = ∞">
          <Input
            type="number"
            min={0}
            className="tabular"
            value={repeat}
            onChange={(e) => setRepeat(Math.max(0, parseInt(e.target.value) || 0))}
          />
        </Field>
        <Field label="Speed" value={`${speed.toFixed(2)}×`}>
          <Slider
            min={0.25}
            max={4}
            step={0.25}
            value={[speed]}
            onValueChange={(v) => setSpeed(v[0] ?? 1)}
          />
        </Field>
      </div>

      <div className="space-y-3 border-t border-border/60 pt-4">
        <div>
          <h4 className="text-overline font-semibold uppercase text-muted">
            Humanization
          </h4>
          <p className="mt-1 text-body text-muted">
            Natural variation, not an anti-cheat bypass.
          </p>
        </div>
        {/* Stacked (not a viewport-`sm` grid) so each slider keeps full width in
            the narrow inspector instead of cramming three across. */}
        <div className="space-y-3">
          <Field label="Position" value={`±${jitter.position_radius_px}px`}>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[jitter.position_radius_px]}
              onValueChange={(v) =>
                setJitter({ ...jitter, position_radius_px: v[0] ?? 0 })
              }
            />
          </Field>
          <Field label="Timing" value={`±${Math.round(jitter.timing_pct * 100)}%`}>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[Math.round(jitter.timing_pct * 100)]}
              onValueChange={(v) =>
                setJitter({ ...jitter, timing_pct: (v[0] ?? 0) / 100 })
              }
            />
          </Field>
          <Field label="Path" value={`±${jitter.path_deviation_px}px`}>
            <Slider
              min={0}
              max={30}
              step={1}
              value={[jitter.path_deviation_px]}
              onValueChange={(v) =>
                setJitter({ ...jitter, path_deviation_px: v[0] ?? 0 })
              }
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
