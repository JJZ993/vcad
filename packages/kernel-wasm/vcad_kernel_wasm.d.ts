/* tslint:disable */
/* eslint-disable */

/**
 * Stub PhysicsSim when physics feature is not enabled.
 */
export class PhysicsSim {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns an error when physics feature is not enabled.
     */
    constructor(_doc_json: string, _end_effector_ids: string[], _dt?: number | null, _substeps?: number | null);
}

/**
 * GPU-accelerated ray tracer for direct BRep rendering.
 *
 * This ray tracer renders BRep surfaces directly without tessellation,
 * achieving pixel-perfect silhouettes at any zoom level.
 */
export class RayTracer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Check if a solid can be ray traced.
     *
     * Returns true if the solid has a BRep representation.
     */
    static canRaytrace(solid: Solid): boolean;
    /**
     * Create a new ray tracer.
     *
     * Requires WebGPU to be available and initialized.
     * Call `initGpu()` before calling this method.
     */
    static create(): RayTracer;
    /**
     * Get the current debug render mode.
     */
    getDebugMode(): number;
    /**
     * Get whether edge detection is enabled.
     */
    getEdgeDetectionEnabled(): boolean;
    /**
     * Get the current frame index for progressive rendering.
     */
    getFrameIndex(): number;
    /**
     * Check if the ray tracer has a scene loaded.
     */
    hasScene(): boolean;
    /**
     * Pick a face at the given pixel coordinates.
     *
     * # Arguments
     * * `camera`, `target`, `up` - Camera parameters
     * * `width`, `height`, `fov` - View parameters
     * * `pixel_x`, `pixel_y` - Pixel coordinates to pick
     *
     * # Returns
     * Face index if a face was hit, or -1 if background was hit.
     */
    pick(camera: Float64Array, target: Float64Array, up: Float64Array, width: number, height: number, fov: number, pixel_x: number, pixel_y: number): number;
    /**
     * Render the scene to an RGBA image with progressive anti-aliasing.
     *
     * Each call accumulates another sample. Call `resetAccumulation()` when the
     * camera moves to restart the accumulation.
     *
     * # Arguments
     * * `camera` - Camera position [x, y, z]
     * * `target` - Look-at target [x, y, z]
     * * `up` - Up vector [x, y, z]
     * * `width` - Image width in pixels
     * * `height` - Image height in pixels
     * * `fov` - Field of view in radians
     *
     * # Returns
     * RGBA pixel data as a byte array (width * height * 4 bytes).
     *
     * # Note
     * This function is async to support WASM's single-threaded environment.
     * In JavaScript, it returns a Promise<Uint8Array>.
     */
    render(camera: Float64Array, target: Float64Array, up: Float64Array, width: number, height: number, fov: number): Promise<Uint8Array>;
    /**
     * Reset the progressive accumulation (call when camera moves).
     */
    resetAccumulation(): void;
    /**
     * Set the debug render mode.
     *
     * # Arguments
     * * `mode` - Debug mode: 0=normal, 1=normals as RGB, 2=face_id colors, 3=N·L grayscale, 4=orientation
     *
     * Call resetAccumulation() after changing mode to see immediate effect.
     */
    setDebugMode(mode: number): void;
    /**
     * Set edge detection settings.
     *
     * # Arguments
     * * `enabled` - Whether to show edge detection overlay
     * * `depth_threshold` - Depth discontinuity threshold (default: 0.1)
     * * `normal_threshold` - Normal angle threshold in degrees (default: 30.0)
     */
    setEdgeDetection(enabled: boolean, depth_threshold: number, normal_threshold: number): void;
    /**
     * Set the material for all faces in the scene.
     *
     * # Arguments
     * * `r`, `g`, `b` - RGB color components (0-1 range, linear)
     * * `metallic` - Metallic factor (0 = dielectric, 1 = metal)
     * * `roughness` - Roughness factor (0 = smooth/mirror, 1 = rough/diffuse)
     */
    setMaterial(r: number, g: number, b: number, metallic: number, roughness: number): void;
    /**
     * Upload a solid's BRep representation for ray tracing.
     *
     * This extracts the BRep surfaces and builds the GPU scene data.
     */
    uploadSolid(solid: Solid): void;
}

/**
 * A 3D solid geometry object.
 *
 * Create solids from primitives, combine with boolean operations,
 * transform, and extract triangle meshes for rendering.
 */
