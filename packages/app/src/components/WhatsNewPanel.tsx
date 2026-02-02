/**
 * What's New panel showing changelog entries with interactive features.
 */

import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Rocket,
  Bug,
  Warning,
  Lightning,
  Book,
  CaretRight,
  CheckCircle,
  Play,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  useChangelogStore,
  CURRENT_VERSION,
} from "@/stores/changelog-store";
import {
  changelog,
  type ChangelogEntry,
  type ChangelogCategory,
} from "@vcad/core";
import { executeChangelogAction } from "@/lib/changelog-actions";

const CATEGORY_CONFIG: Record<
  ChangelogCategory,
  { icon: typeof Rocket; label: string; color: string }
> = {
  feat: { icon: Rocket, label: "FEAT", color: "text-emerald-400" },
  fix: { icon: Bug, label: "FIX", color: "text-amber-400" },
  breaking: { icon: Warning, label: "BREAKING", color: "text-red-400" },
  perf: { icon: Lightning, label: "PERF", color: "text-blue-400" },
  docs: { icon: Book, label: "DOCS", color: "text-violet-400" },
};

const FILTER_OPTIONS: Array<{ value: ChangelogCategory | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "feat", label: "Features" },
  { value: "fix", label: "Fixes" },
  { value: "breaking", label: "Breaking" },
];

