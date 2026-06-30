import * as React from "react";
import { FilePlus2, Save, Trash2, FileText, RotateCcw, X } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ipc } from "@/lib/ipc";
import type { MacroMeta, TrashEntry } from "@/lib/types";

export function Library() {
  const { library, newMacro, saveCurrent, loadFromLibrary, deleteFromLibrary, dirty } =
    useApp();
  const [trashOpen, setTrashOpen] = React.useState(false);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-sm font-semibold">Library</span>
        {dirty && (
          <span
            className="tabular text-[11px] text-warn"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          >
            ● Unsaved
          </span>
        )}
      </div>
      <div className="flex gap-1 px-3 pb-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={newMacro}>
          <FilePlus2 className="h-4 w-4" /> New
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={saveCurrent}>
          <Save className="h-4 w-4" /> Save
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-3">
        {library.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted">
            No saved macros yet. Build or record one, then Save.
          </p>
        ) : (
          <ul className="space-y-1">
            {library.map((m) => (
              <LibraryRow
                key={m.path}
                m={m}
                onOpen={() => loadFromLibrary(m)}
                onDelete={() => deleteFromLibrary(m)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start text-muted hover:text-text"
          onClick={() => setTrashOpen(true)}
        >
          <Trash2 className="h-4 w-4" /> Trash
        </Button>
      </div>

      <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} />
    </aside>
  );
}

function LibraryRow({
  m,
  onOpen,
  onDelete,
}: {
  m: MacroMeta;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex items-center gap-2 rounded-control px-2 py-2 text-sm hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <FileText className="h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate">{m.name}</div>
          <div className="tabular text-[11px] text-muted">
            {m.source} · {m.event_count} events
          </div>
        </div>
        <button
          aria-label={`Delete ${m.name}`}
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-[4px] p-1 text-muted opacity-0 transition-opacity hover:text-record focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