export class Solid {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get the bounding box as [minX, minY, minZ, maxX, maxY, maxZ].
     */
    boundingBox(): Float64Array;
    /**
     * Get the center of mass as [x, y, z].
     */
    centerOfMass(): Float64Array;
    /**
     * Chamfer all edges of the solid by the given distance.
     */
    chamfer(distance: number): Solid;
    /**
     * Create a circular pattern of the solid around an axis.
     *
     * # Arguments
     *
     * * `axis_origin_x/y/z` - A point on the rotation axis
     * * `axis_dir_x/y/z` - Direction of the rotation axis
     * * `count` - Number of copies (including original)
     * * `angle_deg` - Total angle span in degrees
     */
    circularPattern(axis_origin_x: number, axis_origin_y: number, axis_origin_z: number, axis_dir_x: number, axis_dir_y: number, axis_dir_z: number, count: number, angle_deg: number): Solid;
    /**
     * Create a cone/frustum along Z axis.
     */
    static cone(radius_bottom: number, radius_top: number, height: number, segments?: number | null): Solid;
    /**
     * Create a box with corner at origin and dimensions (sx, sy, sz).
     */
    static cube(sx: number, sy: number, sz: number): Solid;
    /**
     * Create a cylinder along Z axis with given radius and height.
     */
    static cylinder(radius: number, height: number, segments?: number | null): Solid;
    /**
     * Boolean difference (self − other).
     */
    difference(other: Solid): Solid;
    /**
     * Create an empty solid.
     */
    static empty(): Solid;
    /**
     * Create a solid by extruding a 2D sketch profile.
     *
     * Takes a sketch profile and extrusion direction as JS objects.
     */
    static extrude(profile_js: any, direction: Float64Array): Solid;
    /**
     * Fillet all edges of the solid with the given radius.
     */
    fillet(radius: number): Solid;
    /**
     * Get the triangle mesh representation.
     *
     * Returns a JS object with `positions` (Float32Array) and `indices` (Uint32Array).
     */
    getMesh(segments?: number | null): any;
    /**
     * Generate a horizontal section view at a given Z height.
     *
     * Convenience method that creates a horizontal section plane.
     */
    horizontalSection(z: number, hatch_spacing?: number | null, hatch_angle?: number | null, segments?: number | null): any;
    /**
     * Boolean intersection (self ∩ other).
     */
    intersection(other: Solid): Solid;
    /**
     * Check if the solid is empty (has no geometry).
     */
    isEmpty(): boolean;
    /**
     * Create a linear pattern of the solid along a direction.
     *
     * # Arguments
     *
     * * `dir_x`, `dir_y`, `dir_z` - Direction vector
     * * `count` - Number of copies (including original)
     * * `spacing` - Distance between copies
     */
    linearPattern(dir_x: number, dir_y: number, dir_z: number, count: number, spacing: number): Solid;
    /**
     * Create a solid by lofting between multiple profiles.
     *
     * Takes an array of sketch profiles (minimum 2).
     */
    static loft(profiles_js: any, closed?: boolean | null): Solid;
    /**
     * Get the number of triangles in the tessellated mesh.
     */
    numTriangles(): number;
    /**
     * Project the solid to a 2D view for technical drawing.
     *
     * # Arguments
     * * `view_direction` - View direction: "front", "back", "top", "bottom", "left", "right", or "isometric"
     * * `segments` - Number of segments for tessellation (optional, default 32)
     *
     * # Returns
     * A JS object containing the projected view with edges and bounds.
     */
    projectView(view_direction: string, segments?: number | null): any;
    /**
     * Create a solid by revolving a 2D sketch profile around an axis.
     *
     * Takes a sketch profile, axis origin, axis direction, and angle in degrees.
     */
    static revolve(profile_js: any, axis_origin: Float64Array, axis_dir: Float64Array, angle_deg: number): Solid;
    /**
     * Rotate the solid by angles in degrees around X, Y, Z axes.
     */
    rotate(x_deg: number, y_deg: number, z_deg: number): Solid;
    /**
     * Scale the solid by (x, y, z).
     */
    scale(x: number, y: number, z: number): Solid;
    /**
     * Generate a section view by cutting the solid with a plane.
     *
     * # Arguments
     * * `plane_json` - JSON string with plane definition: `{"origin": [x,y,z], "normal": [x,y,z], "up": [x,y,z]}`
     * * `hatch_json` - Optional JSON string with hatch pattern: `{"spacing": f64, "angle": f64}`
     * * `segments` - Number of segments for tessellation (optional, default 32)
     *
     * # Returns
     * A JS object containing the section view with curves, hatch lines, and bounds.
     */
    sectionView(plane_json: string, hatch_json?: string | null, segments?: number | null): any;
    /**
     * Shell (hollow) the solid by offsetting all faces inward.
     */
    shell(thickness: number): Solid;
    /**
     * Create a sphere centered at origin with given radius.
     */
    static sphere(radius: number, segments?: number | null): Solid;
    /**
     * Compute the surface area of the solid.
     */
    surfaceArea(): number;
    /**
     * Create a solid by sweeping a profile along a helix path.
     *
     * Takes a sketch profile and helix parameters.
     */
    static sweepHelix(profile_js: any, radius: number, pitch: number, height: number, turns: number, twist_angle?: number | null, scale_start?: number | null, scale_end?: number | null, path_segments?: number | null, arc_segments?: number | null): Solid;
    /**
     * Create a solid by sweeping a profile along a line path.
     *
     * Takes a sketch profile and path endpoints.
     */
    static sweepLine(profile_js: any, start: Float64Array, end: Float64Array, twist_angle?: number | null, scale_start?: number | null, scale_end?: number | null): Solid;
    /**
     * Translate the solid by (x, y, z).
     */
    translate(x: number, y: number, z: number): Solid;
    /**
     * Boolean union (self ∪ other).
     */
    union(other: Solid): Solid;
    /**
     * Compute the volume of the solid.
     */
    volume(): number;
}

