import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc, subscribe } from "@/lib/ipc";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  compileSteps,
  newStep,
  type Step,
  type StepAction,
} from "@/lib/compile";
import type {
  AppState,
  AutoClickOpts,
  CaptureMode,
  ColorTriggerOpts,
  JitterConfig,
  Macro,
  MacroEvent,
  MacroMeta,
  PermissionStatus,
  PlayIntent,
  Schedule,
  ScheduleInfo,
  SessionType,
  Settings,
} from "@/lib/types";

export type Tab = "autoclick" | "steps" | "color" | "schedule";
export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}
export interface Toast {
  id: number;
  msg: string;
  kind: "info" | "success" | "error" | "warn";
  action?: ToastAction;
  durationMs?: number;
}
export interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
}
export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

interface AppContextValue {
  // status / settings
  status: AppState;
  settings: Settings;
  sessionType: SessionType;
  permissions: PermissionStatus;
  // editor
  tab: Tab;
  setTab: (t: Tab) => void;
  macroName: string;
  setMacroName: (s: string) => void;
  steps: Step[];
  events: MacroEvent[]; // derived current timeline (compiled from steps)
  selectedStepId: string | null;
  setSelectedStepId: (id: string | null) => void;
  // run opts
  repeat: number;
  setRepeat: (n: number) => void;
  speed: number;
  setSpeed: (n: number) => void;
  jitter: JitterConfig;
  setJitter: (j: JitterConfig) => void;
  // auto clicker
  autoclick: AutoClickOpts;
  setAutoclick: (o: AutoClickOpts) => void;
  startAutoclick: () => Promise<void>;
  // record opts
  recordMode: CaptureMode;
  setRecordMode: (m: CaptureMode) => void;
  captureKeyboard: boolean;
  setCaptureKeyboard: (b: boolean) => void;
  // live
  recording: { active: boolean; count: number; elapsedMs: number };
  progress: { loop: number; event: number; totalEvents: number; totalLoops: number | null } | null;
  colorClicks: number | null;
  // editor dirty state
  dirty: boolean;
  // library / schedules
  library: MacroMeta[];
  recent: MacroMeta[];
  schedules: ScheduleInfo[];
  toasts: Toast[];
  // step actions
  addStep: (action?: StepAction) => void;
  updateStep: (id: string, patch: Partial<Step>) => void;
  deleteStep: (id: string) => void;
  duplicateStep: (id: string) => void;
  moveStep: (id: string, dir: -1 | 1) => void;
  recordIntoStep: (stepId: string) => Promise<void>;
  // capture
  captureCursorInto: (field: "click" | "dragFrom" | "dragTo") => Promise<void>;
  // playback / record
  play: () => Promise<void>;
  stop: () => Promise<void>;
  stopEverything: () => Promise<void>;
  toggleRecord: () => Promise<void>;
  // files
  newMacro: () => Promise<void>;
  saveCurrent: () => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  loadFromLibrary: (m: MacroMeta) => Promise<void>;
  deleteFromLibrary: (m: MacroMeta) => Promise<void>;
  refreshLibrary: () => Promise<void>;
  // schedules
  armSchedule: (s: Schedule) => Promise<void>;
  cancelSchedule: (id: string) => Promise<void>;
  // color trigger
  startColorTrigger: (opts: ColorTriggerOpts) => Promise<void>;
  stopColorTrigger: () => Promise<void>;
  // settings
  saveSettings: (s: Settings) => Promise<void>;
  // misc
  toast: (msg: string, kind?: Toast["kind"], opts?: ToastOptions) => void;
  dismissToast: (id: number) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<AppContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppState>("idle");
  const [settings, setSettingsState] = useState<Settings>(defaultSettings());
  const [sessionType, setSessionType] = useState<SessionType>("unknown");
  const [permissions, setPermissions] = useState<PermissionStatus>({
    accessibility: true,
    input_monitoring: true,
  });

  const [tab, setTab] = useState<Tab>("autoclick");
  const [macroName, setMacroName] = useState("Untitled macro");
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const [repeat, setRepeat] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [jitter, setJitter] = useState<JitterConfig>({
    position_radius_px: 0,
    timing_pct: 0,
    path_deviation_px: 0,
  });

  const [autoclick, setAutoclickState] = useState<AutoClickOpts>(loadAutoclick);
  const setAutoclick = useCallback((o: AutoClickOpts) => {
    setAutoclickState(o);
    try {
      localStorage.setItem("iac.autoclick", JSON.stringify(o));
    } catch {
      /* localStorage unavailable: keep in-memory only */
    }
  }, []);

