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
        Solid {
            inner: vcad_kernel::Solid::cube(sx, sy, sz),
        }
    }

    /// Create a cylinder along Z axis with given radius and height.
    #[wasm_bindgen(js_name = cylinder)]
    pub fn cylinder(radius: f64, height: f64, segments: Option<u32>) -> Solid {
        Solid {
            inner: vcad_kernel::Solid::cylinder(radius, height, segments.unwrap_or(32)),
        }
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
        Solid {
            inner: self.inner.difference(&other.inner),
        }
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

    // Convert each solid to a mesh
    let meshes: Vec<WasmMesh> = solids
        .iter()
        .map(|s| {
            let mesh = s.to_mesh(32);
            WasmMesh {
                positions: mesh.vertices,
                indices: mesh.indices,
            }
        })
        .collect();

    serde_wasm_bindgen::to_value(&meshes).map_err(|e| JsError::new(&e.to_string()))
}