/**
 * Annotation layer for dimension annotations.
 *
 * This class provides methods for creating and rendering dimension annotations
 * on 2D projected views.
 */
export class WasmAnnotationLayer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add an aligned dimension between two points.
     *
     * The dimension line is parallel to the line connecting the two points.
     *
     * # Arguments
     * * `x1`, `y1` - First point coordinates
     * * `x2`, `y2` - Second point coordinates
     * * `offset` - Distance from points to dimension line
     */
    addAlignedDimension(x1: number, y1: number, x2: number, y2: number, offset: number): void;
    /**
     * Add an angular dimension between three points.
     *
     * The angle is measured at the vertex (middle point).
     *
     * # Arguments
     * * `x1`, `y1` - First point on one leg
     * * `vx`, `vy` - Vertex point (angle measured here)
     * * `x2`, `y2` - Second point on other leg
     * * `arc_radius` - Radius of the arc showing the angle
     */
    addAngleDimension(x1: number, y1: number, vx: number, vy: number, x2: number, y2: number, arc_radius: number): void;
    /**
     * Add a diameter dimension for a circle.
     *
     * # Arguments
     * * `cx`, `cy` - Center of the circle
     * * `radius` - Radius of the circle
     * * `leader_angle` - Angle in radians for the leader line direction
     */
    addDiameterDimension(cx: number, cy: number, radius: number, leader_angle: number): void;
    /**
     * Add a horizontal dimension between two points.
     *
     * # Arguments
     * * `x1`, `y1` - First point coordinates
     * * `x2`, `y2` - Second point coordinates
     * * `offset` - Distance from points to dimension line (positive = above)
     */
    addHorizontalDimension(x1: number, y1: number, x2: number, y2: number, offset: number): void;
    /**
     * Add a radius dimension for a circle.
     *
     * # Arguments
     * * `cx`, `cy` - Center of the circle
     * * `radius` - Radius of the circle
     * * `leader_angle` - Angle in radians for the leader line direction
     */
    addRadiusDimension(cx: number, cy: number, radius: number, leader_angle: number): void;
    /**
     * Add a vertical dimension between two points.
     *
     * # Arguments
     * * `x1`, `y1` - First point coordinates
     * * `x2`, `y2` - Second point coordinates
     * * `offset` - Distance from points to dimension line (positive = right)
     */
    addVerticalDimension(x1: number, y1: number, x2: number, y2: number, offset: number): void;
    /**
     * Get the number of annotations in the layer.
     */
    annotationCount(): number;
    /**
     * Clear all annotations from the layer.
     */
    clear(): void;
    /**
     * Check if the layer has any annotations.
     */
    isEmpty(): boolean;
    /**
     * Create a new empty annotation layer.
     */
    constructor();
    /**
     * Render all dimensions and return as JSON.
     *
     * Returns an array of rendered dimensions, each containing:
     * - `lines`: Array of line segments [[x1, y1], [x2, y2]]
     * - `arcs`: Array of arc definitions
     * - `arrows`: Array of arrow definitions
     * - `texts`: Array of text labels
     *
     * # Arguments
     * * `view_json` - Optional JSON string of a ProjectedView for geometry resolution
     */
    renderAll(view_json?: string | null): any;
}

