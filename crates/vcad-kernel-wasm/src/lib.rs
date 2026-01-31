//! WASM bindings for the vcad B-rep kernel.
//!
//! Exposes the [`Solid`] type for use in JavaScript/TypeScript via wasm-bindgen.

use serde::{Deserialize, Serialize};
use vcad_kernel::vcad_kernel_math::{Point2, Point3, Vec3};
use vcad_kernel::vcad_kernel_sketch::{SketchProfile, SketchSegment};
use wasm_bindgen::prelude::*;

/// Initialize the WASM module (sets up panic hook for better error messages).
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
    // Version marker to verify correct WASM is loaded
    web_sys::console::log_1(&"[WASM] vcad-kernel-wasm v2 loaded (boolean fix included)".into());
}

/// Triangle mesh output for rendering.
#[derive(Serialize, Deserialize)]
pub struct WasmMesh {
    /// Flat array of vertex positions: [x0, y0, z0, x1, y1, z1, ...]
    pub positions: Vec<f32>,
    /// Flat array of triangle indices: [i0, i1, i2, ...]
    pub indices: Vec<u32>,
}

/// A 2D sketch segment (line or arc) for WASM input.
#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WasmSketchSegment {
    Line {
        start: [f64; 2],
        end: [f64; 2],
    },
    Arc {
        start: [f64; 2],
        end: [f64; 2],
        center: [f64; 2],
        ccw: bool,
    },
}

/// Input for creating a sketch profile from JS.
#[derive(Serialize, Deserialize)]
pub struct WasmSketchProfile {
    /// Origin point of the sketch plane [x, y, z].
    pub origin: [f64; 3],
    /// X direction vector [x, y, z].
    pub x_dir: [f64; 3],
    /// Y direction vector [x, y, z].
    pub y_dir: [f64; 3],
    /// Segments forming the closed profile.
    pub segments: Vec<WasmSketchSegment>,
}

impl WasmSketchProfile {
    fn to_kernel_profile(&self) -> Result<SketchProfile, String> {
        let segments: Vec<SketchSegment> = self
            .segments
            .iter()
            .map(|s| match s {
                WasmSketchSegment::Line { start, end } => SketchSegment::Line {
                    start: Point2::new(start[0], start[1]),
                    end: Point2::new(end[0], end[1]),
                },
                WasmSketchSegment::Arc {
                    start,
                    end,
                    center,
                    ccw,
                } => SketchSegment::Arc {
                    start: Point2::new(start[0], start[1]),
                    end: Point2::new(end[0], end[1]),
                    center: Point2::new(center[0], center[1]),
                    ccw: *ccw,
                },
            })
            .collect();

        SketchProfile::new(
            Point3::new(self.origin[0], self.origin[1], self.origin[2]),
            Vec3::new(self.x_dir[0], self.x_dir[1], self.x_dir[2]),
            Vec3::new(self.y_dir[0], self.y_dir[1], self.y_dir[2]),
            segments,
        )
        .map_err(|e| e.to_string())
    }
}

/// A 3D solid geometry object.
///
/// Create solids from primitives, combine with boolean operations,
/// transform, and extract triangle meshes for rendering.
#[wasm_bindgen]
pub struct Solid {
    inner: vcad_kernel::Solid,
}

#[wasm_bindgen]
impl Solid {
    // =========================================================================
    // Constructors
    // =========================================================================

    /// Create an empty solid.
    #[wasm_bindgen(js_name = empty)]
    pub fn empty() -> Solid {
        Solid {
            inner: vcad_kernel::Solid::empty(),
        }
    }

    /// Create a box with corner at origin and dimensions (sx, sy, sz).
    #[wasm_bindgen(js_name = cube)]
    pub fn cube(sx: f64, sy: f64, sz: f64) -> Solid {
        let solid = Solid {
            inner: vcad_kernel::Solid::cube(sx, sy, sz),
        };
        let (min, max) = solid.inner.bounding_box();
        web_sys::console::log_1(&format!(
            "[WASM] Created cube({},{},{}): bbox=[{:.2},{:.2},{:.2}]->[{:.2},{:.2},{:.2}]",
            sx, sy, sz, min[0], min[1], min[2], max[0], max[1], max[2]
        ).into());
        solid
    }

    /// Create a cylinder along Z axis with given radius and height.
    #[wasm_bindgen(js_name = cylinder)]
    pub fn cylinder(radius: f64, height: f64, segments: Option<u32>) -> Solid {
        let segs = segments.unwrap_or(32);
        let solid = Solid {
            inner: vcad_kernel::Solid::cylinder(radius, height, segs),
        };
        let (min, max) = solid.inner.bounding_box();
        web_sys::console::log_1(&format!(
            "[WASM] Created cylinder(r={}, h={}, segs={}): bbox=[{:.2},{:.2},{:.2}]->[{:.2},{:.2},{:.2}]",
            radius, height, segs, min[0], min[1], min[2], max[0], max[1], max[2]
        ).into());
        solid
    }

    /// Create a sphere centered at origin with given radius.
    #[wasm_bindgen(js_name = sphere)]
    pub fn sphere(radius: f64, segments: Option<u32>) -> Solid {
        Solid {
            inner: vcad_kernel::Solid::sphere(radius, segments.unwrap_or(32)),
        }
    }

    /// Create a cone/frustum along Z axis.
    #[wasm_bindgen(js_name = cone)]
    pub fn cone(radius_bottom: f64, radius_top: f64, height: f64, segments: Option<u32>) -> Solid {
        Solid {
            inner: vcad_kernel::Solid::cone(
                radius_bottom,
                radius_top,
                height,
                segments.unwrap_or(32),
            ),
        }
    }

