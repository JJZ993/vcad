import type { Document, Vec3, SketchSegment2D } from "@vcad/ir";
import { evaluateDocument } from "./evaluate.js";
import type { EvaluatedScene, TriangleMesh } from "./mesh.js";
import type { Solid, WasmAnnotationLayer } from "@vcad/kernel-wasm";

export type {
  TriangleMesh,
  EvaluatedPart,
  EvaluatedPartDef,
  EvaluatedInstance,
  EvaluatedScene,
} from "./mesh.js";

export {
  solveForwardKinematics,
  applyForwardKinematics,
} from "./kinematics.js";

export {
  initializeGpu,
  isGpuAvailable,
  processGeometryGpu,
  computeCreasedNormalsGpu,
  decimateMeshGpu,
  mergeMeshes,
} from "./gpu.js";

export type { GpuGeometryResult } from "./gpu.js";

/** Re-export Solid class for direct use */
export type { Solid, WasmAnnotationLayer } from "@vcad/kernel-wasm";

/** 2D projected edge with visibility info */
export interface ProjectedEdge {
  start: { x: number; y: number };
  end: { x: number; y: number };
  visibility: "Visible" | "Hidden";
  edge_type: "Sharp" | "Silhouette" | "Boundary";
  depth: number;
}

/** 2D bounding box */
export interface BoundingBox2D {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

/** Result of projecting a 3D mesh to a 2D view */
export interface ProjectedView {
  edges: ProjectedEdge[];
  bounds: BoundingBox2D;
  view_direction: string;
}

/** Detail view parameters */
export interface DetailViewParams {
  center: { x: number; y: number };
  scale: number;
  width: number;
  height: number;
  label: string;
}

/** A magnified region view */
export interface DetailView {
  edges: ProjectedEdge[];
  bounds: BoundingBox2D;
  params: DetailViewParams;
}

/** Type for the initialized kernel module */
export interface KernelModule {
  Solid: typeof Solid;
  WasmAnnotationLayer: typeof WasmAnnotationLayer;
  projectMesh: (mesh: { positions: Float32Array; indices: Uint32Array }, viewDirection: string) => ProjectedView | null;
  importStepBuffer: (data: Uint8Array) => Array<{ positions: Float32Array; indices: Uint32Array }>;
  exportProjectedViewToDxf: (view_json: string) => Uint8Array;
  createDetailView: (
    parent_json: string,
    center_x: number,
    center_y: number,
    scale: number,
    width: number,
    height: number,
    label: string,
  ) => DetailView;
}

/** Rendered dimension types from the annotation layer */
export interface RenderedText {
  position: { x: number; y: number };
  text: string;
  height: number;
  rotation: number;
  alignment: string;
}

export interface RenderedArrow {
  tip: { x: number; y: number };
  direction: number;
  arrow_type: string;
  size: number;
}

export interface RenderedArc {
  center: { x: number; y: number };
  radius: number;
  start_angle: number;
  end_angle: number;
}

export interface RenderedDimension {
  lines: Array<[{ x: number; y: number }, { x: number; y: number }]>;
  arcs: RenderedArc[];
  arrows: RenderedArrow[];
  texts: RenderedText[];
  is_basic: boolean;
}

/** CSG evaluation engine backed by vcad-kernel (WASM). */
export class Engine {
  private kernel: KernelModule;

  private constructor(kernel: KernelModule) {
    this.kernel = kernel;
  }

  /** Load the vcad-kernel WASM module and return a ready engine. */
  static async init(): Promise<Engine> {
    const wasmModule = await import("@vcad/kernel-wasm");

    // Check if we're in Node.js environment (for tests)
    const isNode =
      typeof process !== "undefined" &&
      process.versions != null &&
      process.versions.node != null;

    if (isNode) {
      // In Node.js, we need to read the WASM file and pass it as a buffer
      // Dynamic imports ensure these aren't bundled for browser
      const fs = await import("node:fs");
      const url = await import("node:url");
      const path = await import("node:path");

      // Get the path to the WASM file relative to the kernel-wasm package
      const kernelWasmPath = url.fileURLToPath(import.meta.url);
      const wasmPath = path.join(
        path.dirname(kernelWasmPath),
        "..",
        "..",
        "kernel-wasm",
        "vcad_kernel_wasm_bg.wasm",
      );
      const wasmBuffer = fs.readFileSync(wasmPath);
      wasmModule.initSync({ module: wasmBuffer });
    } else {
      // In browser, use the default async init
      await wasmModule.default();
    }

    return new Engine({
      Solid: wasmModule.Solid,
      WasmAnnotationLayer: wasmModule.WasmAnnotationLayer,
      projectMesh: wasmModule.projectMesh,
      importStepBuffer: wasmModule.importStepBuffer,
      exportProjectedViewToDxf: wasmModule.exportProjectedViewToDxf,
      createDetailView: wasmModule.createDetailView,
    });
  }

