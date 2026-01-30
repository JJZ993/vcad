import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import * as RadixContextMenu from "@radix-ui/react-context-menu";
import {
  Cube,
  Cylinder,
  Globe,
  Trash,
  Intersect,
  CaretRight,
  CaretDown,
  ArrowUp,
  ArrowsClockwise,
  Spiral,
  Stack,
  X,
  Package,
  LinkSimple,
  Anchor,
  Copy,
  PencilSimple,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { ContextMenu } from "@/components/ContextMenu";
import { useDocumentStore, useUiStore, isBooleanPart } from "@vcad/core";
import type { PrimitiveKind, PartInfo, BooleanPartInfo } from "@vcad/core";
import type { PartInstance, Joint, JointKind } from "@vcad/ir";
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
      className="flex-1 border border-accent bg-surface px-1 py-0.5 text-xs text-text outline-none w-0"
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
  const removePart = useDocumentStore((s) => s.removePart);

  const Icon = getPartIcon(part);
  const isSelected = selectedPartIds.has(part.id);
  const isHovered = hoveredPartId === part.id;
  const isRenaming = renamingId === part.id;

  const isBoolean = isBooleanPart(part);
  const hasChildren = isBoolean && part.sourcePartIds.length > 0;
  const isExpanded = expandedIds.has(part.id);

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
          "group flex items-center gap-1 px-2 py-1.5 text-xs cursor-pointer",
          isSelected
            ? "bg-accent/20 text-accent"
            : isHovered
            ? "bg-hover text-text"
            : "text-text-muted hover:bg-hover hover:text-text",
          depth > 0 && "opacity-70",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={(e) => {
          if (isRenaming) return;
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
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(part.id);
            }}
            className="shrink-0 p-0.5 hover:bg-hover"
          >
            {isExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
          </button>
        ) : (
          <span className="w-4" />
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
                removePart(part.id);
                if (isSelected) clearSelection();
              }}
            >
              <Trash size={12} />
            </Button>
          </Tooltip>
        )}
      </div>

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

/** Get a display string for joint type */
function getJointTypeLabel(kind: JointKind): string {
  switch (kind.type) {
    case "Fixed":
      return "Fixed";
    case "Revolute":
      return "Revolute";
    case "Slider":
      return "Slider";
    case "Cylindrical":
      return "Cylindrical";
    case "Ball":
      return "Ball";
  }
}

/** Get icon for joint type */
function getJointIcon(kind: JointKind): typeof LinkSimple {
  switch (kind.type) {
    case "Fixed":
      return Anchor;
    case "Revolute":
      return ArrowsClockwise;
    case "Slider":
      return ArrowUp;
    case "Cylindrical":
      return Spiral;
    case "Ball":
      return Globe;
  }
}

/** Context menu item for assembly tree */
function AssemblyMenuItem({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <RadixContextMenu.Item
      className="group flex items-center gap-2 px-2 py-1.5 text-xs text-text outline-none cursor-pointer data-[disabled]:opacity-40 data-[disabled]:cursor-default data-[highlighted]:bg-accent/20 data-[highlighted]:text-accent"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={14} className="shrink-0" />
      <span className="flex-1">{label}</span>
    </RadixContextMenu.Item>
  );
}

interface InstanceNodeProps {
  instance: PartInstance;
  joint?: Joint;
  isGround: boolean;
  onRename: (instanceId: string) => void;
}

