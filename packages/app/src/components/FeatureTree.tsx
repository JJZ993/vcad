import { useState, useRef, useEffect } from "react";
import { Cube, Cylinder, Globe, Trash, Intersect } from "@phosphor-icons/react";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { ContextMenu } from "@/components/ContextMenu";
import { useDocumentStore } from "@/stores/document-store";
import { useUiStore } from "@/stores/ui-store";
import type { PrimitiveKind, PartInfo } from "@/types";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<PrimitiveKind, typeof Cube> = {
  cube: Cube,
  cylinder: Cylinder,
  sphere: Globe,
};

function getPartIcon(part: PartInfo): typeof Cube {
  if (part.kind === "boolean") return Intersect;
  return KIND_ICONS[part.kind];
}

function InlineRenameInput({
  partId,
  currentName,
  onDone,
}: {
  partId: string;
  currentName: string;
  onDone: () => void;
}) {
  const [text, setText] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  const renamePart = useDocumentStore((s) => s.renamePart);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function commit() {
    const trimmed = text.trim();
    if (trimmed && trimmed !== currentName) {
      renamePart(partId, trimmed);
    }
    onDone();
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onDone();
      }}
      className="flex-1 rounded border border-accent bg-surface px-1 py-0.5 text-xs text-text outline-none w-0"
      autoFocus
    />
  );
}

export function FeatureTree() {
  const parts = useDocumentStore((s) => s.parts);
  const removePart = useDocumentStore((s) => s.removePart);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Listen for rename event from context menu
  useEffect(() => {
    function handleRename() {
      const { selectedPartIds } = useUiStore.getState();
      if (selectedPartIds.size === 1) {
        setRenamingId(Array.from(selectedPartIds)[0]!);
      }
    }
    window.addEventListener("vcad:rename-part", handleRename);
    return () => window.removeEventListener("vcad:rename-part", handleRename);
  }, []);

  return (
    <Panel side="left">
      <PanelHeader>Features</PanelHeader>
      <PanelBody>
        <ContextMenu>
          <div>
          {parts.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-text-muted">
              no parts yet — add one from the toolbar
            </div>
          )}
          {parts.map((part) => {
            const Icon = getPartIcon(part);
            const isSelected = selectedPartIds.has(part.id);
            const isRenaming = renamingId === part.id;

            return (
              <div
                key={part.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors",
                  isSelected
                    ? "bg-accent/20 text-accent"
                    : "text-text-muted hover:bg-border/30 hover:text-text",
                )}
                onClick={(e) => {
                  if (isRenaming) return;
                  if (e.shiftKey) {
                    toggleSelect(part.id);
                  } else {
                    select(part.id);
                  }
                }}
                onDoubleClick={() => setRenamingId(part.id)}
              >
                <Icon size={14} className="shrink-0" />
                {isRenaming ? (
                  <InlineRenameInput
                    partId={part.id}
                    currentName={part.name}
                    onDone={() => setRenamingId(null)}
                  />
                ) : (
                  <span className="flex-1 truncate">{part.name}</span>
                )}
                <Tooltip content="Delete">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePart(part.id);
                      if (isSelected) clearSelection();
                    }}
                  >
                    <Trash size={12} />
                  </Button>
                </Tooltip>
              </div>
            );
          })}
          </div>
        </ContextMenu>
      </PanelBody>
    </Panel>
  );
}
