import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastContainer } from "@/components/ui/toast";
import { AppShell } from "@/components/AppShell";
import { CornerIcons } from "@/components/CornerIcons";
import { BottomToolbar } from "@/components/BottomToolbar";
import { Viewport } from "@/components/Viewport";
import { FeatureTree } from "@/components/FeatureTree";
import { PropertyPanel } from "@/components/PropertyPanel";
import { InlineOnboarding } from "@/components/InlineOnboarding";
import { AboutModal } from "@/components/AboutModal";
import { CommandPalette } from "@/components/CommandPalette";
import { SketchToolbar } from "@/components/SketchToolbar";
import { FaceSelectionOverlay } from "@/components/FaceSelectionOverlay";
import {
  useSketchStore,
  useEngineStore,
  useDocumentStore,
  useUiStore,
  parseVcadFile,
} from "@vcad/core";
import { useEngine } from "@/hooks/useEngine";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { saveDocument } from "@/lib/save-load";
import { useToastStore } from "@/stores/toast-store";
import { useOnboardingStore } from "@/stores/onboarding-store";

function useThemeSync() {
  const theme = useUiStore((s) => s.theme);
  useLayoutEffect(() => {
    const applyTheme = (prefersDark: boolean) => {
      const effectiveTheme =
        theme === "system" ? (prefersDark ? "dark" : "light") : theme;
      document.documentElement.classList.toggle(
        "light",
        effectiveTheme === "light",
      );
    };

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(mq.matches);

    if (theme === "system") {
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);
}

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
  useThemeSync();

  const [aboutOpen, setAboutOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const engineReady = useEngineStore((s) => s.engineReady);
  const loading = useEngineStore((s) => s.loading);
  const error = useEngineStore((s) => s.error);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const hasParts = useDocumentStore((s) => s.parts.length > 0);
  const sketchActive = useSketchStore((s) => s.active);

  const welcomeModalDismissed = useOnboardingStore(
    (s) => s.welcomeModalDismissed,
  );

  const handleSave = useCallback(() => {
    const state = useDocumentStore.getState();
    saveDocument(state);
    useDocumentStore.getState().markSaved();
    useToastStore.getState().addToast("Document saved", "success");
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

  // Determine if inline onboarding should show
  const showOnboarding = !hasParts && !welcomeModalDismissed && !sketchActive;

  return (
    <TooltipProvider>
      <AppShell>
        {/* Full-bleed viewport */}
        <Viewport />
        <SketchToolbar />
        <FaceSelectionOverlay />

        {/* Inline onboarding (centered over viewport) */}
        <InlineOnboarding visible={showOnboarding} />

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
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onAboutOpen={() => setAboutOpen(true)}
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
