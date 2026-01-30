import { useState } from "react";
import {
  Sun,
  Moon,
  Desktop,
  Command,
  DotsThree,
  List,
  CubeTransparent,
  GridFour,
  Export,
  Info,
  Keyboard,
  BookOpen,
  Cube,
  ArrowsOutCardinal,
} from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@/components/ui/tooltip";
import {
  useDocumentStore,
  useUiStore,
  useEngineStore,
  exportStlBlob,
  exportGltfBlob,
} from "@vcad/core";
import { downloadBlob } from "@/lib/download";
import { useToastStore } from "@/stores/toast-store";
import { FloppyDisk, FolderOpen } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { examples } from "@/data/examples";

interface CornerIconsProps {
  onAboutOpen: () => void;
  onSave: () => void;
  onOpen: () => void;
}

function IconButton({
  children,
  onClick,
  tooltip,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tooltip: string;
  active?: boolean;
}) {
  return (
    <Tooltip content={tooltip}>
      <button
        className={cn(
          "flex h-8 w-8 items-center justify-center",
          "text-text-muted/70 hover:text-text hover:bg-hover",
          active && "text-accent",
        )}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ViewButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-10 items-center justify-center text-[10px] font-medium text-text hover:bg-hover border border-border"
    >
      {children}
    </button>
  );
}

function ExportButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 flex-1 items-center justify-center gap-1.5 text-xs font-medium text-text hover:bg-hover border border-border disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function SettingsMenu({ onAboutOpen }: { onAboutOpen: () => void }) {
  const [showAllExamples, setShowAllExamples] = useState(false);

  const showWireframe = useUiStore((s) => s.showWireframe);
  const toggleWireframe = useUiStore((s) => s.toggleWireframe);
  const gridSnap = useUiStore((s) => s.gridSnap);
  const toggleGridSnap = useUiStore((s) => s.toggleGridSnap);
  const snapIncrement = useUiStore((s) => s.snapIncrement);
  const setSnapIncrement = useUiStore((s) => s.setSnapIncrement);

  const scene = useEngineStore((s) => s.scene);
  const parts = useDocumentStore((s) => s.parts);
  const hasParts = parts.length > 0;

  // Featured examples shown by default
  const featuredExamples = examples.slice(0, 3);
  const remainingExamples = examples.slice(3);
  const displayedExamples = showAllExamples ? examples : featuredExamples;

  function handleLoadExample(exampleId: string) {
    const example = examples.find((e) => e.id === exampleId);
    if (example) {
      window.dispatchEvent(
        new CustomEvent("vcad:load-example", { detail: { file: example.file } }),
      );
    }
  }

  function handleExportStl() {
    if (!scene) return;
    const blob = exportStlBlob(scene);
    downloadBlob(blob, "model.stl");
    useToastStore.getState().addToast("Exported model.stl", "success");
  }

  function handleExportGlb() {
    if (!scene) return;
    const blob = exportGltfBlob(scene);
    downloadBlob(blob, "model.glb");
    useToastStore.getState().addToast("Exported model.glb", "success");
  }

  function handleCameraPreset(preset: string) {
    window.dispatchEvent(new CustomEvent(`vcad:camera-${preset}`));
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "flex h-8 w-8 items-center justify-center",
            "text-text-muted/70 hover:text-text hover:bg-hover",
          )}
        >
          <DotsThree size={20} weight="bold" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-56 border border-border bg-surface p-2 shadow-xl"
          sideOffset={8}
          align="end"
        >
          {/* Examples Section */}
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Try an Example
          </div>
          <div className="flex flex-wrap gap-1 px-1 py-1">
            {displayedExamples.map((example) => (
              <button
                key={example.id}
                onClick={() => handleLoadExample(example.id)}
                className="px-2 py-1 text-xs text-text hover:bg-hover border border-border"
              >
                {example.name}
              </button>
            ))}
          </div>
          {!showAllExamples && remainingExamples.length > 0 && (
            <button
              onClick={() => setShowAllExamples(true)}
              className="w-full px-2 py-1 text-[10px] text-text-muted hover:text-text"
            >
              + {remainingExamples.length} more...
            </button>
          )}

          {/* Divider */}
          <div className="my-2 border-t border-border" />

          {/* View Section */}
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            View
          </div>
          <div className="flex gap-1 px-1 py-1">
            <ViewButton
              onClick={() => handleCameraPreset("isometric")}
              title="Isometric view"
            >
              <Cube size={14} />
            </ViewButton>
            <ViewButton
              onClick={() => handleCameraPreset("fit")}
              title="Fit all in view"
            >
              <ArrowsOutCardinal size={14} />
            </ViewButton>
          </div>
          <div className="flex gap-1 px-1 py-1">
            <ViewButton
              onClick={() => handleCameraPreset("top")}
              title="Top view (looking down Z)"
            >
              Top
            </ViewButton>
            <ViewButton
              onClick={() => handleCameraPreset("front")}
              title="Front view (looking down Y)"
            >
              Front
            </ViewButton>
            <ViewButton
              onClick={() => handleCameraPreset("right")}
              title="Right view (looking down X)"
            >
              Right
            </ViewButton>
          </div>

          {/* Divider */}
          <div className="my-2 border-t border-border" />

          {/* Wireframe toggle */}
          <button
            onClick={toggleWireframe}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-hover"
          >
            <CubeTransparent
              size={14}
              className={showWireframe ? "text-accent" : ""}
            />
            <span>Wireframe</span>
            <span className="ml-auto text-text-muted">X</span>
          </button>

          {/* Grid Snap with submenu */}
          <Popover.Root>
            <Popover.Trigger asChild>
              <button className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-hover">
                <GridFour
                  size={14}
                  className={gridSnap ? "text-accent" : ""}
                />
                <span>Grid Snap</span>
                <span className="ml-auto text-text-muted">
                  {gridSnap ? `${snapIncrement}mm` : "Off"} &rsaquo;
                </span>
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-50 border border-border bg-surface p-1.5 shadow-xl"
                side="right"
                sideOffset={4}
                align="start"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={toggleGridSnap}
                    className="flex items-center gap-2 px-2 py-1 text-xs text-text hover:bg-hover"
                  >
                    <span className={!gridSnap ? "text-accent" : ""}>Off</span>
                  </button>
                  {[1, 2, 5, 10, 25, 50].map((v) => (
                    <button
                      key={v}
                      onClick={() => setSnapIncrement(v)}
                      className="flex items-center gap-2 px-2 py-1 text-xs text-text hover:bg-hover"
                    >
                      <span
                        className={
                          gridSnap && snapIncrement === v ? "text-accent" : ""
                        }
                      >
                        {v}mm
                      </span>
                    </button>
                  ))}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* Divider */}
          <div className="my-2 border-t border-border" />

          {/* Export Section */}
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Export
          </div>
          <div className="flex gap-1 px-1 py-1">
            <ExportButton onClick={handleExportStl} disabled={!hasParts}>
              <Export size={12} />
              STL
            </ExportButton>
            <ExportButton onClick={handleExportGlb} disabled={!hasParts}>
              <Export size={12} weight="fill" />
              GLB
            </ExportButton>
          </div>

          {/* Divider */}
          <div className="my-2 border-t border-border" />

          {/* Help Section */}
          <div className="flex gap-1 px-1 py-1">
            <button
              onClick={onAboutOpen}
              className="flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-text hover:bg-hover"
              title="Keyboard shortcuts"
            >
              <Keyboard size={14} />
              Shortcuts
            </button>
            <a
              href="https://docs.rs/vcad"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-text hover:bg-hover"
              title="Documentation"
            >
              <BookOpen size={14} />
              Docs
            </a>
          </div>
          <button
            onClick={onAboutOpen}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-text hover:bg-hover"
          >
            <Info size={14} />
            <span>About</span>
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function CornerIcons({ onAboutOpen, onSave, onOpen }: CornerIconsProps) {
  const isDirty = useDocumentStore((s) => s.isDirty);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);
  const toggleFeatureTree = useUiStore((s) => s.toggleFeatureTree);
  const featureTreeOpen = useUiStore((s) => s.featureTreeOpen);

  return (
    <>
      {/* Top-left: hamburger + logo */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <IconButton
          tooltip="Toggle sidebar (`)"
          onClick={toggleFeatureTree}
          active={featureTreeOpen}
        >
          <List size={20} />
        </IconButton>
        <div className="flex items-center gap-1 pl-1">
          <span className="text-sm font-bold tracking-tighter text-text">
            vcad<span className="text-accent">.</span>
          </span>
          {isDirty && <span className="text-accent text-xs">*</span>}
        </div>
      </div>

      {/* Top-right: file actions, utilities, settings */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1">
        {/* File actions */}
        <IconButton tooltip="Save (Cmd+S)" onClick={onSave}>
          <FloppyDisk size={18} />
        </IconButton>
        <IconButton tooltip="Open (Cmd+O)" onClick={onOpen}>
          <FolderOpen size={18} />
        </IconButton>

        <IconButton
          tooltip="Command palette (Cmd+K)"
          onClick={toggleCommandPalette}
        >
          <Command size={18} />
        </IconButton>
        <IconButton
          tooltip={
            theme === "system"
              ? "Theme: System (click for Light)"
              : theme === "light"
              ? "Theme: Light (click for Dark)"
              : "Theme: Dark (click for System)"
          }
          onClick={toggleTheme}
        >
          {theme === "system" ? (
            <Desktop size={18} />
          ) : theme === "light" ? (
            <Sun size={18} />
          ) : (
            <Moon size={18} />
          )}
        </IconButton>
        <SettingsMenu onAboutOpen={onAboutOpen} />
      </div>
    </>
  );
}
