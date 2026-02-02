import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Cube,
  Cylinder,
  Globe,
  Unite,
  Subtract,
  Intersect,
  ArrowsOutCardinal,
  ArrowsClockwise,
  ArrowsOut,
  PencilSimple,
  Package,
  PlusSquare,
  LinkSimple,
  Cube as Cube3D,
  Blueprint,
  Download,
  X,
  Circle,
  Octagon,
  CubeTransparent,
  DotsThree,
  ArrowsHorizontal,
  Play,
  Pause,
  Stop,
  FastForward,
  Printer,
  MagnifyingGlass,
  FloppyDisk,
  FolderOpen,
  Export,
  GridFour,
  SidebarSimple,
  Sun,
  Info,
  ArrowCounterClockwise,
  ArrowClockwise,
  Trash,
  Copy,
  Anchor,
  Sparkle,
  SpinnerGap,
  ChatCircle,
} from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@/components/ui/tooltip";
import {
  useDocumentStore,
  useUiStore,
  useSketchStore,
  useEngineStore,
  useSimulationStore,
  createCommandRegistry,
  exportStlBlob,
  exportGltfBlob,
  exportStepBlob,
  type ToolbarTab,
  type Command as CommandType,
} from "@vcad/core";
import type { PrimitiveKind, BooleanType } from "@vcad/core";
import { downloadBlob } from "@/lib/download";
import { useNotificationStore } from "@/stores/notification-store";
import { generateCADServer } from "@/lib/server-inference";
import { fromCompact, type Document } from "@vcad/ir";
import { useRequireAuth, AuthModal, useAuthStore } from "@vcad/auth";
import type { VcadFile } from "@vcad/core";
import { cn } from "@/lib/utils";
import {
  InsertInstanceDialog,
  AddJointDialog,
  FilletChamferDialog,
  ShellDialog,
  PatternDialog,
  MirrorDialog,
} from "@/components/dialogs";
import { useOnboardingStore, type GuidedFlowStep } from "@/stores/onboarding-store";
import { useDrawingStore } from "@/stores/drawing-store";
import { useSlicerStore } from "@/stores/slicer-store";

const PRIMITIVES: { kind: PrimitiveKind; icon: typeof Cube; label: string }[] = [
  { kind: "cube", icon: Cube, label: "Box" },
  { kind: "cylinder", icon: Cylinder, label: "Cylinder" },
  { kind: "sphere", icon: Globe, label: "Sphere" },
];

const BOOLEANS: {
  type: BooleanType;
  icon: typeof Unite;
  label: string;
  shortcut: string;
}[] = [
  { type: "union", icon: Unite, label: "Union", shortcut: "⌘⇧U" },
  { type: "difference", icon: Subtract, label: "Difference", shortcut: "⌘⇧D" },
  { type: "intersection", icon: Intersect, label: "Intersection", shortcut: "⌘⇧I" },
];

const TAB_COLORS: Record<ToolbarTab, string> = {
  create: "text-emerald-400",
  transform: "text-blue-400",
  combine: "text-violet-400",
  modify: "text-amber-400",
  assembly: "text-rose-400",
  simulate: "text-cyan-400",
  build: "text-slate-400",
};

// All tabs in priority order (higher priority = shown first when space is limited)
const ALL_TABS: { id: ToolbarTab; label: string; icon: typeof Cube }[] = [
  { id: "create", label: "Create", icon: Cube },
  { id: "transform", label: "Transform", icon: ArrowsOutCardinal },
  { id: "combine", label: "Combine", icon: Unite },
  { id: "modify", label: "Modify", icon: Circle },
  { id: "assembly", label: "Assembly", icon: Package },
  { id: "simulate", label: "Simulate", icon: Play },
  { id: "build", label: "Export", icon: Export },
];

// Responsive breakpoints and widths
const MOBILE_BREAKPOINT = 640; // sm breakpoint
const TAB_WIDTH_DESKTOP = 95; // ~95px per tab on desktop
const TAB_WIDTH_MOBILE = 44; // Just icon on mobile
const CHAT_WIDTH = 70;
const MORE_WIDTH = 44;
const MIN_VISIBLE_TABS = 0; // Can collapse all to More on very small screens

// Icon mapping for command palette
const COMMAND_ICONS: Record<string, typeof Cube> = {
  Cube,
  Cylinder,
  Globe,
  ArrowsOutCardinal,
  ArrowClockwise,
  ArrowsOut,
  ArrowCounterClockwise,
  Unite,
  Subtract,
  Intersect,
  FloppyDisk,
  FolderOpen,
  Export,
  GridFour,
  CubeTransparent,
  SidebarSimple,
  Sun,
  Info,
  Trash,
  Copy,
  X,
  Package,
  PlusSquare,
  Anchor,
  ArrowsClockwise: ArrowClockwise,
  ArrowsHorizontal,
  Sparkle,
  Circle,
  Octagon,
  DotsThree,
};

