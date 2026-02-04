/**
 * What's New panel - simple changelog list.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { X, Rocket, Bug, Warning, Lightning, Book, Play } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useChangelogStore, CURRENT_VERSION } from "@/stores/changelog-store";
import { changelog, type ChangelogEntry, type ChangelogCategory } from "@vcad/core";
import { executeChangelogAction } from "@/lib/changelog-actions";

const CATEGORY_ICONS: Record<ChangelogCategory, typeof Rocket> = {
  feat: Rocket,
  fix: Bug,
  breaking: Warning,
  perf: Lightning,
  docs: Book,
};

const CATEGORY_COLORS: Record<ChangelogCategory, string> = {
  feat: "text-emerald-400",
  fix: "text-amber-400",
  breaking: "text-red-400",
  perf: "text-blue-400",
  docs: "text-violet-400",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function EntryCard({ entry, onTryIt }: { entry: ChangelogEntry; onTryIt: () => void }) {
  const Icon = CATEGORY_ICONS[entry.category];
  const color = CATEGORY_COLORS[entry.category];

  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-b-0">
      <Icon size={18} className={cn(color, "flex-shrink-0 mt-0.5")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm text-text">{entry.title}</span>
          <span className="text-[10px] text-text-muted">{formatDate(entry.date)}</span>
        </div>
        <p className="text-xs text-text-muted mt-0.5">{entry.summary}</p>
        {entry.tryIt && (
          <button
            onClick={onTryIt}
            className="flex items-center gap-1 mt-2 text-xs text-accent hover:text-accent-hover transition-colors"
          >
            <Play size={12} weight="fill" />
            <span>Try it</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function WhatsNewPanel() {
  const panelOpen = useChangelogStore((s) => s.panelOpen);
  const closePanel = useChangelogStore((s) => s.closePanel);
  const markAllViewed = useChangelogStore((s) => s.markAllViewed);

  const entries = changelog.entries;

  function handleTryIt(entry: ChangelogEntry) {
    if (entry.tryIt) {
      executeChangelogAction(entry.tryIt);
      closePanel();
    }
  }

  // Mark all as viewed when panel opens
  if (panelOpen) {
    markAllViewed();
  }

  return (
    <Dialog.Root open={panelOpen} onOpenChange={(open) => !open && closePanel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-md max-h-[70vh]",
            "bg-surface shadow-2xl flex flex-col",
            "focus:outline-none",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Dialog.Title className="text-sm font-bold text-text flex items-center gap-2">
              <Rocket size={16} className="text-accent" />
              What's New
            </Dialog.Title>
            <Dialog.Close className="p-1.5 text-text-muted hover:text-text transition-colors">
              <X size={16} />
            </Dialog.Close>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 scrollbar-thin">
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onTryIt={() => handleTryIt(entry)} />
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border text-center text-[10px] text-text-muted">
            v{CURRENT_VERSION}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