    /// Create a solid by extruding a 2D sketch profile.
    ///
    /// Takes a sketch profile and extrusion direction as JS objects.
    #[wasm_bindgen(js_name = extrude)]
    pub fn extrude(profile_js: JsValue, direction: Vec<f64>) -> Result<Solid, JsError> {
        let profile: WasmSketchProfile = serde_wasm_bindgen::from_value(profile_js)
            .map_err(|e| JsError::new(&format!("Invalid profile: {}", e)))?;

        if direction.len() != 3 {
            return Err(JsError::new("Direction must have 3 components"));
        }

        let kernel_profile = profile.to_kernel_profile().map_err(|e| JsError::new(&e))?;

        let dir = Vec3::new(direction[0], direction[1], direction[2]);

        vcad_kernel::Solid::extrude(kernel_profile, dir)
            .map(|inner| Solid { inner })
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Create a solid by revolving a 2D sketch profile around an axis.
    ///
    /// Takes a sketch profile, axis origin, axis direction, and angle in degrees.
    #[wasm_bindgen(js_name = revolve)]
    pub fn revolve(
        profile_js: JsValue,
        axis_origin: Vec<f64>,
        axis_dir: Vec<f64>,
        angle_deg: f64,
    ) -> Result<Solid, JsError> {
        let profile: WasmSketchProfile = serde_wasm_bindgen::from_value(profile_js)
            .map_err(|e| JsError::new(&format!("Invalid profile: {}", e)))?;

        if axis_origin.len() != 3 || axis_dir.len() != 3 {
            return Err(JsError::new(
                "Axis origin and direction must have 3 components",
            ));
        }

        let kernel_profile = profile.to_kernel_profile().map_err(|e| JsError::new(&e))?;

        let origin = Point3::new(axis_origin[0], axis_origin[1], axis_origin[2]);
        let dir = Vec3::new(axis_dir[0], axis_dir[1], axis_dir[2]);

        vcad_kernel::Solid::revolve(kernel_profile, origin, dir, angle_deg)
            .map(|inner| Solid { inner })
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Create a solid by sweeping a profile along a line path.
    ///
    /// Takes a sketch profile and path endpoints.
    #[wasm_bindgen(js_name = sweepLine)]
    pub fn sweep_line(
        profile_js: JsValue,
        start: Vec<f64>,
        end: Vec<f64>,
        twist_angle: Option<f64>,
        scale_start: Option<f64>,
        scale_end: Option<f64>,
    ) -> Result<Solid, JsError> {
        use vcad_kernel::vcad_kernel_geom::Line3d;
        use vcad_kernel::vcad_kernel_sweep::SweepOptions;

        let profile: WasmSketchProfile = serde_wasm_bindgen::from_value(profile_js)
            .map_err(|e| JsError::new(&format!("Invalid profile: {}", e)))?;

        if start.len() != 3 || end.len() != 3 {
            return Err(JsError::new("Start and end must have 3 components"));
        }

        let kernel_profile = profile.to_kernel_profile().map_err(|e| JsError::new(&e))?;

        let path = Line3d::from_points(
            Point3::new(start[0], start[1], start[2]),
            Point3::new(end[0], end[1], end[2]),
        );

        let options = SweepOptions {
            twist_angle: twist_angle.unwrap_or(0.0),
            scale_start: scale_start.unwrap_or(1.0),
            scale_end: scale_end.unwrap_or(1.0),
            ..Default::default()
        };

        vcad_kernel::Solid::sweep(kernel_profile, &path, options)
            .map(|inner| Solid { inner })
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Create a solid by sweeping a profile along a helix path.
    ///
    /// Takes a sketch profile and helix parameters.
    #[wasm_bindgen(js_name = sweepHelix)]
    #[allow(clippy::too_many_arguments)]
    pub fn sweep_helix(
        profile_js: JsValue,
        radius: f64,
        pitch: f64,
        height: f64,
        turns: f64,
        twist_angle: Option<f64>,
        scale_start: Option<f64>,
        scale_end: Option<f64>,
        path_segments: Option<u32>,
        arc_segments: Option<u32>,
    ) -> Result<Solid, JsError> {
        use vcad_kernel::vcad_kernel_sweep::{Helix, SweepOptions};

        let profile: WasmSketchProfile = serde_wasm_bindgen::from_value(profile_js)
            .map_err(|e| JsError::new(&format!("Invalid profile: {}", e)))?;

        let kernel_profile = profile.to_kernel_profile().map_err(|e| JsError::new(&e))?;

        let path = Helix::new(radius, pitch, height, turns);

        let options = SweepOptions {
            twist_angle: twist_angle.unwrap_or(0.0),
            scale_start: scale_start.unwrap_or(1.0),
            scale_end: scale_end.unwrap_or(1.0),
            path_segments: path_segments.unwrap_or(0),
            arc_segments: arc_segments.unwrap_or(8),
        };

        vcad_kernel::Solid::sweep(kernel_profile, &path, options)
            .map(|inner| Solid { inner })
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// Create a solid by lofting between multiple profiles.
    ///
    /// Takes an array of sketch profiles (minimum 2).
    #[wasm_bindgen(js_name = loft)]
    pub fn loft(profiles_js: JsValue, closed: Option<bool>) -> Result<Solid, JsError> {
        use vcad_kernel::vcad_kernel_sweep::{LoftMode, LoftOptions};

        let profiles: Vec<WasmSketchProfile> = serde_wasm_bindgen::from_value(profiles_js)
            .map_err(|e| JsError::new(&format!("Invalid profiles: {}", e)))?;

        if profiles.len() < 2 {
            return Err(JsError::new("Loft requires at least 2 profiles"));
        }

        let kernel_profiles: Result<Vec<_>, _> =
            profiles.iter().map(|p| p.to_kernel_profile()).collect();
        let kernel_profiles = kernel_profiles.map_err(|e| JsError::new(&e))?;

        let options = LoftOptions {
            mode: LoftMode::Ruled,
            closed: closed.unwrap_or(false),
        };

        vcad_kernel::Solid::loft(&kernel_profiles, options)
            .map(|inner| Solid { inner })
            .map_err(|e| JsError::new(&e.to_string()))
    }

    // =========================================================================
    // Boolean operations
    // =========================================================================

    /// Boolean union (self ∪ other).
    #[wasm_bindgen(js_name = union)]
    pub fn union(&self, other: &Solid) -> Solid {
        Solid {
            inner: self.inner.union(&other.inner),
        }
    }

    /// Boolean difference (self − other).
    #[wasm_bindgen(js_name = difference)]
    pub fn difference(&self, other: &Solid) -> Solid {
        // Log input solid info with more detail
        let self_tris = self.inner.num_triangles();
        let other_tris = other.inner.num_triangles();

        // Get detailed info about inputs
        let (self_min, self_max) = self.inner.bounding_box();
        let (other_min, other_max) = other.inner.bounding_box();

        web_sys::console::log_1(&format!(
            "[WASM] Boolean difference inputs:\n  self: {} tris, bbox=[{:.2},{:.2},{:.2}]->[{:.2},{:.2},{:.2}]\n  other: {} tris, bbox=[{:.2},{:.2},{:.2}]->[{:.2},{:.2},{:.2}]",
            self_tris, self_min[0], self_min[1], self_min[2], self_max[0], self_max[1], self_max[2],
            other_tris, other_min[0], other_min[1], other_min[2], other_max[0], other_max[1], other_max[2]
        ).into());

        let result = Solid {
            inner: self.inner.difference(&other.inner),
        };

        let result_tris_before_mesh = result.inner.num_triangles();
        let (result_min, result_max) = result.inner.bounding_box();
        web_sys::console::log_1(&format!(
            "[WASM] Difference result: {} tris, bbox=[{:.2},{:.2},{:.2}]->[{:.2},{:.2},{:.2}]",
            result_tris_before_mesh,
            result_min[0], result_min[1], result_min[2],
            result_max[0], result_max[1], result_max[2]
        ).into());

        let mesh = result.inner.to_mesh(32);
        let tris = mesh.indices.len() / 3;
        let verts = mesh.vertices.len() / 3;
        web_sys::console::log_1(&format!("[WASM] Difference mesh (32 segs): {} triangles, {} vertices", tris, verts).into());

        // Analyze the mesh to find any problematic triangles
        // Check for triangles with NEGATIVE x or y coordinates (the "ears")
        let mut negative_x_tris = Vec::new();
        let mut negative_y_tris = Vec::new();
        // Also check triangles on z=0 plane (bottom cap)
        let mut z0_cap_tris = Vec::new();

        for i in (0..mesh.indices.len()).step_by(3) {
            let i0 = mesh.indices[i] as usize * 3;
            let i1 = mesh.indices[i + 1] as usize * 3;
            let i2 = mesh.indices[i + 2] as usize * 3;
            let v0 = [mesh.vertices[i0], mesh.vertices[i0 + 1], mesh.vertices[i0 + 2]];
            let v1 = [mesh.vertices[i1], mesh.vertices[i1 + 1], mesh.vertices[i1 + 2]];
            let v2 = [mesh.vertices[i2], mesh.vertices[i2 + 1], mesh.vertices[i2 + 2]];

            // Check for any vertex with negative x
            if v0[0] < -0.01 || v1[0] < -0.01 || v2[0] < -0.01 {
                negative_x_tris.push(format!(
                    "({:.2},{:.2},{:.2})-({:.2},{:.2},{:.2})-({:.2},{:.2},{:.2})",
                    v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]
                ));
            }

            // Check for any vertex with negative y
            if v0[1] < -0.01 || v1[1] < -0.01 || v2[1] < -0.01 {
                negative_y_tris.push(format!(
                    "({:.2},{:.2},{:.2})-({:.2},{:.2},{:.2})-({:.2},{:.2},{:.2})",
                    v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]
                ));
            }

            // Check triangles on z=0 plane (the bottom cap where ears appear)
            if v0[2].abs() < 0.1 && v1[2].abs() < 0.1 && v2[2].abs() < 0.1 {
                z0_cap_tris.push(format!(
                    "({:.2},{:.2},{:.2})-({:.2},{:.2},{:.2})-({:.2},{:.2},{:.2})",
                    v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]
                ));
            }
        }

        web_sys::console::log_1(&format!("[WASM] Triangles with NEGATIVE x: {}", negative_x_tris.len()).into());
        for (i, tri) in negative_x_tris.iter().take(10).enumerate() {
            web_sys::console::log_1(&format!("[WASM]   neg_x tri {}: {}", i, tri).into());
        }

        web_sys::console::log_1(&format!("[WASM] Triangles with NEGATIVE y: {}", negative_y_tris.len()).into());
        for (i, tri) in negative_y_tris.iter().take(10).enumerate() {
            web_sys::console::log_1(&format!("[WASM]   neg_y tri {}: {}", i, tri).into());
        }

        web_sys::console::log_1(&format!("[WASM] Triangles on z=0 cap: {}", z0_cap_tris.len()).into());
        for (i, tri) in z0_cap_tris.iter().enumerate() {
            web_sys::console::log_1(&format!("[WASM]   z0_cap tri {}: {}", i, tri).into());
        }

        // Compute actual bounding box from mesh
        let mut min_x = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut min_z = f32::INFINITY;
        let mut max_z = f32::NEG_INFINITY;
        for i in (0..mesh.vertices.len()).step_by(3) {
            let x = mesh.vertices[i];
            let y = mesh.vertices[i + 1];
            let z = mesh.vertices[i + 2];
            min_x = min_x.min(x);
            max_x = max_x.max(x);
            min_y = min_y.min(y);
            max_y = max_y.max(y);
            min_z = min_z.min(z);
            max_z = max_z.max(z);
        }
        web_sys::console::log_1(&format!(
            "[WASM] Mesh BBox: [{:.2},{:.2},{:.2}] -> [{:.2},{:.2},{:.2}]",
            min_x, min_y, min_z, max_x, max_y, max_z
        ).into());

        result
    }

    /// Boolean intersection (self ∩ other).
    #[wasm_bindgen(js_name = intersection)]
    pub fn intersection(&self, other: &Solid) -> Solid {
        Solid {
            inner: self.inner.intersection(&other.inner),
        }
    }

    // =========================================================================
    // Transforms
    // =========================================================================

    /// Translate the solid by (x, y, z).
    #[wasm_bindgen(js_name = translate)]
    pub fn translate(&self, x: f64, y: f64, z: f64) -> Solid {
        Solid {
            inner: self.inner.translate(x, y, z),
        }
    }

    /// Rotate the solid by angles in degrees around X, Y, Z axes.
    #[wasm_bindgen(js_name = rotate)]
    pub fn rotate(&self, x_deg: f64, y_deg: f64, z_deg: f64) -> Solid {
        Solid {
            inner: self.inner.rotate(x_deg, y_deg, z_deg),
        }
    }

    /// Scale the solid by (x, y, z).
    #[wasm_bindgen(js_name = scale)]
    pub fn scale(&self, x: f64, y: f64, z: f64) -> Solid {
        Solid {
            inner: self.inner.scale(x, y, z),
        }
    }

    // =========================================================================
    // Fillet & Chamfer
    // =========================================================================

    /// Chamfer all edges of the solid by the given distance.
    #[wasm_bindgen(js_name = chamfer)]
    pub fn chamfer(&self, distance: f64) -> Solid {
        Solid {
            inner: self.inner.chamfer(distance),
        }
    }

    /// Fillet all edges of the solid with the given radius.
    #[wasm_bindgen(js_name = fillet)]
    pub fn fillet(&self, radius: f64) -> Solid {
        Solid {
            inner: self.inner.fillet(radius),
        }
    }

    /// Shell (hollow) the solid by offsetting all faces inward.
    #[wasm_bindgen(js_name = shell)]
    pub fn shell(&self, thickness: f64) -> Solid {
        Solid {
            inner: self.inner.shell(thickness),
        }
    }

    // =========================================================================
    // Pattern operations
    // =========================================================================

    /// Create a linear pattern of the solid along a direction.
    ///
    /// # Arguments
    ///
    /// * `dir_x`, `dir_y`, `dir_z` - Direction vector
    /// * `count` - Number of copies (including original)
    /// * `spacing` - Distance between copies
    #[wasm_bindgen(js_name = linearPattern)]
    pub fn linear_pattern(
        &self,
        dir_x: f64,
        dir_y: f64,
        dir_z: f64,
        count: u32,
        spacing: f64,
    ) -> Solid {
        use vcad_kernel::vcad_kernel_math::Vec3;
        Solid {
            inner: self
                .inner
                .linear_pattern(Vec3::new(dir_x, dir_y, dir_z), count, spacing),
        }
    }

    /// Create a circular pattern of the solid around an axis.
    ///
    /// # Arguments
    ///
    /// * `axis_origin_x/y/z` - A point on the rotation axis
    /// * `axis_dir_x/y/z` - Direction of the rotation axis
    /// * `count` - Number of copies (including original)
    /// * `angle_deg` - Total angle span in degrees
    #[wasm_bindgen(js_name = circularPattern)]
    #[allow(clippy::too_many_arguments)]
    pub fn circular_pattern(
        &self,
        axis_origin_x: f64,
        axis_origin_y: f64,
        axis_origin_z: f64,
        axis_dir_x: f64,
        axis_dir_y: f64,
        axis_dir_z: f64,
        count: u32,
        angle_deg: f64,
    ) -> Solid {
        use vcad_kernel::vcad_kernel_math::{Point3, Vec3};
        Solid {
            inner: self.inner.circular_pattern(
                Point3::new(axis_origin_x, axis_origin_y, axis_origin_z),
                Vec3::new(axis_dir_x, axis_dir_y, axis_dir_z),
                count,
                angle_deg,
            ),
        }
    }

    // =========================================================================
    // Queries
    // =========================================================================

    /// Check if the solid is empty (has no geometry).
    #[wasm_bindgen(js_name = isEmpty)]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Get the triangle mesh representation.
    ///
    /// Returns a JS object with `positions` (Float32Array) and `indices` (Uint32Array).
    #[wasm_bindgen(js_name = getMesh)]
    pub fn get_mesh(&self, segments: Option<u32>) -> JsValue {
        let mesh = self.inner.to_mesh(segments.unwrap_or(32));
        let wasm_mesh = WasmMesh {
            positions: mesh.vertices,
            indices: mesh.indices,
        };
        serde_wasm_bindgen::to_value(&wasm_mesh).unwrap_or(JsValue::NULL)
    }

    /// Compute the volume of the solid.
    #[wasm_bindgen(js_name = volume)]
    pub fn volume(&self) -> f64 {
        self.inner.volume()
    }

    /// Compute the surface area of the solid.
    #[wasm_bindgen(js_name = surfaceArea)]
    pub fn surface_area(&self) -> f64 {
        self.inner.surface_area()
    }

    /// Get the bounding box as [minX, minY, minZ, maxX, maxY, maxZ].
    #[wasm_bindgen(js_name = boundingBox)]
    pub fn bounding_box(&self) -> Vec<f64> {
        let (min, max) = self.inner.bounding_box();
        vec![min[0], min[1], min[2], max[0], max[1], max[2]]
    }

    /// Get the center of mass as [x, y, z].
    #[wasm_bindgen(js_name = centerOfMass)]
    pub fn center_of_mass(&self) -> Vec<f64> {
        let com = self.inner.center_of_mass();
        vec![com[0], com[1], com[2]]
    }

    /// Get the number of triangles in the tessellated mesh.
    #[wasm_bindgen(js_name = numTriangles)]
    pub fn num_triangles(&self) -> usize {
        self.inner.num_triangles()
    }

    /// Generate a section view by cutting the solid with a plane.
    ///
    /// # Arguments
    /// * `plane_json` - JSON string with plane definition: `{"origin": [x,y,z], "normal": [x,y,z], "up": [x,y,z]}`
    /// * `hatch_json` - Optional JSON string with hatch pattern: `{"spacing": f64, "angle": f64}`
    /// * `segments` - Number of segments for tessellation (optional, default 32)
    ///
    /// # Returns
    /// A JS object containing the section view with curves, hatch lines, and bounds.
    #[wasm_bindgen(js_name = sectionView)]
    pub fn section_view(
        &self,
        plane_json: &str,
        hatch_json: Option<String>,
        segments: Option<u32>,
    ) -> JsValue {
        use vcad_kernel_drafting::{section_mesh, HatchPattern, SectionPlane};

        // Parse plane
        let plane: SectionPlane = match serde_json::from_str(plane_json) {
            Ok(p) => p,
            Err(_) => return JsValue::NULL,
        };

        // Parse optional hatch pattern
        let hatch: Option<HatchPattern> = hatch_json.and_then(|h| serde_json::from_str(&h).ok());

        // Get mesh
        let mesh = self.inner.to_mesh(segments.unwrap_or(32));

        // Generate section view
        let view = section_mesh(&mesh, &plane, hatch.as_ref());

        serde_wasm_bindgen::to_value(&view).unwrap_or(JsValue::NULL)
    }

    /// Generate a horizontal section view at a given Z height.
    ///
    /// Convenience method that creates a horizontal section plane.
    #[wasm_bindgen(js_name = horizontalSection)]
    pub fn horizontal_section(
        &self,
        z: f64,
        hatch_spacing: Option<f64>,
        hatch_angle: Option<f64>,
        segments: Option<u32>,
    ) -> JsValue {
        use vcad_kernel_drafting::{section_mesh, HatchPattern, SectionPlane};

        let plane = SectionPlane::horizontal(z);

        let hatch = hatch_spacing.map(|spacing| {
            HatchPattern::new(spacing, hatch_angle.unwrap_or(std::f64::consts::FRAC_PI_4))
        });

        let mesh = self.inner.to_mesh(segments.unwrap_or(32));
        let view = section_mesh(&mesh, &plane, hatch.as_ref());

        serde_wasm_bindgen::to_value(&view).unwrap_or(JsValue::NULL)
    }

    /// Project the solid to a 2D view for technical drawing.
    ///
    /// # Arguments
    /// * `view_direction` - View direction: "front", "back", "top", "bottom", "left", "right", or "isometric"
    /// * `segments` - Number of segments for tessellation (optional, default 32)
    ///
    /// # Returns
    /// A JS object containing the projected view with edges and bounds.
    #[wasm_bindgen(js_name = projectView)]
    pub fn project_view(&self, view_direction: &str, segments: Option<u32>) -> JsValue {
        use vcad_kernel_drafting::{project_mesh, ViewDirection};

        let mesh = self.inner.to_mesh(segments.unwrap_or(32));

        let view_dir = match view_direction.to_lowercase().as_str() {
            "front" => ViewDirection::Front,
            "back" => ViewDirection::Back,
            "top" => ViewDirection::Top,
            "bottom" => ViewDirection::Bottom,
            "left" => ViewDirection::Left,
            "right" => ViewDirection::Right,
            "isometric" => ViewDirection::ISOMETRIC_STANDARD,
            _ => ViewDirection::Front,
        };

        let view = project_mesh(&mesh, view_dir);
        serde_wasm_bindgen::to_value(&view).unwrap_or(JsValue::NULL)
    }
}

// =========================================================================
// Standalone drafting functions
// =========================================================================

/// Generate a section view from a triangle mesh.
///
/// # Arguments
/// * `mesh_js` - Mesh data as JS object with `positions` (Float32Array) and `indices` (Uint32Array)
/// * `plane_json` - JSON string with plane definition: `{"origin": [x,y,z], "normal": [x,y,z], "up": [x,y,z]}`
/// * `hatch_json` - Optional JSON string with hatch pattern: `{"spacing": f64, "angle": f64}`
///
/// # Returns
/// A JS object containing the section view with curves, hatch lines, and bounds.
#[wasm_bindgen(js_name = sectionMesh)]
pub fn section_mesh_wasm(
    mesh_js: JsValue,
    plane_json: &str,
    hatch_json: Option<String>,
) -> JsValue {
    use vcad_kernel_drafting::{section_mesh, HatchPattern, SectionPlane};
    use vcad_kernel_tessellate::TriangleMesh;

    // Parse mesh from JS
    let mesh_data: WasmMesh = match serde_wasm_bindgen::from_value(mesh_js) {
        Ok(m) => m,
        Err(_) => return JsValue::NULL,
    };

    let mesh = TriangleMesh {
        vertices: mesh_data.positions,
        indices: mesh_data.indices,
        normals: Vec::new(),
    };

    // Parse plane
    let plane: SectionPlane = match serde_json::from_str(plane_json) {
        Ok(p) => p,
        Err(_) => return JsValue::NULL,
    };

    // Parse optional hatch pattern
    let hatch: Option<HatchPattern> = hatch_json.and_then(|h| serde_json::from_str(&h).ok());

    // Generate section view
    let view = section_mesh(&mesh, &plane, hatch.as_ref());

    serde_wasm_bindgen::to_value(&view).unwrap_or(JsValue::NULL)
}

/// Project a triangle mesh to a 2D view.
///
/// # Arguments
/// * `mesh_js` - Mesh data as JS object with `positions` (Float32Array) and `indices` (Uint32Array)
/// * `view_direction` - View direction: "front", "back", "top", "bottom", "left", "right", or "isometric"
///
/// # Returns
/// A JS object containing the projected view with edges and bounds.
#[wasm_bindgen(js_name = projectMesh)]
pub fn project_mesh_wasm(mesh_js: JsValue, view_direction: &str) -> JsValue {
    use vcad_kernel_drafting::{project_mesh, ViewDirection};
    use vcad_kernel_tessellate::TriangleMesh;

    // Parse mesh from JS
    let mesh_data: WasmMesh = match serde_wasm_bindgen::from_value(mesh_js) {
        Ok(m) => m,
        Err(_) => return JsValue::NULL,
    };

    let mesh = TriangleMesh {
        vertices: mesh_data.positions,
        indices: mesh_data.indices,
        normals: Vec::new(),
    };

    let view_dir = match view_direction.to_lowercase().as_str() {
        "front" => ViewDirection::Front,
        "back" => ViewDirection::Back,
        "top" => ViewDirection::Top,
        "bottom" => ViewDirection::Bottom,
        "left" => ViewDirection::Left,
        "right" => ViewDirection::Right,
        "isometric" => ViewDirection::ISOMETRIC_STANDARD,
        _ => ViewDirection::Front,
    };

    let view = project_mesh(&mesh, view_dir);
    serde_wasm_bindgen::to_value(&view).unwrap_or(JsValue::NULL)
}

// =========================================================================
// Dimension annotation bindings
// =========================================================================

/// Annotation layer for dimension annotations.
///
/// This class provides methods for creating and rendering dimension annotations
/// on 2D projected views.
#[wasm_bindgen]
pub struct WasmAnnotationLayer {
    inner: vcad_kernel_drafting::AnnotationLayer,
}

#[wasm_bindgen]
impl WasmAnnotationLayer {
    /// Create a new empty annotation layer.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: vcad_kernel_drafting::AnnotationLayer::new(),
        }
    }

    /// Add a horizontal dimension between two points.
    ///
    /// # Arguments
    /// * `x1`, `y1` - First point coordinates
    /// * `x2`, `y2` - Second point coordinates
    /// * `offset` - Distance from points to dimension line (positive = above)
    #[wasm_bindgen(js_name = addHorizontalDimension)]
    pub fn add_horizontal_dimension(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, offset: f64) {
        use vcad_kernel_drafting::Point2D;
        self.inner.add_horizontal_dimension(
            Point2D::new(x1, y1),
            Point2D::new(x2, y2),
            offset,
        );
    }

    /// Add a vertical dimension between two points.
    ///
    /// # Arguments
    /// * `x1`, `y1` - First point coordinates
    /// * `x2`, `y2` - Second point coordinates
    /// * `offset` - Distance from points to dimension line (positive = right)
    #[wasm_bindgen(js_name = addVerticalDimension)]
    pub fn add_vertical_dimension(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, offset: f64) {
        use vcad_kernel_drafting::Point2D;
        self.inner.add_vertical_dimension(
            Point2D::new(x1, y1),
            Point2D::new(x2, y2),
            offset,
        );
    }

    /// Add an aligned dimension between two points.
    ///
    /// The dimension line is parallel to the line connecting the two points.
    ///
    /// # Arguments
    /// * `x1`, `y1` - First point coordinates
    /// * `x2`, `y2` - Second point coordinates
    /// * `offset` - Distance from points to dimension line
    #[wasm_bindgen(js_name = addAlignedDimension)]
    pub fn add_aligned_dimension(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, offset: f64) {
        use vcad_kernel_drafting::Point2D;
        self.inner.add_aligned_dimension(
            Point2D::new(x1, y1),
            Point2D::new(x2, y2),
            offset,
        );
    }

    /// Add a diameter dimension for a circle.
    ///
    /// # Arguments
    /// * `cx`, `cy` - Center of the circle
    /// * `radius` - Radius of the circle
    /// * `leader_angle` - Angle in radians for the leader line direction
    #[wasm_bindgen(js_name = addDiameterDimension)]
    pub fn add_diameter_dimension(&mut self, cx: f64, cy: f64, radius: f64, leader_angle: f64) {
        use vcad_kernel_drafting::GeometryRef;
        self.inner.add_diameter_dimension(
            GeometryRef::Circle {
                center: vcad_kernel_drafting::Point2D::new(cx, cy),
                radius,
            },
            leader_angle,
        );
    }

    /// Add a radius dimension for a circle.
    ///
    /// # Arguments
    /// * `cx`, `cy` - Center of the circle
    /// * `radius` - Radius of the circle
    /// * `leader_angle` - Angle in radians for the leader line direction
    #[wasm_bindgen(js_name = addRadiusDimension)]
    pub fn add_radius_dimension(&mut self, cx: f64, cy: f64, radius: f64, leader_angle: f64) {
        use vcad_kernel_drafting::GeometryRef;
        self.inner.add_radius_dimension(
            GeometryRef::Circle {
                center: vcad_kernel_drafting::Point2D::new(cx, cy),
                radius,
            },
            leader_angle,
        );
    }

    /// Add an angular dimension between three points.
    ///
    /// The angle is measured at the vertex (middle point).
    ///
    /// # Arguments
    /// * `x1`, `y1` - First point on one leg
    /// * `vx`, `vy` - Vertex point (angle measured here)
    /// * `x2`, `y2` - Second point on other leg
    /// * `arc_radius` - Radius of the arc showing the angle
    #[wasm_bindgen(js_name = addAngleDimension)]
    #[allow(clippy::too_many_arguments)]
    pub fn add_angle_dimension(
        &mut self,
        x1: f64,
        y1: f64,
        vx: f64,
        vy: f64,
        x2: f64,
        y2: f64,
        arc_radius: f64,
    ) {
        use vcad_kernel_drafting::Point2D;
        self.inner.add_angle_dimension(
            Point2D::new(x1, y1),
            Point2D::new(vx, vy),
            Point2D::new(x2, y2),
            arc_radius,
        );
    }

    /// Get the number of annotations in the layer.
    #[wasm_bindgen(js_name = annotationCount)]
    pub fn annotation_count(&self) -> usize {
        self.inner.annotation_count()
    }

    /// Check if the layer has any annotations.
    #[wasm_bindgen(js_name = isEmpty)]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Clear all annotations from the layer.
    pub fn clear(&mut self) {
        self.inner.clear();
    }

    /// Render all dimensions and return as JSON.
    ///
    /// Returns an array of rendered dimensions, each containing:
    /// - `lines`: Array of line segments [[x1, y1], [x2, y2]]
    /// - `arcs`: Array of arc definitions
    /// - `arrows`: Array of arrow definitions
    /// - `texts`: Array of text labels
    ///
    /// # Arguments
    /// * `view_json` - Optional JSON string of a ProjectedView for geometry resolution
    #[wasm_bindgen(js_name = renderAll)]
    pub fn render_all(&self, view_json: Option<String>) -> JsValue {
        use vcad_kernel_drafting::ProjectedView;

        // Parse optional view for geometry resolution
        let view: Option<ProjectedView> = view_json.and_then(|v| serde_json::from_str(&v).ok());

        let rendered = self.inner.render_all(view.as_ref());
        serde_wasm_bindgen::to_value(&rendered).unwrap_or(JsValue::NULL)
    }
}