/**
 * Compute creased normals using GPU acceleration.
 *
 * # Arguments
 * * `positions` - Flat array of vertex positions (x, y, z, ...)
 * * `indices` - Triangle indices
 * * `crease_angle` - Angle in radians; faces meeting at sharper angles get hard edges
 *
 * # Returns
 * Flat array of normals (nx, ny, nz, ...), same length as positions.
 */
export function computeCreasedNormalsGpu(positions: Float32Array, indices: Uint32Array, crease_angle: number): Promise<Float32Array>;

/**
 * Create a detail view from a projected view.
 *
 * A detail view is a magnified region of a parent view, useful for showing
 * fine features that would be too small in the main view.
 *
 * # Arguments
 * * `parent_json` - JSON string of the parent ProjectedView
 * * `center_x` - X coordinate of the region center
 * * `center_y` - Y coordinate of the region center
 * * `scale` - Magnification factor (e.g., 2.0 = 2x)
 * * `width` - Width of the region to capture
 * * `height` - Height of the region to capture
 * * `label` - Label for the detail view (e.g., "A")
 *
 * # Returns
 * A JS object containing the detail view with edges and bounds.
 */
export function createDetailView(parent_json: string, center_x: number, center_y: number, scale: number, width: number, height: number, label: string): any;

/**
 * Decimate a mesh to reduce triangle count.
 *
 * # Arguments
 * * `positions` - Flat array of vertex positions
 * * `indices` - Triangle indices
 * * `target_ratio` - Target ratio of triangles to keep (0.5 = 50%)
 *
 * # Returns
 * A JS object with decimated positions, indices, and normals.
 */
export function decimateMeshGpu(positions: Float32Array, indices: Uint32Array, target_ratio: number): Promise<any>;

/**
 * Evaluate compact IR and return a Solid for rendering.
 *
 * This is a convenience function that parses compact IR and evaluates
 * the geometry in a single step.
 *
 * # Arguments
 * * `compact_ir` - The compact IR text to evaluate
 *
 * # Returns
 * A Solid object that can be rendered or queried.
 */
export function evaluateCompactIR(compact_ir: string): Solid;

/**
 * Export a projected view to DXF format.
 *
 * Returns the DXF content as bytes.
 *
 * # Arguments
 * * `view_json` - JSON string of a ProjectedView
 *
 * # Returns
 * A byte array containing the DXF file content.
 */
export function exportProjectedViewToDxf(view_json: string): Uint8Array;

/**
 * Import solids from STEP file bytes.
 *
 * Returns a JS array of mesh data for each imported body.
 * Each mesh contains `positions` (Float32Array) and `indices` (Uint32Array).
 *
 * # Arguments
 * * `data` - Raw STEP file contents as bytes
 *
 * # Returns
 * A JS array of mesh objects for rendering the imported geometry.
 */
export function importStepBuffer(data: Uint8Array): any;

/**
 * Initialize the WASM module (sets up panic hook for better error messages).
 */
export function init(): void;

/**
 * Initialize the GPU context for accelerated geometry processing.
 *
 * Returns `true` if WebGPU is available and initialized, `false` otherwise.
 * This should be called once at application startup.
 */
export function initGpu(): Promise<boolean>;

/**
 * Check if GPU processing is available.
 */
export function isGpuAvailable(): boolean;

/**
 * Check if physics simulation is available.
 */
export function isPhysicsAvailable(): boolean;

/**
 * Chamfer all edges of a solid by the given distance.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_chamfer(solid: Solid, distance: number): Solid;

/**
 * Create a circular pattern of a solid around an axis.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_circular_pattern(solid: Solid, axis_origin_x: number, axis_origin_y: number, axis_origin_z: number, axis_dir_x: number, axis_dir_y: number, axis_dir_z: number, count: number, angle_deg: number): Solid;

/**
 * Fillet all edges of a solid with the given radius.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_fillet(solid: Solid, radius: number): Solid;

/**
 * Create a linear pattern of a solid along a direction.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_linear_pattern(solid: Solid, dir_x: number, dir_y: number, dir_z: number, count: number, spacing: number): Solid;

/**
 * Create a solid by lofting between multiple profiles.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_loft(profiles_js: any, closed?: boolean | null): Solid;

/**
 * Create a solid by revolving a 2D sketch profile around an axis.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_revolve(profile_js: any, axis_origin: Float64Array, axis_dir: Float64Array, angle_deg: number): Solid;

/**
 * Shell (hollow) a solid by offsetting all faces inward.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_shell(solid: Solid, thickness: number): Solid;

/**
 * Create a solid by sweeping a profile along a helix path.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_sweep_helix(profile_js: any, radius: number, pitch: number, height: number, turns: number, twist_angle?: number | null, scale_start?: number | null, scale_end?: number | null, path_segments?: number | null, arc_segments?: number | null): Solid;

/**
 * Create a solid by sweeping a profile along a line path.
 *
 * This is a standalone wrapper for lazy loading via wasmosis.
 */
