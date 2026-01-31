import { useEffect, useRef } from "react";
import { Engine, useDocumentStore, useEngineStore, useUiStore } from "@vcad/core";
import { initializeGpu, initializeRayTracer } from "@vcad/engine";

// Module-level engine instance to survive HMR
let globalEngine: Engine | null = null;
// Guard against concurrent init (React StrictMode calls effect twice)
let engineInitPromise: Promise<Engine> | null = null;

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
            console.warn("[GPU] Failed to initialize:", e);
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
    const unsub = useDocumentStore.subscribe((state) => {
      // Use globalEngine for HMR stability (engineRef might be stale)
      const engine = globalEngine;
      if (!engine) return;

      // Debounce to next animation frame
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // Skip re-evaluation for empty documents if we already have a scene
        // (preserves imported STL/STEP meshes that bypass the document model)
        // Check must be inside RAF so it runs after setScene() has been called
        if (state.document.roots.length === 0) {
          const currentScene = useEngineStore.getState().scene;
          if (currentScene && currentScene.parts.length > 0) {
            return;
          }
        }

        try {
          const scene = engine.evaluate(state.document);
          useEngineStore.getState().setScene(scene);
        } catch (e) {
          useEngineStore.getState().setError(String(e));
        }
      });
    });

    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // Empty deps - subscription is stable
}