  const [recordMode, setRecordMode] = useState<CaptureMode>("full_motion");
  const [captureKeyboard, setCaptureKeyboard] = useState(true);

  const [recording, setRecording] = useState({ active: false, count: 0, elapsedMs: 0 });
  const [progress, setProgress] = useState<AppContextValue["progress"]>(null);
  const [colorClicks, setColorClicks] = useState<number | null>(null);

  const [library, setLibrary] = useState<MacroMeta[]>([]);
  const [recent, setRecent] = useState<MacroMeta[]>([]);
  const [schedules, setSchedules] = useState<ScheduleInfo[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [, setCurrentPath] = useState<string | null>(null);

  // Dirty tracking (ref mirror so the window-close listener reads the latest).
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setDirtyState(v);
  }, []);
  const savedName = useRef<string | null>(null);
  const lastTrash = useRef<{ token: string; name: string; at: number } | null>(null);

  const recStart = useRef(0);
  const toastId = useRef(0);
  // When set, the next recording is captured into this step (inline record).
  const recordingStepRef = useRef<string | null>(null);

  // Imperative confirm dialog (one host rendered in the provider).
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description?: ReactNode;
    confirmLabel: string;
    destructive: boolean;
    resolve?: (ok: boolean) => void;
  }>({ open: false, title: "", confirmLabel: "Confirm", destructive: false });

  const events = useMemo(() => compileSteps(steps), [steps]);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // Component-owned dismissal (Toasts.tsx) so the undo window can pause on hover.
  const toast = useCallback(
    (msg: string, kind: Toast["kind"] = "info", opts?: ToastOptions) => {
      const id = ++toastId.current;
      setToasts((t) => [
        ...t,
        { id, msg, kind, action: opts?.action, durationMs: opts?.durationMs },
      ]);
    },
    [],
  );

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        open: true,
        title: opts.title,
        description: opts.description,
        confirmLabel: opts.confirmLabel ?? "Confirm",
        destructive: opts.destructive ?? false,
        resolve,
      });
    });
  }, []);

  const resolveConfirm = useCallback((ok: boolean) => {
    setConfirmState((s) => {
      s.resolve?.(ok);
      return { ...s, open: false, resolve: undefined };
    });
  }, []);

  const confirmDiscardIfDirty = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description: "Your current macro has changes that haven't been saved.",
      confirmLabel: "Discard",
      destructive: true,
    });
  }, [confirm]);

  // ── Theme controller (system/light/dark) ─────────────────────────
  useEffect(() => {
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  // ── Recording elapsed timer ──────────────────────────────────────
  useEffect(() => {
    if (!recording.active) return;
    const h = setInterval(
      () => setRecording((r) => ({ ...r, elapsedMs: Date.now() - recStart.current })),
      100,
    );
    return () => clearInterval(h);
  }, [recording.active]);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await ipc.listMacros());
      setRecent(await ipc.listRecent());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const refreshSchedules = useCallback(async () => {
    try {
      setSchedules(await ipc.listSchedules());
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ── Initial load + event subscription ────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        setSettingsState(await ipc.getSettings());
        setSessionType(await ipc.getSessionType());
        setPermissions(await ipc.getPermissionStatus());
      } catch (e) {
        console.error(e);
      }
      await refreshLibrary();
      await refreshSchedules();

      unsub = await subscribe({
        onStatusChanged: (p) => {
          setStatus(p.state);
          // Recording can be started from Rust (record hotkey while minimized),
          // so the recording UI state follows backend status, not the button.
          if (p.state === "recording") {
            setRecording((r) => {
              if (r.active) return r;
              recStart.current = Date.now();
              return { active: true, count: 0, elapsedMs: 0 };
            });
          } else {
            setRecording((r) =>
              r.active ? { active: false, count: 0, elapsedMs: 0 } : r,
            );
          }
        },
        onRecordingEventAdded: (p) =>
          setRecording((r) => ({ ...r, count: p.count })),
        onRecordingStopped: (p) => {
          // A recording is just a captured chunk in the sequence: fill the step
          // we were recording into, or append a new "Recorded action" step
          // (e.g. when started via the hotkey with no step pre-created).
          const stepId = recordingStepRef.current;
          recordingStepRef.current = null;
          if (stepId) {
            setSteps((prev) =>
              prev.map((s) =>
                s.id === stepId
                  ? ({ ...s, action: "record", events: p.macro.events } as Step)
                  : s,
              ),
            );
          } else {
            const s: Step = { ...newStep("record"), events: p.macro.events };
            setSteps((prev) => [...prev, s]);
            setSelectedStepId(s.id);
            setTab("steps");
          }
          setDirty(true); // a fresh recording is unsaved
        },
        onPlaybackProgress: (p) =>
          setProgress({
            loop: p.loop_index,
            event: p.event_index,
            totalEvents: p.total_events,
            totalLoops: p.total_loops,
          }),
        onPlaybackFinished: (p) => {
          setProgress(null);
          setColorClicks(null);
          if (p.reason === "panic") toast("Stopped by panic / failsafe", "warn");
          else if (p.reason === "error") toast("Playback error", "error");
        },
        onHotkeyTriggered: (p) => handleHotkeyRef.current?.(p.action),
        onError: (p) => toast(p.message, "error"),
      });
    })();
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check macOS permissions when the window regains focus (SPEC §5).
  useEffect(() => {
    const onFocus = () => ipc.getPermissionStatus().then(setPermissions).catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ── Dirty-aware run-opt / name setters ───────────────────────────
  const setMacroNameDirty = useCallback(
    (s: string) => {
      setMacroName(s);
      setDirty(true);
    },
    [setDirty],
  );
  const setRepeatDirty = useCallback(
    (n: number) => {
      setRepeat(n);
      setDirty(true);
    },
    [setDirty],
  );
  const setSpeedDirty = useCallback(
    (n: number) => {
      setSpeed(n);
      setDirty(true);
    },
    [setDirty],
  );
  const setJitterDirty = useCallback(
    (j: JitterConfig) => {
      setJitter(j);
      setDirty(true);
    },
    [setDirty],
  );

  // ── Step actions ─────────────────────────────────────────────────
  const addStep = useCallback(
    (action: StepAction = "click") => {
      const s = newStep(action);
      setSteps((prev) => [...prev, s]);
      setSelectedStepId(s.id);
      setDirty(true);
    },
    [setDirty],
  );
  const updateStep = useCallback(
    (id: string, patch: Partial<Step>) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)),
      );
      setDirty(true);
    },
    [setDirty],
  );
  const deleteStep = useCallback(
    (id: string) => {
      setSteps((prev) => prev.filter((s) => s.id !== id));
      setDirty(true);
    },
    [setDirty],
  );
  const duplicateStep = useCallback(
    (id: string) => {
      setSteps((prev) => {
        const i = prev.findIndex((s) => s.id === id);
        const orig = prev[i];
        if (i < 0 || !orig) return prev;
        const copy = { ...orig, id: `${orig.action}-${Date.now()}` } as Step;
        const next = [...prev];
        next.splice(i + 1, 0, copy);
        return next;
      });
      setDirty(true);
    },
    [setDirty],
  );
  const moveStep = useCallback(
    (id: string, dir: -1 | 1) => {
      setSteps((prev) => {
        const i = prev.findIndex((s) => s.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const a = prev[i];
        const b = prev[j];
        if (!a || !b) return prev;
        const next = [...prev];
        next[i] = b;
        next[j] = a;
        return next;
      });
      setDirty(true);
    },
    [setDirty],
  );

  // Record a live snippet directly into a step (toggle: start, then stop).
  const recordIntoStep = useCallback(
    async (stepId: string) => {
      if (recording.active) {
        await ipc.stopRecording();
        return;
      }
      recordingStepRef.current = stepId;
      await ipc.startRecording({
        capture_mode: recordMode,
        motion_sample_ms: 15,
        capture_keyboard: captureKeyboard,
      });
    },
    [recording.active, recordMode, captureKeyboard],
  );

  const captureCursorInto = useCallback(
    async (field: "click" | "dragFrom" | "dragTo") => {
      const pos = await ipc.captureCursor();
      if (!selectedStepId) {
        toast(`Captured ${pos.x}, ${pos.y} — select a step first`, "info");
        return;
      }
      if (field === "click") updateStep(selectedStepId, { x: pos.x, y: pos.y } as Partial<Step>);
      else if (field === "dragFrom")
        updateStep(selectedStepId, { fromX: pos.x, fromY: pos.y } as Partial<Step>);
      else updateStep(selectedStepId, { toX: pos.x, toY: pos.y } as Partial<Step>);
      toast(`Captured ${pos.x}, ${pos.y}`, "success");
    },
    [selectedStepId, updateStep, toast],
  );

  // ── Build current macro ──────────────────────────────────────────
  const buildMacro = useCallback(
    (compileEvents: MacroEvent[]): Macro => ({
      version: 1,
      name: macroName,
      created: new Date().toISOString(),
      // A recorded chunk lives inside a step; the saved sequence is "built".
      source: "built",
      settings: { repeat, speed },
      monitors: [],
      events: compileEvents,
    }),
    [macroName, repeat, speed],
  );

  const startAutoclick = useCallback(async () => {
    setColorClicks(0);
    await ipc.startAutoclick(autoclick);
  }, [autoclick]);

  const play = useCallback(async () => {
    // On the Auto Clicker tab, the play/stop hotkey starts the clicker.
    if (tab === "autoclick") {
      await startAutoclick();
      return;
    }
    const home = await ipc.captureCursor().catch(() => ({ x: 0, y: 0 }));
    const evs = compileSteps(steps, { home, rollJitter: true });
    if (evs.length === 0) {
      toast("Nothing to play — add a step or record first", "warn");
      return;
    }
    await ipc.playMacro(buildMacro(evs), { repeat, speed, jitter });
  }, [tab, startAutoclick, steps, repeat, speed, jitter, buildMacro, toast]);

  const stop = useCallback(async () => {
    await ipc.stopPlayback();
    await ipc.stopColorTrigger().catch(() => {});
  }, []);

  // Halt anything active — playback, color trigger, auto clicker, OR recording.
  // Both commands are no-ops when their thing isn't running, so this is always
  // safe and can be the single always-available Stop.
  const stopEverything = useCallback(async () => {
    await ipc.stopPlayback().catch(() => {});
    await ipc.stopRecording().catch(() => {});
  }, []);

  // Record appends a "Recorded action" step and captures into it — recording is
  // just a fast way to author a chunk of the sequence. UI state follows backend
  // status:changed (see subscribe).
  const toggleRecord = useCallback(async () => {
    if (recording.active) {
      await ipc.stopRecording();
      return;
    }
    const s = newStep("record");
    setSteps((prev) => [...prev, s]);
    setSelectedStepId(s.id);
    setTab("steps");
    recordingStepRef.current = s.id;
    await ipc.startRecording({
      capture_mode: recordMode,
      motion_sample_ms: 15,
      capture_keyboard: captureKeyboard,
    });
  }, [recording.active, recordMode, captureKeyboard]);

  // ── Hotkey routing ───────────────────────────────────────────────
  // Record, Play/Stop and Panic are handled in Rust (so they work even when the
  // window is minimized). Only Capture needs the focused editor.
  const handleHotkeyRef = useRef<(a: string) => void>();
  handleHotkeyRef.current = (action: string) => {
    if (action === "capture") void captureCursorInto("click");
  };

  // Keep the backend's record options + play intent fresh so the record/play
  // hotkeys act correctly even while the webview is suspended (minimized).
  useEffect(() => {
    ipc
      .setRecordOpts({
        capture_mode: recordMode,
        motion_sample_ms: 15,
        capture_keyboard: captureKeyboard,
      })
      .catch(() => {});
  }, [recordMode, captureKeyboard]);

  useEffect(() => {
    const intent: PlayIntent =
      tab === "autoclick"
        ? { kind: "autoclick", opts: autoclick }
        : tab === "steps"
          ? {
              kind: "macro",
              mac: buildMacro(compileSteps(steps)),
              opts: { repeat, speed, jitter },
            }
          : { kind: "none" };
    ipc.setPlayIntent(intent).catch(() => {});
  }, [tab, autoclick, steps, repeat, speed, jitter, buildMacro]);

  // ── Files ────────────────────────────────────────────────────────
  const newMacro = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
    setSteps([]);
    setMacroName("Untitled macro");
    setCurrentPath(null);
    savedName.current = null;
    setDirty(false);
    setTab("steps");
  }, [confirmDiscardIfDirty, setDirty]);

  // Save by name; the path is built in Rust (no fragile string concat). On a
  // name collision the prior version goes to Trash (restorable) after confirm.
  const persist = useCallback(
    async (name: string): Promise<boolean> => {
      const evs = compileSteps(steps);
      if (evs.length === 0) {
        toast("Nothing to save — add a step or record first", "warn");
        return false;
      }
      const macro: Macro = { ...buildMacro(evs), name };
      const ownsName = savedName.current === name; // re-saving the same macro: no prompt
      try {
        const path = await ipc.saveMacroByName(name, macro, ownsName);
        setCurrentPath(path);
        savedName.current = name;
        setMacroName(name);
        setDirty(false);
        toast(`Saved ${name}`, "success");
        await refreshLibrary();
        return true;
      } catch (e) {
        if (!errMessage(e).startsWith("EXISTS:")) {
          toast(`Save failed: ${errMessage(e)}`, "error");
          return false;
        }
        const ok = await confirm({
          title: `Replace ${name}?`,
          description:
            "A macro with this name already exists. The current version moves to Trash and can be restored.",
          confirmLabel: "Replace",
          destructive: true,
        });
        if (!ok) return false;
        try {
          const path = await ipc.saveMacroByName(name, macro, true);
          setCurrentPath(path);
          savedName.current = name;
          setMacroName(name);
          setDirty(false);
          toast(`Replaced ${name}`, "success");
          await refreshLibrary();
          return true;
        } catch (e2) {
          toast(`Save failed: ${errMessage(e2)}`, "error");
          return false;
        }
      }
    },
    [steps, buildMacro, confirm, refreshLibrary, toast, setDirty],
  );

  const saveCurrent = useCallback(async () => {
    await persist((macroName || "").trim() || "Untitled macro");
  }, [macroName, persist]);

  const saveAs = useCallback(
    async (name: string) => {
      const clean = name.trim();
      if (!clean) {
        toast("Enter a name first", "warn");
        return;
      }
      savedName.current = null; // force the collision check for the new name
      await persist(clean);
    },
    [persist, toast],
  );

  const loadFromLibrary = useCallback(
    async (m: MacroMeta) => {
      if (!(await confirmDiscardIfDirty())) return;
      try {
        const macro = await ipc.loadMacro(m.path);
        setMacroName(macro.name);
        setRepeat(macro.settings.repeat);
        setSpeed(macro.settings.speed);
        setCurrentPath(m.path);
        savedName.current = macro.name; // re-saving won't prompt
        // A saved macro is a compiled timeline; load it as one recorded chunk
        // in the sequence (playable + editable as a whole).
        const s: Step = { ...newStep("record"), events: macro.events };
        setSteps([s]);
        setSelectedStepId(s.id);
        setTab("steps");
        setDirty(false);
        toast(`Loaded ${macro.name}`, "success");
      } catch (e) {
        toast(`Load failed: ${errMessage(e)}`, "error");
      }
    },
    [confirmDiscardIfDirty, toast, setDirty],
  );

  const restoreFromTrash = useCallback(
    async (token: string, name: string) => {
      try {
        const path = await ipc.restoreMacro(token);
        await refreshLibrary();
        const landed = path.replace(/^.*[\\/]/, "").replace(/\.json$/, "");
        if (landed && landed !== name) {
          toast(`Restored as ${landed} (original name was taken)`, "success");
        } else {
          toast(`Restored ${name}`, "success");
        }
      } catch (e) {
        toast(`Restore failed: ${errMessage(e)}`, "error");
      }
    },
    [refreshLibrary, toast],
  );

  const deleteFromLibrary = useCallback(
    async (m: MacroMeta) => {
      const ok = await confirm({
        title: `Delete ${m.name}?`,
        description: "It moves to Trash and can be restored.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      try {
        const entry = await ipc.deleteMacro(m.path);
        lastTrash.current = { token: entry.token, name: m.name, at: Date.now() };
        await refreshLibrary();
        toast(`Deleted ${m.name}`, "success", {
          durationMs: 8000,
          action: {
            label: "Undo",
            onClick: () => restoreFromTrash(entry.token, m.name),
          },
        });
      } catch (e) {
        toast(`Delete failed: ${errMessage(e)}`, "error");
      }
    },
    [confirm, refreshLibrary, toast, restoreFromTrash],
  );

  // ── Schedules ────────────────────────────────────────────────────
  const armSchedule = useCallback(
    async (s: Schedule) => {
      try {
        const evs = compileSteps(steps);
        if (evs.length === 0) {
          toast("Nothing to schedule", "warn");
          return;
        }
        await ipc.scheduleMacro(buildMacro(evs), s);
        toast("Scheduled — app must stay open", "success");
        await refreshSchedules();
      } catch (e) {
        toast(`${e}`, "error");
      }
    },
    [steps, buildMacro, refreshSchedules, toast],
  );

  const cancelSchedule = useCallback(
    async (id: string) => {
      await ipc.cancelSchedule(id);
      await refreshSchedules();
    },
    [refreshSchedules],
  );

  // Poll schedules for live countdown while any are armed.
  useEffect(() => {
    if (schedules.length === 0) return;
    const h = setInterval(refreshSchedules, 1000);
    return () => clearInterval(h);
  }, [schedules.length, refreshSchedules]);

  // ── Color trigger ────────────────────────────────────────────────
  const startColorTrigger = useCallback(
    async (opts: ColorTriggerOpts) => {
      setColorClicks(0);
      await ipc.startColorTrigger(opts);
    },
    [],
  );
  const stopColorTrigger = useCallback(async () => {
    await ipc.stopColorTrigger();
  }, []);

  // Track color clicks via progress events while color trigger runs.
  useEffect(() => {
    if (progress && progress.totalEvents === 0) setColorClicks(progress.loop);
  }, [progress]);

  // Ctrl/Cmd+Z restores the most recent soft-delete within its grace window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const lt = lastTrash.current;
      if (lt && Date.now() - lt.at < 8000) {
        e.preventDefault();
        lastTrash.current = null;
        void restoreFromTrash(lt.token, lt.name);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restoreFromTrash]);

  // Guard the window's close button against losing unsaved changes.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (e) => {
          if (!dirtyRef.current) return;
          e.preventDefault();
          const discard = await confirm({
            title: "Discard unsaved changes?",
            description: "Your macro has changes that haven't been saved. Save first to keep them.",
            confirmLabel: "Discard and close",
            destructive: true,
          });
          if (discard) await win.destroy();
        });
      } catch {
        // Non-Tauri / unavailable window API: skip the guard.
      }
    })();
    return () => unlisten?.();
  }, [confirm]);

  // ── Settings ─────────────────────────────────────────────────────
  const saveSettings = useCallback(
    async (s: Settings) => {
      setSettingsState(s);
      await ipc.setSettings(s);
      toast("Settings saved", "success");
    },
    [toast],
  );

  const value: AppContextValue = {
    status,
    settings,
    sessionType,
    permissions,
    tab,
    setTab,
    macroName,
    setMacroName: setMacroNameDirty,
    steps,
    events,
    selectedStepId,
    setSelectedStepId,
    repeat,
    setRepeat: setRepeatDirty,
    speed,
    setSpeed: setSpeedDirty,
    jitter,
    setJitter: setJitterDirty,
    autoclick,
    setAutoclick,
    startAutoclick,
    recordMode,
    setRecordMode,
    captureKeyboard,
    setCaptureKeyboard,
    recording,
    progress,
    colorClicks,
    dirty,
    library,
    recent,
    schedules,
    toasts,
    addStep,
    updateStep,
    deleteStep,
    duplicateStep,
    moveStep,
    recordIntoStep,
    captureCursorInto,
    play,
    stop,
    stopEverything,
    toggleRecord,
    newMacro,
    saveCurrent,
    saveAs,
    loadFromLibrary,
    deleteFromLibrary,
    refreshLibrary,
    armSchedule,
    cancelSchedule,
    startColorTrigger,
    stopColorTrigger,
    saveSettings,
    toast,
    dismissToast,
    confirm,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.confirmLabel}
        destructive={confirmState.destructive}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />
    </Ctx.Provider>
  );
}

function defaultAutoclick(): AutoClickOpts {
  return {
    interval_ms: 100,
    button: "left",
    clicks_per_event: 1,
    repeat: 0,
    use_fixed_pos: false,
    x: 0,
    y: 0,
    jitter_time_pct: 0,
    jitter_pos_px: 0,
    key_code: null,
  };
}

// Auto-clicker settings persist between launches (OP Auto Clicker behavior).
function loadAutoclick(): AutoClickOpts {
  try {
    const raw = localStorage.getItem("iac.autoclick");
    if (raw) return { ...defaultAutoclick(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultAutoclick();
}

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

function defaultSettings(): Settings {
  return {
    theme: "system",
    hotkeys: {
      record_toggle: "F5",
      play_stop_toggle: "F6",
      capture_cursor: "F7",
      panic: "F12",
    },
    failsafe: {
      panic_enabled: true,
      corner_failsafe_enabled: true,
      corner_threshold_px: 5,
    },
    default_speed: 1.0,
    launch_on_startup: false,
    weekly_recurrence_enabled: false,
  };
}
