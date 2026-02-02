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

    /// Count orphan half-edges (half-edges with no parent edge)
    fn count_orphan_half_edges(brep: &BRepSolid) -> usize {
        brep.topology
            .half_edges
            .iter()
            .filter(|(_, he)| he.loop_id.is_some() && he.edge.is_none())
            .count()
    }

    /// Extract BRepSolid from BooleanResult, panicking if it's mesh-only
    fn unwrap_brep(result: BooleanResult) -> BRepSolid {
        match result {
            BooleanResult::BRep(b) => *b,
            BooleanResult::Mesh(_) => panic!("Expected BRep result, got Mesh"),
        }
    }

    #[test]
    fn test_mounting_plate_with_multiple_holes() {
        use vcad_kernel_primitives::make_cylinder;

        // Create plate (80x6x60 but oriented for y-axis holes)
        let plate = make_cube(80.0, 6.0, 60.0);

        // Create a single hole cylinder rotated for Y-axis
        fn rotated_cylinder(radius: f64, height: f64, x: f64, z: f64, segments: u32) -> BRepSolid {
            let mut cyl = make_cylinder(radius, height, segments);
            // Rotate 90 degrees around X axis (so cylinder axis points in Y)
            let t = Transform::rotation_x(-std::f64::consts::FRAC_PI_2)
                .then(&Transform::translation(x, -7.0, z));
            for (_, v) in &mut cyl.topology.vertices {
                v.point = t.apply_point(&v.point);
            }
            cyl.geometry.surfaces = cyl
                .geometry
                .surfaces
                .drain(..)
                .map(|s| s.transform(&t))
                .collect();
            cyl
        }

        // Exact structure from the TypeScript test:
        // - 1 large center hole (r=6, at 40,30)
        // - 4 corner holes (r=2, at 8,8 / 72,8 / 8,52 / 72,52)
        // - 4 edge holes (r=2, at 8,30 / 72,30 / 40,8 / 40,52)
        let large_center = rotated_cylinder(6.0, 20.0, 40.0, 30.0, 32);
        let corner1 = rotated_cylinder(2.0, 20.0, 8.0, 8.0, 24);
        let corner2 = rotated_cylinder(2.0, 20.0, 72.0, 8.0, 24);
        let corner3 = rotated_cylinder(2.0, 20.0, 8.0, 52.0, 24);
        let corner4 = rotated_cylinder(2.0, 20.0, 72.0, 52.0, 24);
        let edge1 = rotated_cylinder(2.0, 20.0, 8.0, 30.0, 24);
        let edge2 = rotated_cylinder(2.0, 20.0, 72.0, 30.0, 24);
        let edge3 = rotated_cylinder(2.0, 20.0, 40.0, 8.0, 24);
        let edge4 = rotated_cylinder(2.0, 20.0, 40.0, 52.0, 24);

        // Union all holes together (chain of unions like the TypeScript test)
        let h12 = unwrap_brep(boolean_op(&large_center, &corner1, BooleanOp::Union, 32));
        let h123 = unwrap_brep(boolean_op(&h12, &corner2, BooleanOp::Union, 32));
        let h1234 = unwrap_brep(boolean_op(&h123, &corner3, BooleanOp::Union, 32));
        let h12345 = unwrap_brep(boolean_op(&h1234, &corner4, BooleanOp::Union, 32));
        let h123456 = unwrap_brep(boolean_op(&h12345, &edge1, BooleanOp::Union, 32));
        let h1234567 = unwrap_brep(boolean_op(&h123456, &edge2, BooleanOp::Union, 32));
        let h12345678 = unwrap_brep(boolean_op(&h1234567, &edge3, BooleanOp::Union, 32));
        let holes_all = unwrap_brep(boolean_op(&h12345678, &edge4, BooleanOp::Union, 32));

        eprintln!("After 9-hole union: {} orphan half-edges", count_orphan_half_edges(&holes_all));

        // Check that the unioned holes have no orphan half-edges
        let orphan_count = count_orphan_half_edges(&holes_all);
        assert_eq!(orphan_count, 0, "Unioned holes should have no orphan half-edges");

        // Now subtract from plate
        let result = unwrap_brep(boolean_op(&plate, &holes_all, BooleanOp::Difference, 32));
        eprintln!("After difference: {} orphan half-edges", count_orphan_half_edges(&result));

        let final_orphan_count = count_orphan_half_edges(&result);
        assert_eq!(final_orphan_count, 0, "Final result should have no orphan half-edges");
    }

    /// Test boolean difference with cylinder extending outside cube bounds.
    ///
    /// This tests the case where a cylinder overlaps the cube but also extends
    /// outside it. The result should NOT include any geometry outside the cube's
    /// original bounds.
    #[test]
    fn test_cube_minus_cylinder_boundary() {
        use vcad_kernel_primitives::make_cylinder;

        // Cube from [0,0,0] to [20,20,20]
        let cube = make_cube(20.0, 20.0, 20.0);

        // Cylinder: radius=10, height=20
        // We want the cylinder tangent to the x=0 plane at y=10.
        // Cylinder center at x=0, so it extends from x=-10 to x=10.
        // This is the bug case: the result incorrectly includes geometry at x < 0.
        let mut cylinder = make_cylinder(10.0, 20.0, 32);
        translate_brep(&mut cylinder, -10.0, 10.0, 0.0);

        let result = boolean_op(&cube, &cylinder, BooleanOp::Difference, 32);
        let mesh = result.to_mesh(32);

        // Check bounding box - x should not extend below 0
        let (min, max) = compute_mesh_bbox(&mesh);

        eprintln!("Cube-Cylinder Difference bbox: min={:?}, max={:?}", min, max);

        // The key assertion: no geometry should extend to negative x
        assert!(
            min[0] >= -0.1,
            "Result should not extend to negative x! min[0] = {:.4}",
            min[0]
        );

        // Also verify the cube bounds are roughly preserved
        assert!(
            max[0] <= 20.1 && max[1] <= 20.1 && max[2] <= 20.1,
            "Max should be ~[20,20,20], got {:?}",
            max
        );

        assert!(
            mesh.num_triangles() > 0,
            "Result mesh should have triangles"
        );

        // Validate that all indices are in bounds
        validate_mesh_indices(&mesh);
    }

    /// Test case matching the app scenario: cylinder centered at (0, 10, 0)
    /// This means the cylinder extends from x=-10 to x=10, but the cube
    /// only goes from x=0 to x=20. The result should clip at x=0.
    #[test]
    fn test_cube_minus_centered_cylinder() {
        use vcad_kernel_primitives::make_cylinder;

        // Cube from [0,0,0] to [20,20,20]
        let cube = make_cube(20.0, 20.0, 20.0);

        // Cylinder: radius=10, height=20, centered at origin
        // Translate by (0, 10, 0) to move center to (0, 10, 0)
        // This means cylinder bbox becomes [-10,0,0]->[10,20,20]
        let mut cylinder = make_cylinder(10.0, 20.0, 32);
        translate_brep(&mut cylinder, 0.0, 10.0, 0.0);

        let result = boolean_op(&cube, &cylinder, BooleanOp::Difference, 32);
        let mesh = result.to_mesh(32);

        // Validate mesh indices first
        validate_mesh_indices(&mesh);

        // Check bounding box - x should not extend below 0
        let (min, max) = compute_mesh_bbox(&mesh);

        eprintln!(
            "Centered Cylinder Difference bbox: min={:?}, max={:?}",
            min, max
        );
        eprintln!("Mesh has {} triangles, {} vertices", mesh.num_triangles(), mesh.num_vertices());

        // The key assertion: no geometry should extend to negative x
        assert!(
            min[0] >= -0.1,
            "Result should not extend to negative x! min[0] = {:.4}",
            min[0]
        );

        // Also verify the cube bounds are roughly preserved
        assert!(
            max[0] <= 20.1 && max[1] <= 20.1 && max[2] <= 20.1,
            "Max should be ~[20,20,20], got {:?}",
            max
        );

        assert!(
            mesh.num_triangles() > 0,
            "Result mesh should have triangles"
        );
    }

    /// Validate that all mesh indices are within bounds.
    fn validate_mesh_indices(mesh: &TriangleMesh) {
        let num_verts = mesh.num_vertices();
        let mut max_idx = 0u32;
        let mut invalid_count = 0usize;

        for (i, &idx) in mesh.indices.iter().enumerate() {
            if idx as usize >= num_verts {
                invalid_count += 1;
                eprintln!(
                    "Invalid index at {}: {} >= {} vertices",
                    i, idx, num_verts
                );
            }
            if idx > max_idx {
                max_idx = idx;
            }
        }

        assert_eq!(
            invalid_count, 0,
            "Mesh has {} invalid indices (max index {} but only {} vertices)",
            invalid_count, max_idx, num_verts
        );
    }
}