function CommandDropdown() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auth gating for AI features
  const { requireAuth, showAuth, setShowAuth, feature } = useRequireAuth("ai");

  const handleMouseEnter = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    setOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!pinned) {
      hoverTimeoutRef.current = setTimeout(() => setOpen(false), 100);
    }
  }, [pinned]);

  const handleClick = useCallback(() => {
    setPinned((p) => !p);
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) setPinned(false);
  }, []);

  // Track mobile state for tooltip visibility
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => {
      mq.removeEventListener("change", handler);
      clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // Store actions
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const applyBoolean = useDocumentStore((s) => s.applyBoolean);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const removePart = useDocumentStore((s) => s.removePart);
  const duplicateParts = useDocumentStore((s) => s.duplicateParts);
  const undoStack = useDocumentStore((s) => s.undoStack);
  const redoStack = useDocumentStore((s) => s.redoStack);
  const parts = useDocumentStore((s) => s.parts);
  const document = useDocumentStore((s) => s.document);
  const createPartDef = useDocumentStore((s) => s.createPartDef);
  const addJoint = useDocumentStore((s) => s.addJoint);
  const setGroundInstance = useDocumentStore((s) => s.setGroundInstance);
  const loadDocument = useDocumentStore((s) => s.loadDocument);

  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const select = useUiStore((s) => s.select);
  const selectMultiple = useUiStore((s) => s.selectMultiple);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const toggleWireframe = useUiStore((s) => s.toggleWireframe);
  const toggleGridSnap = useUiStore((s) => s.toggleGridSnap);
  const toggleFeatureTree = useUiStore((s) => s.toggleFeatureTree);

  const scene = useEngineStore((s) => s.scene);

  // AI generation handler (inner function that does the actual work)
  const doAIGenerate = useCallback(async (prompt: string) => {
    setAiGenerating(true);
    setOpen(false);

    const store = useNotificationStore.getState();
    const progressId = store.startAIOperation(prompt, [
      "Connecting to server",
      "Generating geometry",
      "Building mesh",
    ]);

    try {
      store.updateAIProgress(progressId, 0, 10);
      setAiStatus("Connecting to server...");

      const currentSession = useAuthStore.getState().session;
      if (!currentSession) {
        throw new Error("Not authenticated");
      }
      const result = await generateCADServer(prompt, {
        authToken: currentSession.access_token,
      });

      store.updateAIProgress(progressId, 1, 80);
      setAiStatus("Building geometry...");

      const generatedDoc: Document = fromCompact(result.ir);

      store.updateAIProgress(progressId, 2, 95);

      const vcadFile: VcadFile = {
        document: generatedDoc,
        parts: [],
        nextNodeId: Object.keys(generatedDoc.nodes).length,
        nextPartNum: 1,
      };

      loadDocument(vcadFile);

      store.completeAIOperation(progressId, {
        type: "success",
        title: "Generation complete",
        description: `Created in ${(result.durationMs / 1000).toFixed(1)}s`,
        actions: [
          {
            label: "Undo",
            onClick: () => useDocumentStore.getState().undo(),
            variant: "secondary",
          },
        ],
      });
    } catch (err) {
      console.error("AI generation failed:", err);
      store.failAIOperation(
        progressId,
        err instanceof Error ? err.message : "Generation failed"
      );
    } finally {
      setAiGenerating(false);
      setAiStatus("");
    }
  }, [loadDocument]);

  // Wrapper that requires auth before generating
  const handleAIGenerate = useCallback((prompt: string) => {
    requireAuth(() => doAIGenerate(prompt));
  }, [requireAuth, doAIGenerate]);

  const commands = useMemo(() => {
    return createCommandRegistry({
      addPrimitive: (kind) => {
        const partId = addPrimitive(kind);
        select(partId);
        setTransformMode("translate");
        setOpen(false);
      },
      applyBoolean: (type) => {
        const ids = Array.from(selectedPartIds);
        if (ids.length === 2) {
          const newId = applyBoolean(type, ids[0]!, ids[1]!);
          if (newId) select(newId);
        }
        setOpen(false);
      },
      setTransformMode: (mode) => {
        setTransformMode(mode);
        setOpen(false);
      },
      undo: () => {
        undo();
        setOpen(false);
      },
      redo: () => {
        redo();
        setOpen(false);
      },
      toggleWireframe: () => {
        toggleWireframe();
        setOpen(false);
      },
      toggleGridSnap: () => {
        toggleGridSnap();
        setOpen(false);
      },
      toggleFeatureTree: () => {
        toggleFeatureTree();
        setOpen(false);
      },
      save: () => {
        window.dispatchEvent(new CustomEvent("vcad:save"));
        setOpen(false);
      },
      open: () => {
        window.dispatchEvent(new CustomEvent("vcad:open"));
        setOpen(false);
      },
      exportStl: () => {
        if (scene) {
          const blob = exportStlBlob(scene);
          downloadBlob(blob, "model.stl");
        }
        setOpen(false);
      },
      exportGlb: () => {
        if (scene) {
          const blob = exportGltfBlob(scene);
          downloadBlob(blob, "model.glb");
        }
        setOpen(false);
      },
      openAbout: () => {
        window.dispatchEvent(new CustomEvent("vcad:about"));
        setOpen(false);
      },
      deleteSelected: () => {
        for (const id of selectedPartIds) {
          removePart(id);
        }
        clearSelection();
        setOpen(false);
      },
      duplicateSelected: () => {
        if (selectedPartIds.size > 0) {
          const ids = Array.from(selectedPartIds);
          const newIds = duplicateParts(ids);
          selectMultiple(newIds);
        }
        setOpen(false);
      },
      deselectAll: () => {
        clearSelection();
        setOpen(false);
      },
      hasTwoSelected: () => selectedPartIds.size === 2,
      hasSelection: () => selectedPartIds.size > 0,
      hasParts: () => parts.length > 0,
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      createPartDef: () => {
        const partId = Array.from(selectedPartIds)[0];
        if (partId && parts.some((p) => p.id === partId)) {
          const defId = createPartDef(partId);
          if (defId) {
            const instance = document.instances?.find((i) => i.partDefId === defId);
            if (instance) select(instance.id);
          }
        }
        setOpen(false);
      },
      insertInstance: () => {
        window.dispatchEvent(new CustomEvent("vcad:insert-instance"));
        setOpen(false);
      },
      addJoint: (kind) => {
        const instanceIds = Array.from(selectedPartIds).filter((id) =>
          document.instances?.some((i) => i.id === id)
        );
        if (instanceIds.length === 2) {
          const jointId = addJoint({
            parentInstanceId: instanceIds[0]!,
            childInstanceId: instanceIds[1]!,
            parentAnchor: { x: 0, y: 0, z: 0 },
            childAnchor: { x: 0, y: 0, z: 0 },
            kind,
          });
          select(`joint:${jointId}`);
        }
        setOpen(false);
      },
      setGroundInstance: () => {
        const instanceId = Array.from(selectedPartIds)[0];
        if (instanceId && document.instances?.some((i) => i.id === instanceId)) {
          setGroundInstance(instanceId);
        }
        setOpen(false);
      },
      hasOnePartSelected: () =>
        selectedPartIds.size === 1 && parts.some((p) => selectedPartIds.has(p.id)),
      hasPartDefs: () =>
        document.partDefs !== undefined && Object.keys(document.partDefs).length > 0,
      hasTwoInstancesSelected: () => {
        const instanceIds = Array.from(selectedPartIds).filter((id) =>
          document.instances?.some((i) => i.id === id)
        );
        return instanceIds.length === 2;
      },
      hasOneInstanceSelected: () => {
        const instanceIds = Array.from(selectedPartIds).filter((id) =>
          document.instances?.some((i) => i.id === id)
        );
        return instanceIds.length === 1;
      },
      applyFillet: () => {
        window.dispatchEvent(new CustomEvent("vcad:apply-fillet"));
        setOpen(false);
      },
      applyChamfer: () => {
        window.dispatchEvent(new CustomEvent("vcad:apply-chamfer"));
        setOpen(false);
      },
      applyShell: () => {
        window.dispatchEvent(new CustomEvent("vcad:apply-shell"));
        setOpen(false);
      },
      applyLinearPattern: () => {
        window.dispatchEvent(new CustomEvent("vcad:apply-pattern"));
        setOpen(false);
      },
      applyCircularPattern: () => {
        window.dispatchEvent(new CustomEvent("vcad:apply-pattern"));
        setOpen(false);
      },
      applyMirror: () => {
        window.dispatchEvent(new CustomEvent("vcad:apply-mirror"));
        setOpen(false);
      },
    });
  }, [
    addJoint,
    addPrimitive,
    applyBoolean,
    clearSelection,
    createPartDef,
    document,
    duplicateParts,
    parts,
    redo,
    redoStack.length,
    removePart,
    scene,
    select,
    selectMultiple,
    selectedPartIds,
    setGroundInstance,
    setTransformMode,
    toggleFeatureTree,
    toggleGridSnap,
    toggleWireframe,
    undo,
    undoStack.length,
  ]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((cmd) => {
      if (cmd.label.toLowerCase().includes(q)) return true;
      return cmd.keywords.some((kw) => kw.includes(q));
    });
  }, [commands, query]);

  // Listen for keyboard shortcut to open chat
  useEffect(() => {
    function handleOpenChat() {
      setOpen(true);
    }
    window.addEventListener("vcad:open-chat", handleOpenChat);
    return () => window.removeEventListener("vcad:open-chat", handleOpenChat);
  }, []);

  // Reset when opening/closing
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input after popover opens
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector("[data-selected=true]");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const executeCommand = useCallback((cmd: CommandType) => {
    if (cmd.enabled && !cmd.enabled()) return;
    cmd.action();
  }, []);

  const aiPrompt = query.trim();
  const showAIOption = aiPrompt.length > 2;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (aiGenerating) {
      if (e.key === "Escape") {
        // TODO: Cancel generation
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        // If we have a matching command, execute it
        if (filteredCommands.length > 0 && selectedIndex < filteredCommands.length) {
          const cmd = filteredCommands[selectedIndex];
          if (cmd) executeCommand(cmd);
        }
        // Otherwise, if we have a query, generate with AI
        else if (aiPrompt) {
          handleAIGenerate(aiPrompt);
        }
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  }

  function highlightMatch(text: string, q: string): React.ReactNode {
    if (!q) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-accent font-medium">{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  }

  const triggerButton = (
    <button
      className={cn(
        "relative flex items-center justify-center gap-1 text-xs",
        "w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2",
        "hover:bg-hover/50 transition-all",
        (pinned || aiGenerating) && "bg-hover/50",
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {aiGenerating ? (
        <SpinnerGap size={18} className="text-accent animate-spin" />
      ) : (
        <ChatCircle
          size={18}
          weight={pinned ? "fill" : "regular"}
          className={cn("text-accent", "transition-transform")}
        />
      )}
      <span className={cn(
        "hidden sm:inline font-medium transition-colors",
        pinned ? "text-text" : "text-text-muted"
      )}>
        Chat
      </span>
    </button>
  );

  return (
    <>
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      {isMobile ? (
        <Tooltip content="Chat (⌘K)" side="top">
          <Popover.Trigger asChild>{triggerButton}</Popover.Trigger>
        </Tooltip>
      ) : (
        <Popover.Trigger asChild>{triggerButton}</Popover.Trigger>
      )}
      <Popover.Portal>
        <Popover.Content
          className="bottom-toolbar-menu z-50 w-80 bg-surface"
          sideOffset={4}
          side="top"
          align="start"
          onKeyDown={handleKeyDown}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <MagnifyingGlass size={14} className="text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or describe what to create..."
              className="flex-1 bg-transparent text-xs text-text outline-none placeholder:text-text-muted"
              disabled={aiGenerating}
            />
            <kbd className="bg-border/50 px-1 py-0.5 text-[9px] text-text-muted">esc</kbd>
          </div>

          {/* Content */}
          <div ref={listRef} className="max-h-[300px] overflow-y-auto p-1">
            {/* AI generating state */}
            {aiGenerating && (
              <div className="flex items-center gap-2 px-2 py-3 border-b border-border mb-1">
                <SpinnerGap size={14} className="text-accent animate-spin" />
                <span className="text-xs text-text-muted">{aiStatus || "Generating..."}</span>
              </div>
            )}

            {/* Commands */}
            {!aiGenerating && filteredCommands.length > 0 && (
              filteredCommands.map((cmd, idx) => {
                const Icon = COMMAND_ICONS[cmd.icon] ?? Cube;
                const isDisabled = cmd.enabled && !cmd.enabled();
                const isSelected = idx === selectedIndex;

                return (
                  <button
                    key={cmd.id}
                    data-selected={isSelected}
                    disabled={isDisabled}
                    onClick={() => executeCommand(cmd)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors",
                      isSelected && !isDisabled && "bg-accent/20",
                      isDisabled && "opacity-40 cursor-not-allowed",
                      !isSelected && !isDisabled && "hover:bg-border/30",
                    )}
                  >
                    <Icon size={14} className="shrink-0 text-text-muted" />
                    <span className="flex-1">{highlightMatch(cmd.label, query)}</span>
                    {cmd.shortcut && (
                      <kbd className="bg-border/50 px-1 py-0.5 text-[9px] text-text-muted">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })
            )}

            {/* AI generation option */}
            {!aiGenerating && showAIOption && (
              <>
                {filteredCommands.length > 0 && (
                  <div className="border-t border-border my-1" />
                )}
                <button
                  onClick={() => handleAIGenerate(aiPrompt)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors",
                    filteredCommands.length === 0 ? "bg-accent/20" : "hover:bg-border/30",
                  )}
                >
                  <Sparkle size={14} className="shrink-0 text-accent" />
                  <span className="flex-1">
                    Generate: <span className="text-accent">{aiPrompt}</span>
                  </span>
                  <kbd className="bg-border/50 px-1 py-0.5 text-[9px] text-text-muted">
                    server
                  </kbd>
                </button>
              </>
            )}

            {/* Empty state */}
            {!aiGenerating && filteredCommands.length === 0 && !showAIOption && (
              <div className="px-2 py-4 text-center text-xs text-text-muted">
                Type to search commands or describe what to create
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
    <AuthModal open={showAuth} onOpenChange={setShowAuth} feature={feature} />
  </>
  );
}

function ToolbarButton({
  children,
  active,
  disabled,
  onClick,
  tooltip,
  pulse,
  expanded,
  label,
  shortcut,
  iconColor,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  tooltip: string;
  pulse?: boolean;
  expanded?: boolean;
  label?: string;
  shortcut?: string;
  iconColor?: string;
}) {
  return (
    <Tooltip content={tooltip} side="top">
      <button
        className={cn(
          "flex items-center justify-center relative gap-1",
          "h-10 min-w-[40px] px-1.5",
          "sm:h-8 sm:min-w-0",
          expanded ? "sm:px-2" : "sm:px-1.5",
          "disabled:opacity-30 disabled:cursor-not-allowed",
                    pulse && "animate-pulse",
        )}
        disabled={disabled}
        onClick={onClick}
      >
        <span className={cn(
          iconColor,
          "transition-transform",
          active && "scale-110",
          !disabled && "hover:scale-110"
        )}>
          {children}
        </span>
        {expanded && label && (
          <span className={cn(
            "hidden sm:inline text-xs whitespace-nowrap",
            active ? "text-text" : "text-text-muted"
          )}>
            {label}
            {shortcut && <span className="ml-1 opacity-60">{shortcut}</span>}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

function TabDropdown({
  id,
  label,
  icon: Icon,
  index,
  children,
  onSelect,
}: {
  id: ToolbarTab;
  label: string;
  icon: typeof Cube;
  index: number;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleMouseEnter = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    setOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!pinned) {
      hoverTimeoutRef.current = setTimeout(() => setOpen(false), 100);
    }
  }, [pinned]);

  const handleClick = useCallback(() => {
    setPinned((p) => !p);
    setOpen(true);
    onSelect();
  }, [onSelect]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) setPinned(false);
  }, []);

  // Track mobile state for tooltip visibility
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => {
      mq.removeEventListener("change", handler);
      clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const triggerButton = (
    <button
      className={cn(
        "relative flex items-center justify-center gap-1 text-xs",
        "w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2",
        "hover:bg-hover/50 transition-all",
        pinned && "bg-hover/50",
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Icon
        size={18}
        weight={pinned ? "fill" : "regular"}
        className={cn(
          TAB_COLORS[id],
          "transition-transform"
        )}
      />
      <span className={cn(
        "hidden sm:inline font-medium transition-colors",
        pinned ? "text-text" : "text-text-muted"
      )}>
        {label}
      </span>
    </button>
  );

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      {isMobile ? (
        <Tooltip content={`${index + 1}. ${label}`} side="top">
          <Popover.Trigger asChild>{triggerButton}</Popover.Trigger>
        </Tooltip>
      ) : (
        <Popover.Trigger asChild>{triggerButton}</Popover.Trigger>
      )}
      <Popover.Portal>
        <Popover.Content
          className="bottom-toolbar-menu z-50 bg-surface p-2"
          sideOffset={4}
          side="top"
          align="center"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-center gap-1">
            {children}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MoreDropdown({
  tabs,
  activeTab,
  onSelect,
  children,
}: {
  tabs: typeof ALL_TABS;
  activeTab: ToolbarTab;
  onSelect: (tab: ToolbarTab) => void;
  children: (tab: ToolbarTab) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [selectedSubTab, setSelectedSubTab] = useState<ToolbarTab | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleMouseEnter = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    setOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!pinned) {
      hoverTimeoutRef.current = setTimeout(() => setOpen(false), 100);
    }
  }, [pinned]);

  const handleClick = useCallback(() => {
    setPinned((p) => !p);
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) setPinned(false);
  }, []);

  // Track mobile state for tooltip visibility
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => {
      mq.removeEventListener("change", handler);
      clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // Check if the active tab is in the "More" section
  const isMoreTabActive = tabs.some(t => t.id === activeTab);
  const activeMoreTab = tabs.find(t => t.id === activeTab);

  const triggerButton = (
    <button
      className={cn(
        "relative flex items-center justify-center gap-1 text-xs",
        "w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2",
        "hover:bg-hover/50 transition-all",
        pinned && "bg-hover/50",
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {pinned && activeMoreTab ? (
        <activeMoreTab.icon
          size={18}
          weight="fill"
          className={TAB_COLORS[activeMoreTab.id]}
        />
      ) : (
        <DotsThree size={18} weight={pinned ? "fill" : "bold"} className="text-text-muted" />
      )}
      <span className={cn(
        "hidden sm:inline font-medium transition-colors",
        pinned ? "text-text" : "text-text-muted"
      )}>
        {pinned && activeMoreTab ? activeMoreTab.label : "More"}
      </span>
    </button>
  );

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      {isMobile ? (
        <Tooltip content="More" side="top">
          <Popover.Trigger asChild>{triggerButton}</Popover.Trigger>
        </Tooltip>
      ) : (
        <Popover.Trigger asChild>{triggerButton}</Popover.Trigger>
      )}
      <Popover.Portal>
        <Popover.Content
          className="bottom-toolbar-menu z-50 bg-surface p-2"
          sideOffset={4}
          side="top"
          align="center"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Tab selector row */}
          <div className="flex items-center gap-1 border-b border-border pb-2 mb-2">
            {tabs.map((tab) => {
              const isActive = selectedSubTab === tab.id || (!selectedSubTab && activeTab === tab.id);
              const tabButton = (
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1.5 text-xs",
                    "hover:bg-hover transition-colors",
                    isActive && "bg-hover/50",
                  )}
                  onClick={() => {
                    setSelectedSubTab(tab.id);
                    onSelect(tab.id);
                  }}
                >
                  <tab.icon
                    size={14}
                    weight={isActive ? "fill" : "regular"}
                    className={TAB_COLORS[tab.id]}
                  />
                  <span className={cn(
                    "hidden sm:inline",
                    isActive ? "text-text" : "text-text-muted"
                  )}>
                    {tab.label}
                  </span>
                </button>
              );
              return isMobile ? (
                <Tooltip key={tab.id} content={tab.label} side="top">
                  {tabButton}
                </Tooltip>
              ) : (
                <span key={tab.id}>{tabButton}</span>
              );
            })}
          </div>
          {/* Tools for selected tab */}
          <div className="flex items-center gap-1">
            {children(selectedSubTab || (isMoreTabActive ? activeTab : tabs[0]!.id))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function BottomToolbar() {
  const addPrimitive = useDocumentStore((s) => s.addPrimitive);
  const applyBoolean = useDocumentStore((s) => s.applyBoolean);
  const createPartDef = useDocumentStore((s) => s.createPartDef);
  const document = useDocumentStore((s) => s.document);

  const select = useUiStore((s) => s.select);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const transformMode = useUiStore((s) => s.transformMode);
  const setTransformMode = useUiStore((s) => s.setTransformMode);
  const toolbarExpanded = useUiStore((s) => s.toolbarExpanded);
  const toolbarTab = useUiStore((s) => s.toolbarTab);
  const setToolbarTab = useUiStore((s) => s.setToolbarTab);
  const isOrbiting = useUiStore((s) => s.isOrbiting);

  const enterSketchMode = useSketchStore((s) => s.enterSketchMode);
  const enterFaceSelectionMode = useSketchStore((s) => s.enterFaceSelectionMode);
  const sketchActive = useSketchStore((s) => s.active);
  const faceSelectionMode = useSketchStore((s) => s.faceSelectionMode);
  const parts = useDocumentStore((s) => s.parts);

  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [jointDialogOpen, setJointDialogOpen] = useState(false);
  const [filletDialogOpen, setFilletDialogOpen] = useState(false);
  const [chamferDialogOpen, setChamferDialogOpen] = useState(false);
  const [shellDialogOpen, setShellDialogOpen] = useState(false);
  const [patternDialogOpen, setPatternDialogOpen] = useState(false);
  const [mirrorDialogOpen, setMirrorDialogOpen] = useState(false);

  // Responsive toolbar - track how many tabs fit
  const [visibleTabCount, setVisibleTabCount] = useState(ALL_TABS.length);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Calculate visible tabs based on viewport width
  useEffect(() => {
    function calculateVisibleTabs() {
      const viewportWidth = window.innerWidth;
      const isMobile = viewportWidth < MOBILE_BREAKPOINT;
      const tabWidth = isMobile ? TAB_WIDTH_MOBILE : TAB_WIDTH_DESKTOP;

      // On mobile, be more aggressive - less padding, smaller tabs
      const padding = isMobile ? 24 : 40;
      const availableWidth = viewportWidth - padding;

      // Width needed for Chat + More buttons
      const fixedWidth = CHAT_WIDTH + MORE_WIDTH;
      // Remaining width for tabs
      const tabsWidth = availableWidth - fixedWidth;
      // How many tabs can fit
      const maxTabs = Math.max(MIN_VISIBLE_TABS, Math.floor(tabsWidth / tabWidth));
      setVisibleTabCount(Math.min(maxTabs, ALL_TABS.length));
    }

    calculateVisibleTabs();
    window.addEventListener("resize", calculateVisibleTabs);
    return () => window.removeEventListener("resize", calculateVisibleTabs);
  }, []);

  // Split tabs into visible and overflow
  const visibleTabs = ALL_TABS.slice(0, visibleTabCount);
  const overflowTabs = ALL_TABS.slice(visibleTabCount);

  // displayedTab is just toolbarTab (no more hover preview)
  const displayedTab = toolbarTab;

  // Drawing view state
  const viewMode = useDrawingStore((s) => s.viewMode);
  const setViewMode = useDrawingStore((s) => s.setViewMode);

  // Engine state
  const scene = useEngineStore((s) => s.scene);

  // Simulation state
  const simMode = useSimulationStore((s) => s.mode);
  const physicsAvailable = useSimulationStore((s) => s.physicsAvailable);
  const playbackSpeed = useSimulationStore((s) => s.playbackSpeed);
  const playSim = useSimulationStore((s) => s.play);
  const pauseSim = useSimulationStore((s) => s.pause);
  const stopSim = useSimulationStore((s) => s.stop);
  const stepSim = useSimulationStore((s) => s.step);
  const setPlaybackSpeed = useSimulationStore((s) => s.setPlaybackSpeed);

  // Guided flow state
  const guidedFlowActive = useOnboardingStore((s) => s.guidedFlowActive);
  const guidedFlowStep = useOnboardingStore((s) => s.guidedFlowStep);
  const advanceGuidedFlow = useOnboardingStore((s) => s.advanceGuidedFlow);

  // Helper to check if a button should pulse during guided flow
  function shouldPulse(
    forStep: GuidedFlowStep,
    extraCondition: boolean = true
  ): boolean {
    return guidedFlowActive && guidedFlowStep === forStep && extraCondition;
  }

  // Listen for insert-instance event from command palette
  useEffect(() => {
    function handleInsertInstance() {
      setInsertDialogOpen(true);
    }
    window.addEventListener("vcad:insert-instance", handleInsertInstance);
    return () =>
      window.removeEventListener("vcad:insert-instance", handleInsertInstance);
  }, []);

  const hasSelection = selectedPartIds.size > 0;
  const hasTwoSelected = selectedPartIds.size === 2;

  // Assembly mode detection
  const hasPartDefs = document.partDefs && Object.keys(document.partDefs).length > 0;
  const hasInstances = document.instances && document.instances.length > 0;
  const isAssemblyMode = hasPartDefs || hasInstances;
  const hasJoints = document.joints && document.joints.length > 0;

  // Check if we have one part selected (for create part def)
  const hasOnePartSelected =
    selectedPartIds.size === 1 && parts.some((p) => selectedPartIds.has(p.id));

  // Check if we have two instances selected (for add joint)
  const selectedInstanceIds = Array.from(selectedPartIds).filter((id) =>
    document.instances?.some((i) => i.id === id)
  );
  const hasTwoInstancesSelected = selectedInstanceIds.length === 2;

  // Check if an instance is selected (for assembly tab auto-switch)
  const hasInstanceSelected = Array.from(selectedPartIds).some((id) =>
    document.instances?.some((i) => i.id === id)
  );

  // Get the single selected part ID (for modify operations)
  const selectedPartId = hasOnePartSelected
    ? Array.from(selectedPartIds).find((id) => parts.some((p) => p.id === id))
    : null;

  // Listen for modify operation events from command palette
  useEffect(() => {
    function handleFillet() {
      if (selectedPartId) setFilletDialogOpen(true);
    }
    function handleChamfer() {
      if (selectedPartId) setChamferDialogOpen(true);
    }
    function handleShell() {
      if (selectedPartId) setShellDialogOpen(true);
    }
    function handlePattern() {
      if (selectedPartId) setPatternDialogOpen(true);
    }
    function handleMirror() {
      if (selectedPartId) setMirrorDialogOpen(true);
    }
    window.addEventListener("vcad:apply-fillet", handleFillet);
    window.addEventListener("vcad:apply-chamfer", handleChamfer);
    window.addEventListener("vcad:apply-shell", handleShell);
    window.addEventListener("vcad:apply-pattern", handlePattern);
    window.addEventListener("vcad:apply-mirror", handleMirror);
    return () => {
      window.removeEventListener("vcad:apply-fillet", handleFillet);
      window.removeEventListener("vcad:apply-chamfer", handleChamfer);
      window.removeEventListener("vcad:apply-shell", handleShell);
      window.removeEventListener("vcad:apply-pattern", handlePattern);
      window.removeEventListener("vcad:apply-mirror", handleMirror);
    };
  }, [selectedPartId]);

  // Track manual tab clicks to temporarily disable auto-switch
  const manualOverrideRef = useRef(false);
  const manualOverrideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabClick = useCallback((tab: ToolbarTab) => {
    // Set manual override for 2 seconds
    manualOverrideRef.current = true;
    if (manualOverrideTimeout.current) {
      clearTimeout(manualOverrideTimeout.current);
    }
    manualOverrideTimeout.current = setTimeout(() => {
      manualOverrideRef.current = false;
    }, 2000);
    setToolbarTab(tab);
  }, [setToolbarTab]);

  // Keyboard shortcuts: 1-8 to switch tabs
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Don't trigger with modifier keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tabIndex = parseInt(e.key) - 1;
      if (tabIndex >= 0 && tabIndex < ALL_TABS.length) {
        handleTabClick(ALL_TABS[tabIndex]!.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTabClick]);

  // Auto-switch tabs based on context
  const autoSwitchTab = useCallback(() => {
    // Don't auto-switch during guided flow or if user manually changed tabs recently
    if (guidedFlowActive || manualOverrideRef.current) return;

    // Switch to build tab when entering 2D mode
    if (viewMode === "2d") {
      setToolbarTab("build");
      return;
    }

    // Switch to assembly tab when instance is selected
    if (hasInstanceSelected && isAssemblyMode) {
      setToolbarTab("assembly");
      return;
    }

    // Switch to combine tab when exactly 2 parts selected
    if (hasTwoSelected) {
      setToolbarTab("combine");
      return;
    }

    // Switch to transform tab when 1+ parts selected
    if (hasSelection) {
      setToolbarTab("transform");
      return;
    }

    // Default to create when nothing selected
    if (!hasSelection && toolbarTab !== "modify" && toolbarTab !== "simulate" && toolbarTab !== "build") {
      setToolbarTab("create");
    }
  }, [
    guidedFlowActive,
    viewMode,
    hasInstanceSelected,
    isAssemblyMode,
    hasTwoSelected,
    hasSelection,
    toolbarTab,
    setToolbarTab,
  ]);

  // Run auto-switch on relevant state changes
  useEffect(() => {
    autoSwitchTab();
  }, [selectedPartIds.size, viewMode, hasInstanceSelected, autoSwitchTab]);

  function handleAddPrimitive(kind: PrimitiveKind) {
    const partId = addPrimitive(kind);
    select(partId);
    setTransformMode("translate");

    // Advance guided flow if applicable
    if (guidedFlowActive) {
      if (guidedFlowStep === "add-cube" && kind === "cube") {
        advanceGuidedFlow();
      } else if (guidedFlowStep === "add-cylinder" && kind === "cylinder") {
        advanceGuidedFlow();
      }
    }
  }

  function handleBoolean(type: BooleanType) {
    if (!hasTwoSelected) return;
    const ids = Array.from(selectedPartIds);
    const newId = applyBoolean(type, ids[0]!, ids[1]!);
    if (newId) select(newId);

    // Advance guided flow if subtracting during tutorial
    if (guidedFlowActive && guidedFlowStep === "subtract" && type === "difference") {
      advanceGuidedFlow();
    }
  }

  function handleCreatePartDef() {
    if (!hasOnePartSelected) return;
    const partId = Array.from(selectedPartIds)[0]!;
    const partDefId = createPartDef(partId);
    if (partDefId) {
      // Select the newly created instance
      const instance = document.instances?.find((i) => i.partDefId === partDefId);
      if (instance) {
        select(instance.id);
      }
    }
  }

  // Render tab content based on specified tab (or displayed tab if not specified)
  const renderTabContent = (tab?: ToolbarTab) => {
    const targetTab = tab ?? displayedTab;
    const color = TAB_COLORS[targetTab];

    switch (targetTab) {
      case "create":
        return (
          <>
            {PRIMITIVES.map(({ kind, icon: Icon, label }) => (
              <ToolbarButton
                key={kind}
                tooltip={`Add ${label}`}
                disabled={sketchActive}
                onClick={() => handleAddPrimitive(kind)}
                pulse={
                  (kind === "cube" && shouldPulse("add-cube")) ||
                  (kind === "cylinder" && shouldPulse("add-cylinder"))
                }
                expanded={toolbarExpanded}
                label={label}
                iconColor={color}
              >
                <Icon size={20} />
              </ToolbarButton>
            ))}
            <ToolbarButton
              tooltip="New Sketch (S)"
              active={faceSelectionMode}
              disabled={sketchActive}
              onClick={() => {
                if (parts.length > 0) {
                  enterFaceSelectionMode();
                } else {
                  enterSketchMode("XY");
                }
              }}
              expanded={toolbarExpanded}
              label="Sketch"
              shortcut="S"
              iconColor={color}
            >
              <PencilSimple size={20} />
            </ToolbarButton>
          </>
        );

      case "transform":
        return (
          <>
            <ToolbarButton
              tooltip={!hasSelection ? "Move (select a part)" : "Move (M)"}
              active={hasSelection && transformMode === "translate"}
              disabled={!hasSelection || viewMode === "2d"}
              onClick={() => setTransformMode("translate")}
              expanded={toolbarExpanded}
              label="Move"
              shortcut="M"
              iconColor={color}
            >
              <ArrowsOutCardinal size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasSelection ? "Rotate (select a part)" : "Rotate (R)"}
              active={hasSelection && transformMode === "rotate"}
              disabled={!hasSelection || viewMode === "2d"}
              onClick={() => setTransformMode("rotate")}
              expanded={toolbarExpanded}
              label="Rotate"
              shortcut="R"
              iconColor={color}
            >
              <ArrowsClockwise size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasSelection ? "Scale (select a part)" : "Scale (S)"}
              active={hasSelection && transformMode === "scale"}
              disabled={!hasSelection || viewMode === "2d"}
              onClick={() => setTransformMode("scale")}
              expanded={toolbarExpanded}
              label="Scale"
              shortcut="S"
              iconColor={color}
            >
              <ArrowsOut size={20} />
            </ToolbarButton>
          </>
        );

      case "combine":
        return (
          <>
            {BOOLEANS.map(({ type, icon: Icon, label, shortcut }) => (
              <ToolbarButton
                key={type}
                tooltip={!hasTwoSelected ? `${label} (select 2 parts)` : `${label} (${shortcut})`}
                disabled={!hasTwoSelected}
                onClick={() => handleBoolean(type)}
                pulse={type === "difference" && shouldPulse("subtract")}
                expanded={toolbarExpanded}
                label={label}
                shortcut={shortcut}
                iconColor={color}
              >
                <Icon size={20} />
              </ToolbarButton>
            ))}
          </>
        );

      case "modify":
        return (
          <>
            <ToolbarButton
              tooltip={!hasOnePartSelected ? "Fillet (select a part)" : "Fillet"}
              disabled={!hasOnePartSelected || sketchActive}
              onClick={() => setFilletDialogOpen(true)}
              expanded={toolbarExpanded}
              label="Fillet"
              iconColor={color}
            >
              <Circle size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasOnePartSelected ? "Chamfer (select a part)" : "Chamfer"}
              disabled={!hasOnePartSelected || sketchActive}
              onClick={() => setChamferDialogOpen(true)}
              expanded={toolbarExpanded}
              label="Chamfer"
              iconColor={color}
            >
              <Octagon size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasOnePartSelected ? "Shell (select a part)" : "Shell"}
              disabled={!hasOnePartSelected || sketchActive}
              onClick={() => setShellDialogOpen(true)}
              expanded={toolbarExpanded}
              label="Shell"
              iconColor={color}
            >
              <CubeTransparent size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasOnePartSelected ? "Pattern (select a part)" : "Pattern"}
              disabled={!hasOnePartSelected || sketchActive}
              onClick={() => setPatternDialogOpen(true)}
              expanded={toolbarExpanded}
              label="Pattern"
              iconColor={color}
            >
              <DotsThree size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasOnePartSelected ? "Mirror (select a part)" : "Mirror"}
              disabled={!hasOnePartSelected || sketchActive}
              onClick={() => setMirrorDialogOpen(true)}
              expanded={toolbarExpanded}
              label="Mirror"
              iconColor={color}
            >
              <ArrowsHorizontal size={20} />
            </ToolbarButton>
          </>
        );

      case "assembly":
        return (
          <>
            <ToolbarButton
              tooltip={!hasOnePartSelected ? "Create Part Definition (select a part)" : "Create Part Definition"}
              disabled={!hasOnePartSelected || sketchActive}
              onClick={handleCreatePartDef}
              expanded={toolbarExpanded}
              label="Create Part"
              iconColor={color}
            >
              <Package size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasPartDefs ? "Insert Instance (create a part def first)" : "Insert Instance"}
              disabled={!hasPartDefs || sketchActive}
              onClick={() => setInsertDialogOpen(true)}
              expanded={toolbarExpanded}
              label="Insert"
              iconColor={color}
            >
              <PlusSquare size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasTwoInstancesSelected ? "Add Joint (select 2 instances)" : "Add Joint"}
              disabled={!hasTwoInstancesSelected || sketchActive}
              onClick={() => setJointDialogOpen(true)}
              expanded={toolbarExpanded}
              label="Joint"
              iconColor={color}
            >
              <LinkSimple size={20} />
            </ToolbarButton>
          </>
        );

      case "simulate":
        return (
          <>
            <ToolbarButton
              tooltip={
                !hasJoints
                  ? "Play (add joints to simulate)"
                  : simMode === "running"
                  ? "Pause Simulation"
                  : "Play Simulation"
              }
              active={simMode === "running"}
              disabled={!hasJoints || !physicsAvailable || sketchActive}
              onClick={() => {
                if (simMode === "running") {
                  pauseSim();
                } else {
                  playSim();
                }
              }}
              expanded={toolbarExpanded}
              label={simMode === "running" ? "Pause" : "Play"}
              iconColor={color}
            >
              {simMode === "running" ? <Pause size={20} /> : <Play size={20} />}
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasJoints ? "Stop (add joints to simulate)" : "Stop Simulation"}
              disabled={!hasJoints || simMode === "off" || sketchActive}
              onClick={stopSim}
              expanded={toolbarExpanded}
              label="Stop"
              iconColor={color}
            >
              <Stop size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!hasJoints ? "Step (add joints to simulate)" : "Step Simulation"}
              disabled={!hasJoints || simMode === "running" || !physicsAvailable || sketchActive}
              onClick={stepSim}
              expanded={toolbarExpanded}
              label="Step"
              iconColor={color}
            >
              <FastForward size={20} />
            </ToolbarButton>
            <div className="flex items-center gap-0.5 px-1">
              <span className="text-xs text-text-muted">{playbackSpeed.toFixed(1)}x</span>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="w-16 h-1 accent-accent"
                title="Playback Speed"
                disabled={!hasJoints}
              />
            </div>
          </>
        );

      case "build":
        return (
          <>
            <ToolbarButton
              tooltip="3D View"
              active={viewMode === "3d"}
              onClick={() => setViewMode("3d")}
              expanded={toolbarExpanded}
              label="3D"
              iconColor={color}
            >
              <Cube3D size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip="2D Drawing View"
              active={viewMode === "2d"}
              onClick={() => setViewMode("2d")}
              expanded={toolbarExpanded}
              label="2D"
              iconColor={color}
            >
              <Blueprint size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!scene?.parts?.length ? "Export STL (add geometry first)" : "Export STL"}
              disabled={!scene?.parts?.length}
              onClick={() => {
                if (scene) {
                  const blob = exportStlBlob(scene);
                  downloadBlob(blob, "model.stl");
                  useNotificationStore.getState().addToast("Exported model.stl", "success");
                }
              }}
              expanded={toolbarExpanded}
              label="STL"
              iconColor={color}
            >
              <Download size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!scene?.parts?.length ? "Export GLB (add geometry first)" : "Export GLB"}
              disabled={!scene?.parts?.length}
              onClick={() => {
                if (scene) {
                  const blob = exportGltfBlob(scene);
                  downloadBlob(blob, "model.glb");
                  useNotificationStore.getState().addToast("Exported model.glb", "success");
                }
              }}
              expanded={toolbarExpanded}
              label="GLB"
              iconColor={color}
            >
              <Download size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!scene?.parts?.length ? "Export STEP (add geometry first)" : "Export STEP"}
              disabled={!scene?.parts?.length}
              onClick={() => {
                if (scene) {
                  try {
                    const blob = exportStepBlob(scene);
                    downloadBlob(blob, "model.step");
                    useNotificationStore.getState().addToast("Exported model.step", "success");
                  } catch (e) {
                    useNotificationStore.getState().addToast(
                      e instanceof Error ? e.message : "STEP export failed",
                      "error"
                    );
                  }
                }
              }}
              expanded={toolbarExpanded}
              label="STEP"
              iconColor={color}
            >
              <Download size={20} />
            </ToolbarButton>
            <ToolbarButton
              tooltip={!scene?.parts?.length ? "Print (add geometry first)" : "Open Print Settings"}
              disabled={!scene?.parts?.length || sketchActive}
              onClick={() => {
                useSlicerStore.getState().openPrintPanel();
              }}
              expanded={toolbarExpanded}
              label="Print"
              iconColor={color}
            >
              <Printer size={20} />
            </ToolbarButton>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <InsertInstanceDialog
        open={insertDialogOpen}
        onOpenChange={setInsertDialogOpen}
      />
      <AddJointDialog open={jointDialogOpen} onOpenChange={setJointDialogOpen} />
      {selectedPartId && (
        <>
          <FilletChamferDialog
            open={filletDialogOpen}
            onOpenChange={setFilletDialogOpen}
            mode="fillet"
            partId={selectedPartId}
          />
          <FilletChamferDialog
            open={chamferDialogOpen}
            onOpenChange={setChamferDialogOpen}
            mode="chamfer"
            partId={selectedPartId}
          />
          <ShellDialog
            open={shellDialogOpen}
            onOpenChange={setShellDialogOpen}
            partId={selectedPartId}
          />
          <PatternDialog
            open={patternDialogOpen}
            onOpenChange={setPatternDialogOpen}
            partId={selectedPartId}
          />
          <MirrorDialog
            open={mirrorDialogOpen}
            onOpenChange={setMirrorDialogOpen}
            partId={selectedPartId}
          />
        </>
      )}
      {/* Bottom toolbar */}
      <div
        ref={toolbarRef}
        className={cn(
          "bottom-toolbar",
          "fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
          "flex items-center gap-0.5 pointer-events-auto",
          "bg-surface/95 backdrop-blur-sm",
          "transition-all duration-200",
          isOrbiting && "opacity-0 pointer-events-none"
        )}
      >
        {/* Command palette dropdown */}
        <CommandDropdown />

        {/* Visible tabs as dropdowns */}
        {visibleTabs.map(({ id, label, icon }, index) => (
          <TabDropdown
            key={id}
            id={id}
            label={label}
            icon={icon}
            index={index}
            onSelect={() => handleTabClick(id)}
          >
            {renderTabContent(id)}
          </TabDropdown>
        ))}

        {/* "More" dropdown for overflow tabs */}
        {overflowTabs.length > 0 && (
          <MoreDropdown
            tabs={overflowTabs}
            activeTab={toolbarTab}
            onSelect={handleTabClick}
          >
            {(tab) => renderTabContent(tab)}
          </MoreDropdown>
        )}
      </div>
    </>
  );
}
