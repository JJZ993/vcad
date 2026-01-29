import { useState, useRef, useEffect, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastContainer } from "@/components/ui/toast";
import { AppShell } from "@/components/AppShell";
import { CornerIcons } from "@/components/CornerIcons";
import { BottomToolbar } from "@/components/BottomToolbar";
import { Viewport } from "@/components/Viewport";
import { FeatureTree } from "@/components/FeatureTree";
import { PropertyPanel } from "@/components/PropertyPanel";
import { WelcomeModal } from "@/components/WelcomeModal";
import { AboutModal } from "@/components/AboutModal";
import { CommandPalette } from "@/components/CommandPalette";
import { SketchCanvas } from "@/components/SketchCanvas";
import { SketchToolbar } from "@/components/SketchToolbar";
import { FaceSelectionOverlay } from "@/components/FaceSelectionOverlay";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useSketchStore, useEngineStore, useDocumentStore, useUiStore, parseVcadFile } from "@vcad/core";
import { useEngine } from "@/hooks/useEngine";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { saveDocument } from "@/lib/save-load";
import { useToastStore } from "@/stores/toast-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="text-sm text-text-muted">initializing engine...</div>
        <div className="h-0.5 w-32 overflow-hidden rounded bg-border">
          <div className="h-full w-1/3 animate-pulse rounded bg-accent" />
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
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const engineReady = useEngineStore((s) => s.engineReady);
  const loading = useEngineStore((s) => s.loading);
  const error = useEngineStore((s) => s.error);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const hasParts = useDocumentStore((s) => s.parts.length > 0);
  const sketchActive = useSketchStore((s) => s.active);
  const deleteConfirmParts = useUiStore((s) => s.deleteConfirmParts);
  const hideDeleteConfirm = useUiStore((s) => s.hideDeleteConfirm);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const parts = useDocumentStore((s) => s.parts);
  const removePart = useDocumentStore((s) => s.removePart);

  const welcomeModalDismissed = useOnboardingStore((s) => s.welcomeModalDismissed);

  // Close welcome modal when parts are added
  useEffect(() => {
    if (hasParts && welcomeOpen) {
      setWelcomeOpen(false);
    }
  }, [hasParts, welcomeOpen]);

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

  // Determine if welcome modal should show
  const showWelcomeModal = !hasParts && !welcomeModalDismissed && welcomeOpen && !sketchActive;

  return (
    <TooltipProvider>
      <AppShell>
        {/* Full-bleed viewport */}
        <Viewport />
        <SketchCanvas />
        <SketchToolbar />
        <FaceSelectionOverlay />

        {/* Floating UI elements */}
        <CornerIcons
          onAboutOpen={() => setAboutOpen(true)}
          onSave={handleSave}
          onOpen={handleOpen}
        />
        {!sketchActive && <FeatureTree />}
        {!sketchActive && <PropertyPanel />}
        {!sketchActive && <BottomToolbar />}
      </AppShell>

      {/* Modals */}
      <WelcomeModal open={showWelcomeModal} onOpenChange={setWelcomeOpen} />
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
