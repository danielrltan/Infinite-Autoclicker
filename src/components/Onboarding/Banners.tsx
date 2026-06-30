import { AlertTriangle } from "lucide-react";
import { useApp } from "@/store";
import { ipc } from "@/lib/ipc";
import { Button } from "@/components/ui/button";

/** macOS permission + Wayland notices (SPEC §5). Non-alarming, actionable. */
export function Banners() {
  const { sessionType, permissions } = useApp();

  if (sessionType === "wayland") {
    return (
      <Banner>
        <div className="flex-1">
          <strong>Linux Wayland detected.</strong> Wayland blocks global input
          capture and synthesis, so recording and playback won't work here. Run
          your session under X11 to use Infinite Autoclicker.
        </div>
      </Banner>
    );
  }

  if (sessionType === "macos") {
    const missing =
      !permissions.accessibility || !permissions.input_monitoring;
    if (!missing) return null;
    return (
      <Banner>
        <div className="flex-1 space-y-2">
          <div>
            <strong>Permissions needed.</strong> Input Monitoring lets the app
            record your clicks; Accessibility lets it play them back. Grant them,
            then return — this updates automatically.
          </div>
          <div className="flex gap-2">
            {!permissions.input_monitoring && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => ipc.openPermissionSettings("input_monitoring")}
              >
                Open Input Monitoring
              </Button>
            )}
            {!permissions.accessibility && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => ipc.openPermissionSettings("accessibility")}
              >
                Open Accessibility
              </Button>
            )}
          </div>
        </div>
      </Banner>
    );
  }

  return null;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}