impl Default for WasmAnnotationLayer {
    fn default() -> Self {
        Self::new()
    }
}

// =========================================================================
// DXF Export
// =========================================================================

/// Export a projected view to DXF format.
///
/// Returns the DXF content as bytes.
///
/// # Arguments
/// * `view_json` - JSON string of a ProjectedView
///
/// # Returns
/// A byte array containing the DXF file content.
#[wasm_bindgen(js_name = exportProjectedViewToDxf)]
pub fn export_projected_view_to_dxf(view_json: &str) -> Result<Vec<u8>, JsError> {
    use std::io::Write;
    use vcad_kernel_drafting::{ProjectedView, Visibility};

    let view: ProjectedView =
        serde_json::from_str(view_json).map_err(|e| JsError::new(&e.to_string()))?;

    // Build DXF content
    let mut buffer = Vec::new();

    // Header
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "SECTION").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "HEADER").unwrap();
    writeln!(buffer, "9").unwrap();
    writeln!(buffer, "$ACADVER").unwrap();
    writeln!(buffer, "1").unwrap();
    writeln!(buffer, "AC1009").unwrap();
    writeln!(buffer, "9").unwrap();
    writeln!(buffer, "$INSUNITS").unwrap();
    writeln!(buffer, "70").unwrap();
    writeln!(buffer, "4").unwrap();
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "ENDSEC").unwrap();

    // Tables
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "SECTION").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "TABLES").unwrap();

    // Linetypes
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "TABLE").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "LTYPE").unwrap();
    writeln!(buffer, "70").unwrap();
    writeln!(buffer, "2").unwrap();

    // Continuous
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "LTYPE").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "CONTINUOUS").unwrap();
    writeln!(buffer, "70").unwrap();
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "3").unwrap();
    writeln!(buffer, "Solid line").unwrap();
    writeln!(buffer, "72").unwrap();
    writeln!(buffer, "65").unwrap();
    writeln!(buffer, "73").unwrap();
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "40").unwrap();
    writeln!(buffer, "0.0").unwrap();

    // Hidden
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "LTYPE").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "HIDDEN").unwrap();
    writeln!(buffer, "70").unwrap();
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "3").unwrap();
    writeln!(buffer, "Hidden line").unwrap();
    writeln!(buffer, "72").unwrap();
    writeln!(buffer, "65").unwrap();
    writeln!(buffer, "73").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "40").unwrap();
    writeln!(buffer, "9.525").unwrap();
    writeln!(buffer, "49").unwrap();
    writeln!(buffer, "6.35").unwrap();
    writeln!(buffer, "49").unwrap();
    writeln!(buffer, "-3.175").unwrap();
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "ENDTAB").unwrap();

    // Layers
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "TABLE").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "LAYER").unwrap();
    writeln!(buffer, "70").unwrap();
    writeln!(buffer, "2").unwrap();

    // VISIBLE layer
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "LAYER").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "VISIBLE").unwrap();
    writeln!(buffer, "70").unwrap();
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "62").unwrap();
    writeln!(buffer, "7").unwrap();
    writeln!(buffer, "6").unwrap();
    writeln!(buffer, "CONTINUOUS").unwrap();

    // HIDDEN layer
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "LAYER").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "HIDDEN").unwrap();
    writeln!(buffer, "70").unwrap();
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "62").unwrap();
    writeln!(buffer, "8").unwrap();
    writeln!(buffer, "6").unwrap();
    writeln!(buffer, "HIDDEN").unwrap();
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "ENDTAB").unwrap();

    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "ENDSEC").unwrap();

    // Entities
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "SECTION").unwrap();
    writeln!(buffer, "2").unwrap();
    writeln!(buffer, "ENTITIES").unwrap();

    for edge in &view.edges {
        let (layer, linetype) = match edge.visibility {
            Visibility::Visible => ("VISIBLE", "CONTINUOUS"),
            Visibility::Hidden => ("HIDDEN", "HIDDEN"),
        };

        writeln!(buffer, "0").unwrap();
        writeln!(buffer, "LINE").unwrap();
        writeln!(buffer, "8").unwrap();
        writeln!(buffer, "{}", layer).unwrap();
        writeln!(buffer, "6").unwrap();
        writeln!(buffer, "{}", linetype).unwrap();
        writeln!(buffer, "10").unwrap();
        writeln!(buffer, "{:.6}", edge.start.x).unwrap();
        writeln!(buffer, "20").unwrap();
        writeln!(buffer, "{:.6}", edge.start.y).unwrap();
        writeln!(buffer, "11").unwrap();
        writeln!(buffer, "{:.6}", edge.end.x).unwrap();
        writeln!(buffer, "21").unwrap();
        writeln!(buffer, "{:.6}", edge.end.y).unwrap();
    }

    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "ENDSEC").unwrap();

    // EOF
    writeln!(buffer, "0").unwrap();
    writeln!(buffer, "EOF").unwrap();

    Ok(buffer)
}

