// Types
export type {
  PrimitiveKind,
  BooleanType,
  SketchPlane,
  AxisAlignedPlane,
  ArbitraryPlane,
  FaceInfo,
  PrimitivePartInfo,
  BooleanPartInfo,
  ExtrudePartInfo,
  RevolvePartInfo,
  SweepPartInfo,
  LoftPartInfo,
  PartInfo,
  ToolMode,
  TransformMode,
  Theme,
  ConstraintTool,
  ConstraintStatus,
  SketchState,
} from "./types.js";

export {
  isPrimitivePart,
  isBooleanPart,
  isExtrudePart,
  isRevolvePart,
  isSweepPart,
  isLoftPart,
  getSketchPlaneDirections,
  isAxisAlignedPlane,
  computePlaneFromFace,
  getSketchPlaneName,
} from "./types.js";

// Stores
export { useDocumentStore, getUndoActionName, getRedoActionName } from "./stores/document-store.js";
export type { VcadFile, DocumentState } from "./stores/document-store.js";

export { useUiStore } from "./stores/ui-store.js";
export type { UiState } from "./stores/ui-store.js";

export { useSketchStore } from "./stores/sketch-store.js";
export type { SketchStore, ProfileSnapshot, SketchExitStatus } from "./stores/sketch-store.js";

export { useEngineStore } from "./stores/engine-store.js";
export type { EngineState } from "./stores/engine-store.js";

// Commands
export { createCommandRegistry } from "./commands.js";
export type { Command, CommandRegistry, CommandActions } from "./commands.js";

// Export utilities
export { exportStlBuffer, exportStlBlob } from "./utils/export-stl.js";
export { exportGltfBuffer, exportGltfBlob } from "./utils/export-gltf.js";
export { serializeDocument, parseVcadFile } from "./utils/save-load.js";
export type { VcadFile as VcadFileFormat } from "./utils/save-load.js";

// Re-export engine initialization
export { Engine } from "@vcad/engine";
export type { EvaluatedScene, EvaluatedPart, TriangleMesh } from "@vcad/engine";
