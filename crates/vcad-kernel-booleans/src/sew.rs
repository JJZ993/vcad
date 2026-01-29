//! Topology reconstruction — sew selected faces into a result solid.
//!
//! After classification, we have sets of faces from both solids to keep.
//! This module copies those faces into a new BRepSolid, merging vertices
//! within tolerance and building proper shell/solid topology.
//!
//! # Important Implementation Note: Face Orientation Reversal
//!
//! When performing a boolean difference (A - B), faces from B that are kept
//! need their normals flipped to point into the resulting solid (they become
//! interior walls of holes/cavities).
//!
//! ## The Bug That Was Fixed
//!
//! There are two ways to flip a face's effective normal:
//! 1. Flip the `orientation` field (Forward ↔ Reversed)
//! 2. Reverse the loop vertex order (changes winding, which changes computed normal)
//!
//! The old code did BOTH when `reverse_b=true`:
//! - `copy_loop` reversed vertex order → normal flipped
//! - `copy_faces` flipped orientation → normal flipped again
//!
//! Two flips cancel out! The faces ended up with their original normal direction,
//! pointing OUTWARD from the hole instead of INWARD. This caused:
//! - Hole walls to contribute POSITIVE volume instead of negative
//! - Result volume was 29088 instead of expected 27936
//! - Visual artifacts (faces rendering incorrectly)
//!
//! ## The Fix
//!
//! Only flip the orientation field, NOT the loop vertex order. The orientation
//! field is the proper B-rep mechanism for controlling face normal direction
//! relative to the underlying surface.
//!
//! ```text
//! // WRONG (double flip = no flip):
//! copy_loop(..., reverse=true)  // flips winding
//! orientation = !orientation    // flips again → back to original
//!
//! // CORRECT (single flip):
//! copy_loop(..., reverse=false) // preserve winding
//! orientation = !orientation    // flips once → correct direction
//! ```

use vcad_kernel_geom::GeometryStore;
use vcad_kernel_math::Point3;
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::{FaceId, Orientation, ShellType, Topology};

use std::collections::HashMap;

/// Sew selected faces from two solids into a new result solid.
///
/// - `faces_a`: Face IDs to keep from solid A (in A's topology)
/// - `faces_b`: Face IDs to keep from solid B (in B's topology)
/// - `reverse_b`: If true, flip the orientation of B's faces (for difference)
/// - `tolerance`: Vertex merge distance
pub fn sew_faces(
    a: &BRepSolid,
    faces_a: &[FaceId],
    b: &BRepSolid,
    faces_b: &[FaceId],
    reverse_b: bool,
    tolerance: f64,
) -> BRepSolid {
    let mut topo = Topology::new();
    let mut geom = GeometryStore::new();

    // Copy faces from A
    let _a_face_map = copy_faces(a, faces_a, false, &mut topo, &mut geom);

    // Copy faces from B
    let _b_face_map = copy_faces(b, faces_b, reverse_b, &mut topo, &mut geom);

    // Merge vertices within tolerance
    merge_nearby_vertices(&mut topo, tolerance);

    // Build shell from all faces
    let all_faces: Vec<FaceId> = topo.faces.keys().collect();
    if all_faces.is_empty() {
        let shell = topo.add_shell(Vec::new(), ShellType::Outer);
        let solid = topo.add_solid(shell);
        return BRepSolid {
            topology: topo,
            geometry: geom,
            solid_id: solid,
        };
    }

    let shell = topo.add_shell(all_faces, ShellType::Outer);
    let solid = topo.add_solid(shell);

    BRepSolid {
        topology: topo,
        geometry: geom,
        solid_id: solid,
    }
}

