#![warn(missing_docs)]

//! High-level B-rep CAD kernel facade for vcad.
//!
//! Provides the [`Solid`] type — the primary interface for creating and
//! manipulating 3D geometry using B-rep representation.
//!
//! # Example
//!
//! ```
//! use vcad_kernel::Solid;
//!
//! let cube = Solid::cube(10.0, 20.0, 30.0);
//! let mesh = cube.to_mesh(32);
//! assert!(mesh.num_triangles() >= 12);
//! ```

pub use vcad_kernel_booleans;
pub use vcad_kernel_geom;
pub use vcad_kernel_math;
pub use vcad_kernel_primitives;
pub use vcad_kernel_tessellate;
pub use vcad_kernel_topo;

use vcad_kernel_booleans::{boolean_op, BooleanOp, BooleanResult};
use vcad_kernel_math::{Point3, Transform, Vec3};
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_tessellate::{tessellate_brep, TriangleMesh};

/// The internal representation of a solid.
#[derive(Debug, Clone)]
enum SolidRepr {
    /// Full B-rep solid with topology and geometry.
    BRep(Box<BRepSolid>),
    /// Mesh-only solid (result of boolean operations in Phase 1).
    Mesh(TriangleMesh),
    /// Empty solid (no geometry).
    Empty,
}

/// A 3D solid geometry object.
///
/// Solids can be created from primitives, combined with CSG boolean operations,
/// and transformed. The tessellation to triangle meshes is done on demand.
#[derive(Debug, Clone)]
pub struct Solid {
    repr: SolidRepr,
    /// Default tessellation segment count.
    segments: u32,
}

impl Solid {
    // =========================================================================
    // Constructors
    // =========================================================================

    /// Create an empty solid.
    pub fn empty() -> Self {
        Self {
            repr: SolidRepr::Empty,
            segments: 32,
        }
    }

    /// Create a box (cuboid) with corner at origin and dimensions `(sx, sy, sz)`.
    pub fn cube(sx: f64, sy: f64, sz: f64) -> Self {
        Self {
            repr: SolidRepr::BRep(Box::new(vcad_kernel_primitives::make_cube(sx, sy, sz))),
            segments: 32,
        }
    }

    /// Create a cylinder along Z axis with the given radius and height.
    pub fn cylinder(radius: f64, height: f64, segments: u32) -> Self {
        Self {
            repr: SolidRepr::BRep(Box::new(vcad_kernel_primitives::make_cylinder(
                radius, height, segments,
            ))),
            segments,
        }
    }

    /// Create a sphere centered at origin with the given radius.
    pub fn sphere(radius: f64, segments: u32) -> Self {
        Self {
            repr: SolidRepr::BRep(Box::new(vcad_kernel_primitives::make_sphere(
                radius, segments,
            ))),
            segments,
        }
    }

    /// Create a cone/frustum along Z axis.
    pub fn cone(radius_bottom: f64, radius_top: f64, height: f64, segments: u32) -> Self {
        Self {
            repr: SolidRepr::BRep(Box::new(vcad_kernel_primitives::make_cone(
                radius_bottom,
                radius_top,
                height,
                segments,
            ))),
            segments,
        }
    }

    // =========================================================================
    // CSG boolean operations
    // =========================================================================

    /// Boolean union (self ∪ other).
    pub fn union(&self, other: &Solid) -> Solid {
        self.boolean(other, BooleanOp::Union)
    }

    /// Boolean difference (self − other).
    pub fn difference(&self, other: &Solid) -> Solid {
        self.boolean(other, BooleanOp::Difference)
    }

    /// Boolean intersection (self ∩ other).
    pub fn intersection(&self, other: &Solid) -> Solid {
        self.boolean(other, BooleanOp::Intersection)
    }

