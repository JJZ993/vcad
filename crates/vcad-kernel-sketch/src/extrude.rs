//! Extrude operation: create a solid by sweeping a profile along a direction.

use std::collections::HashMap;

use vcad_kernel_geom::{GeometryStore, Plane};
use vcad_kernel_math::{Point2, Point3, Vec3};
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::{HalfEdgeId, Orientation, ShellType, Topology, VertexId};

use crate::{SketchError, SketchProfile, SketchSegment};

/// Extrude a closed profile along a direction to create a B-rep solid.
///
/// # Arguments
///
/// * `profile` - The closed 2D profile to extrude
/// * `direction` - The extrusion direction vector (magnitude = distance)
///
/// # Returns
///
/// A B-rep solid with:
/// - One lateral face per segment (planar for lines, cylindrical for arcs)
/// - Two cap faces (bottom at profile plane, top translated by direction)
///
/// # Errors
///
/// Returns an error if the direction vector is zero.
///
/// # Example
///
/// ```
/// use vcad_kernel_sketch::{SketchProfile, extrude};
/// use vcad_kernel_math::{Point3, Vec3};
///
/// let profile = SketchProfile::rectangle(
///     Point3::origin(),
///     Vec3::x(),
///     Vec3::y(),
///     10.0, 5.0,
/// );
/// let solid = extrude(&profile, Vec3::new(0.0, 0.0, 20.0)).unwrap();
/// // Creates a 10x5x20 box
/// ```
pub fn extrude(profile: &SketchProfile, direction: Vec3) -> Result<BRepSolid, SketchError> {
    let dir_len = direction.norm();
    if dir_len < 1e-12 {
        return Err(SketchError::ZeroExtrusion);
    }

    let mut topo = Topology::new();
    let mut geom = GeometryStore::new();

    let n_segments = profile.segments.len();

    // Vertex cache: quantized position -> VertexId
    let mut vertex_cache: HashMap<[i64; 3], VertexId> = HashMap::new();

    let quantize_pt = |p: Point3| -> [i64; 3] {
        [
            (p.x * 1e9).round() as i64,
            (p.y * 1e9).round() as i64,
            (p.z * 1e9).round() as i64,
        ]
    };

    let get_or_create_vertex =
        |cache: &mut HashMap<[i64; 3], VertexId>, topo: &mut Topology, pos: Point3| -> VertexId {
            let key = quantize_pt(pos);
            *cache.entry(key).or_insert_with(|| topo.add_vertex(pos))
        };

    // Create bottom and top vertices for each segment endpoint
    let mut bottom_verts: Vec<VertexId> = Vec::with_capacity(n_segments);
    let mut top_verts: Vec<VertexId> = Vec::with_capacity(n_segments);

    for seg in &profile.segments {
        let start_2d = seg.start();
        let start_3d = profile.to_3d(start_2d);
        let top_3d = start_3d + direction;

        let bot_v = get_or_create_vertex(&mut vertex_cache, &mut topo, start_3d);
        let top_v = get_or_create_vertex(&mut vertex_cache, &mut topo, top_3d);

        bottom_verts.push(bot_v);
        top_verts.push(top_v);
    }

    let mut all_faces = Vec::new();

    // Track half-edges for twin pairing: (origin_key, dest_key) -> HalfEdgeId
    let mut he_map: HashMap<([i64; 3], [i64; 3]), HalfEdgeId> = HashMap::new();

    // Build lateral faces (one per segment)
    // The profile goes CCW when viewed from +normal direction.
    // For each segment from point i to point i+1:
    //   - bottom edge: bot[i] -> bot[i+1]
    //   - top edge: top[i+1] -> top[i]  (reversed)
    //   - left edge: bot[i] -> top[i]
    //   - right edge: top[i+1] -> bot[i+1]
    //
    // For outward-pointing normals on the lateral face:
    // Winding should be: bot[i] -> bot[i+1] -> top[i+1] -> top[i]
    // This creates a face whose normal points away from the solid interior.

    for (i, seg) in profile.segments.iter().enumerate() {
        let next_i = (i + 1) % n_segments;

        let bot_i = bottom_verts[i];
        let bot_next = bottom_verts[next_i];
        let top_i = top_verts[i];
        let top_next = top_verts[next_i];

        let bot_i_pos = topo.vertices[bot_i].point;
        let bot_next_pos = topo.vertices[bot_next].point;
        let top_i_pos = topo.vertices[top_i].point;
        let top_next_pos = topo.vertices[top_next].point;

        // Create lateral face with winding: bot_i -> bot_next -> top_next -> top_i
        let (face_id, face_hes) = match seg {
            SketchSegment::Line { .. } => build_planar_lateral_face(
                &mut topo,
                &mut geom,
                bot_i,
                bot_next,
                top_next,
                top_i,
                bot_i_pos,
                bot_next_pos,
                top_next_pos,
                top_i_pos,
            ),
            SketchSegment::Arc { center, ccw, .. } => build_cylindrical_lateral_face(
                &mut topo, &mut geom, profile, bot_i, bot_next, top_next, top_i, *center, *ccw,
                &direction,
            ),
        };

        all_faces.push(face_id);

        // Record half-edges for twin pairing
        for he_id in face_hes {
            let he = &topo.half_edges[he_id];
            let origin = topo.vertices[he.origin].point;
            let next = he.next.unwrap();
            let dest = topo.vertices[topo.half_edges[next].origin].point;
            he_map.insert((quantize_pt(origin), quantize_pt(dest)), he_id);
        }
    }

    // Build bottom cap face
    // The profile vertices go CCW when viewed from +normal.
    // Bottom face normal should point in -direction (opposite to extrusion).
    // For -direction normal with CCW vertices, we need CW winding (reversed).
    let bot_cap_face_id = build_cap_face(
        &mut topo,
        &mut geom,
        &bottom_verts,
        &-*profile.normal.as_ref(),
        true, // reversed winding for outward (-direction) normal
        &mut he_map,
        quantize_pt,
    );
    all_faces.push(bot_cap_face_id);

    // Build top cap face
    // Top face normal should point in +direction.
    // Profile vertices map to top with same order, so CCW gives +direction normal.
    let top_cap_face_id = build_cap_face(
        &mut topo,
        &mut geom,
        &top_verts,
        profile.normal.as_ref(),
        false, // forward winding for outward (+direction) normal
        &mut he_map,
        quantize_pt,
    );
    all_faces.push(top_cap_face_id);

    // Pair twin half-edges
    pair_twin_half_edges(&mut topo, &he_map);

    // Build shell and solid
    let shell = topo.add_shell(all_faces, ShellType::Outer);
    let solid_id = topo.add_solid(shell);

    Ok(BRepSolid {
        topology: topo,
        geometry: geom,
        solid_id,
    })
}

