//! WASM bindings for the vcad B-rep kernel.
//!
//! Exposes the [`Solid`] type for use in JavaScript/TypeScript via wasm-bindgen.

use serde::{Deserialize, Serialize};
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
    pub fn cone(
        radius_bottom: f64,
        radius_top: f64,
        height: f64,
        segments: Option<u32>,
    ) -> Solid {
        Solid {
            inner: vcad_kernel::Solid::cone(
                radius_bottom,
                radius_top,
                height,
                segments.unwrap_or(32),
            ),
        }
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
}