// =========================================================================
// Detail Views
// =========================================================================

/// Create a detail view from a projected view.
///
/// A detail view is a magnified region of a parent view, useful for showing
/// fine features that would be too small in the main view.
///
/// # Arguments
/// * `parent_json` - JSON string of the parent ProjectedView
/// * `center_x` - X coordinate of the region center
/// * `center_y` - Y coordinate of the region center
/// * `scale` - Magnification factor (e.g., 2.0 = 2x)
/// * `width` - Width of the region to capture
/// * `height` - Height of the region to capture
/// * `label` - Label for the detail view (e.g., "A")
///
/// # Returns
/// A JS object containing the detail view with edges and bounds.
#[wasm_bindgen(js_name = createDetailView)]
#[allow(clippy::too_many_arguments)]
pub fn create_detail_view(
    parent_json: &str,
    center_x: f64,
    center_y: f64,
    scale: f64,
    width: f64,
    height: f64,
    label: &str,
) -> Result<JsValue, JsError> {
    use vcad_kernel_drafting::{create_detail_view as create_detail, DetailViewParams, Point2D, ProjectedView};

    let parent: ProjectedView =
        serde_json::from_str(parent_json).map_err(|e| JsError::new(&e.to_string()))?;

    let params = DetailViewParams::new(
        Point2D::new(center_x, center_y),
        scale,
        width,
        height,
        label,
    );

    let detail = create_detail(&parent, &params);

    serde_wasm_bindgen::to_value(&detail).map_err(|e| JsError::new(&e.to_string()))
}

