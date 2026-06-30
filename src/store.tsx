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
import { ipc, subscribe } from "@/lib/ipc";
import {
  compileSteps,
  newClickStep,
  newDragStep,
  type Step,
} from "@/lib/compile";
import type {
  AppState,
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

export type Tab = "steps" | "recorded" | "color" | "schedule";
export interface Toast {
  id: number;
  msg: string;
  kind: "info" | "success" | "error" | "warn";
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
  // record opts
  recordMode: CaptureMode;
  setRecordMode: (m: CaptureMode) => void;
  captureKeyboard: boolean;
  setCaptureKeyboard: (b: boolean) => void;
  // live
  recording: { active: boolean; count: number; elapsedMs: number };
  progress: { loop: number; event: number; totalEvents: number; totalLoops: number | null } | null;
  colorClicks: number | null;
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
  newMacro: () => void;
  saveCurrent: () => Promise<void>;
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
  toast: (msg: string, kind?: Toast["kind"]) => void;
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

  const [tab, setTab] = useState<Tab>("steps");
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

  const [recordMode, setRecordMode] = useState<CaptureMode>("full_motion");
  const [captureKeyboard, setCaptureKeyboard] = useState(true);

  const [recording, setRecording] = useState({ active: false, count: 0, elapsedMs: 0 });
  const [progress, setProgress] = useState<AppContextValue["progress"]>(null);
  const [colorClicks, setColorClicks] = useState<number | null>(null);

  const [library, setLibrary] = useState<MacroMeta[]>([]);
  const [recent, setRecent] = useState<MacroMeta[]>([]);
  const [schedules, setSchedules] = useState<ScheduleInfo[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);

  const recStart = useRef(0);
  const toastId = useRef(0);

  const events = useMemo(
    () => (source === "recorded" ? recordedEvents : compileSteps(steps)),
    [source, recordedEvents, steps],
  );

  const toast = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

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

  // ── Step actions ─────────────────────────────────────────────────
  const addClickStep = useCallback(() => {
    const s = newClickStep();
    setSteps((prev) => [...prev, s]);
    setSelectedStepId(s.id);
    setSource("built");
  }, []);
  const addDragStep = useCallback(() => {
    const s = newDragStep();
    setSteps((prev) => [...prev, s]);
    setSelectedStepId(s.id);
    setSource("built");
  }, []);
  const updateStep = useCallback((id: string, patch: Partial<Step>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)),
    );
  }, []);
  const deleteStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const duplicateStep = useCallback((id: string) => {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const orig = prev[i];
      if (i < 0 || !orig) return prev;
      const copy = { ...orig, id: `${orig.kind}-${Date.now()}` } as Step;
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
  }, []);
  const moveStep = useCallback((id: string, dir: -1 | 1) => {
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
  }, []);

  const deleteRecordedEvent = useCallback((index: number) => {
    setRecordedEvents((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

  const play = useCallback(async () => {
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
  }, [source, recordedEvents, steps, repeat, speed, jitter, buildMacro, toast]);

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
  const newMacro = useCallback(() => {
    setSteps([]);
    setRecordedEvents([]);
    setSource("built");
    setMacroName("Untitled macro");
    setCurrentPath(null);
    setTab("steps");
  }, []);

  const saveCurrent = useCallback(async () => {
    try {
      const dir = await ipc.defaultMacroDir();
      const safe = macroName.replace(/[^\w.-]+/g, "_") || "macro";
      const path = currentPath ?? `${dir}/${safe}.json`;
      const evs = source === "recorded" ? recordedEvents : compileSteps(steps);
      await ipc.saveMacro(path, buildMacro(evs));
      setCurrentPath(path);
      toast("Saved", "success");
      await refreshLibrary();
    } catch (e) {
      toast(`Save failed: ${e}`, "error");
    }
  }, [macroName, currentPath, source, recordedEvents, steps, buildMacro, refreshLibrary, toast]);

  const loadFromLibrary = useCallback(
    async (m: MacroMeta) => {
      try {
        const macro = await ipc.loadMacro(m.path);
        setMacroName(macro.name);
        setSource(macro.source);
        setRepeat(macro.settings.repeat);
        setSpeed(macro.settings.speed);
        setCurrentPath(m.path);
        if (macro.source === "recorded") {
          setRecordedEvents(macro.events);
          setTab("recorded");
        } else {
          // Loaded built macros come back as a compiled timeline; show as events.
          setRecordedEvents(macro.events);
          setSource("recorded");
          setTab("recorded");
        }
        toast(`Loaded ${macro.name}`, "success");
      } catch (e) {
        toast(`Load failed: ${e}`, "error");
      }
    },
    [toast],
  );

  const deleteFromLibrary = useCallback(
    async (m: MacroMeta) => {
      await ipc.deleteMacro(m.path);
      toast("Deleted", "success");
      await refreshLibrary();
    },
    [refreshLibrary, toast],
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
    setMacroName,
    source,
    steps,
    recordedEvents,
    deleteRecordedEvent,
    events,
    selectedStepId,
    setSelectedStepId,
    repeat,
    setRepeat,
    speed,
    setSpeed,
    jitter,
    setJitter,
    recordMode,
    setRecordMode,
    captureKeyboard,
    setCaptureKeyboard,
    recording,
    progress,
    colorClicks,
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
    loadFromLibrary,
    deleteFromLibrary,
    refreshLibrary,
    armSchedule,
    cancelSchedule,
    startColorTrigger,
    stopColorTrigger,
    saveSettings,
    toast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
