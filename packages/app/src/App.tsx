import { useState, useRef, useEffect, useCallback } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Viewport } from "@/components/Viewport";
import { Toolbar } from "@/components/Toolbar";
import { FeatureTree } from "@/components/FeatureTree";
import { PropertyPanel } from "@/components/PropertyPanel";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { AboutModal } from "@/components/AboutModal";
import { useEngine } from "@/hooks/useEngine";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useEngineStore } from "@/stores/engine-store";
import { useDocumentStore } from "@/stores/document-store";
import { useUiStore } from "@/stores/ui-store";
import { saveDocument, parseVcadFile } from "@/lib/save-load";

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="text-sm text-text-muted">initializing engine...</div>
        <div className="h-0.5 w-32 overflow-hidden rounded-full bg-border">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
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
  const hasSelection = useUiStore((s) => s.selectedPartIds.size > 0);
  const hasParts = useDocumentStore((s) => s.parts.length > 0);

  const handleSave = useCallback(() => {
    const state = useDocumentStore.getState();
    saveDocument(state);
  }, []);

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
      {featureTreeOpen && <FeatureTree />}
      {hasSelection && <PropertyPanel />}
      {!hasParts && <WelcomeScreen />}
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
      <input
        ref={fileInputRef}
        type="file"
        accept=".vcad,.json"
        className="hidden"
        onChange={handleFileChange}
      />
    </TooltipProvider>
  );
}