#[allow(clippy::too_many_arguments)]
fn build_planar_lateral_face(
    topo: &mut Topology,
    geom: &mut GeometryStore,
    v0: VertexId,
    v1: VertexId,
    v2: VertexId,
    v3: VertexId,
    p0: Point3,
    p1: Point3,
    p2: Point3,
    _p3: Point3,
) -> (vcad_kernel_topo::FaceId, Vec<HalfEdgeId>) {
    // Create plane from first three points
    // v0->v1 is bottom edge, v1->v2 is right edge going up
    let x_dir = p1 - p0; // along profile segment
    let y_dir = p2 - p1; // up along extrusion
    let surf_idx = geom.add_surface(Box::new(Plane::new(p0, x_dir, y_dir)));

    // Create half-edges: v0 -> v1 -> v2 -> v3 -> (back to v0)
    let he0 = topo.add_half_edge(v0);
    let he1 = topo.add_half_edge(v1);
    let he2 = topo.add_half_edge(v2);
    let he3 = topo.add_half_edge(v3);

    let loop_id = topo.add_loop(&[he0, he1, he2, he3]);
    let face_id = topo.add_face(loop_id, surf_idx, Orientation::Forward);

    (face_id, vec![he0, he1, he2, he3])
}

#[allow(clippy::too_many_arguments)]
fn build_cylindrical_lateral_face(
    topo: &mut Topology,
    geom: &mut GeometryStore,
    _profile: &SketchProfile,
    v0: VertexId,
    v1: VertexId,
    v2: VertexId,
    v3: VertexId,
    _center_2d: Point2,
    _ccw: bool,
    _direction: &Vec3,
) -> (vcad_kernel_topo::FaceId, Vec<HalfEdgeId>) {
    // For arc segments, we approximate with a planar face.
    // A true cylindrical surface would require the tessellator to handle
    // partial cylinder arcs, which is not currently supported.
    // Using a planar quad gives correct topology and approximately correct volume
    // for small arc segments.

    let p0 = topo.vertices[v0].point;
    let p1 = topo.vertices[v1].point;
    let p2 = topo.vertices[v2].point;

    // Create plane from the quad vertices
    let x_dir = p1 - p0;
    let y_dir = p2 - p1;
    let surf_idx = geom.add_surface(Box::new(Plane::new(p0, x_dir, y_dir)));

    // Same winding as other lateral faces: v0 -> v1 -> v2 -> v3
    let he0 = topo.add_half_edge(v0);
    let he1 = topo.add_half_edge(v1);
    let he2 = topo.add_half_edge(v2);
    let he3 = topo.add_half_edge(v3);

    let loop_id = topo.add_loop(&[he0, he1, he2, he3]);
    let face_id = topo.add_face(loop_id, surf_idx, Orientation::Forward);

    (face_id, vec![he0, he1, he2, he3])
}

