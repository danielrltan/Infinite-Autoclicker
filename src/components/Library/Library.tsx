import * as React from "react";
import { Trash2, FileText, RotateCcw, X, FolderOpen, Library as LibraryIcon } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { ipc } from "@/lib/ipc";
import type { MacroMeta, TrashEntry } from "@/lib/types";

/** Top-bar button that opens the macro library in a dialog (not a nav tab). */
export function LibraryButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip label="Library">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open library"
          onClick={() => setOpen(true)}
        >
          <LibraryIcon className="h-5 w-5" />
        </Button>
      </Tooltip>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Library</DialogTitle>
          <DialogDescription>
            Open a saved macro, or manage Trash. Opening one loads it into the editor.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto">
          <LibraryPanel onOpened={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Saved macros as cards, plus the Trash. Used inside the Library dialog. */
export function LibraryPanel({ onOpened }: { onOpened?: () => void }) {
  const { library, loadFromLibrary, deleteFromLibrary } = useApp();
  const [trashOpen, setTrashOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Saved macros</h2>
        <Button size="sm" variant="ghost" onClick={() => setTrashOpen(true)}>
          <Trash2 className="h-4 w-4" /> Trash
        </Button>
      </div>

      {library.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-8 text-center text-sm text-muted">
          No saved macros yet. Build or record one, then Save.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {library.map((m) => (
            <MacroCard
              key={m.path}
              m={m}
              onOpen={async () => {
                await loadFromLibrary(m);
                onOpened?.();
              }}
              onDelete={() => deleteFromLibrary(m)}
            />
          ))}
        </ul>
      )}

      <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} />
    </div>
  );
}

function MacroCard({
  m,
  onOpen,
  onDelete,
}: {
  m: MacroMeta;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-start gap-2 rounded-card border border-border bg-surface p-3">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{m.name}</div>
        <div className="tabular text-[11px] text-muted">
          {m.source} · {m.event_count} events
        </div>
        <div className="mt-2 flex gap-1">
          <Button size="sm" variant="secondary" onClick={onOpen}>
            <FolderOpen className="h-3.5 w-3.5" /> Open
          </Button>
          <button
            aria-label={`Delete ${m.name}`}
            title="Delete"
            onClick={onDelete}
            className="rounded-control p-1.5 text-muted transition-colors hover:bg-border/50 hover:text-record focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function TrashDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { refreshLibrary, toast, confirm } = useApp();
  const [entries, setEntries] = React.useState<TrashEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await ipc.listTrash());
    } catch (e) {
      toast(`Couldn't load Trash: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const restore = async (t: TrashEntry) => {
    try {
      const path = await ipc.restoreMacro(t.token);
      const landed = path.replace(/^.*[\\/]/, "").replace(/\.json$/, "");
      toast(
        landed && landed !== t.original_name
          ? `Restored as ${landed}`
          : `Restored ${t.original_name}`,
        "success",
      );
      await Promise.all([load(), refreshLibrary()]);
    } catch (e) {
      toast(`Restore failed: ${e}`, "error");
    }
  };

  const purge = async (t: TrashEntry) => {
    const ok = await confirm({
      title: `Permanently delete ${t.original_name}?`,
      description: "This can't be undone.",
      confirmLabel: "Delete forever",
      destructive: true,
    });
    if (!ok) return;
    try {
      await ipc.purgeTrash(t.token);
      await load();
    } catch (e) {
      toast(`Couldn't delete: ${e}`, "error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Recently deleted macros. Restore one, or delete it forever.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-auto">
          {loading ? (
            <p className="px-1 py-6 text-center text-xs text-muted">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted">Trash is empty.</p>
          ) : (
            <ul className="space-y-1">
              {entries.map((t) => (
                <li
                  key={t.token}
                  className="flex items-center gap-2 rounded-control px-2 py-2 hover:bg-surface"
                >
                  <Trash2 className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{t.original_name}</div>
                    <div className="tabular text-[11px] text-muted">
                      {t.event_count} events · {relTime(t.trashed_at)}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => restore(t)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </Button>
                  <button
                    type="button"
                    aria-label={`Delete ${t.original_name} forever`}
                    title="Delete forever"
                    onClick={() => purge(t)}
                    className="rounded-[4px] p-1 text-muted transition-colors hover:text-record focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