// =========================================================================
// STEP Import
// =========================================================================

/// Import solids from STEP file bytes.
///
/// Returns a JS array of mesh data for each imported body.
/// Each mesh contains `positions` (Float32Array) and `indices` (Uint32Array).
///
/// # Arguments
/// * `data` - Raw STEP file contents as bytes
///
/// # Returns
/// A JS array of mesh objects for rendering the imported geometry.
#[wasm_bindgen(js_name = importStepBuffer)]
pub fn import_step_buffer(data: &[u8]) -> Result<JsValue, JsError> {
    let solids = vcad_kernel::Solid::from_step_buffer_all(data)
        .map_err(|e| JsError::new(&e.to_string()))?;

    // Convert each solid to a mesh (use fewer segments for imported files)
    let meshes: Vec<WasmMesh> = solids
        .iter()
        .map(|s| {
            let mesh = s.to_mesh(16); // Lower resolution for faster rendering
            WasmMesh {
                positions: mesh.vertices,
                indices: mesh.indices,
            }
        })
        .collect();

    serde_wasm_bindgen::to_value(&meshes).map_err(|e| JsError::new(&e.to_string()))
}

// =========================================================================
// GPU-Accelerated Geometry Processing
// =========================================================================

/// GPU geometry processing result.
#[derive(Serialize, Deserialize)]
pub struct GpuGeometryResult {
    /// Vertex positions (flat array: x, y, z, ...).
    pub positions: Vec<f32>,
    /// Triangle indices.
    pub indices: Vec<u32>,
    /// Vertex normals (flat array: nx, ny, nz, ...).
    pub normals: Vec<f32>,
}

