import { useState, useRef, useEffect, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastContainer } from "@/components/ui/toast";
import { Viewport } from "@/components/Viewport";
import { Toolbar } from "@/components/Toolbar";
import { FeatureTree } from "@/components/FeatureTree";
import { PropertyPanel } from "@/components/PropertyPanel";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { AboutModal } from "@/components/AboutModal";
import { CommandPalette } from "@/components/CommandPalette";
import { SketchCanvas } from "@/components/SketchCanvas";
import { SketchToolbar } from "@/components/SketchToolbar";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useSketchStore, useEngineStore, useDocumentStore, useUiStore, parseVcadFile } from "@vcad/core";
import { useEngine } from "@/hooks/useEngine";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { saveDocument } from "@/lib/save-load";
import { useToastStore } from "@/stores/toast-store";

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="text-sm text-text-muted">initializing engine...</div>
        <div className="h-0.5 w-32 overflow-hidden  bg-border">
          <div className="h-full w-1/3 animate-pulse  bg-accent" />
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-sm font-bold text-danger">engine error</div>
        <div className="max-w-md text-xs text-text-muted">{message}</div>
      </div>
    </div>
  );
}

export function App() {
  useEngine();
  useKeyboardShortcuts();

  const [aboutOpen, setAboutOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const engineReady = useEngineStore((s) => s.engineReady);
  const loading = useEngineStore((s) => s.loading);
  const error = useEngineStore((s) => s.error);
  const featureTreeOpen = useUiStore((s) => s.featureTreeOpen);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const hasSelection = useUiStore((s) => s.selectedPartIds.size > 0);
  const hasParts = useDocumentStore((s) => s.parts.length > 0);
  const sketchActive = useSketchStore((s) => s.active);
  const deleteConfirmParts = useUiStore((s) => s.deleteConfirmParts);
  const hideDeleteConfirm = useUiStore((s) => s.hideDeleteConfirm);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const parts = useDocumentStore((s) => s.parts);
  const removePart = useDocumentStore((s) => s.removePart);

  const handleSave = useCallback(() => {
    const state = useDocumentStore.getState();
    saveDocument(state);
    useDocumentStore.getState().markSaved();
    useToastStore.getState().addToast("Document saved", "success");
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirmParts) {
      for (const id of deleteConfirmParts) {
        removePart(id);
      }
      clearSelection();
      hideDeleteConfirm();
    }
  }, [deleteConfirmParts, removePart, clearSelection, hideDeleteConfirm]);

  // Get part names for the delete confirmation dialog
  const deleteConfirmPartNames = deleteConfirmParts
    ? deleteConfirmParts
        .map((id) => parts.find((p) => p.id === id)?.name ?? id)
    : [];

  const handleOpen = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const vcadFile = parseVcadFile(text);
          useDocumentStore.getState().loadDocument(vcadFile);
          useUiStore.getState().clearSelection();
        } catch (err) {
          console.error("Failed to load file:", err);
          useToastStore.getState().addToast("Failed to load document", "error");
        }
      };
      reader.readAsText(file);

      // Reset input so same file can be re-opened
      e.target.value = "";
    },
    [],
  );

  // Listen for save/open custom events from keyboard shortcuts
  useEffect(() => {
    const onSave = () => handleSave();
    const onOpen = () => handleOpen();
    window.addEventListener("vcad:save", onSave);
    window.addEventListener("vcad:open", onOpen);
    return () => {
      window.removeEventListener("vcad:save", onSave);
      window.removeEventListener("vcad:open", onOpen);
    };
  }, [handleSave, handleOpen]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useDocumentStore.getState().isDirty) {
        e.preventDefault();
        e.returnValue = true;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  if (error && !engineReady) return <ErrorScreen message={error} />;
  if (loading || !engineReady) return <LoadingScreen />;

  return (
    <TooltipProvider>
      <Viewport />
      <Toolbar
        onAboutOpen={() => setAboutOpen(true)}
        onSave={handleSave}
        onOpen={handleOpen}
      />
      {featureTreeOpen && !sketchActive && <FeatureTree />}
      {hasSelection && !sketchActive && <PropertyPanel />}
      {!hasParts && !sketchActive && <WelcomeScreen />}
      <SketchCanvas />
      <SketchToolbar />
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onAboutOpen={() => setAboutOpen(true)}
      />
      <DeleteConfirmDialog
        isOpen={deleteConfirmParts !== null}
        partNames={deleteConfirmPartNames}
        onConfirm={handleDeleteConfirm}
        onCancel={hideDeleteConfirm}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".vcad,.json"
        className="hidden"
        onChange={handleFileChange}
      />
      <ToastContainer />
    </TooltipProvider>
  );
}
