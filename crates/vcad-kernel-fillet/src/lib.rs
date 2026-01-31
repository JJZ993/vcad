#![warn(missing_docs)]

//! Fillet and chamfer operations for the vcad kernel.
//!
//! Implements edge modification operations on B-rep solids:
//! - **Chamfer**: replaces an edge with a planar bevel face
//! - **Fillet**: replaces an edge with a cylindrical blend surface
//!
//! Currently supports edges between planar faces (the most common case
//! for prismatic CAD geometry).

use std::collections::HashMap;
use vcad_kernel_geom::{CylinderSurface, GeometryStore, Plane};
use vcad_kernel_math::{Dir3, Point3, Vec3};
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::{EdgeId, FaceId, HalfEdgeId, Orientation, ShellType, Topology, VertexId};

// =============================================================================
// Topology analysis helpers
// =============================================================================

/// Information about a face extracted from the B-rep.
#[derive(Debug, Clone)]
struct FaceInfo {
    face_id: FaceId,
    /// Vertices in loop order.
    vertex_ids: Vec<VertexId>,
    /// Vertex positions in loop order.
    positions: Vec<Point3>,
    /// Outward face normal (from vertex winding).
    normal: Vec3,
}

/// Information about an edge.
#[derive(Debug, Clone)]
struct EdgeInfo {
    #[allow(dead_code)]
    edge_id: EdgeId,
    /// Start vertex (origin of the primary half-edge).
    v_start: VertexId,
    /// End vertex.
    v_end: VertexId,
    /// Face on the primary half-edge side.
    face_a: FaceId,
    /// Face on the twin half-edge side.
    face_b: FaceId,
}

/// Extract face information from a B-rep solid.
fn extract_faces(brep: &BRepSolid) -> Vec<FaceInfo> {
    let topo = &brep.topology;
    let mut faces = Vec::new();

    for (face_id, face) in &topo.faces {
        let vertex_ids = topo.loop_vertices(face.outer_loop);
        let positions: Vec<Point3> = vertex_ids.iter().map(|&v| topo.vertices[v].point).collect();
        let normal = compute_face_normal(&positions);

        faces.push(FaceInfo {
            face_id,
            vertex_ids,
            positions,
            normal,
        });
    }

    faces
}

/// Compute face normal from vertex positions using Newell's method.
fn compute_face_normal(positions: &[Point3]) -> Vec3 {
    let n = positions.len();
    if n < 3 {
        return Vec3::z();
    }
    let mut normal = Vec3::zeros();
    for i in 0..n {
        let curr = positions[i];
        let next = positions[(i + 1) % n];
        normal.x += (curr.y - next.y) * (curr.z + next.z);
        normal.y += (curr.z - next.z) * (curr.x + next.x);
        normal.z += (curr.x - next.x) * (curr.y + next.y);
    }
    let len = normal.norm();
    if len < 1e-15 {
        Vec3::z()
    } else {
        normal / len
    }
}

/// Extract edge information from a B-rep solid.
/// Only returns edges that have two adjacent faces (manifold edges).
fn extract_edges(brep: &BRepSolid) -> Vec<EdgeInfo> {
    let topo = &brep.topology;
    let mut edges = Vec::new();

    for (edge_id, edge) in &topo.edges {
        let he1 = edge.half_edge;
        let he2 = match topo.half_edges[he1].twin {
            Some(t) => t,
            None => continue,
        };

        let v_start = topo.half_edges[he1].origin;
        let v_end = topo.half_edges[he2].origin;

        let face_a = topo.half_edges[he1]
            .loop_id
            .and_then(|l| topo.loops[l].face);
        let face_b = topo.half_edges[he2]
            .loop_id
            .and_then(|l| topo.loops[l].face);

        if let (Some(fa), Some(fb)) = (face_a, face_b) {
            edges.push(EdgeInfo {
                edge_id,
                v_start,
                v_end,
                face_a: fa,
                face_b: fb,
            });
        }
    }

    edges
}

// =============================================================================
// Trim vertex computation
// =============================================================================

/// Key for a trim vertex: (original_vertex, face_id).
/// Each original vertex gets one trim vertex per adjacent face.
type TrimKey = (VertexId, FaceId);

