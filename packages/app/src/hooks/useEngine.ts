import { useEffect, useRef } from "react";
import { Engine, useDocumentStore, useEngineStore } from "@vcad/core";

export function useEngine() {
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number>(0);
  const setScene = useEngineStore((s) => s.setScene);
  const setEngineReady = useEngineStore((s) => s.setEngineReady);
  const setLoading = useEngineStore((s) => s.setLoading);
  const setError = useEngineStore((s) => s.setError);

  // Init engine
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Engine.init()
      .then((engine) => {
        if (cancelled) return;
        engineRef.current = engine;
        setEngineReady(true);
        setLoading(false);

        // Evaluate initial document
        const doc = useDocumentStore.getState().document;
        if (doc.roots.length > 0) {
          try {
            setScene(engine.evaluate(doc));
          } catch (e) {
            setError(String(e));
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [setScene, setEngineReady, setLoading, setError]);

  // Subscribe to document changes and re-evaluate
  useEffect(() => {
    const unsub = useDocumentStore.subscribe((state) => {
      const engine = engineRef.current;
      if (!engine) return;

      // Debounce to next animation frame
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        try {
          const scene = engine.evaluate(state.document);
          setScene(scene);
        } catch (e) {
          setError(String(e));
        }
      });
    });

    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, [setScene, setError]);
}