/// Copy selected faces from a source BRep into the target topology/geometry.
///
/// Returns a mapping from source FaceId to new FaceId.
fn copy_faces(
    source: &BRepSolid,
    face_ids: &[FaceId],
    reverse_orientation: bool,
    target_topo: &mut Topology,
    target_geom: &mut GeometryStore,
) -> HashMap<FaceId, FaceId> {
    let mut face_map = HashMap::new();
    // Map from source VertexId position hash → target VertexId
    // We use positions since VertexIds from different topologies aren't comparable
    let mut vertex_map: HashMap<VertexPosKey, vcad_kernel_topo::VertexId> = HashMap::new();
    // Map from source surface index → target surface index
    let mut surface_map: HashMap<usize, usize> = HashMap::new();

    for &src_face_id in face_ids {
        let src_face = &source.topology.faces[src_face_id];
        let src_surface_idx = src_face.surface_index;

        // Copy surface if not already copied
        let tgt_surface_idx = *surface_map.entry(src_surface_idx).or_insert_with(|| {
            let surface = source.geometry.surfaces[src_surface_idx].clone();
            target_geom.add_surface(surface)
        });

        // Copy outer loop vertices and half-edges.
        //
        // CRITICAL: We do NOT reverse the loop vertices here, even when reverse_orientation=true.
        // The orientation field flip alone is sufficient to reverse the face normal.
        // If we also reversed the loop vertices, we'd double-flip and end up with the
        // original normal direction (see module docs for detailed explanation).
        //
        // This was a bug that caused boolean difference to produce wrong results:
        // hole walls pointed outward instead of inward, adding volume instead of subtracting.
        let tgt_outer_loop = copy_loop(
            source,
            src_face.outer_loop,
            false, // NEVER reverse loop - orientation flip handles normal reversal
            target_topo,
            &mut vertex_map,
        );

        // Determine orientation
        let orientation = if reverse_orientation {
            match src_face.orientation {
                Orientation::Forward => Orientation::Reversed,
                Orientation::Reversed => Orientation::Forward,
            }
        } else {
            src_face.orientation
        };

        let tgt_face = target_topo.add_face(tgt_outer_loop, tgt_surface_idx, orientation);

        // Copy inner loops
        for &inner_loop in &src_face.inner_loops {
            let tgt_inner = copy_loop(
                source,
                inner_loop,
                false, // Never reverse loop for orientation flip
                target_topo,
                &mut vertex_map,
            );
            target_topo.add_inner_loop(tgt_face, tgt_inner);
        }

        face_map.insert(src_face_id, tgt_face);
    }

    face_map
}

/// Copy a loop from source to target topology.
///
/// Returns the new LoopId in the target topology.
fn copy_loop(
    source: &BRepSolid,
    src_loop: vcad_kernel_topo::LoopId,
    reverse: bool,
    target: &mut Topology,
    vertex_map: &mut HashMap<VertexPosKey, vcad_kernel_topo::VertexId>,
) -> vcad_kernel_topo::LoopId {
    let src_topo = &source.topology;

    // Collect half-edges in order
    let src_hes: Vec<_> = src_topo.loop_half_edges(src_loop).collect();

    // Get vertices in order
    let mut vert_ids: Vec<vcad_kernel_topo::VertexId> = src_hes
        .iter()
        .map(|&he| {
            let src_v = src_topo.half_edges[he].origin;
            let pos = src_topo.vertices[src_v].point;
            let key = VertexPosKey::from_point(&pos);

            *vertex_map
                .entry(key)
                .or_insert_with(|| target.add_vertex(pos))
        })
        .collect();

    if reverse {
        vert_ids.reverse();
    }

    // Create half-edges
    let hes: Vec<_> = vert_ids.iter().map(|&v| target.add_half_edge(v)).collect();

    // Create loop
    target.add_loop(&hes)
}

/// Key for vertex position hashing (for deduplication).
///
/// Uses quantized coordinates to handle floating-point imprecision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct VertexPosKey {
    x: i64,
    y: i64,
    z: i64,
}

impl VertexPosKey {
    fn from_point(p: &Point3) -> Self {
        // Quantize to ~1e-8 resolution
        let scale = 1e8;
        Self {
            x: (p.x * scale).round() as i64,
            y: (p.y * scale).round() as i64,
            z: (p.z * scale).round() as i64,
        }
    }
}

