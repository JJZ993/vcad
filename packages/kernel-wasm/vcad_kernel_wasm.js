/* @ts-self-types="./vcad_kernel_wasm.d.ts" */

/**
 * A 3D solid geometry object.
 *
 * Create solids from primitives, combine with boolean operations,
 * transform, and extract triangle meshes for rendering.
 */
export class Solid {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Solid.prototype);
        obj.__wbg_ptr = ptr;
        SolidFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SolidFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_solid_free(ptr, 0);
    }
    /**
     * Get the bounding box as [minX, minY, minZ, maxX, maxY, maxZ].
     * @returns {Float64Array}
     */
    boundingBox() {
        const ret = wasm.solid_boundingBox(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Get the center of mass as [x, y, z].
     * @returns {Float64Array}
     */
    centerOfMass() {
        const ret = wasm.solid_centerOfMass(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Chamfer all edges of the solid by the given distance.
     * @param {number} distance
     * @returns {Solid}
     */
    chamfer(distance) {
        const ret = wasm.solid_chamfer(this.__wbg_ptr, distance);
        return Solid.__wrap(ret);
    }
    /**
     * Create a circular pattern of the solid around an axis.
     *
     * # Arguments
     *
     * * `axis_origin_x/y/z` - A point on the rotation axis
     * * `axis_dir_x/y/z` - Direction of the rotation axis
     * * `count` - Number of copies (including original)
     * * `angle_deg` - Total angle span in degrees
     * @param {number} axis_origin_x
     * @param {number} axis_origin_y
     * @param {number} axis_origin_z
     * @param {number} axis_dir_x
     * @param {number} axis_dir_y
     * @param {number} axis_dir_z
     * @param {number} count
     * @param {number} angle_deg
     * @returns {Solid}
     */
    circularPattern(axis_origin_x, axis_origin_y, axis_origin_z, axis_dir_x, axis_dir_y, axis_dir_z, count, angle_deg) {
        const ret = wasm.solid_circularPattern(this.__wbg_ptr, axis_origin_x, axis_origin_y, axis_origin_z, axis_dir_x, axis_dir_y, axis_dir_z, count, angle_deg);
        return Solid.__wrap(ret);
    }
    /**
     * Create a cone/frustum along Z axis.
     * @param {number} radius_bottom
     * @param {number} radius_top
     * @param {number} height
     * @param {number | null} [segments]
     * @returns {Solid}
     */
    static cone(radius_bottom, radius_top, height, segments) {
        const ret = wasm.solid_cone(radius_bottom, radius_top, height, isLikeNone(segments) ? 0x100000001 : (segments) >>> 0);
        return Solid.__wrap(ret);
    }
    /**
     * Create a box with corner at origin and dimensions (sx, sy, sz).
     * @param {number} sx
     * @param {number} sy
     * @param {number} sz
     * @returns {Solid}
     */
    static cube(sx, sy, sz) {
        const ret = wasm.solid_cube(sx, sy, sz);
        return Solid.__wrap(ret);
    }
    /**
     * Create a cylinder along Z axis with given radius and height.
     * @param {number} radius
     * @param {number} height
     * @param {number | null} [segments]
     * @returns {Solid}
     */
    static cylinder(radius, height, segments) {
        const ret = wasm.solid_cylinder(radius, height, isLikeNone(segments) ? 0x100000001 : (segments) >>> 0);
        return Solid.__wrap(ret);
    }
    /**
     * Boolean difference (self − other).
     * @param {Solid} other
     * @returns {Solid}
     */
    difference(other) {
        _assertClass(other, Solid);
        const ret = wasm.solid_difference(this.__wbg_ptr, other.__wbg_ptr);
        return Solid.__wrap(ret);
    }
    /**
     * Create an empty solid.
     * @returns {Solid}
     */
    static empty() {
        const ret = wasm.solid_empty();
        return Solid.__wrap(ret);
    }
    /**
     * Create a solid by extruding a 2D sketch profile.
     *
     * Takes a sketch profile and extrusion direction as JS objects.
     * @param {any} profile_js
     * @param {Float64Array} direction
     * @returns {Solid}
     */
    static extrude(profile_js, direction) {
        const ptr0 = passArrayF64ToWasm0(direction, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.solid_extrude(profile_js, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Solid.__wrap(ret[0]);
    }
    /**
     * Fillet all edges of the solid with the given radius.
     * @param {number} radius
     * @returns {Solid}
     */
    fillet(radius) {
        const ret = wasm.solid_fillet(this.__wbg_ptr, radius);
        return Solid.__wrap(ret);
    }
    /**
     * Get the triangle mesh representation.
     *
     * Returns a JS object with `positions` (Float32Array) and `indices` (Uint32Array).
     * @param {number | null} [segments]
     * @returns {any}
     */
    getMesh(segments) {
        const ret = wasm.solid_getMesh(this.__wbg_ptr, isLikeNone(segments) ? 0x100000001 : (segments) >>> 0);
        return ret;
    }
    /**
     * Generate a horizontal section view at a given Z height.
     *
     * Convenience method that creates a horizontal section plane.
     * @param {number} z
     * @param {number | null} [hatch_spacing]
     * @param {number | null} [hatch_angle]
     * @param {number | null} [segments]
     * @returns {any}
     */
    horizontalSection(z, hatch_spacing, hatch_angle, segments) {
        const ret = wasm.solid_horizontalSection(this.__wbg_ptr, z, !isLikeNone(hatch_spacing), isLikeNone(hatch_spacing) ? 0 : hatch_spacing, !isLikeNone(hatch_angle), isLikeNone(hatch_angle) ? 0 : hatch_angle, isLikeNone(segments) ? 0x100000001 : (segments) >>> 0);
        return ret;
    }
    /**
     * Boolean intersection (self ∩ other).
     * @param {Solid} other
     * @returns {Solid}
     */
    intersection(other) {
        _assertClass(other, Solid);
        const ret = wasm.solid_intersection(this.__wbg_ptr, other.__wbg_ptr);
        return Solid.__wrap(ret);
    }
    /**
     * Check if the solid is empty (has no geometry).
     * @returns {boolean}
     */
    isEmpty() {
        const ret = wasm.solid_isEmpty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Create a linear pattern of the solid along a direction.
     *
     * # Arguments
     *
     * * `dir_x`, `dir_y`, `dir_z` - Direction vector
     * * `count` - Number of copies (including original)
     * * `spacing` - Distance between copies
     * @param {number} dir_x
     * @param {number} dir_y
     * @param {number} dir_z
     * @param {number} count
     * @param {number} spacing
     * @returns {Solid}
     */
    linearPattern(dir_x, dir_y, dir_z, count, spacing) {
        const ret = wasm.solid_linearPattern(this.__wbg_ptr, dir_x, dir_y, dir_z, count, spacing);
        return Solid.__wrap(ret);
    }
    /**
     * Create a solid by lofting between multiple profiles.
     *
     * Takes an array of sketch profiles (minimum 2).
     * @param {any} profiles_js
     * @param {boolean | null} [closed]
     * @returns {Solid}
     */
    static loft(profiles_js, closed) {
        const ret = wasm.solid_loft(profiles_js, isLikeNone(closed) ? 0xFFFFFF : closed ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Solid.__wrap(ret[0]);
    }
    /**
     * Get the number of triangles in the tessellated mesh.
     * @returns {number}
     */
    numTriangles() {
        const ret = wasm.solid_numTriangles(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Project the solid to a 2D view for technical drawing.
     *
     * # Arguments
     * * `view_direction` - View direction: "front", "back", "top", "bottom", "left", "right", or "isometric"
     * * `segments` - Number of segments for tessellation (optional, default 32)
     *
     * # Returns
     * A JS object containing the projected view with edges and bounds.
     * @param {string} view_direction
     * @param {number | null} [segments]
     * @returns {any}
     */
    projectView(view_direction, segments) {
        const ptr0 = passStringToWasm0(view_direction, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.solid_projectView(this.__wbg_ptr, ptr0, len0, isLikeNone(segments) ? 0x100000001 : (segments) >>> 0);
        return ret;
    }
    /**
     * Create a solid by revolving a 2D sketch profile around an axis.
     *
     * Takes a sketch profile, axis origin, axis direction, and angle in degrees.
     * @param {any} profile_js
     * @param {Float64Array} axis_origin
     * @param {Float64Array} axis_dir
     * @param {number} angle_deg
     * @returns {Solid}
     */
    static revolve(profile_js, axis_origin, axis_dir, angle_deg) {
        const ptr0 = passArrayF64ToWasm0(axis_origin, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(axis_dir, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.solid_revolve(profile_js, ptr0, len0, ptr1, len1, angle_deg);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Solid.__wrap(ret[0]);
    }
    /**
     * Rotate the solid by angles in degrees around X, Y, Z axes.
     * @param {number} x_deg
     * @param {number} y_deg
     * @param {number} z_deg
     * @returns {Solid}
     */
    rotate(x_deg, y_deg, z_deg) {
        const ret = wasm.solid_rotate(this.__wbg_ptr, x_deg, y_deg, z_deg);
        return Solid.__wrap(ret);
    }
    /**
     * Scale the solid by (x, y, z).
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Solid}
     */
    scale(x, y, z) {
        const ret = wasm.solid_scale(this.__wbg_ptr, x, y, z);
        return Solid.__wrap(ret);
    }
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
     * @param {string} plane_json
     * @param {string | null} [hatch_json]
     * @param {number | null} [segments]
     * @returns {any}
     */
    sectionView(plane_json, hatch_json, segments) {
        const ptr0 = passStringToWasm0(plane_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(hatch_json) ? 0 : passStringToWasm0(hatch_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.solid_sectionView(this.__wbg_ptr, ptr0, len0, ptr1, len1, isLikeNone(segments) ? 0x100000001 : (segments) >>> 0);
        return ret;
    }
    /**
     * Shell (hollow) the solid by offsetting all faces inward.
     * @param {number} thickness
     * @returns {Solid}
     */
    shell(thickness) {
        const ret = wasm.solid_shell(this.__wbg_ptr, thickness);
        return Solid.__wrap(ret);
    }
    /**
     * Create a sphere centered at origin with given radius.
     * @param {number} radius
     * @param {number | null} [segments]
     * @returns {Solid}
     */
    static sphere(radius, segments) {
        const ret = wasm.solid_sphere(radius, isLikeNone(segments) ? 0x100000001 : (segments) >>> 0);
        return Solid.__wrap(ret);
    }
    /**
     * Compute the surface area of the solid.
     * @returns {number}
     */
    surfaceArea() {
        const ret = wasm.solid_surfaceArea(this.__wbg_ptr);
        return ret;
    }
    /**
     * Create a solid by sweeping a profile along a helix path.
     *
     * Takes a sketch profile and helix parameters.
     * @param {any} profile_js
     * @param {number} radius
     * @param {number} pitch
     * @param {number} height
     * @param {number} turns
     * @param {number | null} [twist_angle]
     * @param {number | null} [scale_start]
     * @param {number | null} [scale_end]
     * @param {number | null} [path_segments]
     * @param {number | null} [arc_segments]
     * @returns {Solid}
     */
    static sweepHelix(profile_js, radius, pitch, height, turns, twist_angle, scale_start, scale_end, path_segments, arc_segments) {
        const ret = wasm.solid_sweepHelix(profile_js, radius, pitch, height, turns, !isLikeNone(twist_angle), isLikeNone(twist_angle) ? 0 : twist_angle, !isLikeNone(scale_start), isLikeNone(scale_start) ? 0 : scale_start, !isLikeNone(scale_end), isLikeNone(scale_end) ? 0 : scale_end, isLikeNone(path_segments) ? 0x100000001 : (path_segments) >>> 0, isLikeNone(arc_segments) ? 0x100000001 : (arc_segments) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Solid.__wrap(ret[0]);
    }
    /**
     * Create a solid by sweeping a profile along a line path.
     *
     * Takes a sketch profile and path endpoints.
     * @param {any} profile_js
     * @param {Float64Array} start
     * @param {Float64Array} end
     * @param {number | null} [twist_angle]
     * @param {number | null} [scale_start]
     * @param {number | null} [scale_end]
     * @returns {Solid}
     */
    static sweepLine(profile_js, start, end, twist_angle, scale_start, scale_end) {
        const ptr0 = passArrayF64ToWasm0(start, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(end, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.solid_sweepLine(profile_js, ptr0, len0, ptr1, len1, !isLikeNone(twist_angle), isLikeNone(twist_angle) ? 0 : twist_angle, !isLikeNone(scale_start), isLikeNone(scale_start) ? 0 : scale_start, !isLikeNone(scale_end), isLikeNone(scale_end) ? 0 : scale_end);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Solid.__wrap(ret[0]);
    }
    /**
     * Translate the solid by (x, y, z).
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {Solid}
     */
    translate(x, y, z) {
        const ret = wasm.solid_translate(this.__wbg_ptr, x, y, z);
        return Solid.__wrap(ret);
    }
    /**
     * Boolean union (self ∪ other).
     * @param {Solid} other
     * @returns {Solid}
     */
    union(other) {
        _assertClass(other, Solid);
        const ret = wasm.solid_union(this.__wbg_ptr, other.__wbg_ptr);
        return Solid.__wrap(ret);
    }
    /**
     * Compute the volume of the solid.
     * @returns {number}
     */
    volume() {
        const ret = wasm.solid_volume(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) Solid.prototype[Symbol.dispose] = Solid.prototype.free;

/**
 * Annotation layer for dimension annotations.
 *
 * This class provides methods for creating and rendering dimension annotations
 * on 2D projected views.
 */
export class WasmAnnotationLayer {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAnnotationLayerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmannotationlayer_free(ptr, 0);
    }
    /**
     * Add an aligned dimension between two points.
     *
     * The dimension line is parallel to the line connecting the two points.
     *
     * # Arguments
     * * `x1`, `y1` - First point coordinates
     * * `x2`, `y2` - Second point coordinates
     * * `offset` - Distance from points to dimension line
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} offset
     */
    addAlignedDimension(x1, y1, x2, y2, offset) {
        wasm.wasmannotationlayer_addAlignedDimension(this.__wbg_ptr, x1, y1, x2, y2, offset);
    }
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
     * @param {number} x1
     * @param {number} y1
     * @param {number} vx
     * @param {number} vy
     * @param {number} x2
     * @param {number} y2
     * @param {number} arc_radius
     */
    addAngleDimension(x1, y1, vx, vy, x2, y2, arc_radius) {
        wasm.wasmannotationlayer_addAngleDimension(this.__wbg_ptr, x1, y1, vx, vy, x2, y2, arc_radius);
    }
    /**
     * Add a diameter dimension for a circle.
     *
     * # Arguments
     * * `cx`, `cy` - Center of the circle
     * * `radius` - Radius of the circle
     * * `leader_angle` - Angle in radians for the leader line direction
     * @param {number} cx
     * @param {number} cy
     * @param {number} radius
     * @param {number} leader_angle
     */
    addDiameterDimension(cx, cy, radius, leader_angle) {
        wasm.wasmannotationlayer_addDiameterDimension(this.__wbg_ptr, cx, cy, radius, leader_angle);
    }
    /**
     * Add a horizontal dimension between two points.
     *
     * # Arguments
     * * `x1`, `y1` - First point coordinates
     * * `x2`, `y2` - Second point coordinates
     * * `offset` - Distance from points to dimension line (positive = above)
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} offset
     */
    addHorizontalDimension(x1, y1, x2, y2, offset) {
        wasm.wasmannotationlayer_addHorizontalDimension(this.__wbg_ptr, x1, y1, x2, y2, offset);
    }
    /**
     * Add a radius dimension for a circle.
     *
     * # Arguments
     * * `cx`, `cy` - Center of the circle
     * * `radius` - Radius of the circle
     * * `leader_angle` - Angle in radians for the leader line direction
     * @param {number} cx
     * @param {number} cy
     * @param {number} radius
     * @param {number} leader_angle
     */
    addRadiusDimension(cx, cy, radius, leader_angle) {
        wasm.wasmannotationlayer_addRadiusDimension(this.__wbg_ptr, cx, cy, radius, leader_angle);
    }
    /**
     * Add a vertical dimension between two points.
     *
     * # Arguments
     * * `x1`, `y1` - First point coordinates
     * * `x2`, `y2` - Second point coordinates
     * * `offset` - Distance from points to dimension line (positive = right)
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} offset
     */
    addVerticalDimension(x1, y1, x2, y2, offset) {
        wasm.wasmannotationlayer_addVerticalDimension(this.__wbg_ptr, x1, y1, x2, y2, offset);
    }
    /**
     * Get the number of annotations in the layer.
     * @returns {number}
     */
    annotationCount() {
        const ret = wasm.wasmannotationlayer_annotationCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Clear all annotations from the layer.
     */
    clear() {
        wasm.wasmannotationlayer_clear(this.__wbg_ptr);
    }
    /**
     * Check if the layer has any annotations.
     * @returns {boolean}
     */
    isEmpty() {
        const ret = wasm.wasmannotationlayer_isEmpty(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Create a new empty annotation layer.
     */
    constructor() {
        const ret = wasm.wasmannotationlayer_new();
        this.__wbg_ptr = ret >>> 0;
        WasmAnnotationLayerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
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
     * @param {string | null} [view_json]
     * @returns {any}
     */
    renderAll(view_json) {
        var ptr0 = isLikeNone(view_json) ? 0 : passStringToWasm0(view_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmannotationlayer_renderAll(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
}
if (Symbol.dispose) WasmAnnotationLayer.prototype[Symbol.dispose] = WasmAnnotationLayer.prototype.free;

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
 * @param {string} parent_json
 * @param {number} center_x
 * @param {number} center_y
 * @param {number} scale
 * @param {number} width
 * @param {number} height
 * @param {string} label
 * @returns {any}
 */
export function createDetailView(parent_json, center_x, center_y, scale, width, height, label) {
    const ptr0 = passStringToWasm0(parent_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(label, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.createDetailView(ptr0, len0, center_x, center_y, scale, width, height, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

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
 * @param {string} view_json
 * @returns {Uint8Array}
 */
export function exportProjectedViewToDxf(view_json) {
    const ptr0 = passStringToWasm0(view_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportProjectedViewToDxf(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

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
 * @param {Uint8Array} data
 * @returns {any}
 */
export function importStepBuffer(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.importStepBuffer(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Initialize the WASM module (sets up panic hook for better error messages).
 */
export function init() {
    wasm.init();
}

/**
 * Project a triangle mesh to a 2D view.
 *
 * # Arguments
 * * `mesh_js` - Mesh data as JS object with `positions` (Float32Array) and `indices` (Uint32Array)
 * * `view_direction` - View direction: "front", "back", "top", "bottom", "left", "right", or "isometric"
 *
 * # Returns
 * A JS object containing the projected view with edges and bounds.
 * @param {any} mesh_js
 * @param {string} view_direction
 * @returns {any}
 */
export function projectMesh(mesh_js, view_direction) {
    const ptr0 = passStringToWasm0(view_direction, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.projectMesh(mesh_js, ptr0, len0);
    return ret;
}

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
 * @param {any} mesh_js
 * @param {string} plane_json
 * @param {string | null} [hatch_json]
 * @returns {any}
 */
export function sectionMesh(mesh_js, plane_json, hatch_json) {
    const ptr0 = passStringToWasm0(plane_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(hatch_json) ? 0 : passStringToWasm0(hatch_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.sectionMesh(mesh_js, ptr0, len0, ptr1, len1);
    return ret;
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_8c4e43fe74559d73: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_04624de7d0e8332d: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8f0eb39a4a4c2f66: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_8fcf4ce7f1ca72a2: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_bbbb1c18aa2f5e25: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_0bc8482c6e3508ae: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_47fa6863be6f2f25: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_31b12575b56f32fc: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_0095a73b8b156f76: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_5ae8e5880f2c1fbd: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_undefined_9e4d92534c42d778: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_11888390b0186270: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_9dd77d8cd6671811: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_8ff4255516ccad3e: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_72fb696202c56729: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_389efe28435a9388: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_done_57b39ecd9addfe81: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_58c7934c745daac7: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_error_7534b8e9a36f1ab4: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_get_9b94d73e6221f75c: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_b3ed3ad4be2bc8ac: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_with_ref_key_1dc361bd10053bfe: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_c367199e2fa2aa04: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_53af74335dec57f4: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_9b9075935c74707c: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_d314bb98fcf08331: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_bfbc7332a9768d2a: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_6ff6560ca1568e55: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_32ed9a279acd054c: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_35a7bace40f36eac: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_361308b2356cecd0: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_3eb36ae241fe6f44: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_8a6f238a6ece86ea: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_dd2b680c8bf6ae29: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_next_3482f54c49e8af19: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_next_418f80d8f5303233: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_prototypesetcall_bdcdcc5842e4d77d: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_set_3f1d0b984ed272ed: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_f43e577aea94465b: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_stack_0ed75d68575b0f3c: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_value_0546255b415e96c1: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./vcad_kernel_wasm_bg.js": import0,
    };
}

const SolidFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_solid_free(ptr >>> 0, 1));
const WasmAnnotationLayerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmannotationlayer_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('vcad_kernel_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