/// Initialize the GPU context for accelerated geometry processing.
///
/// Returns `true` if WebGPU is available and initialized, `false` otherwise.
/// This should be called once at application startup.
#[cfg(feature = "gpu")]
#[wasm_bindgen(js_name = initGpu)]
pub async fn init_gpu() -> Result<bool, JsError> {
    match vcad_kernel_gpu::GpuContext::init().await {
        Ok(_) => {
            web_sys::console::log_1(&"[WASM] GPU context initialized successfully".into());
            Ok(true)
        }
        Err(e) => {
            web_sys::console::warn_1(&format!("[WASM] GPU init failed: {}", e).into());
            Ok(false)
        }
    }
}

/// Initialize the GPU context (stub when GPU feature is disabled).
#[cfg(not(feature = "gpu"))]
#[wasm_bindgen(js_name = initGpu)]
pub async fn init_gpu() -> Result<bool, JsError> {
    web_sys::console::log_1(&"[WASM] GPU feature not enabled".into());
    Ok(false)
}

/// Check if GPU processing is available.
#[wasm_bindgen(js_name = isGpuAvailable)]
pub fn is_gpu_available() -> bool {
    #[cfg(feature = "gpu")]
    {
        vcad_kernel_gpu::GpuContext::get().is_some()
    }
    #[cfg(not(feature = "gpu"))]
    {
        false
    }
}

/// Process geometry with GPU acceleration.
///
/// Computes creased normals and optionally generates LOD meshes.
///
/// # Arguments
/// * `positions` - Flat array of vertex positions (x, y, z, ...)
/// * `indices` - Triangle indices
/// * `crease_angle` - Angle in radians for creased normal computation
/// * `generate_lod` - If true, returns multiple LOD levels
///
/// # Returns
/// A JS array of geometry results. If `generate_lod` is true, returns
/// [full, 50%, 25%] detail levels. Otherwise returns a single mesh.
#[cfg(feature = "gpu")]
#[wasm_bindgen(js_name = processGeometryGpu)]
pub async fn process_geometry_gpu(
    positions: Vec<f32>,
    indices: Vec<u32>,
    crease_angle: f32,
    generate_lod: bool,
) -> Result<JsValue, JsError> {
    use vcad_kernel_gpu::{compute_creased_normals, decimate_mesh};

    // Compute normals for full-resolution mesh
    let normals = compute_creased_normals(&positions, &indices, crease_angle)
        .await
        .map_err(|e| JsError::new(&format!("Normal computation failed: {}", e)))?;

    let mut results = vec![GpuGeometryResult {
        positions: positions.clone(),
        indices: indices.clone(),
        normals,
    }];

    if generate_lod {
        // Generate 50% LOD
        let lod1 = decimate_mesh(&positions, &indices, 0.5)
            .await
            .map_err(|e| JsError::new(&format!("Decimation (50%) failed: {}", e)))?;
        results.push(GpuGeometryResult {
            positions: lod1.positions,
            indices: lod1.indices,
            normals: lod1.normals,
        });

        // Generate 25% LOD
        let lod2 = decimate_mesh(&positions, &indices, 0.25)
            .await
            .map_err(|e| JsError::new(&format!("Decimation (25%) failed: {}", e)))?;
        results.push(GpuGeometryResult {
            positions: lod2.positions,
            indices: lod2.indices,
            normals: lod2.normals,
        });
    }

    serde_wasm_bindgen::to_value(&results).map_err(|e| JsError::new(&e.to_string()))
}

