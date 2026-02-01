import type { EvaluatedScene } from "@vcad/engine";

/**
 * Export an evaluated scene as a STEP file ArrayBuffer.
 * Uses the first part with B-rep data available.
 *
 * @throws Error if no parts have B-rep data for STEP export
 */
export function exportStepBuffer(scene: EvaluatedScene): Uint8Array {
  let lastError: Error | null = null;
  let hasBRepParts = false;

  for (const part of scene.parts) {
    if (part.solid?.canExportStep?.()) {
      hasBRepParts = true;
      try {
        return part.solid.toStepBuffer();
      } catch (e) {
        // Store the error and try the next part
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
    }
  }

  // Provide a helpful error message based on what went wrong
  if (hasBRepParts && lastError) {
    // B-rep exists but topology is invalid (common after complex boolean operations)
    throw new Error(
      `STEP export failed: ${lastError.message}. ` +
      "Complex boolean operations can produce invalid topology. " +
      "Try exporting to STL instead."
    );
  }

  throw new Error(
    "No parts with B-rep data available for STEP export. " +
    "Parts that use boolean operations may lose B-rep data."
  );
}

/**
 * Export an evaluated scene as a STEP file Blob (browser only).
 */
export function exportStepBlob(scene: EvaluatedScene): Blob {
  const buffer = exportStepBuffer(scene);
  // Create a copy - buffer.buffer returns entire WASM linear memory, not just the STEP data
  return new Blob([new Uint8Array(buffer)], { type: "application/step" });
}