    fn boolean(&self, other: &Solid, op: BooleanOp) -> Solid {
        match (&self.repr, &other.repr) {
            (SolidRepr::Empty, _) => match op {
                BooleanOp::Union => other.clone(),
                BooleanOp::Difference | BooleanOp::Intersection => Solid::empty(),
            },
            (_, SolidRepr::Empty) => match op {
                BooleanOp::Union | BooleanOp::Difference => self.clone(),
                BooleanOp::Intersection => Solid::empty(),
            },
            (SolidRepr::BRep(a), SolidRepr::BRep(b)) => {
                let segments = self.segments.max(other.segments);
                let result = boolean_op(a.as_ref(), b.as_ref(), op, segments);
                match result {
                    BooleanResult::Mesh(m) => Solid {
                        repr: SolidRepr::Mesh(m),
                        segments,
                    },
                    BooleanResult::BRep(brep) => Solid {
                        repr: SolidRepr::BRep(brep),
                        segments,
                    },
                }
            }
            // For mesh-only solids, tessellate BRep first then combine meshes
            _ => {
                let segments = self.segments.max(other.segments);
                let mesh_a = self.to_mesh(segments);
                let mesh_b = other.to_mesh(segments);
                // For mesh-only cases, just concatenate meshes.
                // This is a Phase 1 limitation — proper mesh CSG comes in Phase 2.
                let mut combined = mesh_a;
                combined.merge(&mesh_b);
                Solid {
                    repr: SolidRepr::Mesh(combined),
                    segments,
                }
            }
        }
    }

    // =========================================================================
    // Transforms
    // =========================================================================

    /// Translate the solid by `(x, y, z)`.
    pub fn translate(&self, x: f64, y: f64, z: f64) -> Solid {
        let t = Transform::translation(x, y, z);
        self.apply_transform(&t)
    }

    /// Rotate the solid by angles in degrees around X, Y, Z axes.
    pub fn rotate(&self, x_deg: f64, y_deg: f64, z_deg: f64) -> Solid {
        let rx = Transform::rotation_x(x_deg.to_radians());
        let ry = Transform::rotation_y(y_deg.to_radians());
        let rz = Transform::rotation_z(z_deg.to_radians());
        // Apply Z, then Y, then X (matching manifold-rs convention)
        let t = rx.then(&ry).then(&rz);
        self.apply_transform(&t)
    }

    /// Scale the solid by `(x, y, z)`.
    pub fn scale(&self, x: f64, y: f64, z: f64) -> Solid {
        let t = Transform::scale(x, y, z);
        self.apply_transform(&t)
    }

    fn apply_transform(&self, transform: &Transform) -> Solid {
        match &self.repr {
            SolidRepr::Empty => Solid::empty(),
            SolidRepr::BRep(brep) => {
                let mut new_brep = brep.as_ref().clone();
                // Transform all vertex positions
                for (_id, vertex) in &mut new_brep.topology.vertices {
                    vertex.point = transform.apply_point(&vertex.point);
                }
                // Transform all surface definitions
                for surface in &mut new_brep.geometry.surfaces {
                    *surface = surface.transform(transform);
                }
                // If negative determinant (mirror), flip face orientations
                let det = transform.matrix.fixed_view::<3, 3>(0, 0).determinant();
                if det < 0.0 {
                    for (_id, face) in &mut new_brep.topology.faces {
                        face.orientation = match face.orientation {
                            vcad_kernel_topo::Orientation::Forward => {
                                vcad_kernel_topo::Orientation::Reversed
                            }
                            vcad_kernel_topo::Orientation::Reversed => {
                                vcad_kernel_topo::Orientation::Forward
                            }
                        };
                    }
                }
                Solid {
                    repr: SolidRepr::BRep(Box::new(new_brep)),
                    segments: self.segments,
                }
            }
            SolidRepr::Mesh(mesh) => {
                let mut new_mesh = mesh.clone();
                let verts = &mut new_mesh.vertices;
                for chunk in verts.chunks_mut(3) {
                    let p = Point3::new(chunk[0] as f64, chunk[1] as f64, chunk[2] as f64);
                    let tp = transform.apply_point(&p);
                    chunk[0] = tp.x as f32;
                    chunk[1] = tp.y as f32;
                    chunk[2] = tp.z as f32;
                }
                // If any scale factor is negative, flip triangle winding
                let det = transform.matrix.fixed_view::<3, 3>(0, 0).determinant();
                if det < 0.0 {
                    for tri in new_mesh.indices.chunks_mut(3) {
                        tri.swap(1, 2);
                    }
                }
                Solid {
                    repr: SolidRepr::Mesh(new_mesh),
                    segments: self.segments,
                }
            }
        }
    }

    // =========================================================================
    // Queries
    // =========================================================================