function InstanceNode({ instance, joint, isGround, onRename }: InstanceNodeProps) {
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const hoveredPartId = useUiStore((s) => s.hoveredPartId);
  const setHoveredPartId = useUiStore((s) => s.setHoveredPartId);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const deleteInstance = useDocumentStore((s) => s.deleteInstance);
  const setGroundInstance = useDocumentStore((s) => s.setGroundInstance);
  const clearSelection = useUiStore((s) => s.clearSelection);

  const isSelected = selectedPartIds.has(instance.id);
  const isHovered = hoveredPartId === instance.id;

  const displayName = instance.name ?? instance.partDefId;
  const jointSuffix = joint
    ? ` [${getJointTypeLabel(joint.kind)}]`
    : isGround
    ? " (grounded)"
    : "";

  function handleDelete() {
    deleteInstance(instance.id);
    if (isSelected) clearSelection();
  }

  function handleSetGround() {
    setGroundInstance(instance.id);
  }

  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>
        <div
          className={cn(
            "group flex items-center gap-1 px-2 py-1.5 text-xs cursor-pointer",
            isSelected
              ? "bg-accent/20 text-accent"
              : isHovered
              ? "bg-hover text-text"
              : "text-text-muted hover:bg-hover hover:text-text",
          )}
          style={{ paddingLeft: "24px" }}
          onClick={(e) => {
            if (e.shiftKey) {
              toggleSelect(instance.id);
            } else {
              select(instance.id);
            }
          }}
          onMouseEnter={() => setHoveredPartId(instance.id)}
          onMouseLeave={() => setHoveredPartId(null)}
        >
          <Package size={14} className="shrink-0" />
          <span className="flex-1 truncate">
            {displayName}
            <span className="text-text-muted/70">{jointSuffix}</span>
          </span>
          {isGround && (
            <Anchor size={12} className="shrink-0 text-text-muted/50" />
          )}
        </div>
      </RadixContextMenu.Trigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.Content className="z-50 min-w-[160px] border border-border bg-card p-1 shadow-xl">
          <AssemblyMenuItem
            icon={PencilSimple}
            label="Rename"
            onClick={() => onRename(instance.id)}
          />
          <AssemblyMenuItem
            icon={Anchor}
            label="Set as Ground"
            disabled={isGround}
            onClick={handleSetGround}
          />
          <RadixContextMenu.Separator className="my-1 h-px bg-border" />
          <AssemblyMenuItem
            icon={Trash}
            label="Delete Instance"
            onClick={handleDelete}
          />
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}

interface JointNodeProps {
  joint: Joint;
  instancesById: Map<string, PartInstance>;
}

function JointNode({ joint, instancesById }: JointNodeProps) {
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const hoveredPartId = useUiStore((s) => s.hoveredPartId);
  const setHoveredPartId = useUiStore((s) => s.setHoveredPartId);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const deleteJoint = useDocumentStore((s) => s.deleteJoint);
  const clearSelection = useUiStore((s) => s.clearSelection);

  // Use joint.id prefixed with "joint:" to distinguish from instances
  const jointSelectionId = `joint:${joint.id}`;
  const isSelected = selectedPartIds.has(jointSelectionId);
  const isHovered = hoveredPartId === jointSelectionId;

  const Icon = getJointIcon(joint.kind);
  const parentName = joint.parentInstanceId
    ? instancesById.get(joint.parentInstanceId)?.name ?? joint.parentInstanceId
    : "Ground";
  const childName =
    instancesById.get(joint.childInstanceId)?.name ?? joint.childInstanceId;
  const displayName = joint.name ?? `${getJointTypeLabel(joint.kind)} Joint`;

  // Show state value for non-fixed joints
  let stateDisplay = "";
  if (joint.kind.type === "Revolute") {
    stateDisplay = ` ${joint.state.toFixed(0)}°`;
  } else if (joint.kind.type === "Slider") {
    stateDisplay = ` ${joint.state.toFixed(1)}mm`;
  }

  function handleDelete() {
    deleteJoint(joint.id);
    if (isSelected) clearSelection();
  }

  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>
        <div
          className={cn(
            "group flex items-center gap-1 px-2 py-1.5 text-xs cursor-pointer",
            isSelected
              ? "bg-accent/20 text-accent"
              : isHovered
              ? "bg-hover text-text"
              : "text-text-muted hover:bg-hover hover:text-text",
          )}
          style={{ paddingLeft: "24px" }}
          onClick={(e) => {
            if (e.shiftKey) {
              toggleSelect(jointSelectionId);
            } else {
              select(jointSelectionId);
            }
          }}
          onMouseEnter={() => setHoveredPartId(jointSelectionId)}
          onMouseLeave={() => setHoveredPartId(null)}
        >
          <Icon size={14} className="shrink-0" />
          <span className="flex-1 truncate">
            {displayName}
            <span className="text-text-muted/70">{stateDisplay}</span>
          </span>
          <Tooltip content={`${parentName} → ${childName}`} side="right">
            <LinkSimple size={12} className="shrink-0 text-text-muted/50" />
          </Tooltip>
        </div>
      </RadixContextMenu.Trigger>
      <RadixContextMenu.Portal>
        <RadixContextMenu.Content className="z-50 min-w-[160px] border border-border bg-card p-1 shadow-xl">
          <AssemblyMenuItem
            icon={Trash}
            label="Delete Joint"
            onClick={handleDelete}
          />
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}

