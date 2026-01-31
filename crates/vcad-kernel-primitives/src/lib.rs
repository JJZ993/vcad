#![warn(missing_docs)]

//! B-rep primitive solid construction for the vcad kernel.
//!
//! Constructs valid B-rep topology + geometry for standard CAD primitives:
//! cube (box), cylinder, sphere, and cone.

use vcad_kernel_geom::{Circle3d, CylinderSurface, GeometryStore, Line3d, Plane, SphereSurface};
use vcad_kernel_math::{Point3, Vec3};
use vcad_kernel_topo::{HalfEdgeId, Orientation, ShellType, SolidId, Topology};

/// Result of constructing a B-rep primitive: topology + geometry.
#[derive(Debug, Clone)]
pub struct BRepSolid {
    /// The topological structure.
    pub topology: Topology,
    /// The geometric data (surfaces, curves).
    pub geometry: GeometryStore,
    /// The solid entity.
    pub solid_id: SolidId,
}

/// Build a B-rep box (cuboid) with corner at origin and dimensions `(sx, sy, sz)`.
///
/// The box has 6 planar faces, 12 edges, and 8 vertices.
/// Vertex layout (corner-aligned at origin):
/// ```text
///     v4----v5
///    /|    /|
///   v7----v6|    z
///   | v0--|-v1   | y
///   |/    |/     |/
///   v3----v2     +---x
/// ```
pub fn make_cube(sx: f64, sy: f64, sz: f64) -> BRepSolid {
    let mut topo = Topology::new();
    let mut geom = GeometryStore::new();

    // 8 vertices
    let v0 = topo.add_vertex(Point3::new(0.0, 0.0, 0.0));
    let v1 = topo.add_vertex(Point3::new(sx, 0.0, 0.0));
    let v2 = topo.add_vertex(Point3::new(sx, sy, 0.0));
    let v3 = topo.add_vertex(Point3::new(0.0, sy, 0.0));
    let v4 = topo.add_vertex(Point3::new(0.0, 0.0, sz));
    let v5 = topo.add_vertex(Point3::new(sx, 0.0, sz));
    let v6 = topo.add_vertex(Point3::new(sx, sy, sz));
    let v7 = topo.add_vertex(Point3::new(0.0, sy, sz));

    // 6 faces, each with 4 half-edges forming a loop.
    // Convention: outward normals, CCW vertex order when viewed from outside.

    let mut all_faces = Vec::new();

    // Face helpers: for each face, define the 4 vertices in CCW order (viewed from outside)
    // Plane normal = x_dir × y_dir, so we choose x_dir/y_dir to produce outward normals
    let face_defs: [([vcad_kernel_topo::VertexId; 4], Point3, Vec3, Vec3); 6] = [
        // Bottom face (z=0): normal -Z = (0,1,0) × (1,0,0)
        (
            [v0, v3, v2, v1],
            Point3::new(0.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
        ),
        // Top face (z=sz): normal +Z = (1,0,0) × (0,1,0)
        (
            [v4, v5, v6, v7],
            Point3::new(0.0, 0.0, sz),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
        ),
        // Front face (y=0): normal -Y = (0,0,1) × (1,0,0)
        (
            [v0, v1, v5, v4],
            Point3::new(0.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
            Vec3::new(1.0, 0.0, 0.0),
        ),
        // Back face (y=sy): normal +Y = (1,0,0) × (0,0,1)
        (
            [v2, v3, v7, v6],
            Point3::new(0.0, sy, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
        ),
        // Left face (x=0): normal -X = (0,0,1) × (0,1,0)
        (
            [v0, v4, v7, v3],
            Point3::new(0.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
            Vec3::new(0.0, 1.0, 0.0),
        ),
        // Right face (x=sx): normal +X = (0,1,0) × (0,0,1)
        (
            [v1, v2, v6, v5],
            Point3::new(sx, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
        ),
    ];

    // We need to track half-edges by (origin, dest) to pair twins later
    let mut he_map: std::collections::HashMap<
        (vcad_kernel_topo::VertexId, vcad_kernel_topo::VertexId),
        HalfEdgeId,
    > = std::collections::HashMap::new();

    for (verts, plane_origin, x_dir, y_dir) in face_defs.iter() {
        let surface_idx = geom.add_surface(Box::new(Plane::new(*plane_origin, *x_dir, *y_dir)));

        let mut hes = Vec::new();
        for j in 0..4 {
            let he = topo.add_half_edge(verts[j]);
            hes.push(he);
            he_map.insert((verts[j], verts[(j + 1) % 4]), he);
        }

        let loop_id = topo.add_loop(&hes);

        let face_id = topo.add_face(loop_id, surface_idx, Orientation::Forward);
        all_faces.push(face_id);
    }

    // Pair twin half-edges (each edge only once)
    let mut paired = std::collections::HashSet::new();
    for &(v_from, v_to) in he_map.keys() {
        if paired.contains(&(v_to, v_from)) {
            continue;
        }
        if let Some(&he2) = he_map.get(&(v_to, v_from)) {
            let he1 = he_map[&(v_from, v_to)];
            topo.add_edge(he1, he2);
            paired.insert((v_from, v_to));
        }
    }

    // Add 3D curves for all edges (lines)
    for &face_id in &all_faces {
        let face = &topo.faces[face_id];
        for he_id in topo.loop_half_edges(face.outer_loop).collect::<Vec<_>>() {
            let origin = topo.vertices[topo.half_edges[he_id].origin].point;
            let dest_id = topo.half_edge_dest(he_id);
            let dest = topo.vertices[dest_id].point;
            geom.add_curve_3d(Box::new(Line3d::from_points(origin, dest)));
        }
    }

    let shell = topo.add_shell(all_faces, ShellType::Outer);
    let solid_id = topo.add_solid(shell);

    BRepSolid {
        topology: topo,
        geometry: geom,
        solid_id,
    }
}

/// Build a B-rep cylinder with the given radius and height, axis along Z.
///
/// The cylinder has:
/// - 1 cylindrical lateral face
/// - 2 planar cap faces (top and bottom)
/// - 2 circular edges (top and bottom) + 1 seam edge
/// - Seam edge connects the two circles at u=0
///
/// `segments` controls tessellation quality but doesn't affect the B-rep structure.
pub fn make_cylinder(radius: f64, height: f64, _segments: u32) -> BRepSolid {
    let mut topo = Topology::new();
    let mut geom = GeometryStore::new();

    // Vertices: 2 points on the seam (u=0) at bottom and top
    let v_bot = topo.add_vertex(Point3::new(radius, 0.0, 0.0));
    let v_top = topo.add_vertex(Point3::new(radius, 0.0, height));

    // Surfaces:
    // 0: cylindrical lateral surface
    let cyl_surf = CylinderSurface::new(radius);
    let cyl_idx = geom.add_surface(Box::new(cyl_surf));

    // 1: bottom cap (z=0, normal -Z)
    let bot_plane = Plane::new(
        Point3::origin(),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, -1.0, 0.0), // Reversed Y so normal points -Z
    );
    let bot_idx = geom.add_surface(Box::new(bot_plane));

    // 2: top cap (z=height, normal +Z)
    let top_plane = Plane::new(
        Point3::new(0.0, 0.0, height),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
    );
    let top_idx = geom.add_surface(Box::new(top_plane));

    // 3D curves: bottom circle, top circle, seam line
    geom.add_curve_3d(Box::new(Circle3d::new(Point3::origin(), radius)));
    geom.add_curve_3d(Box::new(Circle3d::new(
        Point3::new(0.0, 0.0, height),
        radius,
    )));
    geom.add_curve_3d(Box::new(Line3d::from_points(
        Point3::new(radius, 0.0, 0.0),
        Point3::new(radius, 0.0, height),
    )));

    // Lateral face: single face with a single loop using a seam edge
    // The loop goes: bottom_he (v_bot → v_bot, full circle at z=0) ->
    //                seam_up (v_bot → v_top) ->
    //                top_he (v_top → v_top, full circle at z=height, reversed) ->
    //                seam_down (v_top → v_bot)
    //
    // Actually, for a proper cylinder B-rep:
    // Lateral face has 4 half-edges forming its boundary:
    //   he_bot: v_bot → v_bot (bottom circle, forward)
    //   he_seam_up: v_bot → v_top (seam, going up)
    //   he_top: v_top → v_top (top circle, reversed)
    //   he_seam_down: v_top → v_bot (seam, going down)

    let he_bot_lat = topo.add_half_edge(v_bot);
    let he_seam_up = topo.add_half_edge(v_bot);
    let he_top_lat = topo.add_half_edge(v_top);
    let he_seam_down = topo.add_half_edge(v_top);

    let lat_loop = topo.add_loop(&[he_bot_lat, he_seam_up, he_top_lat, he_seam_down]);
    let lat_face = topo.add_face(lat_loop, cyl_idx, Orientation::Forward);

    // Bottom cap: single face with a single loop (circle going CW when viewed from below = CCW for -Z normal)
    let he_bot_cap = topo.add_half_edge(v_bot); // full circle
    let bot_loop = topo.add_loop(&[he_bot_cap]);
    let bot_face = topo.add_face(bot_loop, bot_idx, Orientation::Forward);

    // Top cap: single face with a single loop (circle going CCW when viewed from above)
    let he_top_cap = topo.add_half_edge(v_top);
    let top_loop = topo.add_loop(&[he_top_cap]);
    let top_face = topo.add_face(top_loop, top_idx, Orientation::Forward);

    // Twin half-edges:
    // Bottom circle: he_bot_lat twins with he_bot_cap
    topo.add_edge(he_bot_lat, he_bot_cap);
    // Top circle: he_top_lat twins with he_top_cap
    topo.add_edge(he_top_lat, he_top_cap);
    // Seam: he_seam_up twins with he_seam_down
    topo.add_edge(he_seam_up, he_seam_down);

    let shell = topo.add_shell(vec![lat_face, bot_face, top_face], ShellType::Outer);
    let solid_id = topo.add_solid(shell);

    BRepSolid {
        topology: topo,
        geometry: geom,
        solid_id,
    }
}

/// Build a B-rep sphere with the given radius, centered at origin.
///
/// The sphere has:
/// - 1 spherical face covering the entire surface
/// - 1 seam edge (line of longitude at u=0)
/// - 2 degenerate point vertices at the poles
///
/// `segments` controls tessellation quality but doesn't affect the B-rep structure.
pub fn make_sphere(radius: f64, _segments: u32) -> BRepSolid {
    let mut topo = Topology::new();
    let mut geom = GeometryStore::new();

    let sphere_surf = SphereSurface::new(radius);
    let surf_idx = geom.add_surface(Box::new(sphere_surf));

    // Vertices at the poles and seam equator point
    let v_north = topo.add_vertex(Point3::new(0.0, 0.0, radius));
    let v_south = topo.add_vertex(Point3::new(0.0, 0.0, -radius));
    let _v_seam = topo.add_vertex(Point3::new(radius, 0.0, 0.0));

    // The sphere face is bounded by a loop:
    // seam_up (v_seam → v_north, along longitude u=0, v from 0 to PI/2)
    // seam_over_north (v_north → v_seam, degenerate at pole, wraps around)
    // Actually for a single-face sphere, we need:
    // A single seam edge from south pole to north pole (u=0), going up
    // And the same seam going back (u=2π = u=0, other side)
    // With degenerate edges at the poles.
    //
    // Simplest valid topology: 4 half-edges
    //   he1: v_south → v_north (seam, forward)
    //   he2: v_north → v_south (seam, reverse)
    // But for a proper single-face boundary we need the loop to be:
    //   pole_south (degenerate at south) → seam_up → pole_north (degenerate) → seam_down

    let he_seam_up = topo.add_half_edge(v_south);
    let he_north_degen = topo.add_half_edge(v_north);
    let he_seam_down = topo.add_half_edge(v_north);
    let he_south_degen = topo.add_half_edge(v_south);

    // For the single-face sphere, the loop traverses the boundary of the
    // parametric domain [0, 2π] × [-π/2, π/2]:
    //   bottom edge (v = -π/2, degenerate south pole)
    //   right seam (u = 2π → u = 0 going up, but really same seam)
    //   top edge (v = π/2, degenerate north pole)
    //   left seam (u = 0 going down)

    let sphere_loop = topo.add_loop(&[he_south_degen, he_seam_up, he_north_degen, he_seam_down]);
    let sphere_face = topo.add_face(sphere_loop, surf_idx, Orientation::Forward);

    // The seam is a single edge with two sides
    topo.add_edge(he_seam_up, he_seam_down);
    // The degenerate pole edges are self-edges
    topo.add_edge(he_north_degen, he_south_degen);

    // 3D curve: seam is a half-circle from south to north pole
    geom.add_curve_3d(Box::new(Line3d::from_points(
        Point3::new(0.0, 0.0, -radius),
        Point3::new(0.0, 0.0, radius),
    )));

    let shell = topo.add_shell(vec![sphere_face], ShellType::Outer);
    let solid_id = topo.add_solid(shell);

    BRepSolid {
        topology: topo,
        geometry: geom,
        solid_id,
    }
}

/// Build a B-rep cone (frustum) with bottom radius, top radius, and height along Z.
///
/// If `radius_top == 0`, this is a pointed cone with an apex vertex.
/// If `radius_top == radius_bottom`, falls back to a cylinder.
///
/// `segments` controls tessellation quality but doesn't affect the B-rep structure.
pub fn make_cone(radius_bottom: f64, radius_top: f64, height: f64, _segments: u32) -> BRepSolid {
    // If radii are equal, it's a cylinder
    if (radius_bottom - radius_top).abs() < 1e-12 {
        return make_cylinder(radius_bottom, height, _segments);
    }

    let mut topo = Topology::new();
    let mut geom = GeometryStore::new();

    let is_pointed = radius_top < 1e-12;

    // Conical surface
    let cone_surf = if let Some(cs) = vcad_kernel_geom::ConeSurface::from_frustum(
        Point3::origin(),
        radius_bottom,
        radius_top,
        height,
    ) {
        cs
    } else {
        // Shouldn't happen since we checked for equal radii
        return make_cylinder(radius_bottom, height, _segments);
    };
    let cone_idx = geom.add_surface(Box::new(cone_surf));

    // Bottom cap
    let bot_plane = Plane::new(
        Point3::origin(),
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, -1.0, 0.0),
    );
    let bot_idx = geom.add_surface(Box::new(bot_plane));

    if is_pointed {
        // Pointed cone: apex vertex at top, one circle at bottom
        let v_bot = topo.add_vertex(Point3::new(radius_bottom, 0.0, 0.0));
        let v_apex = topo.add_vertex(Point3::new(0.0, 0.0, height));

        // Lateral face: loop with 3 half-edges
        // bottom_circle (v_bot → v_bot) → seam_up (v_bot → v_apex) → seam_down (v_apex → v_bot)
        let he_bot_lat = topo.add_half_edge(v_bot);
        let he_seam_up = topo.add_half_edge(v_bot);
        let he_seam_down = topo.add_half_edge(v_apex);

        let lat_loop = topo.add_loop(&[he_bot_lat, he_seam_up, he_seam_down]);
        let lat_face = topo.add_face(lat_loop, cone_idx, Orientation::Forward);

        // Bottom cap
        let he_bot_cap = topo.add_half_edge(v_bot);
        let bot_loop = topo.add_loop(&[he_bot_cap]);
        let bot_face = topo.add_face(bot_loop, bot_idx, Orientation::Forward);

        topo.add_edge(he_bot_lat, he_bot_cap);
        topo.add_edge(he_seam_up, he_seam_down);

        geom.add_curve_3d(Box::new(Circle3d::new(Point3::origin(), radius_bottom)));
        geom.add_curve_3d(Box::new(Line3d::from_points(
            Point3::new(radius_bottom, 0.0, 0.0),
            Point3::new(0.0, 0.0, height),
        )));

        let shell = topo.add_shell(vec![lat_face, bot_face], ShellType::Outer);
        let solid_id = topo.add_solid(shell);

        BRepSolid {
            topology: topo,
            geometry: geom,
            solid_id,
        }
    } else {
        // Frustum: two circles + seam
        let v_bot = topo.add_vertex(Point3::new(radius_bottom, 0.0, 0.0));
        let v_top = topo.add_vertex(Point3::new(radius_top, 0.0, height));

        // Top cap
        let top_plane = Plane::new(
            Point3::new(0.0, 0.0, height),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
        );
        let top_idx = geom.add_surface(Box::new(top_plane));

        // Lateral face (same as cylinder but conical)
        let he_bot_lat = topo.add_half_edge(v_bot);
        let he_seam_up = topo.add_half_edge(v_bot);
        let he_top_lat = topo.add_half_edge(v_top);
        let he_seam_down = topo.add_half_edge(v_top);

        let lat_loop = topo.add_loop(&[he_bot_lat, he_seam_up, he_top_lat, he_seam_down]);
        let lat_face = topo.add_face(lat_loop, cone_idx, Orientation::Forward);

        let he_bot_cap = topo.add_half_edge(v_bot);
        let bot_loop = topo.add_loop(&[he_bot_cap]);
        let bot_face = topo.add_face(bot_loop, bot_idx, Orientation::Forward);

        let he_top_cap = topo.add_half_edge(v_top);
        let top_loop = topo.add_loop(&[he_top_cap]);
        let top_face = topo.add_face(top_loop, top_idx, Orientation::Forward);

        topo.add_edge(he_bot_lat, he_bot_cap);
        topo.add_edge(he_top_lat, he_top_cap);
        topo.add_edge(he_seam_up, he_seam_down);

        geom.add_curve_3d(Box::new(Circle3d::new(Point3::origin(), radius_bottom)));
        geom.add_curve_3d(Box::new(Circle3d::new(
            Point3::new(0.0, 0.0, height),
            radius_top,
        )));
        geom.add_curve_3d(Box::new(Line3d::from_points(
            Point3::new(radius_bottom, 0.0, 0.0),
            Point3::new(radius_top, 0.0, height),
        )));

        let shell = topo.add_shell(vec![lat_face, bot_face, top_face], ShellType::Outer);
        let solid_id = topo.add_solid(shell);

        BRepSolid {
            topology: topo,
            geometry: geom,
            solid_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cube_topology() {
        let brep = make_cube(10.0, 20.0, 30.0);
        let topo = &brep.topology;
        assert_eq!(topo.vertices.len(), 8);
        assert_eq!(topo.faces.len(), 6);
        // 6 faces × 4 half-edges = 24 half-edges
        assert_eq!(topo.half_edges.len(), 24);
        // 12 edges
        assert_eq!(topo.edges.len(), 12);
        assert_eq!(topo.shells.len(), 1);
        assert_eq!(topo.solids.len(), 1);
    }

    #[test]
    fn test_cube_geometry() {
        let brep = make_cube(10.0, 20.0, 30.0);
        // 6 planar surfaces
        assert_eq!(brep.geometry.surfaces.len(), 6);
        // All surfaces are planes
        for s in &brep.geometry.surfaces {
            assert_eq!(s.surface_type(), vcad_kernel_geom::SurfaceKind::Plane);
        }
    }

    #[test]
    fn test_cube_vertex_positions() {
        let brep = make_cube(10.0, 20.0, 30.0);
        let positions: Vec<_> = brep.topology.vertices.values().map(|v| v.point).collect();
        // Check extremes
        let min_x = positions.iter().map(|p| p.x).fold(f64::MAX, f64::min);
        let max_x = positions.iter().map(|p| p.x).fold(f64::MIN, f64::max);
        assert!((min_x - 0.0).abs() < 1e-12);
        assert!((max_x - 10.0).abs() < 1e-12);
    }

    #[test]
    fn test_cylinder_topology() {
        let brep = make_cylinder(5.0, 10.0, 32);
        let topo = &brep.topology;
        assert_eq!(topo.vertices.len(), 2); // top + bottom seam points
        assert_eq!(topo.faces.len(), 3); // lateral + top + bottom
        assert_eq!(topo.edges.len(), 3); // 2 circles + 1 seam
        assert_eq!(topo.shells.len(), 1);
        assert_eq!(topo.solids.len(), 1);
    }

    #[test]
    fn test_cylinder_geometry() {
        let brep = make_cylinder(5.0, 10.0, 32);
        assert_eq!(brep.geometry.surfaces.len(), 3); // cylinder + 2 planes
        assert_eq!(
            brep.geometry.surfaces[0].surface_type(),
            vcad_kernel_geom::SurfaceKind::Cylinder
        );
        assert_eq!(
            brep.geometry.surfaces[1].surface_type(),
            vcad_kernel_geom::SurfaceKind::Plane
        );
    }

    #[test]
    fn test_sphere_topology() {
        let brep = make_sphere(10.0, 32);
        let topo = &brep.topology;
        // 3 vertices: north pole, south pole, seam equator point
        assert_eq!(topo.vertices.len(), 3);
        assert_eq!(topo.faces.len(), 1); // single spherical face
        assert_eq!(topo.shells.len(), 1);
        assert_eq!(topo.solids.len(), 1);
    }

    #[test]
    fn test_cone_pointed() {
        let brep = make_cone(5.0, 0.0, 10.0, 32);
        let topo = &brep.topology;
        assert_eq!(topo.vertices.len(), 2); // base point + apex
        assert_eq!(topo.faces.len(), 2); // lateral + bottom
    }

    #[test]
    fn test_cone_frustum() {
        let brep = make_cone(5.0, 3.0, 10.0, 32);
        let topo = &brep.topology;
        assert_eq!(topo.vertices.len(), 2); // bottom + top seam points
        assert_eq!(topo.faces.len(), 3); // lateral + top + bottom
        assert_eq!(topo.edges.len(), 3); // 2 circles + 1 seam
    }

    #[test]
    fn test_cone_equal_radii_is_cylinder() {
        let brep = make_cone(5.0, 5.0, 10.0, 32);
        // Should fall back to cylinder
        assert_eq!(brep.topology.faces.len(), 3);
    }
}