/// Process geometry (CPU fallback when GPU feature is disabled).
#[cfg(not(feature = "gpu"))]
#[wasm_bindgen(js_name = processGeometryGpu)]
pub async fn process_geometry_gpu(
    _positions: Vec<f32>,
    _indices: Vec<u32>,
    _crease_angle: f32,
    _generate_lod: bool,
) -> Result<JsValue, JsError> {
    Err(JsError::new("GPU feature not enabled"))
}

/// Compute creased normals using GPU acceleration.
///
/// # Arguments
/// * `positions` - Flat array of vertex positions (x, y, z, ...)
/// * `indices` - Triangle indices
/// * `crease_angle` - Angle in radians; faces meeting at sharper angles get hard edges
///
/// # Returns
/// Flat array of normals (nx, ny, nz, ...), same length as positions.
#[cfg(feature = "gpu")]
#[wasm_bindgen(js_name = computeCreasedNormalsGpu)]
pub async fn compute_creased_normals_gpu(
    positions: Vec<f32>,
    indices: Vec<u32>,
    crease_angle: f32,
) -> Result<Vec<f32>, JsError> {
    vcad_kernel_gpu::compute_creased_normals(&positions, &indices, crease_angle)
        .await
        .map_err(|e| JsError::new(&format!("Normal computation failed: {}", e)))
}

/// Compute creased normals (CPU fallback when GPU feature is disabled).
#[cfg(not(feature = "gpu"))]
#[wasm_bindgen(js_name = computeCreasedNormalsGpu)]
pub async fn compute_creased_normals_gpu(
    _positions: Vec<f32>,
    _indices: Vec<u32>,
    _crease_angle: f32,
) -> Result<Vec<f32>, JsError> {
    Err(JsError::new("GPU feature not enabled"))
}

/// Decimate a mesh to reduce triangle count.
///
/// # Arguments
/// * `positions` - Flat array of vertex positions
/// * `indices` - Triangle indices
/// * `target_ratio` - Target ratio of triangles to keep (0.5 = 50%)
///
/// # Returns
/// A JS object with decimated positions, indices, and normals.
#[cfg(feature = "gpu")]
#[wasm_bindgen(js_name = decimateMeshGpu)]
pub async fn decimate_mesh_gpu(
    positions: Vec<f32>,
    indices: Vec<u32>,
    target_ratio: f32,
) -> Result<JsValue, JsError> {
    let result = vcad_kernel_gpu::decimate_mesh(&positions, &indices, target_ratio)
        .await
        .map_err(|e| JsError::new(&format!("Decimation failed: {}", e)))?;

    let gpu_result = GpuGeometryResult {
        positions: result.positions,
        indices: result.indices,
        normals: result.normals,
    };

    serde_wasm_bindgen::to_value(&gpu_result).map_err(|e| JsError::new(&e.to_string()))
}

/// Decimate a mesh (CPU fallback when GPU feature is disabled).
#[cfg(not(feature = "gpu"))]
#[wasm_bindgen(js_name = decimateMeshGpu)]
pub async fn decimate_mesh_gpu(
    _positions: Vec<f32>,
    _indices: Vec<u32>,
    _target_ratio: f32,
) -> Result<JsValue, JsError> {
    Err(JsError::new("GPU feature not enabled"))
}

// =========================================================================
// GPU Ray Tracing (Direct BRep Rendering)
// =========================================================================

/// GPU-accelerated ray tracer for direct BRep rendering.
///
/// This ray tracer renders BRep surfaces directly without tessellation,
/// achieving pixel-perfect silhouettes at any zoom level.
#[cfg(feature = "raytrace")]
#[wasm_bindgen]
pub struct RayTracer {
    pipeline: vcad_kernel_raytrace::gpu::RayTracePipeline,
    scene: Option<vcad_kernel_raytrace::gpu::GpuScene>,
    /// Current frame index for progressive rendering (1-based).
    frame_index: u32,
    /// Accumulation buffer for progressive anti-aliasing.
    accum_buffer: Option<wgpu::Buffer>,
    /// Last camera state for detecting camera changes.
    last_camera_hash: u64,
    /// Last render dimensions.
    last_width: u32,
    last_height: u32,
}

#[cfg(feature = "raytrace")]
#[wasm_bindgen]
impl RayTracer {
    /// Create a new ray tracer.
    ///
    /// Requires WebGPU to be available and initialized.
    /// Call `initGpu()` before calling this method.
    #[wasm_bindgen(js_name = create)]
    pub fn create() -> Result<RayTracer, JsError> {
        // Ensure GPU context is initialized
        let ctx = vcad_kernel_gpu::GpuContext::get()
            .ok_or_else(|| JsError::new("GPU not initialized. Call initGpu() first."))?;

        let pipeline = vcad_kernel_raytrace::gpu::RayTracePipeline::new(ctx)
            .map_err(|e| JsError::new(&format!("Failed to create ray trace pipeline: {}", e)))?;

        web_sys::console::log_1(&"[WASM] RayTracer created".into());

        Ok(RayTracer {
            pipeline,
            scene: None,
            frame_index: 0,
            accum_buffer: None,
            last_camera_hash: 0,
            last_width: 0,
            last_height: 0,
        })
    }

    /// Reset the progressive accumulation (call when camera moves).
    #[wasm_bindgen(js_name = resetAccumulation)]
    pub fn reset_accumulation(&mut self) {
        self.frame_index = 0;
        self.accum_buffer = None;
    }

    /// Get the current frame index for progressive rendering.
    #[wasm_bindgen(js_name = getFrameIndex)]
    pub fn get_frame_index(&self) -> u32 {
        self.frame_index
    }

    /// Upload a solid's BRep representation for ray tracing.
    ///
    /// This extracts the BRep surfaces and builds the GPU scene data.
    #[wasm_bindgen(js_name = uploadSolid)]
    pub fn upload_solid(&mut self, solid: &Solid) -> Result<(), JsError> {
        use vcad_kernel_raytrace::gpu::GpuScene;

        // Get the BRep from the solid
        let brep = solid.inner.brep()
            .ok_or_else(|| JsError::new("Solid has no BRep representation (mesh-only)"))?;

        // Build GPU scene from BRep
        let scene = GpuScene::from_brep(brep)
            .map_err(|e| JsError::new(&format!("Failed to build GPU scene: {}", e)))?;

        let num_faces = scene.faces.len();
        let num_surfaces = scene.surfaces.len();
        let num_bvh_nodes = scene.bvh_nodes.len();

        // Debug: print face AABBs, inner loop data, and UV bounds from trim vertices
        for (i, face) in scene.faces.iter().enumerate() {
            // Compute UV bounds from trim vertices for this face
            let trim_start = face.trim_start as usize;
            let trim_count = face.trim_count as usize;
            let (uv_min_x, uv_max_x, uv_min_y, uv_max_y) = if trim_count > 0 {
                let mut min_x = f32::MAX;
                let mut max_x = f32::MIN;
                let mut min_y = f32::MAX;
                let mut max_y = f32::MIN;
                for j in 0..trim_count {
                    let uv = &scene.trim_verts[trim_start + j];
                    min_x = min_x.min(uv.x);
                    max_x = max_x.max(uv.x);
                    min_y = min_y.min(uv.y);
                    max_y = max_y.max(uv.y);
                }
                (min_x, max_x, min_y, max_y)
            } else {
                (0.0, 0.0, 0.0, 0.0)
            };

            web_sys::console::log_1(&format!(
                "[WASM] Face {}: surface={}, trim={}/{}@{}, UV_bounds=[{:.2},{:.2}]->[{:.2},{:.2}], inner={}/{}@{} (desc@{}), AABB=[{:.2},{:.2},{:.2}]->[{:.2},{:.2},{:.2}]",
                i, face.surface_idx,
                face.trim_count, face.trim_start, face.trim_start,
                uv_min_x, uv_min_y, uv_max_x, uv_max_y,
                face.inner_loop_count, face.inner_count, face.inner_start, face.inner_desc_start,
                face.aabb_min[0], face.aabb_min[1], face.aabb_min[2],
                face.aabb_max[0], face.aabb_max[1], face.aabb_max[2]
            ).into());
        }

        // Log inner_loop_descs buffer size
        web_sys::console::log_1(&format!(
            "[WASM] inner_loop_descs buffer: {} entries, trim_verts: {} entries",
            scene.inner_loop_descs.len(),
            scene.trim_verts.len()
        ).into());

        self.scene = Some(scene);

        web_sys::console::log_1(&format!(
            "[WASM] Uploaded solid: {} faces, {} surfaces, {} BVH nodes",
            num_faces, num_surfaces, num_bvh_nodes
        ).into());

        Ok(())
    }