/// Compute trim vertices for all vertices on all faces.
///
/// For each vertex V on face F:
/// - The entering edge E_enter and leaving edge E_leave define two trim lines
///   (parallel to each edge, offset inward by `distance`)
/// - The trim vertex is at the intersection of these two trim lines
///
/// This gives one vertex per (original_vertex, face) pair.
fn compute_trim_vertices(faces: &[FaceInfo], distance: f64) -> HashMap<TrimKey, Point3> {
    let mut trims = HashMap::new();

    // Build a map: (vertex, face) → (entering_edge_dir, leaving_edge_dir)
    // For each face, walk its loop and find the entering/leaving edge directions at each vertex.
    for face in faces {
        let n = face.vertex_ids.len();
        let normal = face.normal;

        for i in 0..n {
            let v_id = face.vertex_ids[i];
            let v_pos = face.positions[i];
            let prev_idx = (i + n - 1) % n;
            let next_idx = (i + 1) % n;

            // Direction of entering edge: from predecessor toward this vertex
            let prev_pos = face.positions[prev_idx];
            let d_enter = v_pos - prev_pos;
            let d_enter_len = d_enter.norm();

            // Direction of leaving edge: from this vertex toward successor
            let next_pos = face.positions[next_idx];
            let d_leave = next_pos - v_pos;
            let d_leave_len = d_leave.norm();

            if d_enter_len < 1e-15 || d_leave_len < 1e-15 {
                trims.insert((v_id, face.face_id), v_pos);
                continue;
            }

            let d_enter = d_enter / d_enter_len;
            let d_leave = d_leave / d_leave_len;

            // Compute inward perpendiculars (into the face interior)
            let perp_enter = normal.cross(&d_enter);
            let pe_len = perp_enter.norm();
            let perp_leave = normal.cross(&d_leave);
            let pl_len = perp_leave.norm();

            if pe_len < 1e-15 || pl_len < 1e-15 {
                trims.insert((v_id, face.face_id), v_pos);
                continue;
            }

            let perp_enter = perp_enter / pe_len;
            let perp_leave = perp_leave / pl_len;

            // Trim line 1: point on entering edge's trim line, direction d_enter
            // P1 = V + distance * perp_enter
            // Trim line 2: point on leaving edge's trim line, direction d_leave
            // P2 = V + distance * perp_leave
            //
            // Solve: P1 + t1 * d_enter = P2 + t2 * d_leave
            // => distance * (perp_enter - perp_leave) = t2 * d_leave - t1 * d_enter
            //
            // Cross with d_leave: delta × d_leave = -t1 * (d_enter × d_leave)
            // t1 = -(delta × d_leave) · normal / (d_enter × d_leave) · normal

            let delta = distance * (perp_enter - perp_leave);
            let cross_dirs = d_enter.cross(&d_leave);
            let denom = cross_dirs.dot(&normal);

            if denom.abs() < 1e-15 {
                // Parallel edges — use midpoint of perpendicular offsets
                let p = v_pos + distance * 0.5 * (perp_enter + perp_leave);
                trims.insert((v_id, face.face_id), p);
                continue;
            }

            let cross_delta = delta.cross(&d_leave);
            let t1 = -cross_delta.dot(&normal) / denom;

            let p1 = v_pos + distance * perp_enter;
            let trim_point = Point3::from(p1.coords + t1 * d_enter);
            trims.insert((v_id, face.face_id), trim_point);
        }
    }

    trims
}

// =============================================================================
// Chamfer
// =============================================================================