    /// Check if the solid is empty (has no geometry).
    pub fn is_empty(&self) -> bool {
        match &self.repr {
            SolidRepr::Empty => true,
            SolidRepr::BRep(_) => false,
            SolidRepr::Mesh(m) => m.num_triangles() == 0,
        }
    }

    /// Get the triangle mesh representation.
    pub fn to_mesh(&self, segments: u32) -> TriangleMesh {
        match &self.repr {
            SolidRepr::Empty => TriangleMesh::new(),
            SolidRepr::BRep(brep) => tessellate_brep(brep.as_ref(), segments),
            SolidRepr::Mesh(m) => m.clone(),
        }
    }

    /// Compute the volume of the solid from its triangle mesh.
    pub fn volume(&self) -> f64 {
        let mesh = self.to_mesh(self.segments);
        compute_volume(&mesh)
    }

    /// Compute the surface area of the solid from its triangle mesh.
    pub fn surface_area(&self) -> f64 {
        let mesh = self.to_mesh(self.segments);
        compute_surface_area(&mesh)
    }

    /// Compute the axis-aligned bounding box as `(min, max)`.
    ///
    /// For B-rep solids with only planar faces, computes directly from vertex
    /// positions (no tessellation needed). For curved surfaces, falls back to
    /// the tessellated mesh since vertices alone don't capture the full extent.
    pub fn bounding_box(&self) -> ([f64; 3], [f64; 3]) {
        match &self.repr {
            SolidRepr::BRep(brep) => {
                use vcad_kernel_geom::SurfaceKind;
                let all_planar = brep
                    .geometry
                    .surfaces
                    .iter()
                    .all(|s| s.surface_type() == SurfaceKind::Plane);
                if all_planar {
                    let mut min = [f64::MAX; 3];
                    let mut max = [f64::MIN; 3];
                    for (_id, v) in &brep.topology.vertices {
                        let p = v.point;
                        min[0] = min[0].min(p.x);
                        min[1] = min[1].min(p.y);
                        min[2] = min[2].min(p.z);
                        max[0] = max[0].max(p.x);
                        max[1] = max[1].max(p.y);
                        max[2] = max[2].max(p.z);
                    }
                    (min, max)
                } else {
                    let mesh = self.to_mesh(self.segments);
                    compute_bounding_box(&mesh)
                }
            }
            _ => {
                let mesh = self.to_mesh(self.segments);
                compute_bounding_box(&mesh)
            }
        }
    }

    /// Compute the geometric centroid (volume-weighted center of mass).
    pub fn center_of_mass(&self) -> [f64; 3] {
        let mesh = self.to_mesh(self.segments);
        compute_center_of_mass(&mesh)
    }

    /// Number of triangles in the tessellated mesh.
    pub fn num_triangles(&self) -> usize {
        let mesh = self.to_mesh(self.segments);
        mesh.num_triangles()
    }
}

// =============================================================================
// Mesh computation helpers (same algorithms as vcad lib.rs)
// =============================================================================

fn compute_volume(mesh: &TriangleMesh) -> f64 {
    let verts = &mesh.vertices;
    let indices = &mesh.indices;
    let mut vol = 0.0;
    for tri in indices.chunks(3) {
        let (i0, i1, i2) = (
            tri[0] as usize * 3,
            tri[1] as usize * 3,
            tri[2] as usize * 3,
        );
        let v0 = [verts[i0] as f64, verts[i0 + 1] as f64, verts[i0 + 2] as f64];
        let v1 = [verts[i1] as f64, verts[i1 + 1] as f64, verts[i1 + 2] as f64];
        let v2 = [verts[i2] as f64, verts[i2 + 1] as f64, verts[i2 + 2] as f64];
        vol += v0[0] * (v1[1] * v2[2] - v2[1] * v1[2]) - v1[0] * (v0[1] * v2[2] - v2[1] * v0[2])
            + v2[0] * (v0[1] * v1[2] - v1[1] * v0[2]);
    }
    (vol / 6.0).abs()
}