    /// Render the scene to an RGBA image with progressive anti-aliasing.
    ///
    /// Each call accumulates another sample. Call `resetAccumulation()` when the
    /// camera moves to restart the accumulation.
    ///
    /// # Arguments
    /// * `camera` - Camera position [x, y, z]
    /// * `target` - Look-at target [x, y, z]
    /// * `up` - Up vector [x, y, z]
    /// * `width` - Image width in pixels
    /// * `height` - Image height in pixels
    /// * `fov` - Field of view in radians
    ///
    /// # Returns
    /// RGBA pixel data as a byte array (width * height * 4 bytes).
    ///
    /// # Note
    /// This function is async to support WASM's single-threaded environment.
    /// In JavaScript, it returns a Promise<Uint8Array>.
    pub async fn render(
        &mut self,
        camera: Vec<f64>,
        target: Vec<f64>,
        up: Vec<f64>,
        width: u32,
        height: u32,
        fov: f32,
    ) -> Result<Vec<u8>, JsError> {
        use vcad_kernel_raytrace::gpu::GpuCamera;
        use std::hash::{Hash, Hasher};
        use std::collections::hash_map::DefaultHasher;

        if camera.len() != 3 || target.len() != 3 || up.len() != 3 {
            return Err(JsError::new("camera, target, and up must each have 3 components"));
        }

        let scene = self.scene.as_ref()
            .ok_or_else(|| JsError::new("No solid uploaded. Call uploadSolid() first."))?;

        // Compute camera hash to detect changes
        // Round to 3 decimal places to avoid floating-point precision issues
        // causing spurious resets (e.g., 29.659999999 vs 29.660000001)
        let mut hasher = DefaultHasher::new();
        for v in &camera { ((v * 1000.0).round() as i64).hash(&mut hasher); }
        for v in &target { ((v * 1000.0).round() as i64).hash(&mut hasher); }
        ((fov * 1000.0).round() as i32).hash(&mut hasher);
        let camera_hash = hasher.finish();

        // Reset accumulation if camera changed or dimensions changed
        if camera_hash != self.last_camera_hash || width != self.last_width || height != self.last_height {
            self.frame_index = 0;
            self.accum_buffer = None;
            self.last_camera_hash = camera_hash;
            self.last_width = width;
            self.last_height = height;
        }

        // Increment frame index (capped at 256 for convergence)
        self.frame_index = (self.frame_index + 1).min(256);

        // Log progress occasionally
        if self.frame_index == 1 || self.frame_index.is_multiple_of(16) {
            web_sys::console::log_1(&format!(
                "[WASM] render() frame={} camera=[{:.2},{:.2},{:.2}] target=[{:.2},{:.2},{:.2}]",
                self.frame_index,
                camera[0], camera[1], camera[2],
                target[0], target[1], target[2],
            ).into());
        }

        let gpu_camera = GpuCamera::new(
            [camera[0] as f32, camera[1] as f32, camera[2] as f32],
            [target[0] as f32, target[1] as f32, target[2] as f32],
            [up[0] as f32, up[1] as f32, up[2] as f32],
            fov,
            width,
            height,
        );

        let ctx = vcad_kernel_gpu::GpuContext::get()
            .ok_or_else(|| JsError::new("GPU context lost"))?;

        let (pixels, new_accum) = self.pipeline.render_progressive(
            ctx,
            scene,
            &gpu_camera,
            width,
            height,
            self.frame_index,
            self.accum_buffer.take(),
        )
            .await
            .map_err(|e| JsError::new(&format!("Render failed: {}", e)))?;

        // Store accumulation texture for next frame
        self.accum_buffer = Some(new_accum);

        Ok(pixels)
    }

    /// Pick a face at the given pixel coordinates.
    ///
    /// # Arguments
    /// * `camera`, `target`, `up` - Camera parameters
    /// * `width`, `height`, `fov` - View parameters
    /// * `pixel_x`, `pixel_y` - Pixel coordinates to pick
    ///
    /// # Returns
    /// Face index if a face was hit, or -1 if background was hit.
    #[allow(clippy::too_many_arguments)]
    pub fn pick(
        &self,
        camera: Vec<f64>,
        target: Vec<f64>,
        up: Vec<f64>,
        width: u32,
        height: u32,
        fov: f32,
        pixel_x: u32,
        pixel_y: u32,
    ) -> Result<i32, JsError> {
        use vcad_kernel_raytrace::Ray;
        use vcad_kernel_math::{Point3, Vec3};

        if camera.len() != 3 || target.len() != 3 || up.len() != 3 {
            return Err(JsError::new("camera, target, and up must each have 3 components"));
        }

        let scene = self.scene.as_ref()
            .ok_or_else(|| JsError::new("No solid uploaded. Call uploadSolid() first."))?;

        // Compute ray from camera through pixel
        let cam_pos = Point3::new(camera[0], camera[1], camera[2]);
        let tgt = Point3::new(target[0], target[1], target[2]);
        let up_vec = Vec3::new(up[0], up[1], up[2]);

        let forward = (tgt - cam_pos).normalize();
        let right = forward.cross(&up_vec).normalize();
        let up_normalized = right.cross(&forward);

        let aspect = width as f64 / height as f64;
        let fov_tan = (fov as f64 * 0.5).tan();

        // NDC for pixel center
        let ndc_x = (pixel_x as f64 + 0.5) / width as f64 * 2.0 - 1.0;
        let ndc_y = 1.0 - (pixel_y as f64 + 0.5) / height as f64 * 2.0;

        let ray_dir = (forward + right * ndc_x * fov_tan * aspect + up_normalized * ndc_y * fov_tan).normalize();

        let ray = Ray::new(cam_pos, ray_dir);

        // Use CPU BVH for picking (more accurate than GPU render)
        // For now, return -1 as we don't have a CPU trace path in GpuScene
        // The full implementation would trace against the BRep directly

        // TODO: Implement CPU picking path
        // For now, this is a stub that always returns -1
        let _ = (ray, scene);
        Ok(-1)
    }

    /// Check if a solid can be ray traced.
    ///
    /// Returns true if the solid has a BRep representation.
    #[wasm_bindgen(js_name = canRaytrace)]
    pub fn can_raytrace(solid: &Solid) -> bool {
        solid.inner.brep().is_some()
    }

    /// Check if the ray tracer has a scene loaded.
    #[wasm_bindgen(js_name = hasScene)]
    pub fn has_scene(&self) -> bool {
        self.scene.is_some()
    }
}

/// Stub RayTracer when raytrace feature is not enabled.
#[cfg(not(feature = "raytrace"))]
#[wasm_bindgen]
pub struct RayTracer;

#[cfg(not(feature = "raytrace"))]
#[wasm_bindgen]
impl RayTracer {
    /// Returns an error when raytrace feature is not enabled.
    #[wasm_bindgen(js_name = create)]
    pub fn create() -> Result<RayTracer, JsError> {
        Err(JsError::new("Ray tracing feature not enabled. Compile with --features raytrace"))
    }
}
