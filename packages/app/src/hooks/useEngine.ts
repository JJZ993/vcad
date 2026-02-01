import { useEffect, useRef } from "react";
import { Engine, useDocumentStore, useEngineStore, useSimulationStore, useUiStore, logger } from "@vcad/core";
import { initializeGpu, initializeRayTracer } from "@vcad/engine";

// Module-level engine instance to survive HMR
let globalEngine: Engine | null = null;
// Guard against concurrent init (React StrictMode calls effect twice)
let engineInitPromise: Promise<Engine> | null = null;

/** Debounce timeout for full-quality re-render after drag ends */
let refinementTimeout: ReturnType<typeof setTimeout> | null = null;

export function useEngine() {
  const engineRef = useRef<Engine | null>(globalEngine);
  const rafRef = useRef<number>(0);

  // Init engine (only once, survives HMR)
  useEffect(() => {
    // If engine already exists (from previous HMR cycle), reuse it
    if (globalEngine) {
      engineRef.current = globalEngine;
      useEngineStore.getState().setEngine(globalEngine);
      useEngineStore.getState().setEngineReady(true);
      useEngineStore.getState().setLoading(false);

      // Re-evaluate the document to restore the scene
      const doc = useDocumentStore.getState().document;
      if (doc.roots.length > 0) {
        try {
          useEngineStore.getState().setScene(globalEngine.evaluate(doc));
        } catch (e) {
          useEngineStore.getState().setError(String(e));
        }
      }
      return;
    }

    let cancelled = false;
    useEngineStore.getState().setLoading(true);
    performance.mark("engine-init-start");

    // If init is already in progress (React StrictMode), reuse the existing promise
    if (!engineInitPromise) {
      engineInitPromise = Engine.init();
    }

    engineInitPromise
      .then(async (engine) => {
        if (cancelled) return;
        performance.mark("engine-init-complete");
        globalEngine = engine;
        engineRef.current = engine;
        useEngineStore.getState().setEngine(engine);
        useEngineStore.getState().setEngineReady(true);
        useEngineStore.getState().setLoading(false);

        // Initialize GPU for accelerated geometry processing (non-blocking)
        initializeGpu()
          .then((gpuAvailable) => {
            // After GPU init, try to initialize ray tracer
            if (gpuAvailable) {
              return initializeRayTracer();
            }
            return false;
          })
          .then((raytraceAvailable) => {
            useUiStore.getState().setRaytraceAvailable(raytraceAvailable);
          })
          .catch((e) => {
            logger.warn("gpu", `Failed to initialize: ${e}`);
          });

        // Evaluate initial document
        const doc = useDocumentStore.getState().document;
        if (doc.roots.length > 0) {
          try {
            useEngineStore.getState().setScene(engine.evaluate(doc));
          } catch (e) {
            useEngineStore.getState().setError(String(e));
          }
        }
      })
      .catch((e) => {
        if (!cancelled) useEngineStore.getState().setError(String(e));
      });

    return () => {
      cancelled = true;
    };
  }, []); // Empty deps - only run on initial mount

  // Subscribe to document changes and re-evaluate
  useEffect(() => {
    const unsub = useDocumentStore.subscribe((state, prevState) => {
      // Use globalEngine for HMR stability (engineRef might be stale)
      const engine = globalEngine;
      if (!engine) return;

      // Only re-evaluate if the actual document content changed
      // Skip metadata-only changes (isDirty, lastSavedAt, etc.)
      if (state.document === prevState?.document) {
        return;
      }

      // Check mode BEFORE scheduling RAF - if physics is active, skip entirely
      const simModeNow = useSimulationStore.getState().mode;
      if (simModeNow !== "off") {
        return;
      }

      // Debounce to next animation frame
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // Double-check mode inside RAF (mode might have changed since scheduling)
        const simMode = useSimulationStore.getState().mode;
        if (simMode !== "off") {
          return;
        }

        // Skip re-evaluation for empty documents if we already have a scene
        // (preserves imported STL/STEP meshes that bypass the document model)
        // Check must be inside RAF so it runs after setScene() has been called
        if (state.document.roots.length === 0) {
          const currentScene = useEngineStore.getState().scene;
          // Only preserve if document was already empty (STL/STEP import case)
          // NOT if user just deleted all features (transition from non-empty → empty)
          const wasAlreadyEmpty = prevState?.document.roots.length === 0;
          if (currentScene && currentScene.parts.length > 0 && wasAlreadyEmpty) {
            return;
          }
        }

        try {
          // During parameter dragging: skip clash detection for faster updates
          const isDragging = state.isParameterDragging;

          // Get dirty nodes and clear them
          const dirtyNodes = state.dirtyNodeIds;

          // Invalidate caches for dirty nodes (if any)
          if (dirtyNodes.size > 0) {
            engine.invalidateNodes(dirtyNodes);
            // Clear dirty nodes after invalidation
            useDocumentStore.getState().clearDirtyNodes();
          }

          // Evaluate with optimizations during dragging
          const scene = engine.evaluate(state.document, {
            skipClashDetection: isDragging,
          });
          useEngineStore.getState().setScene(scene);

          // If dragging just ended, schedule a refinement pass
          if (prevState?.isParameterDragging && !isDragging) {
            if (refinementTimeout) {
              clearTimeout(refinementTimeout);
            }
            refinementTimeout = setTimeout(() => {
              // Full quality re-evaluation with clash detection
              try {
                const doc = useDocumentStore.getState().document;
                const refinedScene = engine.evaluate(doc, {
                  skipClashDetection: false,
                });
                useEngineStore.getState().setScene(refinedScene);
              } catch (e) {
                useEngineStore.getState().setError(String(e));
              }
              refinementTimeout = null;
            }, 100);
          }
        } catch (e) {
          useEngineStore.getState().setError(String(e));
        }
      });
    });

    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
      if (refinementTimeout) {
        clearTimeout(refinementTimeout);
        refinementTimeout = null;
      }
    };
  }, []); // Empty deps - subscription is stable
}
