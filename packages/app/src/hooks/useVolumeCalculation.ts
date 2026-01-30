/**
 * Hook for computing volume of a part from its mesh.
 */

import { useMemo } from "react";
import { useEngineStore, useDocumentStore, computeVolume } from "@vcad/core";

/**
 * Calculate the volume of a part by finding its mesh in the evaluated scene.
 * @param partId - The part ID to calculate volume for
 * @returns Volume in mm³, or undefined if mesh not found
 */
export function useVolumeCalculation(partId: string | null): number | undefined {
  const scene = useEngineStore((s) => s.scene);
  const parts = useDocumentStore((s) => s.parts);

  return useMemo(() => {
    if (!partId || !scene) return undefined;

    // Find the part index in document store
    const partIndex = parts.findIndex((p) => p.id === partId);
    if (partIndex === -1) return undefined;

    // Get the corresponding evaluated part by index
    const evalPart = scene.parts[partIndex];
    if (!evalPart) return undefined;

    return computeVolume(evalPart.mesh);
  }, [partId, scene, parts]);
}