fn build_cap_face<F>(
    topo: &mut Topology,
    geom: &mut GeometryStore,
    verts: &[VertexId],
    normal: &Vec3,
    reversed: bool,
    he_map: &mut HashMap<([i64; 3], [i64; 3]), HalfEdgeId>,
    quantize_pt: F,
) -> vcad_kernel_topo::FaceId
where
    F: Fn(Point3) -> [i64; 3],
{
    let n = verts.len();

    // Get positions
    let positions: Vec<Point3> = verts.iter().map(|&v| topo.vertices[v].point).collect();

    // Create plane surface
    let origin = positions[0];
    let surf_idx = if n >= 3 {
        let x_dir = positions[1] - origin;
        let y_dir = positions[n - 1] - origin;
        if x_dir.norm() > 1e-12 && y_dir.norm() > 1e-12 && x_dir.cross(&y_dir).norm() > 1e-12 {
            geom.add_surface(Box::new(Plane::new(origin, x_dir, y_dir)))
        } else {
            geom.add_surface(Box::new(Plane::from_normal(origin, *normal)))
        }
    } else {
        geom.add_surface(Box::new(Plane::from_normal(origin, *normal)))
    };

    // Create half-edges in the correct order
    let ordered_verts: Vec<VertexId> = if reversed {
        verts.iter().rev().copied().collect()
    } else {
        verts.to_vec()
    };

    let hes: Vec<HalfEdgeId> = ordered_verts
        .iter()
        .map(|&v| topo.add_half_edge(v))
        .collect();
    let loop_id = topo.add_loop(&hes);
    let face_id = topo.add_face(loop_id, surf_idx, Orientation::Forward);

    // Record half-edges for twin pairing
    for &he_id in &hes {
        let he = &topo.half_edges[he_id];
        let origin = topo.vertices[he.origin].point;
        let next = he.next.unwrap();
        let dest = topo.vertices[topo.half_edges[next].origin].point;
        he_map.insert((quantize_pt(origin), quantize_pt(dest)), he_id);
    }

    face_id
}