export function op_sweep_line(profile_js: any, start: Float64Array, end: Float64Array, twist_angle?: number | null, scale_start?: number | null, scale_end?: number | null): Solid;

/**
 * Parse compact IR text format into a vcad IR Document (JSON).
 *
 * The compact IR format is a token-efficient text representation designed
 * for ML model training and inference. See `vcad_ir::compact` for format details.
 *
 * # Arguments
 * * `compact_ir` - The compact IR text to parse
 *
 * # Returns
 * A JSON string representing the parsed vcad IR Document.
 *
 * # Example
 * ```javascript
 * const ir = "C 50 30 5\nY 5 10\nT 1 25 15 0\nD 0 2";
 * const doc = parseCompactIR(ir);
 * console.log(doc); // JSON document
 * ```
 */
export function parseCompactIR(compact_ir: string): string;

/**
 * Process geometry with GPU acceleration.
 *
 * Computes creased normals and optionally generates LOD meshes.
 *
 * # Arguments
 * * `positions` - Flat array of vertex positions (x, y, z, ...)
 * * `indices` - Triangle indices
 * * `crease_angle` - Angle in radians for creased normal computation
 * * `generate_lod` - If true, returns multiple LOD levels
 *
 * # Returns
 * A JS array of geometry results. If `generate_lod` is true, returns
 * [full, 50%, 25%] detail levels. Otherwise returns a single mesh.
 */
export function processGeometryGpu(positions: Float32Array, indices: Uint32Array, crease_angle: number, generate_lod: boolean): Promise<any>;

/**
 * Project a triangle mesh to a 2D view.
 *
 * # Arguments
 * * `mesh_js` - Mesh data as JS object with `positions` (Float32Array) and `indices` (Uint32Array)
 * * `view_direction` - View direction: "front", "back", "top", "bottom", "left", "right", or "isometric"
 *
 * # Returns
 * A JS object containing the projected view with edges and bounds.
 */
export function projectMesh(mesh_js: any, view_direction: string): any;

/**
 * Generate a section view from a triangle mesh.
 *
 * # Arguments
 * * `mesh_js` - Mesh data as JS object with `positions` (Float32Array) and `indices` (Uint32Array)
 * * `plane_json` - JSON string with plane definition: `{"origin": [x,y,z], "normal": [x,y,z], "up": [x,y,z]}`
 * * `hatch_json` - Optional JSON string with hatch pattern: `{"spacing": f64, "angle": f64}`
 *
 * # Returns
 * A JS object containing the section view with curves, hatch lines, and bounds.
 */
export function sectionMesh(mesh_js: any, plane_json: string, hatch_json?: string | null): any;

/**
 * Convert a vcad IR Document (JSON) to compact IR text format.
 *
 * # Arguments
 * * `doc_json` - JSON string representing a vcad IR Document
 *
 * # Returns
 * The compact IR text representation.
 *
 * # Example
 * ```javascript
 * const compact = toCompactIR(docJson);
 * console.log(compact); // "C 50 30 5\nY 5 10\n..."
 * ```
 */