/// Chamfer all edges of a B-rep solid by the given distance.
///
/// Creates a new solid where each edge is replaced by a planar bevel face,
/// each original face is trimmed back, and each vertex becomes a polygon face.
///
/// # Requirements
///
/// - All faces must be planar (analytic surfaces)
/// - The solid should be convex (concave solids may produce incorrect results)
/// - Distance must be positive and small enough that offset vertices don't overlap
///
/// # Panics
///
/// Panics if the solid has no edges or if offset computation fails.
pub fn chamfer_all_edges(brep: &BRepSolid, distance: f64) -> BRepSolid {
    let faces = extract_faces(brep);
    let edges = extract_edges(brep);

    if edges.is_empty() {
        return brep.clone();
    }

    let trims = compute_trim_vertices(&faces, distance);

    // Build vertex→edges map (which edges meet at each vertex)
    let mut vertex_edges: HashMap<VertexId, Vec<&EdgeInfo>> = HashMap::new();
    for edge in &edges {
        vertex_edges.entry(edge.v_start).or_default().push(edge);
        vertex_edges.entry(edge.v_end).or_default().push(edge);
    }

    let mut new_topo = Topology::new();
    let mut new_geom = GeometryStore::new();
    let mut vertex_cache: HashMap<[i64; 3], VertexId> = HashMap::new();

    let get_or_create_vertex =
        |cache: &mut HashMap<[i64; 3], VertexId>, topo: &mut Topology, pos: Point3| -> VertexId {
            let key = quantize(pos);
            *cache.entry(key).or_insert_with(|| topo.add_vertex(pos))
        };

    let mut all_faces = Vec::new();

    // 1. Build modified original faces (same vertex count, using trim vertices)
    for face in &faces {
        let new_positions: Vec<Point3> = face
            .vertex_ids
            .iter()
            .filter_map(|&v_id| trims.get(&(v_id, face.face_id)).copied())
            .collect();

        if new_positions.len() < 3 {
            continue;
        }

        let new_verts: Vec<VertexId> = new_positions
            .iter()
            .map(|p| get_or_create_vertex(&mut vertex_cache, &mut new_topo, *p))
            .collect();

        let p0 = new_positions[0];
        let x_dir = new_positions[1] - p0;
        let y_dir = new_positions[new_positions.len() - 1] - p0;
        let surf_idx = if x_dir.norm() > 1e-12 && y_dir.norm() > 1e-12 {
            new_geom.add_surface(Box::new(Plane::new(p0, x_dir, y_dir)))
        } else {
            new_geom.add_surface(Box::new(Plane::from_normal(p0, face.normal)))
        };

        let hes: Vec<HalfEdgeId> = new_verts
            .iter()
            .map(|&v| new_topo.add_half_edge(v))
            .collect();
        let loop_id = new_topo.add_loop(&hes);
        let face_id = new_topo.add_face(loop_id, surf_idx, Orientation::Forward);
        all_faces.push(face_id);
    }

    // 2. Build chamfer faces (one per edge)
    for edge_info in &edges {
        let pa_s = trims.get(&(edge_info.v_start, edge_info.face_a));
        let pa_e = trims.get(&(edge_info.v_end, edge_info.face_a));
        let pb_s = trims.get(&(edge_info.v_start, edge_info.face_b));
        let pb_e = trims.get(&(edge_info.v_end, edge_info.face_b));

        if let (Some(&pa_s), Some(&pa_e), Some(&pb_s), Some(&pb_e)) = (pa_s, pa_e, pb_s, pb_e) {
            // Orient the quad for outward normal
            let chamfer_center =
                Point3::from((pa_s.coords + pa_e.coords + pb_e.coords + pb_s.coords) * 0.25);
            let solid_center = compute_centroid(&faces);
            let outward_dir = chamfer_center - solid_center;

            let e1 = pa_e - pa_s;
            let e2 = pb_s - pa_s;
            let n = e1.cross(&e2);

            let positions = if n.dot(&outward_dir) > 0.0 {
                vec![pa_s, pa_e, pb_e, pb_s]
            } else {
                vec![pa_s, pb_s, pb_e, pa_e]
            };

            let verts: Vec<VertexId> = positions
                .iter()
                .map(|p| get_or_create_vertex(&mut vertex_cache, &mut new_topo, *p))
                .collect();

            let x_dir = positions[1] - positions[0];
            let y_dir = positions[3] - positions[0];
            let surf_idx = new_geom.add_surface(Box::new(Plane::new(positions[0], x_dir, y_dir)));

            let hes: Vec<HalfEdgeId> = verts.iter().map(|&v| new_topo.add_half_edge(v)).collect();
            let loop_id = new_topo.add_loop(&hes);
            let face_id = new_topo.add_face(loop_id, surf_idx, Orientation::Forward);
            all_faces.push(face_id);
        }
    }

    // 3. Build vertex faces (one per vertex where ≥3 edges meet)
    build_vertex_faces(
        &faces,
        &vertex_edges,
        &trims,
        brep,
        &mut vertex_cache,
        &mut new_topo,
        &mut new_geom,
        &mut all_faces,
    );

    // 4. Pair twin half-edges
    pair_twin_half_edges(&mut new_topo);

    // 5. Build shell and solid
    let shell = new_topo.add_shell(all_faces, ShellType::Outer);
    let solid_id = new_topo.add_solid(shell);

    BRepSolid {
        topology: new_topo,
        geometry: new_geom,
        solid_id,
    }
}

