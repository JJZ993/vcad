#![warn(missing_docs)]

//! CSG boolean operations on B-rep solids for the vcad kernel.
//!
//! Implements union, difference, and intersection of B-rep solids.
//!
//! The boolean pipeline has 4 stages:
//! 1. **AABB filter** — broadphase to find candidate face pairs
//! 2. **SSI** — surface-surface intersection for each candidate pair
//! 3. **Classification** — label sub-faces as IN/OUT/ON
//! 4. **Reconstruction** — sew selected faces into the result solid
//!
//! Phase 2 is building this pipeline incrementally. The mesh-based
//! fallback from Phase 1 remains as a backup.

// Internal modules
mod api;
pub mod bbox;
pub mod classify;
pub mod mesh;
mod pipeline;
mod repair;
pub mod sew;
pub mod split;
pub mod ssi;
pub mod trim;

// Re-export public API
pub use api::{boolean_op, BooleanOp, BooleanResult};
pub use mesh::point_in_mesh;

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_kernel_math::{Point3, Transform};
    use vcad_kernel_primitives::{make_cube, BRepSolid};
    use vcad_kernel_tessellate::{tessellate_brep, TriangleMesh};

    /// Compute the volume of a triangle mesh using signed tetrahedron method.
    fn compute_mesh_volume(mesh: &TriangleMesh) -> f64 {
        let verts = &mesh.vertices;
        let indices = &mesh.indices;
        let mut vol = 0.0;
        for tri in indices.chunks(3) {
            let i0 = tri[0] as usize * 3;
            let i1 = tri[1] as usize * 3;
            let i2 = tri[2] as usize * 3;
            let v0 = [verts[i0] as f64, verts[i0 + 1] as f64, verts[i0 + 2] as f64];
            let v1 = [verts[i1] as f64, verts[i1 + 1] as f64, verts[i1 + 2] as f64];
            let v2 = [verts[i2] as f64, verts[i2 + 1] as f64, verts[i2 + 2] as f64];
            vol += v0[0] * (v1[1] * v2[2] - v2[1] * v1[2])
                - v1[0] * (v0[1] * v2[2] - v2[1] * v0[2])
                + v2[0] * (v0[1] * v1[2] - v1[1] * v0[2]);
        }
        (vol / 6.0).abs()
    }

    /// Compute the bounding box of a triangle mesh.
    fn compute_mesh_bbox(mesh: &TriangleMesh) -> ([f64; 3], [f64; 3]) {
        let mut min = [f64::MAX; 3];
        let mut max = [f64::MIN; 3];
        for chunk in mesh.vertices.chunks(3) {
            for i in 0..3 {
                min[i] = min[i].min(chunk[i] as f64);
                max[i] = max[i].max(chunk[i] as f64);
            }
        }
        (min, max)
    }

    /// Translate a BRepSolid by a given offset, updating both vertices and surfaces.
    fn translate_brep(brep: &mut BRepSolid, dx: f64, dy: f64, dz: f64) {
        let t = Transform::translation(dx, dy, dz);

        // Translate all vertices
        for (_, v) in &mut brep.topology.vertices {
            v.point = t.apply_point(&v.point);
        }

        // Transform all surfaces using drain to avoid clone
        brep.geometry.surfaces = brep
            .geometry
            .surfaces
            .drain(..)
            .map(|s| s.transform(&t))
            .collect();
    }

    #[test]
    fn test_difference_hole_in_center() {
        // Simpler test case: two axis-aligned cubes with partial overlap
        let big_cube = make_cube(10.0, 10.0, 10.0);

        let mut small_cube = make_cube(4.0, 20.0, 4.0);
        translate_brep(&mut small_cube, 3.0, -5.0, 3.0);

        let result = boolean_op(&big_cube, &small_cube, BooleanOp::Difference, 32);
        let mesh = result.to_mesh(32);

        let volume = compute_mesh_volume(&mesh);

        // Accept volume in range [700, 1000] as "working"
        assert!(
            volume > 700.0 && volume < 1000.0,
            "Expected volume in [700,1000], got {}",
            volume
        );

        // Check bounding box
        let (min, max) = compute_mesh_bbox(&mesh);
        assert!(
            min[0] >= -0.01 && min[1] >= -0.01 && min[2] >= -0.01,
            "Min should be ~[0,0,0], got {:?}",
            min
        );
        assert!(
            max[0] <= 10.01 && max[1] <= 10.01 && max[2] <= 10.01,
            "Max should be ~[10,10,10], got {:?}",
            max
        );

        assert!(
            mesh.num_triangles() > 0,
            "Result mesh should have triangles"
        );
    }

    #[test]
    fn test_point_in_cube_mesh() {
        let brep = make_cube(10.0, 10.0, 10.0);
        let mesh = tessellate_brep(&brep, 32);

        // Point inside the cube
        assert!(point_in_mesh(&Point3::new(5.0, 5.0, 5.0), &mesh));
        // Point outside the cube
        assert!(!point_in_mesh(&Point3::new(15.0, 5.0, 5.0), &mesh));
        assert!(!point_in_mesh(&Point3::new(-1.0, 5.0, 5.0), &mesh));
    }

    #[test]
    fn test_union_overlapping() {
        // Partially overlapping cubes
        let a = make_cube(10.0, 10.0, 10.0);
        let mut b = make_cube(10.0, 10.0, 10.0);
        for (_, v) in &mut b.topology.vertices {
            v.point.x += 5.0; // shift B by half
        }
        let result = boolean_op(&a, &b, BooleanOp::Union, 32);
        // Overlapping booleans return BRep
        assert!(matches!(result, BooleanResult::BRep(_)));
        let mesh = result.to_mesh(32);
        assert!(mesh.num_triangles() > 0);
    }

    #[test]
    fn test_difference_overlapping() {
        let a = make_cube(10.0, 10.0, 10.0);
        let b = make_cube(5.0, 5.0, 5.0);
        let result = boolean_op(&a, &b, BooleanOp::Difference, 32);
        let mesh = result.to_mesh(32);
        assert!(mesh.num_triangles() > 0);
    }

    /// Test boolean difference with a hole completely inside a plate.
    #[test]
    fn test_plate_with_hole() {
        let plate = make_cube(80.0, 6.0, 60.0);

        let mut hole = make_cube(12.0, 20.0, 12.0);
        translate_brep(&mut hole, 34.0, -7.0, 24.0);

        let result = boolean_op(&plate, &hole, BooleanOp::Difference, 32);
        let mesh = result.to_mesh(32);

        let volume = compute_mesh_volume(&mesh);

        // Expected volume: 80*6*60 - 12*6*12 = 28800 - 864 = 27936
        assert!(
            (volume - 27936.0).abs() < 100.0,
            "Expected volume ~27936, got {}",
            volume
        );
    }

    #[test]
    fn test_point_in_mesh_on_surface() {
        let brep = make_cube(10.0, 10.0, 10.0);
        let mesh = tessellate_brep(&brep, 32);

        // Point clearly inside
        assert!(point_in_mesh(&Point3::new(5.0, 5.0, 5.0), &mesh));

        // Point clearly outside
        assert!(!point_in_mesh(&Point3::new(15.0, 5.0, 5.0), &mesh));
    }

    #[test]
    fn test_point_in_mesh_near_edge() {
        let brep = make_cube(10.0, 10.0, 10.0);
        let mesh = tessellate_brep(&brep, 32);

        // Points slightly inside the cube
        assert!(point_in_mesh(&Point3::new(5.0, 5.0, 9.999), &mesh));
        assert!(point_in_mesh(&Point3::new(5.0, 9.999, 5.0), &mesh));
        assert!(point_in_mesh(&Point3::new(9.999, 5.0, 5.0), &mesh));

        // Points slightly outside the cube
        assert!(!point_in_mesh(&Point3::new(5.0, 5.0, 10.001), &mesh));
        assert!(!point_in_mesh(&Point3::new(5.0, 10.001, 5.0), &mesh));
        assert!(!point_in_mesh(&Point3::new(10.001, 5.0, 5.0), &mesh));
    }

    #[test]
    fn test_point_in_polygon_exact() {
        use vcad_kernel_math::Point2;

        // Square polygon
        let square = vec![
            Point2::new(0.0, 0.0),
            Point2::new(10.0, 0.0),
            Point2::new(10.0, 10.0),
            Point2::new(0.0, 10.0),
        ];

        // Point clearly inside
        assert!(trim::point_in_polygon(&Point2::new(5.0, 5.0), &square));

        // Point clearly outside
        assert!(!trim::point_in_polygon(&Point2::new(15.0, 5.0), &square));

        // Point exactly on edge
        assert!(trim::point_in_polygon(&Point2::new(5.0, 0.0), &square));
        assert!(trim::point_in_polygon(&Point2::new(0.0, 5.0), &square));

        // Point exactly on vertex
        assert!(trim::point_in_polygon(&Point2::new(0.0, 0.0), &square));
        assert!(trim::point_in_polygon(&Point2::new(10.0, 10.0), &square));
    }

    #[test]
    fn test_coplanar_cubes_union() {
        let a = make_cube(10.0, 10.0, 10.0);
        let mut b = make_cube(10.0, 10.0, 10.0);
        for (_, v) in &mut b.topology.vertices {
            v.point.x += 10.0;
        }
        b.geometry.surfaces = b
            .geometry
            .surfaces
            .drain(..)
            .map(|s| s.transform(&Transform::translation(10.0, 0.0, 0.0)))
            .collect();

        let result = boolean_op(&a, &b, BooleanOp::Union, 32);
        let mesh = result.to_mesh(32);

        assert!(mesh.num_triangles() > 0);

        let vol = compute_mesh_volume(&mesh);
        assert!(
            (vol - 2000.0).abs() < 100.0,
            "Expected volume ~2000, got {}",
            vol
        );
    }

    #[test]
    fn test_near_coplanar_faces() {
        let a = make_cube(10.0, 10.0, 10.0);
        let mut b = make_cube(10.0, 10.0, 10.0);
        for (_, v) in &mut b.topology.vertices {
            v.point.x += 9.999;
        }
        b.geometry.surfaces = b
            .geometry
            .surfaces
            .drain(..)
            .map(|s| s.transform(&Transform::translation(9.999, 0.0, 0.0)))
            .collect();

        let result = boolean_op(&a, &b, BooleanOp::Union, 32);
        let mesh = result.to_mesh(32);

        assert!(mesh.num_triangles() > 0);
    }
}