export function toCompactIR(doc_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_physicssim_free: (a: number, b: number) => void;
    readonly __wbg_raytracer_free: (a: number, b: number) => void;
    readonly __wbg_solid_free: (a: number, b: number) => void;
    readonly __wbg_wasmannotationlayer_free: (a: number, b: number) => void;
    readonly computeCreasedNormalsGpu: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly createDetailView: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly decimateMeshGpu: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly evaluateCompactIR: (a: number, b: number) => [number, number, number];
    readonly exportProjectedViewToDxf: (a: number, b: number) => [number, number, number, number];
    readonly importStepBuffer: (a: number, b: number) => [number, number, number];
    readonly initGpu: () => any;
    readonly isGpuAvailable: () => number;
    readonly isPhysicsAvailable: () => number;
    readonly op_chamfer: (a: number, b: number) => number;
    readonly op_circular_pattern: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly op_fillet: (a: number, b: number) => number;
    readonly op_linear_pattern: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly op_loft: (a: any, b: number) => [number, number, number];
    readonly op_revolve: (a: any, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly op_shell: (a: number, b: number) => number;
    readonly op_sweep_helix: (a: any, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number, number];
    readonly op_sweep_line: (a: any, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
    readonly parseCompactIR: (a: number, b: number) => [number, number, number, number];
    readonly physicssim_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly processGeometryGpu: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly projectMesh: (a: any, b: number, c: number) => any;
    readonly raytracer_canRaytrace: (a: number) => number;
    readonly raytracer_create: () => [number, number, number];
    readonly raytracer_getDebugMode: (a: number) => number;
    readonly raytracer_getEdgeDetectionEnabled: (a: number) => number;
    readonly raytracer_getFrameIndex: (a: number) => number;
    readonly raytracer_hasScene: (a: number) => number;
    readonly raytracer_pick: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
    readonly raytracer_render: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly raytracer_resetAccumulation: (a: number) => void;
    readonly raytracer_setDebugMode: (a: number, b: number) => void;
    readonly raytracer_setEdgeDetection: (a: number, b: number, c: number, d: number) => void;
    readonly raytracer_setMaterial: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly raytracer_uploadSolid: (a: number, b: number) => [number, number];
    readonly sectionMesh: (a: any, b: number, c: number, d: number, e: number) => any;
    readonly solid_boundingBox: (a: number) => [number, number];
    readonly solid_centerOfMass: (a: number) => [number, number];
    readonly solid_cone: (a: number, b: number, c: number, d: number) => number;
    readonly solid_cube: (a: number, b: number, c: number) => number;
    readonly solid_cylinder: (a: number, b: number, c: number) => number;
    readonly solid_difference: (a: number, b: number) => number;
    readonly solid_empty: () => number;
    readonly solid_extrude: (a: any, b: number, c: number) => [number, number, number];
    readonly solid_getMesh: (a: number, b: number) => any;
    readonly solid_horizontalSection: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly solid_intersection: (a: number, b: number) => number;
    readonly solid_isEmpty: (a: number) => number;
    readonly solid_loft: (a: any, b: number) => [number, number, number];
    readonly solid_numTriangles: (a: number) => number;
    readonly solid_projectView: (a: number, b: number, c: number, d: number) => any;
    readonly solid_rotate: (a: number, b: number, c: number, d: number) => number;
    readonly solid_scale: (a: number, b: number, c: number, d: number) => number;
    readonly solid_sectionView: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly solid_sphere: (a: number, b: number) => number;
    readonly solid_surfaceArea: (a: number) => number;
    readonly solid_sweepHelix: (a: any, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number, number];
    readonly solid_sweepLine: (a: any, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
    readonly solid_translate: (a: number, b: number, c: number, d: number) => number;
    readonly solid_union: (a: number, b: number) => number;
    readonly solid_volume: (a: number) => number;
    readonly toCompactIR: (a: number, b: number) => [number, number, number, number];
    readonly wasmannotationlayer_addAlignedDimension: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly wasmannotationlayer_addAngleDimension: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly wasmannotationlayer_addDiameterDimension: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmannotationlayer_addHorizontalDimension: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly wasmannotationlayer_addRadiusDimension: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmannotationlayer_addVerticalDimension: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly wasmannotationlayer_annotationCount: (a: number) => number;
    readonly wasmannotationlayer_clear: (a: number) => void;
    readonly wasmannotationlayer_isEmpty: (a: number) => number;
    readonly wasmannotationlayer_new: () => number;
    readonly wasmannotationlayer_renderAll: (a: number, b: number, c: number) => any;
    readonly solid_linearPattern: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly init: () => void;
    readonly solid_revolve: (a: any, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly solid_chamfer: (a: number, b: number) => number;
    readonly solid_fillet: (a: number, b: number) => number;
    readonly solid_shell: (a: number, b: number) => number;
    readonly solid_circularPattern: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly wasm_bindgen__closure__destroy__ha8b73a36ae48e470: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h250d7189f9770b99: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h60f25fed64173f82: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h4488ad9b37e81000: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__ha8b3f1b8e67fad08: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