  /** Evaluate an IR document into triangle meshes. */
  evaluate(doc: Document): EvaluatedScene {
    return evaluateDocument(doc, this.kernel);
  }

  /** Get the Solid class for direct use */
  get Solid(): typeof Solid {
    return this.kernel.Solid;
  }

  /** Get the WasmAnnotationLayer class for creating dimensions */
  get WasmAnnotationLayer(): typeof WasmAnnotationLayer {
    return this.kernel.WasmAnnotationLayer;
  }

  /** Project a mesh to a 2D view */
  projectMesh(mesh: TriangleMesh, viewDirection: string): ProjectedView | null {
    return this.kernel.projectMesh(
      { positions: mesh.positions, indices: mesh.indices },
      viewDirection,
    );
  }

  /** Import solids from a STEP file buffer.
   *
   * Returns an array of triangle meshes, one for each body in the STEP file.
   */
  importStep(data: ArrayBuffer): TriangleMesh[] {
    const bytes = new Uint8Array(data);
    const meshes = this.kernel.importStepBuffer(bytes);
    return meshes.map((m) => ({
      positions: new Float32Array(m.positions),
      indices: new Uint32Array(m.indices),
    }));
  }

  /** Export a projected view to DXF format.
   *
   * Returns the DXF file content as a Uint8Array.
   */
  exportDrawingToDxf(view: ProjectedView): Uint8Array {
    const json = JSON.stringify(view);
    return this.kernel.exportProjectedViewToDxf(json);
  }

  /** Create a detail view (magnified region) from a projected view.
   *
   * @param view - The parent projected view
   * @param centerX - X coordinate of the region center
   * @param centerY - Y coordinate of the region center
   * @param scale - Magnification factor (e.g., 2.0 = 2x)
   * @param width - Width of the region to capture
   * @param height - Height of the region to capture
   * @param label - Label for the detail view (e.g., "A")
   */
  createDetailView(
    view: ProjectedView,
    centerX: number,
    centerY: number,
    scale: number,
    width: number,
    height: number,
    label: string,
  ): DetailView {
    const json = JSON.stringify(view);
    return this.kernel.createDetailView(json, centerX, centerY, scale, width, height, label);
  }

  /** Evaluate a preview extrusion without adding to document */
  evaluateExtrudePreview(
    origin: Vec3,
    xDir: Vec3,
    yDir: Vec3,
    segments: SketchSegment2D[],
    direction: Vec3,
  ): TriangleMesh | null {
    if (segments.length === 0) return null;

    try {
      const profile = {
        origin: [origin.x, origin.y, origin.z],
        x_dir: [xDir.x, xDir.y, xDir.z],
        y_dir: [yDir.x, yDir.y, yDir.z],
        segments: segments.map((seg) => {
          if (seg.type === "Line") {
            return {
              type: "Line" as const,
              start: [seg.start.x, seg.start.y],
              end: [seg.end.x, seg.end.y],
            };
          } else {
            return {
              type: "Arc" as const,
              start: [seg.start.x, seg.start.y],
              end: [seg.end.x, seg.end.y],
              center: [seg.center.x, seg.center.y],
              ccw: seg.ccw,
            };
          }
        }),
      };

      const dirArray = new Float64Array([direction.x, direction.y, direction.z]);
      const solid = this.kernel.Solid.extrude(profile, dirArray);
      const meshData = solid.getMesh();

      return {
        positions: new Float32Array(meshData.positions),
        indices: new Uint32Array(meshData.indices),
      };
    } catch {
      return null;
    }
  }
}