fn compute_surface_area(mesh: &TriangleMesh) -> f64 {
    let verts = &mesh.vertices;
    let indices = &mesh.indices;
    let mut area = 0.0;
    for tri in indices.chunks(3) {
        let (i0, i1, i2) = (
            tri[0] as usize * 3,
            tri[1] as usize * 3,
            tri[2] as usize * 3,
        );
        let v0 = Vec3::new(verts[i0] as f64, verts[i0 + 1] as f64, verts[i0 + 2] as f64);
        let v1 = Vec3::new(verts[i1] as f64, verts[i1 + 1] as f64, verts[i1 + 2] as f64);
        let v2 = Vec3::new(verts[i2] as f64, verts[i2 + 1] as f64, verts[i2 + 2] as f64);
        area += (v1 - v0).cross(&(v2 - v0)).norm() / 2.0;
    }
    area
}

fn compute_bounding_box(mesh: &TriangleMesh) -> ([f64; 3], [f64; 3]) {
    let verts = &mesh.vertices;
    let mut min = [f64::MAX; 3];
    let mut max = [f64::MIN; 3];
    for chunk in verts.chunks(3) {
        for i in 0..3 {
            let v = chunk[i] as f64;
            if v < min[i] {
                min[i] = v;
            }
            if v > max[i] {
                max[i] = v;
            }
        }
    }
    (min, max)
}