/// Compute the centroid of all faces' vertex positions.
fn compute_centroid(faces: &[FaceInfo]) -> Point3 {
    let mut sum = Vec3::zeros();
    let mut count = 0;
    for face in faces {
        for p in &face.positions {
            sum += p.coords;
            count += 1;
        }
    }
    if count == 0 {
        Point3::origin()
    } else {
        Point3::from(sum / count as f64)
    }
}

/// Pair twin half-edges by matching (origin, destination) vertex pairs.
fn pair_twin_half_edges(topo: &mut Topology) {
    let mut he_map: HashMap<([i64; 3], [i64; 3]), HalfEdgeId> = HashMap::new();

    let he_ids: Vec<HalfEdgeId> = topo.half_edges.keys().collect();
    for he_id in &he_ids {
        let he = &topo.half_edges[*he_id];
        let origin = topo.vertices[he.origin].point;
        let next = match he.next {
            Some(n) => n,
            None => continue,
        };
        let dest = topo.vertices[topo.half_edges[next].origin].point;

        let origin_key = quantize(origin);
        let dest_key = quantize(dest);

        if let Some(&twin_id) = he_map.get(&(dest_key, origin_key)) {
            if topo.half_edges[*he_id].twin.is_none() && topo.half_edges[twin_id].twin.is_none() {
                topo.add_edge(*he_id, twin_id);
            }
        }

        he_map.insert((origin_key, dest_key), *he_id);
    }
}

fn quantize(p: Point3) -> [i64; 3] {
    [
        (p.x * 1e9).round() as i64,
        (p.y * 1e9).round() as i64,
        (p.z * 1e9).round() as i64,
    ]
}

/// Build vertex faces for all vertices where ≥3 edges meet.
/// Each vertex face is a polygon connecting the trim vertices from all adjacent faces.
#[allow(clippy::too_many_arguments)]
fn build_vertex_faces(
    faces: &[FaceInfo],
    vertex_edges: &HashMap<VertexId, Vec<&EdgeInfo>>,
    trims: &HashMap<TrimKey, Point3>,
    brep: &BRepSolid,
    vertex_cache: &mut HashMap<[i64; 3], VertexId>,
    new_topo: &mut Topology,
    new_geom: &mut GeometryStore,
    all_faces: &mut Vec<FaceId>,
) {
    let get_or_create_vertex =
        |cache: &mut HashMap<[i64; 3], VertexId>, topo: &mut Topology, pos: Point3| -> VertexId {
            let key = quantize(pos);
            *cache.entry(key).or_insert_with(|| topo.add_vertex(pos))
        };

    for (&v_id, v_edges) in vertex_edges {
        if v_edges.len() < 3 {
            continue;
        }

        let v_pos = brep.topology.vertices[v_id].point;

        // Collect trim vertices from all faces at this vertex
        let mut vertex_face_points: Vec<Point3> = Vec::new();
        for face in faces {
            if face.vertex_ids.contains(&v_id) {
                if let Some(&p) = trims.get(&(v_id, face.face_id)) {
                    vertex_face_points.push(p);
                }
            }
        }

        if vertex_face_points.len() < 3 {
            continue;
        }

        // Sort by angle around the axis from solid center to vertex
        let solid_center = compute_centroid(faces);
        let axis = (v_pos - solid_center).normalize();

        let arbitrary = if axis.x.abs() < 0.9 {
            Vec3::x()
        } else {
            Vec3::y()
        };
        let u_dir = axis.cross(&arbitrary).normalize();
        let v_dir = axis.cross(&u_dir);

        let center = vertex_face_points
            .iter()
            .fold(Vec3::zeros(), |acc, p| acc + p.coords)
            / vertex_face_points.len() as f64;
        let center = Point3::from(center);

        let mut indexed: Vec<(usize, f64)> = vertex_face_points
            .iter()
            .enumerate()
            .map(|(i, p)| {
                let d = *p - center;
                (i, d.dot(&v_dir).atan2(d.dot(&u_dir)))
            })
            .collect();
        indexed.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

        let sorted_positions: Vec<Point3> = indexed
            .iter()
            .map(|(i, _)| vertex_face_points[*i])
            .collect();

        if sorted_positions.len() >= 3 {
            let e1 = sorted_positions[1] - sorted_positions[0];
            let e2 = sorted_positions[2] - sorted_positions[0];
            let n = e1.cross(&e2);
            let outward = center - solid_center;

            let final_positions = if n.dot(&outward) > 0.0 {
                sorted_positions
            } else {
                let mut rev = sorted_positions;
                rev.reverse();
                rev
            };

            let verts: Vec<VertexId> = final_positions
                .iter()
                .map(|p| get_or_create_vertex(vertex_cache, new_topo, *p))
                .collect();

            let x_dir = final_positions[1] - final_positions[0];
            let y_dir = final_positions[final_positions.len() - 1] - final_positions[0];
            let surf_idx =
                new_geom.add_surface(Box::new(Plane::new(final_positions[0], x_dir, y_dir)));

            let hes: Vec<HalfEdgeId> = verts.iter().map(|&v| new_topo.add_half_edge(v)).collect();
            let loop_id = new_topo.add_loop(&hes);
            let face_id = new_topo.add_face(loop_id, surf_idx, Orientation::Forward);
            all_faces.push(face_id);
        }
    }
}