function EntryCard({
  entry,
  isSelected,
  isViewed,
  onSelect,
}: {
  entry: ChangelogEntry;
  isSelected: boolean;
  isViewed: boolean;
  onSelect: () => void;
}) {
  const config = CATEGORY_CONFIG[entry.category];
  const Icon = config.icon;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left p-3 border transition-colors",
        isSelected
          ? "border-accent bg-accent/10"
          : "border-border hover:border-text-muted/50 bg-bg",
      )}
    >
      <div className="flex items-start gap-2">
        <Icon size={16} className={cn(config.color, "mt-0.5 flex-shrink-0")} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-text truncate">
              {entry.title}
            </span>
            {!isViewed && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
            {entry.summary}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-muted">
            <span>v{entry.version}</span>
            <span>·</span>
            <span>{formatDate(entry.date)}</span>
          </div>
        </div>
        <CaretRight size={14} className="text-text-muted flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

function EntryDetail({ entry }: { entry: ChangelogEntry }) {
  const config = CATEGORY_CONFIG[entry.category];
  const closePanel = useChangelogStore((s) => s.closePanel);

  function handleTryIt() {
    if (entry.tryIt) {
      executeChangelogAction(entry.tryIt);
      closePanel();
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "px-1.5 py-0.5 text-[10px] font-bold uppercase",
            config.color,
            "bg-current/10",
          )}
        >
          {config.label}
        </span>
        <span className="text-xs text-text-muted">v{entry.version}</span>
        <span className="text-xs text-text-muted">·</span>
        <span className="text-xs text-text-muted">{formatDate(entry.date)}</span>
      </div>

      {/* Title */}
      <h2 className="text-lg font-bold text-text mb-2">{entry.title}</h2>

      {/* Summary */}
      <p className="text-sm text-text-muted mb-4">{entry.summary}</p>

      {/* Details (markdown-ish) */}
      {entry.details && (
        <div className="prose prose-sm prose-invert max-w-none mb-4">
          <div
            className="text-xs text-text-muted space-y-2"
            dangerouslySetInnerHTML={{ __html: formatDetails(entry.details) }}
          />
        </div>
      )}

      {/* Try It button */}
      {entry.tryIt && (
        <button
          onClick={handleTryIt}
          className={cn(
            "flex items-center gap-2 px-4 py-2 mb-4",
            "bg-accent text-white text-sm font-medium",
            "hover:bg-accent-hover transition-colors",
          )}
        >
          <Play size={16} weight="fill" />
          <span>Try it now</span>
        </button>
      )}

      {/* MCP Tools */}
      {entry.mcpTools && entry.mcpTools.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">
            MCP Tools
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entry.mcpTools.map((tool) => (
              <code
                key={tool}
                className="px-1.5 py-0.5 bg-bg text-xs text-accent font-mono"
              >
                {tool}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Feature tags */}
      {entry.features && entry.features.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">
            Features
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entry.features.map((feature) => (
              <span
                key={feature}
                className="px-1.5 py-0.5 bg-bg text-xs text-text-muted"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Breaking change warning */}
      {entry.breaking && (
        <div className="p-3 bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-1">
            <Warning size={16} />
            <span>Breaking Change</span>
          </div>
          <p className="text-xs text-text-muted">{entry.breaking.description}</p>
          {entry.breaking.migration && (
            <p className="text-xs text-text-muted mt-2">
              <strong>Migration:</strong> {entry.breaking.migration}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDetails(details: string): string {
  // Simple markdown-like formatting
  return details
    .replace(/^## (.+)$/gm, '<h3 class="font-bold text-text mt-3 mb-1">$1</h3>')
    .replace(/^- \*\*(.+?)\*\* - (.+)$/gm, '<li><strong class="text-text">$1</strong> - $2</li>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-text">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="px-1 bg-bg text-accent">$1</code>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/<li>/g, '<li class="ml-4">');
}

export function WhatsNewPanel() {
  const panelOpen = useChangelogStore((s) => s.panelOpen);
  const closePanel = useChangelogStore((s) => s.closePanel);
  const selectedEntryId = useChangelogStore((s) => s.selectedEntryId);
  const selectEntry = useChangelogStore((s) => s.selectEntry);
  const filterCategory = useChangelogStore((s) => s.filterCategory);
  const setFilter = useChangelogStore((s) => s.setFilter);
  const viewedEntryIds = useChangelogStore((s) => s.viewedEntryIds);
  const markAllViewed = useChangelogStore((s) => s.markAllViewed);
  const getFilteredEntries = useChangelogStore((s) => s.getFilteredEntries);
  const getUnreadCount = useChangelogStore((s) => s.getUnreadCount);

  const entries = getFilteredEntries();
  const unreadCount = getUnreadCount();
  const selectedEntry = selectedEntryId
    ? changelog.entries.find((e) => e.id === selectedEntryId)
    : entries[0];

  return (
    <Dialog.Root open={panelOpen} onOpenChange={(open) => !open && closePanel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-full max-w-3xl h-[80vh] max-h-[600px]",
            "bg-surface shadow-2xl flex flex-col",
            "focus:outline-none",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Dialog.Title className="text-sm font-bold text-text flex items-center gap-2">
              <Rocket size={16} className="text-accent" />
              What's New in vcad
              <span className="text-xs font-normal text-text-muted">v{CURRENT_VERSION}</span>
            </Dialog.Title>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllViewed}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors"
                >
                  <CheckCircle size={14} />
                  Mark all read
                </button>
              )}
              <Dialog.Close className="p-1.5 text-text-muted hover:text-text transition-colors">
                <X size={16} />
              </Dialog.Close>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0">
            {/* Entry list */}
            <div className="w-64 flex-shrink-0 border-r border-border flex flex-col">
              {/* Filters */}
              <div className="flex gap-1 p-2 border-b border-border">
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFilter(option.value)}
                    className={cn(
                      "px-2 py-1 text-xs transition-colors",
                      filterCategory === option.value
                        ? "bg-accent text-white"
                        : "text-text-muted hover:text-text hover:bg-hover",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {/* Entry list */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
                {entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === (selectedEntryId ?? entries[0]?.id)}
                    isViewed={viewedEntryIds.has(entry.id)}
                    onSelect={() => selectEntry(entry.id)}
                  />
                ))}
                {entries.length === 0 && (
                  <div className="text-center py-8 text-text-muted text-xs">
                    No entries match the filter
                  </div>
                )}
              </div>
            </div>

            {/* Entry detail */}
            {selectedEntry ? (
              <EntryDetail entry={selectedEntry} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
                Select an entry to view details
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border text-center text-[10px] text-text-muted">
            Press <kbd className="px-1 py-0.5 bg-bg font-mono">?</kbd> to toggle this panel
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