fn compute_center_of_mass(mesh: &TriangleMesh) -> [f64; 3] {
    let verts = &mesh.vertices;
    let indices = &mesh.indices;
    let mut cx = 0.0;
    let mut cy = 0.0;
    let mut cz = 0.0;
    let mut total_vol = 0.0;
    for tri in indices.chunks(3) {
        let (i0, i1, i2) = (
            tri[0] as usize * 3,
            tri[1] as usize * 3,
            tri[2] as usize * 3,
        );
        let v0 = [verts[i0] as f64, verts[i0 + 1] as f64, verts[i0 + 2] as f64];
        let v1 = [verts[i1] as f64, verts[i1 + 1] as f64, verts[i1 + 2] as f64];
        let v2 = [verts[i2] as f64, verts[i2 + 1] as f64, verts[i2 + 2] as f64];
        let vol = v0[0] * (v1[1] * v2[2] - v2[1] * v1[2]) - v1[0] * (v0[1] * v2[2] - v2[1] * v0[2])
            + v2[0] * (v0[1] * v1[2] - v1[1] * v0[2]);
        total_vol += vol;
        cx += vol * (v0[0] + v1[0] + v2[0]);
        cy += vol * (v0[1] + v1[1] + v2[1]);
        cz += vol * (v0[2] + v1[2] + v2[2]);
    }
    if total_vol.abs() < 1e-15 {
        return [0.0; 3];
    }
    let s = 1.0 / (4.0 * total_vol);
    [cx * s, cy * s, cz * s]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cube() {
        let cube = Solid::cube(10.0, 10.0, 10.0);
        assert!(!cube.is_empty());
        let mesh = cube.to_mesh(32);
        assert!(mesh.num_triangles() >= 12);
    }

    #[test]
    fn test_cylinder() {
        let cyl = Solid::cylinder(5.0, 10.0, 32);
        assert!(!cyl.is_empty());
    }

    #[test]
    fn test_sphere() {
        let sphere = Solid::sphere(10.0, 32);
        assert!(!sphere.is_empty());
    }

    #[test]
    fn test_cone() {
        let cone = Solid::cone(5.0, 3.0, 10.0, 32);
        assert!(!cone.is_empty());
    }

    #[test]
    fn test_empty() {
        let empty = Solid::empty();
        assert!(empty.is_empty());
    }

    #[test]
    fn test_translate() {
        let cube = Solid::cube(10.0, 10.0, 10.0);
        let moved = cube.translate(100.0, 0.0, 0.0);
        let (min, max) = moved.bounding_box();
        assert!((min[0] - 100.0).abs() < 0.1);
        assert!((max[0] - 110.0).abs() < 0.1);
    }

    #[test]
    fn test_scale() {
        let cube = Solid::cube(10.0, 10.0, 10.0);
        let scaled = cube.scale(2.0, 1.0, 1.0);
        let (min, max) = scaled.bounding_box();
        assert!((max[0] - min[0] - 20.0).abs() < 0.1);
        assert!((max[1] - min[1] - 10.0).abs() < 0.1);
    }

    #[test]
    fn test_union() {
        let a = Solid::cube(10.0, 10.0, 10.0);
        let b = Solid::cube(10.0, 10.0, 10.0);
        let result = a.union(&b);
        assert!(!result.is_empty());
    }

    #[test]
    fn test_difference() {
        let a = Solid::cube(10.0, 10.0, 10.0);
        let b = Solid::cube(5.0, 5.0, 5.0);
        let result = a.difference(&b);
        assert!(!result.is_empty());
    }

    #[test]
    fn test_intersection() {
        let a = Solid::cube(10.0, 10.0, 10.0);
        let b = Solid::cube(10.0, 10.0, 10.0);
        let result = a.intersection(&b);
        assert!(!result.is_empty());
    }

    #[test]
    fn test_cube_volume() {
        let cube = Solid::cube(10.0, 10.0, 10.0);
        let vol = cube.volume();
        assert!((vol - 1000.0).abs() < 1.0, "expected ~1000, got {vol}");
    }

    #[test]
    fn test_cube_surface_area() {
        let cube = Solid::cube(10.0, 10.0, 10.0);
        let area = cube.surface_area();
        assert!((area - 600.0).abs() < 1.0, "expected ~600, got {area}");
    }

    #[test]
    fn test_cube_bounding_box() {
        let cube = Solid::cube(10.0, 20.0, 30.0);
        let (min, max) = cube.bounding_box();
        assert!((max[0] - min[0] - 10.0).abs() < 0.01);
        assert!((max[1] - min[1] - 20.0).abs() < 0.01);
        assert!((max[2] - min[2] - 30.0).abs() < 0.01);
    }

    #[test]
    fn test_cube_center_of_mass() {
        let cube = Solid::cube(10.0, 10.0, 10.0);
        let com = cube.center_of_mass();
        assert!((com[0] - 5.0).abs() < 0.1, "cx: {}", com[0]);
        assert!((com[1] - 5.0).abs() < 0.1, "cy: {}", com[1]);
        assert!((com[2] - 5.0).abs() < 0.1, "cz: {}", com[2]);
    }

    #[test]
    fn test_rotate_cube_volume() {
        let cube = Solid::cube(10.0, 10.0, 10.0);
        let rotated = cube.rotate(45.0, 30.0, 60.0);
        let vol = rotated.volume();
        // Volume should be preserved after rotation
        assert!((vol - 1000.0).abs() < 2.0, "expected ~1000, got {vol}");
    }

    #[test]
    fn test_translate_cylinder_bbox() {
        let cyl = Solid::cylinder(5.0, 10.0, 32);
        let moved = cyl.translate(100.0, 200.0, 300.0);
        let (min, max) = moved.bounding_box();
        // Center should be offset by translation
        assert!((min[0] - 95.0).abs() < 0.5, "min x: {}", min[0]);
        assert!((max[0] - 105.0).abs() < 0.5, "max x: {}", max[0]);
        assert!((min[2] - 300.0).abs() < 0.5, "min z: {}", min[2]);
        assert!((max[2] - 310.0).abs() < 0.5, "max z: {}", max[2]);
    }

    #[test]
    fn test_scale_cylinder_volume() {
        let cyl = Solid::cylinder(5.0, 10.0, 64);
        let base_vol = cyl.volume();
        let scaled = cyl.scale(2.0, 2.0, 2.0);
        let scaled_vol = scaled.volume();
        // Volume scales by 2^3 = 8
        let ratio = scaled_vol / base_vol;
        assert!((ratio - 8.0).abs() < 0.5, "expected ratio ~8, got {ratio}");
    }

    #[test]
    fn test_mirror_x() {
        let cube = Solid::cube(10.0, 10.0, 10.0).translate(5.0, 0.0, 0.0);
        let mirrored = cube.scale(-1.0, 1.0, 1.0);
        let (min, _max) = mirrored.bounding_box();
        assert!(
            min[0] < 0.0,
            "mirrored min x should be negative: {}",
            min[0]
        );
    }

    #[test]
    fn test_empty_union() {
        let empty = Solid::empty();
        let cube = Solid::cube(10.0, 10.0, 10.0);
        let result = empty.union(&cube);
        assert!(!result.is_empty());
    }

    #[test]
    fn test_num_triangles() {
        let cube = Solid::cube(10.0, 10.0, 10.0);
        assert!(
            cube.num_triangles() >= 12,
            "cube should have at least 12 triangles"
        );
    }
}
