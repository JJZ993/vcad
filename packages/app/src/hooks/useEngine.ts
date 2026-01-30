import { useEffect, useRef } from "react";
import { Engine, useDocumentStore, useEngineStore } from "@vcad/core";

// Module-level engine instance to survive HMR
let globalEngine: Engine | null = null;

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

    Engine.init()
      .then((engine) => {
        if (cancelled) return;
        globalEngine = engine;
        engineRef.current = engine;
        useEngineStore.getState().setEngine(engine);
        useEngineStore.getState().setEngineReady(true);
        useEngineStore.getState().setLoading(false);

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
