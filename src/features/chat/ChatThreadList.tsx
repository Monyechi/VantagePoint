import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ChatThread } from "@/lib/db/queries";

export interface ChatThreadListProps {
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function ChatThreadList({
  threads,
  activeThreadId,
  onSelect,
  onNewChat,
  onDelete,
  onClearAll,
}: ChatThreadListProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--color-border)]">
      <div className="p-3">
        <Button variant="secondary" className="w-full justify-start gap-2" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2">
        {threads.length === 0 ? (
          <p className="px-2.5 py-4 text-xs text-[var(--color-muted-foreground)]">
            No conversations yet.
          </p>
        ) : (
          <ul className="space-y-0.5 pb-2">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    t.id === activeThreadId
                      ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                      : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.title || "New chat"}</span>
                    <span className="block truncate text-xs text-[var(--color-muted-foreground)]">
                      {formatRelativeTime(t.updated_at)}
                    </span>
                  </span>
                  <Trash2
                    className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--color-destructive)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t.id);
                    }}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {threads.length > 0 && (
        <div className="border-t border-[var(--color-border)] p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[var(--color-muted-foreground)]"
            onClick={onClearAll}
          >
            Clear all history
          </Button>
        </div>
      )}
    </aside>
  );
}
