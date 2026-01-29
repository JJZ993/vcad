import { useState, useRef, useEffect, useMemo } from "react";
import { Cube, Cylinder, Globe, Trash, Intersect, CaretRight, CaretDown, ArrowUp, ArrowsClockwise, Spiral, Stack } from "@phosphor-icons/react";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { ContextMenu } from "@/components/ContextMenu";
import { useDocumentStore, useUiStore, isBooleanPart } from "@vcad/core";
import type { PrimitiveKind, PartInfo, BooleanPartInfo } from "@vcad/core";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<PrimitiveKind, typeof Cube> = {
  cube: Cube,
  cylinder: Cylinder,
  sphere: Globe,
};

function getPartIcon(part: PartInfo): typeof Cube {
  if (part.kind === "boolean") return Intersect;
  if (part.kind === "extrude") return ArrowUp;
  if (part.kind === "revolve") return ArrowsClockwise;
  if (part.kind === "sweep") return Spiral;
  if (part.kind === "loft") return Stack;
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
      className="flex-1  border border-accent bg-surface px-1 py-0.5 text-xs text-text outline-none w-0"
      autoFocus
    />
  );
}

interface TreeNodeProps {
  part: PartInfo;
  depth: number;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  consumedParts: Record<string, PartInfo>;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
}

function TreeNode({
  part,
  depth,
  expandedIds,
  toggleExpanded,
  consumedParts,
  renamingId,
  setRenamingId,
}: TreeNodeProps) {
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const hoveredPartId = useUiStore((s) => s.hoveredPartId);
  const setHoveredPartId = useUiStore((s) => s.setHoveredPartId);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const showDeleteConfirm = useUiStore((s) => s.showDeleteConfirm);
  const removePart = useDocumentStore((s) => s.removePart);

  const Icon = getPartIcon(part);
  const isSelected = selectedPartIds.has(part.id);
  const isHovered = hoveredPartId === part.id;
  const isRenaming = renamingId === part.id;

  // Check if this is a boolean with children
  const isBoolean = isBooleanPart(part);
  const hasChildren = isBoolean && part.sourcePartIds.length > 0;
  const isExpanded = expandedIds.has(part.id);

  // Get child parts for booleans
  const childParts = useMemo(() => {
    if (!isBoolean) return [];
    return (part as BooleanPartInfo).sourcePartIds
      .map((id) => consumedParts[id])
      .filter((p): p is PartInfo => p !== undefined);
  }, [isBoolean, part, consumedParts]);

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1  px-2 py-1.5 text-xs cursor-pointer transition-colors",
          isSelected
            ? "bg-accent/20 text-accent"
            : isHovered
              ? "bg-border/20 text-text"
              : "text-text-muted hover:bg-border/30 hover:text-text",
          depth > 0 && "opacity-70",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={(e) => {
          if (isRenaming) return;
          // Only root parts (depth 0) are selectable
          if (depth > 0) return;
          if (e.shiftKey) {
            toggleSelect(part.id);
          } else {
            select(part.id);
          }
        }}
        onDoubleClick={() => depth === 0 && setRenamingId(part.id)}
        onMouseEnter={() => setHoveredPartId(part.id)}
        onMouseLeave={() => setHoveredPartId(null)}
      >
        {/* Expand/collapse triangle for booleans */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(part.id);
            }}
            className="shrink-0 p-0.5 hover:bg-border/30 "
          >
            {isExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
          </button>
        ) : (
          <span className="w-4" /> // spacer
        )}
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
        {depth === 0 && (
          <Tooltip content="Delete (Shift+click to skip confirmation)">
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-5 w-5 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                // Shift+click skips confirmation (power user fast delete)
                if (e.shiftKey) {
                  removePart(part.id);
                  if (isSelected) clearSelection();
                } else {
                  showDeleteConfirm([part.id]);
                }
              }}
            >
              <Trash size={12} />
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Render children if expanded */}
      {hasChildren && isExpanded && (
        <>
          {childParts.map((child) => (
            <TreeNode
              key={child.id}
              part={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              consumedParts={consumedParts}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
            />
          ))}
        </>
      )}
    </>
  );
}

export function FeatureTree() {
  const parts = useDocumentStore((s) => s.parts);
  const consumedParts = useDocumentStore((s) => s.consumedParts);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

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
            {parts.map((part) => (
              <TreeNode
                key={part.id}
                part={part}
                depth={0}
                expandedIds={expandedIds}
                toggleExpanded={toggleExpanded}
                consumedParts={consumedParts}
                renamingId={renamingId}
                setRenamingId={setRenamingId}
              />
            ))}
          </div>
        </ContextMenu>
      </PanelBody>
    </Panel>
  );
}
