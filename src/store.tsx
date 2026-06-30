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
  newClickStep,
  newDragStep,
  type Step,
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
  Schedule,
  ScheduleInfo,
  SessionType,
  Settings,
  Source,
} from "@/lib/types";

export type Tab = "autoclick" | "steps" | "recorded" | "color" | "schedule";
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
  source: Source;
  steps: Step[];
  recordedEvents: MacroEvent[];
  deleteRecordedEvent: (index: number) => void;
  events: MacroEvent[]; // derived current timeline
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
  addClickStep: () => void;
  addDragStep: () => void;
  updateStep: (id: string, patch: Partial<Step>) => void;
  deleteStep: (id: string) => void;
  duplicateStep: (id: string) => void;
  moveStep: (id: string, dir: -1 | 1) => void;
  // capture
  captureCursorInto: (field: "click" | "dragFrom" | "dragTo") => Promise<void>;
  // playback / record
  play: () => Promise<void>;
  stop: () => Promise<void>;
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
  const [source, setSource] = useState<Source>("built");
  const [steps, setSteps] = useState<Step[]>([]);
  const [recordedEvents, setRecordedEvents] = useState<MacroEvent[]>([]);
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

  // Imperative confirm dialog (one host rendered in the provider).
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description?: ReactNode;
    confirmLabel: string;
    destructive: boolean;
    resolve?: (ok: boolean) => void;
  }>({ open: false, title: "", confirmLabel: "Confirm", destructive: false });

  const events = useMemo(
    () => (source === "recorded" ? recordedEvents : compileSteps(steps)),
    [source, recordedEvents, steps],
  );

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
        onStatusChanged: (p) => setStatus(p.state),
        onRecordingEventAdded: (p) =>
          setRecording((r) => ({ ...r, count: p.count })),
        onRecordingStopped: (p) => {
          setRecordedEvents(p.macro.events);
          setSource("recorded");
          setTab("recorded");
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
  const addClickStep = useCallback(() => {
    const s = newClickStep();
    setSteps((prev) => [...prev, s]);
    setSelectedStepId(s.id);
    setSource("built");
    setDirty(true);
  }, [setDirty]);
  const addDragStep = useCallback(() => {
    const s = newDragStep();
    setSteps((prev) => [...prev, s]);
    setSelectedStepId(s.id);
    setSource("built");
    setDirty(true);
  }, [setDirty]);
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
        const copy = { ...orig, id: `${orig.kind}-${Date.now()}` } as Step;
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

  const deleteRecordedEvent = useCallback(
    (index: number) => {
      setRecordedEvents((prev) => prev.filter((_, i) => i !== index));
      setDirty(true);
    },
    [setDirty],
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
      source,
      settings: { repeat, speed },
      monitors: [],
      events: compileEvents,
    }),
    [macroName, source, repeat, speed],
  );

  const startAutoclick = useCallback(async () => {
    setColorClicks(0);
    await ipc.startAutoclick(autoclick);
  }, [autoclick]);

  const play = useCallback(async () => {
    // On the Auto Clicker tab, Play/F8 starts the clicker.
    if (tab === "autoclick") {
      await startAutoclick();
      return;
    }
    let evs: MacroEvent[];
    if (source === "recorded") {
      evs = recordedEvents;
    } else {
      const home = await ipc.captureCursor().catch(() => ({ x: 0, y: 0 }));
      evs = compileSteps(steps, { home, rollJitter: true });
    }
    if (evs.length === 0) {
      toast("Nothing to play — add a step or record first", "warn");
      return;
    }
    await ipc.playMacro(buildMacro(evs), { repeat, speed, jitter });
  }, [tab, startAutoclick, source, recordedEvents, steps, repeat, speed, jitter, buildMacro, toast]);

  const stop = useCallback(async () => {
    await ipc.stopPlayback();
    await ipc.stopColorTrigger().catch(() => {});
  }, []);

  const toggleRecord = useCallback(async () => {
    if (recording.active) {
      await ipc.stopRecording();
      setRecording({ active: false, count: 0, elapsedMs: 0 });
    } else {
      await ipc.startRecording({
        capture_mode: recordMode,
        motion_sample_ms: 15,
        capture_keyboard: captureKeyboard,
      });
      recStart.current = Date.now();
      setRecording({ active: true, count: 0, elapsedMs: 0 });
    }
  }, [recording.active, recordMode, captureKeyboard]);

  // ── Hotkey routing (works unfocused) ─────────────────────────────
  const handleHotkeyRef = useRef<(a: string) => void>();
  handleHotkeyRef.current = (action: string) => {
    if (action === "record") void toggleRecord();
    else if (action === "play_stop") {
      if (status === "playing") void stop();
      else void play();
    } else if (action === "capture") void captureCursorInto("click");
    // panic is handled in Rust; UI just reflects via playback:finished
  };

  // ── Files ────────────────────────────────────────────────────────
  const newMacro = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
    setSteps([]);
    setRecordedEvents([]);
    setSource("built");
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
      const evs = source === "recorded" ? recordedEvents : compileSteps(steps);
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
    [source, recordedEvents, steps, buildMacro, confirm, refreshLibrary, toast, setDirty],
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
        setSource("recorded");
        setRepeat(macro.settings.repeat);
        setSpeed(macro.settings.speed);
        setCurrentPath(m.path);
        savedName.current = macro.name; // re-saving won't prompt
        // Built and recorded macros both arrive as a compiled timeline.
        setRecordedEvents(macro.events);
        setTab("recorded");
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
        const evs = source === "recorded" ? recordedEvents : compileSteps(steps);
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
    [source, recordedEvents, steps, buildMacro, refreshSchedules, toast],
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
    source,
    steps,
    recordedEvents,
    deleteRecordedEvent,
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
    addClickStep,
    addDragStep,
    updateStep,
    deleteStep,
    duplicateStep,
    moveStep,
    captureCursorInto,
    play,
    stop,
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
      record_toggle: "F9",
      play_stop_toggle: "F8",
      capture_cursor: "F6",
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
