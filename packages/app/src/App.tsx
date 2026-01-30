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
import { GuidedFlowOverlay } from "@/components/GuidedFlowOverlay";
import { GhostPromptController } from "@/components/GhostPromptController";
import { CelebrationOverlay } from "@/components/CelebrationOverlay";
import { AboutModal } from "@/components/AboutModal";
import { CommandPalette } from "@/components/CommandPalette";
import { SketchToolbar } from "@/components/SketchToolbar";
import { FaceSelectionOverlay } from "@/components/FaceSelectionOverlay";
import { QuotePanel } from "@/components/QuotePanel";
import {
  useSketchStore,
  useEngineStore,
  useDocumentStore,
  useUiStore,
  parseVcadFile,
  parseStl,
  type VcadFile,
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
  const [isDragging, setIsDragging] = useState(false);
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
  const guidedFlowActive = useOnboardingStore((s) => s.guidedFlowActive);
  const guidedFlowStep = useOnboardingStore((s) => s.guidedFlowStep);
  const advanceGuidedFlow = useOnboardingStore((s) => s.advanceGuidedFlow);
  const incrementSessions = useOnboardingStore((s) => s.incrementSessions);
  const parts = useDocumentStore((s) => s.parts);
  const selectMultiple = useUiStore((s) => s.selectMultiple);

  const handleSave = useCallback(() => {
    const state = useDocumentStore.getState();
    saveDocument(state);
    useDocumentStore.getState().markSaved();
    useToastStore.getState().addToast("Document saved", "success");
  }, []);

  const handleOpen = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    // Handle STEP files
    if (ext === "step" || ext === "stp") {
      try {
        const engine = useEngineStore.getState().engine;
        if (!engine) {
          useToastStore.getState().addToast("Engine not ready", "error");
          return;
        }

        const buffer = await file.arrayBuffer();
        const meshes = engine.importStep(buffer);

        if (meshes.length === 0) {
          useToastStore.getState().addToast("No geometry found in STEP file", "error");
          return;
        }

        // Create an evaluated scene directly from the meshes
        const scene = {
          parts: meshes.map((mesh) => ({
            mesh,
            material: "default",
          })),
          clashes: [],
        };

        // Clear document and set imported scene
        useDocumentStore.getState().loadDocument({
          document: { version: "1", nodes: {}, roots: [], materials: {}, part_materials: {} },
          parts: [],
          nextNodeId: 1,
          nextPartNum: 1,
        });
        useEngineStore.getState().setScene(scene);
        useUiStore.getState().clearSelection();

        useToastStore.getState().addToast(
          `Imported ${meshes.length} solid${meshes.length > 1 ? "s" : ""} from STEP`,
          "success"
        );
      } catch (err) {
        console.error("Failed to import STEP:", err);
        useToastStore.getState().addToast("Failed to import STEP file", "error");
      }
      return;
    }

    // Handle STL files
    if (ext === "stl") {
      try {
        const buffer = await file.arrayBuffer();
        const mesh = parseStl(buffer);
        const triangleCount = mesh.indices.length / 3;

        // Create an evaluated scene with the imported mesh
        const scene = {
          parts: [{ mesh, material: "default" }],
          clashes: [],
        };

        // Clear document and set imported scene
        useDocumentStore.getState().loadDocument({
          document: { version: "1", nodes: {}, roots: [], materials: {}, part_materials: {} },
          parts: [],
          nextNodeId: 1,
          nextPartNum: 1,
        });
        useEngineStore.getState().setScene(scene);
        useUiStore.getState().clearSelection();

        useToastStore.getState().addToast(
          `Imported STL with ${triangleCount.toLocaleString()} triangles`,
          "success"
        );
      } catch (err) {
        console.error("Failed to import STL:", err);
        useToastStore.getState().addToast("Failed to import STL file", "error");
      }
      return;
    }

    // Handle .vcad/.json files
    try {
      const text = await file.text();
      const vcadFile = parseVcadFile(text);
      useDocumentStore.getState().loadDocument(vcadFile);
      useUiStore.getState().clearSelection();
    } catch (err) {
      console.error("Failed to load file:", err);
      useToastStore.getState().addToast("Failed to load document", "error");
    }
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await processFile(file);
      // Reset input so same file can be re-opened
      e.target.value = "";
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) await processFile(file);
    },
    [processFile],
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

  // Listen for load-example events from the menu
  useEffect(() => {
    const onLoadExample = (e: CustomEvent<{ file: VcadFile }>) => {
      try {
        useDocumentStore.getState().loadDocument(e.detail.file);
        useUiStore.getState().clearSelection();
      } catch (err) {
        console.error("Failed to load example:", err);
        useToastStore.getState().addToast("Failed to load example", "error");
      }
    };
    window.addEventListener(
      "vcad:load-example",
      onLoadExample as EventListener,
    );
    return () => {
      window.removeEventListener(
        "vcad:load-example",
        onLoadExample as EventListener,
      );
    };
  }, []);

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

  // Increment session counter on app load (for ghost prompt fade-out)
  useEffect(() => {
    incrementSessions();
  }, [incrementSessions]);

  // Track cylinder position for "position-cylinder" guided flow step
  const document = useDocumentStore((s) => s.document);
  const selectedPartIds = useUiStore((s) => s.selectedPartIds);
  const cylinderInitialPos = useRef<{ x: number; y: number; z: number } | null>(null);

  useEffect(() => {
    if (!guidedFlowActive || guidedFlowStep !== "position-cylinder") {
      cylinderInitialPos.current = null;
      return;
    }

    // Find the cylinder part
    const cylinder = parts.find((p) => p.kind === "cylinder");
    if (!cylinder) return;

    // Get translation from document node
    const translateNode = document.nodes[String(cylinder.translateNodeId)];
    const offset =
      translateNode?.op.type === "Translate"
        ? translateNode.op.offset
        : { x: 0, y: 0, z: 0 };

    // Initialize baseline position
    if (cylinderInitialPos.current === null) {
      cylinderInitialPos.current = { ...offset };
    }

    // Check if cylinder has moved enough (>5mm in Y for "up")
    const deltaY = Math.abs(offset.y - cylinderInitialPos.current.y);
    if (deltaY > 5) {
      // Auto-select both parts for the subtract step
      // Order matters: first selected is the base, second is subtracted from it
      const cube = parts.find((p) => p.kind === "cube");
      if (cube && cylinder) {
        selectMultiple([cube.id, cylinder.id]);
      }
      advanceGuidedFlow();
    }
  }, [guidedFlowActive, guidedFlowStep, parts, document.nodes, advanceGuidedFlow, selectMultiple]);

  // Keep both parts selected during subtract step
  useEffect(() => {
    if (!guidedFlowActive || guidedFlowStep !== "subtract") return;

    const cube = parts.find((p) => p.kind === "cube");
    const cylinder = parts.find((p) => p.kind === "cylinder");
    if (!cube || !cylinder) return;

    // If not both selected, re-select them (cube first = base shape)
    const hasBoth = selectedPartIds.has(cube.id) && selectedPartIds.has(cylinder.id);
    if (!hasBoth) {
      selectMultiple([cube.id, cylinder.id]);
    }
  }, [guidedFlowActive, guidedFlowStep, parts, selectedPartIds, selectMultiple]);

  if (error && !engineReady) return <ErrorScreen message={error} />;
  if (loading || !engineReady) return <LoadingScreen />;

  // Determine if inline onboarding should show (not during guided flow)
  const showOnboarding = !hasParts && !welcomeModalDismissed && !sketchActive && !guidedFlowActive;

  return (
    <TooltipProvider>
      <div
        className="contents"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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

          {/* Onboarding overlays */}
          <GuidedFlowOverlay />
          <GhostPromptController />
          <CelebrationOverlay />

          {/* Quote panel (slides in from right when Make It Real clicked) */}
          <QuotePanel />

          {/* Drag overlay */}
          {isDragging && (
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm">
              <div className="rounded-lg border-2 border-dashed border-accent bg-bg/90 px-8 py-6 text-center">
                <div className="text-lg font-medium text-text">Drop file to import</div>
                <div className="mt-1 text-sm text-text-muted">.vcad, .stl, .step</div>
              </div>
            </div>
          )}
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
          accept=".vcad,.json,.step,.stp,.stl"
          className="hidden"
          onChange={handleFileChange}
        />
        <ToastContainer />
      </div>
    </TooltipProvider>
  );
}