interface AssemblyTreeProps {
  instances: PartInstance[];
  joints: Joint[];
  groundInstanceId?: string;
}

function AssemblyTree({
  instances,
  joints,
  groundInstanceId,
}: AssemblyTreeProps) {
  const renameInstance = useDocumentStore((s) => s.renameInstance);

  const instancesById = useMemo(
    () => new Map(instances.map((i) => [i.id, i])),
    [instances],
  );

  // Build map of child instance -> joint
  const jointByChild = useMemo(
    () => new Map(joints.map((j) => [j.childInstanceId, j])),
    [joints],
  );

  return (
    <div className="space-y-1">
      {/* Section header: Instances */}
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-2 pt-2">
        Instances
      </div>
      {instances.length === 0 ? (
        <div className="px-2 py-2 text-center text-xs text-text-muted">
          No instances yet.
          <br />
          Select a part and run "Create Part Definition" to start.
        </div>
      ) : (
        instances.map((instance) => (
          <InstanceNode
            key={instance.id}
            instance={instance}
            joint={jointByChild.get(instance.id)}
            isGround={instance.id === groundInstanceId}
            onRename={(id) => {
              const inst = instances.find((i) => i.id === id);
              if (inst) {
                const newName = prompt("Rename instance:", inst.name ?? inst.partDefId);
                if (newName && newName.trim()) {
                  renameInstance(id, newName.trim());
                }
              }
            }}
          />
        ))
      )}

      {/* Section header: Joints (if any) */}
      {joints.length > 0 && (
        <>
          <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted px-2 pt-3">
            Joints
          </div>
          {joints.map((joint) => (
            <JointNode
              key={joint.id}
              joint={joint}
              instancesById={instancesById}
            />
          ))}
        </>
      )}
    </div>
  );
}

export function FeatureTree() {
  const parts = useDocumentStore((s) => s.parts);
  const consumedParts = useDocumentStore((s) => s.consumedParts);
  const document = useDocumentStore((s) => s.document);
  const featureTreeOpen = useUiStore((s) => s.featureTreeOpen);
  const setFeatureTreeOpen = useUiStore((s) => s.setFeatureTreeOpen);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();

  // Check if this is an assembly document
  const hasInstances = document.instances && document.instances.length > 0;

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

  const hasContent = hasInstances || parts.length > 0;

  // Close by default if there's no content on first render
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      if (!hasContent) {
        setFeatureTreeOpen(false);
      }
    }
  }, [hasContent, setFeatureTreeOpen]);

  const handleBackdropClick = useCallback(() => {
    setFeatureTreeOpen(false);
  }, [setFeatureTreeOpen]);

  if (!featureTreeOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <div
          className="fixed inset-0 z-10 bg-black/50 sm:hidden"
          onClick={handleBackdropClick}
        />
      )}

      <div
        className={cn(
          // Mobile: full-height drawer from left
          "fixed inset-y-0 left-0 z-20 w-72",
          "pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)]",
          // Desktop: floating panel
          "sm:absolute sm:top-14 sm:left-3 sm:inset-y-auto sm:w-56",
          "sm:pt-0 sm:pb-0 sm:pl-0",
          "border-r sm:border border-border",
          "bg-surface",
          "shadow-lg shadow-black/30",
          isMobile ? "h-full" : "max-h-[calc(100vh-120px)]",
          "flex flex-col",
        )}
      >
        {/* Header */}
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Features
          </span>
          <button
            onClick={() => setFeatureTreeOpen(false)}
            className="flex h-8 w-8 sm:h-6 sm:w-6 items-center justify-center text-text-muted hover:text-text hover:bg-hover"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
          {!hasContent ? (
            <div className="px-2 py-4 text-center text-xs text-text-muted">
              No features yet.
              <br />
              Use the command bar to create a part.
            </div>
          ) : (
            <ContextMenu>
              <div>
                {/* Assembly mode: show instances and joints */}
                {hasInstances ? (
                  <AssemblyTree
                    instances={document.instances!}
                    joints={document.joints ?? []}
                    groundInstanceId={document.groundInstanceId}
                  />
                ) : (
                  <>
                    {/* Legacy mode: show parts */}
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
                  </>
                )}
              </div>
            </ContextMenu>
          )}
        </div>
      </div>
    </>
  );
}