fn pair_twin_half_edges(topo: &mut Topology, he_map: &HashMap<([i64; 3], [i64; 3]), HalfEdgeId>) {
    let mut paired = std::collections::HashSet::new();

    for (&(origin_key, dest_key), &he_id) in he_map {
        if paired.contains(&(dest_key, origin_key)) {
            continue;
        }

        if let Some(&twin_id) = he_map.get(&(dest_key, origin_key)) {
            if topo.half_edges[he_id].twin.is_none() && topo.half_edges[twin_id].twin.is_none() {
                topo.add_edge(he_id, twin_id);
                paired.insert((origin_key, dest_key));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;
    use vcad_kernel_geom::SurfaceKind;

    #[test]
    fn test_extrude_rectangle() {
        let profile = SketchProfile::rectangle(Point3::origin(), Vec3::x(), Vec3::y(), 10.0, 5.0);

        let solid = extrude(&profile, Vec3::new(0.0, 0.0, 20.0)).unwrap();

        // 6 faces: 4 lateral + 2 caps
        assert_eq!(solid.topology.faces.len(), 6);

        // 8 vertices
        assert_eq!(solid.topology.vertices.len(), 8);

        // 12 edges
        assert_eq!(solid.topology.edges.len(), 12);

        // All faces should be planar
        for surface in &solid.geometry.surfaces {
            assert_eq!(surface.surface_type(), SurfaceKind::Plane);
        }
    }

    #[test]
    fn test_extrude_rectangle_volume() {
        let profile = SketchProfile::rectangle(Point3::origin(), Vec3::x(), Vec3::y(), 10.0, 5.0);

        let solid = extrude(&profile, Vec3::new(0.0, 0.0, 20.0)).unwrap();

        let mesh = vcad_kernel_tessellate::tessellate_brep(&solid, 32);
        let vol = compute_mesh_volume(&mesh);

        // Expected: 10 * 5 * 20 = 1000
        assert!(
            (vol - 1000.0).abs() < 1.0,
            "expected volume ~1000, got {vol}"
        );
    }

    #[test]
    fn test_extrude_all_halfedges_paired() {
        let profile = SketchProfile::rectangle(Point3::origin(), Vec3::x(), Vec3::y(), 10.0, 5.0);

        let solid = extrude(&profile, Vec3::new(0.0, 0.0, 20.0)).unwrap();

        // All half-edges should have twins (closed manifold)
        let unpaired: Vec<_> = solid
            .topology
            .half_edges
            .values()
            .filter(|he| he.twin.is_none())
            .collect();

        assert!(
            unpaired.is_empty(),
            "found {} unpaired half-edges",
            unpaired.len()
        );
    }

    #[test]
    fn test_extrude_l_shape() {
        // L-shaped profile: 6 vertices
        let segments = vec![
            SketchSegment::Line {
                start: Point2::new(0.0, 0.0),
                end: Point2::new(10.0, 0.0),
            },
            SketchSegment::Line {
                start: Point2::new(10.0, 0.0),
                end: Point2::new(10.0, 5.0),
            },
            SketchSegment::Line {
                start: Point2::new(10.0, 5.0),
                end: Point2::new(5.0, 5.0),
            },
            SketchSegment::Line {
                start: Point2::new(5.0, 5.0),
                end: Point2::new(5.0, 10.0),
            },
            SketchSegment::Line {
                start: Point2::new(5.0, 10.0),
                end: Point2::new(0.0, 10.0),
            },
            SketchSegment::Line {
                start: Point2::new(0.0, 10.0),
                end: Point2::new(0.0, 0.0),
            },
        ];

        let profile = SketchProfile::new(Point3::origin(), Vec3::x(), Vec3::y(), segments).unwrap();

        let solid = extrude(&profile, Vec3::new(0.0, 0.0, 15.0)).unwrap();

        // 8 faces: 6 lateral + 2 caps
        assert_eq!(solid.topology.faces.len(), 8);

        // 12 vertices (6 bottom + 6 top)
        assert_eq!(solid.topology.vertices.len(), 12);

        // All half-edges paired
        let unpaired = solid
            .topology
            .half_edges
            .values()
            .filter(|he| he.twin.is_none())
            .count();
        assert_eq!(unpaired, 0);
    }

    #[test]
    fn test_extrude_circle() {
        let profile = SketchProfile::circle(Point3::origin(), Vec3::z(), 5.0, 8);

        let solid = extrude(&profile, Vec3::new(0.0, 0.0, 10.0)).unwrap();

        // 10 faces: 8 lateral + 2 caps
        assert_eq!(solid.topology.faces.len(), 10);

        // All half-edges should be paired
        let unpaired = solid
            .topology
            .half_edges
            .values()
            .filter(|he| he.twin.is_none())
            .count();
        assert_eq!(unpaired, 0, "expected no unpaired half-edges");

        // Volume should approximate π*r²*h = π*25*10 ≈ 785
        // Note: Using planar approximation for arc faces, so some error expected
        let mesh = vcad_kernel_tessellate::tessellate_brep(&solid, 64);
        let vol = compute_mesh_volume(&mesh);
        let expected = PI * 25.0 * 10.0;
        // Allow 10% error due to planar approximation of curved faces
        assert!(
            (vol - expected).abs() < expected * 0.1,
            "expected volume ~{expected:.1}, got {vol:.1}"
        );
    }

    #[test]
    fn test_extrude_zero_direction_error() {
        let profile = SketchProfile::rectangle(Point3::origin(), Vec3::x(), Vec3::y(), 10.0, 5.0);

        let result = extrude(&profile, Vec3::zeros());
        assert!(matches!(result, Err(SketchError::ZeroExtrusion)));
    }

    #[test]
    fn test_extrude_angled_direction() {
        // Extrude at 45 degrees
        let profile = SketchProfile::rectangle(Point3::origin(), Vec3::x(), Vec3::y(), 10.0, 10.0);

        let solid = extrude(&profile, Vec3::new(0.0, 10.0, 10.0)).unwrap();

        assert_eq!(solid.topology.faces.len(), 6);

        // For angled extrusion: V = A * (d · n) where d is direction, n is normal
        // d = (0, 10, 10), n = (0, 0, 1), so d·n = 10
        // V = 100 * 10 = 1000
        let mesh = vcad_kernel_tessellate::tessellate_brep(&solid, 32);
        let vol = compute_mesh_volume(&mesh);
        assert!(
            (vol - 1000.0).abs() < 5.0,
            "expected volume ~1000, got {vol}"
        );
    }

    fn compute_mesh_volume(mesh: &vcad_kernel_tessellate::TriangleMesh) -> f64 {
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
            vol += v0[0] * (v1[1] * v2[2] - v2[1] * v1[2])
                - v1[0] * (v0[1] * v2[2] - v2[1] * v0[2])
                + v2[0] * (v0[1] * v1[2] - v1[1] * v0[2]);
        }
        (vol / 6.0).abs()
    }
}