// =============================================================================
// Fillet
// =============================================================================

/// Fillet all edges of a B-rep solid with a constant radius.
///
/// Creates a new solid where each edge is replaced by a cylindrical blend
/// surface tangent to both adjacent faces. Each original face is trimmed,
/// and each vertex becomes a polygon face with curved transitions.
///
/// # Requirements
///
/// - All faces must be planar
/// - The solid should be convex
/// - Radius must be positive and smaller than the shortest edge / 2
///
/// # Current limitations
///
/// The vertex faces at edge junctions are still planar (not smooth transitions).
/// This is a common simplification for constant-radius fillets.
pub fn fillet_all_edges(brep: &BRepSolid, radius: f64) -> BRepSolid {
    let faces = extract_faces(brep);
    let edges = extract_edges(brep);

    if edges.is_empty() {
        return brep.clone();
    }

    // Tangent points are at the same positions as chamfer trim vertices
    let trims = compute_trim_vertices(&faces, radius);
    let face_map: HashMap<FaceId, &FaceInfo> = faces.iter().map(|f| (f.face_id, f)).collect();

    let mut vertex_edges: HashMap<VertexId, Vec<&EdgeInfo>> = HashMap::new();
    for edge in &edges {
        vertex_edges.entry(edge.v_start).or_default().push(edge);
        vertex_edges.entry(edge.v_end).or_default().push(edge);
    }

    let mut new_topo = Topology::new();
    let mut new_geom = GeometryStore::new();
    let mut vertex_cache: HashMap<[i64; 3], VertexId> = HashMap::new();

    let get_or_create_vertex =
        |cache: &mut HashMap<[i64; 3], VertexId>, topo: &mut Topology, pos: Point3| -> VertexId {
            let key = quantize(pos);
            *cache.entry(key).or_insert_with(|| topo.add_vertex(pos))
        };

    let mut all_faces = Vec::new();

    // 1. Build modified original faces (same vertex count, using trim vertices)
    for face in &faces {
        let new_positions: Vec<Point3> = face
            .vertex_ids
            .iter()
            .filter_map(|&v_id| trims.get(&(v_id, face.face_id)).copied())
            .collect();

        if new_positions.len() < 3 {
            continue;
        }

        let verts: Vec<VertexId> = new_positions
            .iter()
            .map(|p| get_or_create_vertex(&mut vertex_cache, &mut new_topo, *p))
            .collect();

        let p0 = new_positions[0];
        let x_dir = new_positions[1] - p0;
        let y_dir = new_positions[new_positions.len() - 1] - p0;
        let surf_idx = if x_dir.norm() > 1e-12 && y_dir.norm() > 1e-12 {
            new_geom.add_surface(Box::new(Plane::new(p0, x_dir, y_dir)))
        } else {
            new_geom.add_surface(Box::new(Plane::from_normal(p0, face.normal)))
        };

        let hes: Vec<HalfEdgeId> = verts.iter().map(|&v| new_topo.add_half_edge(v)).collect();
        let loop_id = new_topo.add_loop(&hes);
        let face_id = new_topo.add_face(loop_id, surf_idx, Orientation::Forward);
        all_faces.push(face_id);
    }

    // 2. Build fillet faces (cylindrical blend for each edge)
    for edge_info in &edges {
        let fa = face_map[&edge_info.face_a];
        let fb = face_map[&edge_info.face_b];

        let pa_s = trims.get(&(edge_info.v_start, edge_info.face_a));
        let pa_e = trims.get(&(edge_info.v_end, edge_info.face_a));
        let pb_s = trims.get(&(edge_info.v_start, edge_info.face_b));
        let pb_e = trims.get(&(edge_info.v_end, edge_info.face_b));

        if let (Some(&pa_s), Some(&pa_e), Some(&pb_s), Some(&pb_e)) = (pa_s, pa_e, pb_s, pb_e) {
            // Cylinder axis along the edge direction
            let v_start_pos = brep.topology.vertices[edge_info.v_start].point;
            let v_end_pos = brep.topology.vertices[edge_info.v_end].point;
            let edge_dir = v_end_pos - v_start_pos;
            let edge_len = edge_dir.norm();
            if edge_len < 1e-12 {
                continue;
            }
            let edge_unit = edge_dir / edge_len;

            // Cylinder center: offset from the edge by r along both face normals
            let center_offset = radius * (fa.normal + fb.normal);
            let center_start = v_start_pos + center_offset;

            // Ref dir: from cylinder center toward the tangent on face_a
            let to_tangent_a = pa_s - center_start;
            let ref_dir = to_tangent_a - to_tangent_a.dot(&edge_unit) * edge_unit;
            let ref_len = ref_dir.norm();
            if ref_len < 1e-12 {
                continue;
            }

            let cyl_surface = CylinderSurface {
                center: center_start,
                axis: Dir3::new_normalize(edge_unit),
                ref_dir: Dir3::new_normalize(ref_dir),
                radius,
            };
            let surf_idx = new_geom.add_surface(Box::new(cyl_surface));

            // Orient the quad for outward normal
            let solid_center = compute_centroid(&faces);
            let chamfer_center =
                Point3::from((pa_s.coords + pa_e.coords + pb_e.coords + pb_s.coords) * 0.25);
            let outward = chamfer_center - solid_center;

            let e1 = pa_e - pa_s;
            let e2 = pb_s - pa_s;
            let n = e1.cross(&e2);

            let positions = if n.dot(&outward) > 0.0 {
                vec![pa_s, pa_e, pb_e, pb_s]
            } else {
                vec![pa_s, pb_s, pb_e, pa_e]
            };

            let verts: Vec<VertexId> = positions
                .iter()
                .map(|p| get_or_create_vertex(&mut vertex_cache, &mut new_topo, *p))
                .collect();

            let hes: Vec<HalfEdgeId> = verts.iter().map(|&v| new_topo.add_half_edge(v)).collect();
            let loop_id = new_topo.add_loop(&hes);
            let face_id = new_topo.add_face(loop_id, surf_idx, Orientation::Forward);
            all_faces.push(face_id);
        }
    }

    // 3. Build vertex faces
    build_vertex_faces(
        &faces,
        &vertex_edges,
        &trims,
        brep,
        &mut vertex_cache,
        &mut new_topo,
        &mut new_geom,
        &mut all_faces,
    );

    // 4. Pair twin half-edges
    pair_twin_half_edges(&mut new_topo);

    // 5. Build shell and solid
    let shell = new_topo.add_shell(all_faces, ShellType::Outer);
    let solid_id = new_topo.add_solid(shell);

    BRepSolid {
        topology: new_topo,
        geometry: new_geom,
        solid_id,
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_kernel_primitives::make_cube;

    #[test]
    fn test_extract_faces_cube() {
        let cube = make_cube(10.0, 10.0, 10.0);
        let faces = extract_faces(&cube);
        assert_eq!(faces.len(), 6);
        for face in &faces {
            assert_eq!(face.vertex_ids.len(), 4);
            let n = face.normal;
            assert!(
                (n.norm() - 1.0).abs() < 0.01,
                "face normal not unit: {:?}",
                n
            );
        }
    }

    #[test]
    fn test_extract_edges_cube() {
        let cube = make_cube(10.0, 10.0, 10.0);
        let edges = extract_edges(&cube);
        assert_eq!(edges.len(), 12, "cube should have 12 edges");
    }

    #[test]
    fn test_chamfer_cube_topology() {
        let cube = make_cube(10.0, 10.0, 10.0);
        let chamfered = chamfer_all_edges(&cube, 1.0);

        // Chamfered cube: 6 quads (trimmed faces) + 12 quads (chamfer faces) + 8 triangles = 26 faces
        let n_faces = chamfered.topology.faces.len();
        assert_eq!(
            n_faces, 26,
            "chamfered cube should have 26 faces, got {}",
            n_faces
        );

        // 24 vertices (each original vertex spawns 3 trim vertices, one per face)
        let n_verts = chamfered.topology.vertices.len();
        assert_eq!(
            n_verts, 24,
            "chamfered cube should have 24 vertices, got {}",
            n_verts
        );

        // All half-edges should be paired (closed solid)
        let total_hes = chamfered.topology.half_edges.len();
        let paired_hes = chamfered
            .topology
            .half_edges
            .values()
            .filter(|he| he.twin.is_some())
            .count();
        assert_eq!(
            paired_hes, total_hes,
            "all {} half-edges should be paired, got {} paired",
            total_hes, paired_hes
        );
    }

    #[test]
    fn test_chamfer_cube_volume() {
        let cube = make_cube(10.0, 10.0, 10.0);
        let d = 1.0;
        let chamfered = chamfer_all_edges(&cube, d);

        let mesh = vcad_kernel_tessellate::tessellate_brep(&chamfered, 32);

        // Volume of chamfered cube via inclusion-exclusion:
        // 12 full edge prisms (cross-section 0.5*d², length L): 12 * 0.5 * d² * L
        // 24 pairwise overlaps at vertices (3 per vertex): 24 * d³/3
        // 8 triple overlaps at vertices: 8 * d³/4
        // Removed = 6*d²*L - 8*d³ + 2*d³ = 6*d²*(L - d)
        // Expected = L³ - 6*d²*(L - d)
        let l = 10.0;
        let expected_vol = l * l * l - 6.0 * d * d * (l - d);

        let vol = compute_mesh_volume(&mesh);
        assert!(
            (vol - expected_vol).abs() < 5.0,
            "chamfered cube volume: expected ~{:.1}, got {:.1}",
            expected_vol,
            vol
        );
    }

    #[test]
    fn test_fillet_cube_topology() {
        let cube = make_cube(10.0, 10.0, 10.0);
        let filleted = fillet_all_edges(&cube, 1.0);

        // Same topology as chamfer: 26 faces
        let n_faces = filleted.topology.faces.len();
        assert_eq!(
            n_faces, 26,
            "filleted cube should have 26 faces, got {}",
            n_faces
        );
    }

    #[test]
    fn test_fillet_cube_has_cylindrical_surfaces() {
        let cube = make_cube(10.0, 10.0, 10.0);
        let filleted = fillet_all_edges(&cube, 1.0);

        // Should have 12 cylindrical surfaces (one per edge)
        let n_cyl = filleted
            .geometry
            .surfaces
            .iter()
            .filter(|s| s.surface_type() == vcad_kernel_geom::SurfaceKind::Cylinder)
            .count();
        assert_eq!(
            n_cyl, 12,
            "filleted cube should have 12 cylindrical surfaces, got {}",
            n_cyl
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