/// Merge vertices that are within tolerance of each other.
///
/// After merging, half-edges pointing to the merged-away vertex
/// are updated to point to the surviving vertex.
fn merge_nearby_vertices(topo: &mut Topology, tolerance: f64) {
    let tol2 = tolerance * tolerance;

    // Collect all vertex IDs and positions
    let verts: Vec<(vcad_kernel_topo::VertexId, Point3)> =
        topo.vertices.iter().map(|(id, v)| (id, v.point)).collect();

    // Build merge map: vertex_to_remove → vertex_to_keep
    let mut merge_map: HashMap<vcad_kernel_topo::VertexId, vcad_kernel_topo::VertexId> =
        HashMap::new();

    for i in 0..verts.len() {
        if merge_map.contains_key(&verts[i].0) {
            continue;
        }
        for j in (i + 1)..verts.len() {
            if merge_map.contains_key(&verts[j].0) {
                continue;
            }
            let dist2 = (verts[i].1 - verts[j].1).norm_squared();
            if dist2 < tol2 {
                merge_map.insert(verts[j].0, verts[i].0);
            }
        }
    }

    if merge_map.is_empty() {
        return;
    }

    // Update all half-edges to use the surviving vertex
    let he_ids: Vec<_> = topo.half_edges.keys().collect();
    for he_id in he_ids {
        let origin = topo.half_edges[he_id].origin;
        if let Some(&target) = merge_map.get(&origin) {
            topo.half_edges[he_id].origin = target;
        }
    }

    // Remove merged vertices
    for v_id in merge_map.keys() {
        topo.vertices.remove(*v_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_kernel_primitives::make_cube;

    #[test]
    fn test_sew_non_overlapping() {
        // Two separate cubes — union should have all 12 faces
        let a = make_cube(10.0, 10.0, 10.0);
        let mut b = make_cube(10.0, 10.0, 10.0);
        for (_, v) in &mut b.topology.vertices {
            v.point.x += 100.0;
        }

        let faces_a: Vec<FaceId> = a.topology.faces.keys().collect();
        let faces_b: Vec<FaceId> = b.topology.faces.keys().collect();

        let result = sew_faces(&a, &faces_a, &b, &faces_b, false, 1e-6);
        assert_eq!(result.topology.faces.len(), 12); // 6 + 6
    }

    #[test]
    fn test_sew_with_reverse() {
        let a = make_cube(10.0, 10.0, 10.0);
        let faces_a: Vec<FaceId> = a.topology.faces.keys().collect();

        // Sew A's faces with reversed B (empty B)
        let result = sew_faces(&a, &faces_a, &a, &[], true, 1e-6);
        assert_eq!(result.topology.faces.len(), 6);
    }

    #[test]
    fn test_vertex_merge() {
        let mut topo = Topology::new();

        // Two vertices at nearly the same position
        let v1 = topo.add_vertex(Point3::new(1.0, 2.0, 3.0));
        let v2 = topo.add_vertex(Point3::new(1.0 + 1e-8, 2.0, 3.0));
        let v3 = topo.add_vertex(Point3::new(10.0, 20.0, 30.0));

        // Create half-edges so we can verify the merge
        let he1 = topo.add_half_edge(v1);
        let he2 = topo.add_half_edge(v2);
        let he3 = topo.add_half_edge(v3);

        merge_nearby_vertices(&mut topo, 1e-6);

        // v1 and v2 should have been merged
        assert_eq!(topo.vertices.len(), 2);

        // he1 and he2 should now point to the same vertex
        assert_eq!(topo.half_edges[he1].origin, topo.half_edges[he2].origin);

        // he3 should still point to v3
        assert_eq!(topo.half_edges[he3].origin, v3);
    }

    #[test]
    fn test_sew_empty() {
        let a = make_cube(10.0, 10.0, 10.0);
        let result = sew_faces(&a, &[], &a, &[], false, 1e-6);
        assert_eq!(result.topology.faces.len(), 0);
    }
}
