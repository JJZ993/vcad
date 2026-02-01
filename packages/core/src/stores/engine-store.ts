import { create } from "zustand";
import type { EvaluatedScene, TriangleMesh, Engine } from "@vcad/engine";
import type { Transform3D } from "@vcad/ir";

export interface EngineState {
  engine: Engine | null;
  scene: EvaluatedScene | null;
  previewMesh: TriangleMesh | null;
  engineReady: boolean;
  loading: boolean;
  error: string | null;

  setEngine: (engine: Engine) => void;
  setScene: (scene: EvaluatedScene) => void;
  setPreviewMesh: (mesh: TriangleMesh | null) => void;
  setEngineReady: (ready: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Update instance transforms directly (for physics, bypasses CSG re-eval) */
  updateInstanceTransforms: (transforms: Map<string, Transform3D>) => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  engine: null,
  scene: null,
  previewMesh: null,
  engineReady: false,
  loading: false,
  error: null,

  setEngine: (engine) => set({ engine }),
  setScene: (scene) => set({ scene, error: null }),
  setPreviewMesh: (mesh) => set({ previewMesh: mesh }),
  setEngineReady: (ready) => set({ engineReady: ready }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  updateInstanceTransforms: (transforms) =>
    set((state) => {
      if (!state.scene?.instances) return state;
      const instances = state.scene.instances.map((inst) => {
        const transform = transforms.get(inst.instanceId);
        return transform ? { ...inst, transform } : inst;
      });
      return { scene: { ...state.scene, instances } };
    }),
}));
