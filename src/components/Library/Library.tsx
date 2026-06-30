import { FilePlus2, Save, Trash2, FileText } from "lucide-react";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import type { MacroMeta } from "@/lib/types";

export function Library() {
  const { library, newMacro, saveCurrent, loadFromLibrary, deleteFromLibrary } = useApp();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-sm font-semibold">Library</span>
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
        onKeyDown={(e) => e.key === "Enter" && onOpen()}
        className="flex items-center gap-2 rounded-control px-2 py-2 text-sm hover:bg-bg"
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
          className="rounded-[4px] p-1 text-muted opacity-0 transition-opacity hover:text-record group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
