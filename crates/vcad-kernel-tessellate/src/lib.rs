#![warn(missing_docs)]

//! B-rep to triangle mesh tessellation for the vcad kernel.
//!
//! Converts B-rep faces into triangle meshes by:
//! 1. Sampling face boundaries in parameter space
//! 2. Generating interior sample points
//! 3. Triangulating via ear-clipping
//! 4. Mapping back to 3D via surface evaluation

use std::f64::consts::PI;
use vcad_kernel_geom::{GeometryStore, SurfaceKind};
use vcad_kernel_math::{Point2, Point3};
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::{FaceId, Orientation, Topology};

/// Output triangle mesh matching manifold-rs `Mesh` interface.
#[derive(Debug, Clone)]
pub struct TriangleMesh {
    /// Flat array of vertex positions: `[x0, y0, z0, x1, y1, z1, ...]` (f32).
    pub vertices: Vec<f32>,
    /// Flat array of triangle indices: `[i0, i1, i2, ...]` (u32).
    pub indices: Vec<u32>,
}

impl TriangleMesh {
    /// Create an empty mesh.
    pub fn new() -> Self {
        Self {
            vertices: Vec::new(),
            indices: Vec::new(),
        }
    }

    /// Number of triangles.
    pub fn num_triangles(&self) -> usize {
        self.indices.len() / 3
    }

    /// Number of vertices.
    pub fn num_vertices(&self) -> usize {
        self.vertices.len() / 3
    }

    /// Merge another mesh into this one.
    pub fn merge(&mut self, other: &TriangleMesh) {
        let offset = self.num_vertices() as u32;
        self.vertices.extend_from_slice(&other.vertices);
        self.indices
            .extend(other.indices.iter().map(|&i| i + offset));
    }
}

impl Default for TriangleMesh {
    fn default() -> Self {
        Self::new()
    }
}

/// Tessellation parameters controlling mesh quality.
#[derive(Debug, Clone, Copy)]
pub struct TessellationParams {
    /// Number of segments for circular features.
    pub circle_segments: u32,
    /// Number of segments along the height of cylindrical/conical features.
    pub height_segments: u32,
    /// Number of latitude bands for spherical features.
    pub latitude_segments: u32,
}

impl Default for TessellationParams {
    fn default() -> Self {
        Self {
            circle_segments: 32,
            height_segments: 1,
            latitude_segments: 16,
        }
    }
}

impl TessellationParams {
    /// Create params from a segment count hint (used for circular features).
    pub fn from_segments(segments: u32) -> Self {
        Self {
            circle_segments: segments.max(3),
            height_segments: 1,
            latitude_segments: (segments / 2).max(4),
        }
    }
}

/// Tessellate an entire B-rep solid into a triangle mesh.
pub fn tessellate_solid(brep: &BRepSolid, params: &TessellationParams) -> TriangleMesh {
    let mut mesh = TriangleMesh::new();
    let solid = &brep.topology.solids[brep.solid_id];
    let shell = &brep.topology.shells[solid.outer_shell];

    for &face_id in &shell.faces {
        let face_mesh = tessellate_face(&brep.topology, &brep.geometry, face_id, params);
        mesh.merge(&face_mesh);
    }

    mesh
}

/// Tessellate a single B-rep face.
fn tessellate_face(
    topo: &Topology,
    geom: &GeometryStore,
    face_id: FaceId,
    params: &TessellationParams,
) -> TriangleMesh {
    let face = &topo.faces[face_id];
    let surface = &geom.surfaces[face.surface_index];
    let reversed = face.orientation == Orientation::Reversed;

    match surface.surface_type() {
        SurfaceKind::Plane => tessellate_planar_face(topo, face_id, reversed),
        SurfaceKind::Cylinder => tessellate_cylindrical_face(topo, geom, face_id, params, reversed),
        SurfaceKind::Sphere => tessellate_spherical_face(geom, face_id, params, reversed),
        SurfaceKind::Cone => tessellate_conical_face(topo, geom, face_id, params, reversed),
    }
}

/// Tessellate a planar face by triangulating its boundary polygon.
/// Handles faces with inner loops (holes) using constrained triangulation.
fn tessellate_planar_face(topo: &Topology, face_id: FaceId, reversed: bool) -> TriangleMesh {
    let face = &topo.faces[face_id];
    let outer_verts: Vec<_> = topo
        .loop_half_edges(face.outer_loop)
        .map(|he| topo.vertices[topo.half_edges[he].origin].point)
        .collect();

    if outer_verts.len() < 3 {
        return TriangleMesh::new();
    }

    // Check if face has inner loops (holes)
    if !face.inner_loops.is_empty() {
        return tessellate_planar_face_with_holes(topo, face_id, reversed);
    }

    let mut mesh = TriangleMesh::new();

    // Add all vertices
    for v in &outer_verts {
        mesh.vertices.push(v.x as f32);
        mesh.vertices.push(v.y as f32);
        mesh.vertices.push(v.z as f32);
    }

    // Fan triangulation (valid for convex polygons — all our planar primitives are convex)
    for i in 1..(outer_verts.len() - 1) {
        if reversed {
            mesh.indices.push(0);
            mesh.indices.push((i + 1) as u32);
            mesh.indices.push(i as u32);
        } else {
            mesh.indices.push(0);
            mesh.indices.push(i as u32);
            mesh.indices.push((i + 1) as u32);
        }
    }

    mesh
}

/// Tessellate a planar face with inner loops (holes).
/// Uses a simple bridge-based approach: connects outer boundary to inner loops.
fn tessellate_planar_face_with_holes(topo: &Topology, face_id: FaceId, reversed: bool) -> TriangleMesh {
    let face = &topo.faces[face_id];

    // Get outer loop vertices
    let outer_verts: Vec<Point3> = topo
        .loop_half_edges(face.outer_loop)
        .map(|he| topo.vertices[topo.half_edges[he].origin].point)
        .collect();

    if outer_verts.len() < 3 {
        return TriangleMesh::new();
    }

    // Get all inner loop vertices
    let mut inner_loops: Vec<Vec<Point3>> = Vec::new();
    for &inner_loop in &face.inner_loops {
        let inner_verts: Vec<Point3> = topo
            .loop_half_edges(inner_loop)
            .map(|he| topo.vertices[topo.half_edges[he].origin].point)
            .collect();
        if inner_verts.len() >= 3 {
            inner_loops.push(inner_verts);
        }
    }

    if inner_loops.is_empty() {
        // No valid inner loops, fall back to simple triangulation
        return tessellate_simple_polygon(&outer_verts, reversed);
    }

    // Build a 2D projection for triangulation
    // Compute the face plane from first 3 vertices
    let e1 = outer_verts[1] - outer_verts[0];
    let e2 = outer_verts[2] - outer_verts[0];
    let normal = e1.cross(&e2);
    if normal.norm() < 1e-12 {
        return TriangleMesh::new();
    }

    let u_axis = e1.normalize();
    let v_axis = normal.cross(&e1).normalize();
    let origin = outer_verts[0];

    // Project 3D points to 2D
    let project = |p: &Point3| -> (f64, f64) {
        let d = *p - origin;
        (d.dot(&u_axis), d.dot(&v_axis))
    };

    // Project outer loop
    let outer_2d: Vec<(f64, f64)> = outer_verts.iter().map(&project).collect();

    // Project inner loops
    let inner_2d: Vec<Vec<(f64, f64)>> = inner_loops
        .iter()
        .map(|loop_verts| loop_verts.iter().map(&project).collect())
        .collect();

    // Use ear-clipping with hole bridging
    triangulate_polygon_with_holes(&outer_2d, &inner_2d, &outer_verts, &inner_loops, reversed)
}

/// Triangulate a polygon with holes using ear-clipping with bridge construction.
fn triangulate_polygon_with_holes(
    outer_2d: &[(f64, f64)],
    inner_2d: &[Vec<(f64, f64)>],
    outer_3d: &[Point3],
    inner_3d: &[Vec<Point3>],
    reversed: bool,
) -> TriangleMesh {
    let mut mesh = TriangleMesh::new();

    // Collect all vertices
    let mut all_verts_3d: Vec<Point3> = outer_3d.to_vec();
    let mut all_verts_2d: Vec<(f64, f64)> = outer_2d.to_vec();

    // Track where each inner loop starts
    let mut inner_starts: Vec<usize> = Vec::new();
    for (inner_loop_3d, inner_loop_2d) in inner_3d.iter().zip(inner_2d.iter()) {
        inner_starts.push(all_verts_3d.len());
        all_verts_3d.extend_from_slice(inner_loop_3d);
        all_verts_2d.extend_from_slice(inner_loop_2d);
    }

    // Add all vertices to mesh
    for v in &all_verts_3d {
        mesh.vertices.push(v.x as f32);
        mesh.vertices.push(v.y as f32);
        mesh.vertices.push(v.z as f32);
    }

    // Build a merged polygon by bridging outer to each inner loop
    let mut poly_indices: Vec<usize> = (0..outer_2d.len()).collect();

    // Track which vertices have been used as bridge endpoints
    let mut used_bridge_vertices: std::collections::HashSet<usize> = std::collections::HashSet::new();

    for (hole_idx, inner_start) in inner_starts.iter().enumerate() {
        let inner_len = inner_2d[hole_idx].len();

        // Find the pair of (outer vertex, inner vertex) with minimum distance
        // Avoid vertices already used as bridge endpoints
        let mut candidates: Vec<(f64, usize, usize)> = Vec::new(); // (dist, inner_idx, outer_poly_idx)

        for i in 0..inner_len {
            let inner_pt = all_verts_2d[inner_start + i];
            for (j, &outer_idx) in poly_indices.iter().enumerate() {
                let outer_pt = all_verts_2d[outer_idx];
                let dist = (outer_pt.0 - inner_pt.0).powi(2) + (outer_pt.1 - inner_pt.1).powi(2);
                candidates.push((dist, i, j));
            }
        }

        // Sort by distance
        candidates.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

        // Find the best candidate that doesn't reuse a bridge vertex
        let mut best_inner = 0;
        let mut best_outer_idx = 0;

        for (_, inner_idx, outer_poly_idx) in &candidates {
            let outer_vertex_idx = poly_indices[*outer_poly_idx];
            // For the first hole, allow any vertex. For subsequent holes,
            // prefer vertices that haven't been used, but fall back if needed.
            if !used_bridge_vertices.contains(&outer_vertex_idx) || hole_idx == 0 {
                best_inner = *inner_idx;
                best_outer_idx = *outer_poly_idx;
                used_bridge_vertices.insert(outer_vertex_idx);
                break;
            }
        }

        // If all vertices are used (shouldn't happen with reasonable input), use closest anyway
        if candidates.is_empty() {
            continue;
        }

        let rightmost_inner = best_inner;

        // Insert bridge: outer -> hole -> back to outer
        let inner_global_start = *inner_start;
        let hole_indices: Vec<usize> = (0..inner_len)
            .map(|i| inner_global_start + ((rightmost_inner + i) % inner_len))
            .collect();

        // Insert after best_outer_idx:
        // poly[0..=best_outer_idx] + hole_indices + [hole_indices[0], poly[best_outer_idx]] + poly[best_outer_idx+1..]
        // Simplified: insert hole loop with bridge vertices
        let bridge_outer = poly_indices[best_outer_idx];
        let bridge_inner = hole_indices[0];

        let mut new_poly = Vec::new();
        new_poly.extend_from_slice(&poly_indices[..=best_outer_idx]);
        new_poly.extend_from_slice(&hole_indices);
        new_poly.push(bridge_inner);
        new_poly.push(bridge_outer);
        new_poly.extend_from_slice(&poly_indices[best_outer_idx + 1..]);

        poly_indices = new_poly;
    }


    // Now triangulate the merged polygon using ear clipping
    ear_clip_triangulate(&all_verts_2d, &poly_indices, &mut mesh.indices, reversed);

    mesh
}

/// Simple ear-clipping triangulation for a polygon (defined by indices into a vertex array).
fn ear_clip_triangulate(
    verts_2d: &[(f64, f64)],
    indices: &[usize],
    out_indices: &mut Vec<u32>,
    reversed: bool,
) {
    if indices.len() < 3 {
        return;
    }

    let mut remaining: Vec<usize> = indices.to_vec();

    while remaining.len() > 3 {
        let n = remaining.len();
        let mut found_ear = false;

        for i in 0..n {
            let prev = (i + n - 1) % n;
            let next = (i + 1) % n;

            let a = verts_2d[remaining[prev]];
            let b = verts_2d[remaining[i]];
            let c = verts_2d[remaining[next]];

            // Check if this is a convex vertex (ear candidate)
            let cross = (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0);
            let is_convex = if reversed { cross < 0.0 } else { cross > 0.0 };

            if !is_convex {
                continue;
            }

            // Check if any other vertex is inside this triangle
            let mut is_ear = true;
            for j in 0..n {
                if j == prev || j == i || j == next {
                    continue;
                }
                let p = verts_2d[remaining[j]];
                if point_in_triangle_2d(p, a, b, c) {
                    is_ear = false;
                    break;
                }
            }

            if is_ear {
                // Add triangle
                if reversed {
                    out_indices.push(remaining[prev] as u32);
                    out_indices.push(remaining[next] as u32);
                    out_indices.push(remaining[i] as u32);
                } else {
                    out_indices.push(remaining[prev] as u32);
                    out_indices.push(remaining[i] as u32);
                    out_indices.push(remaining[next] as u32);
                }
                remaining.remove(i);
                found_ear = true;
                break;
            }
        }

        if !found_ear {
            // Degenerate case - just triangulate remaining as fan
            break;
        }
    }

    // Final triangle
    if remaining.len() == 3 {
        if reversed {
            out_indices.push(remaining[0] as u32);
            out_indices.push(remaining[2] as u32);
            out_indices.push(remaining[1] as u32);
        } else {
            out_indices.push(remaining[0] as u32);
            out_indices.push(remaining[1] as u32);
            out_indices.push(remaining[2] as u32);
        }
    }
}

/// Check if a point is inside a triangle in 2D using barycentric coordinates.
fn point_in_triangle_2d(p: (f64, f64), a: (f64, f64), b: (f64, f64), c: (f64, f64)) -> bool {
    let v0 = (c.0 - a.0, c.1 - a.1);
    let v1 = (b.0 - a.0, b.1 - a.1);
    let v2 = (p.0 - a.0, p.1 - a.1);

    let dot00 = v0.0 * v0.0 + v0.1 * v0.1;
    let dot01 = v0.0 * v1.0 + v0.1 * v1.1;
    let dot02 = v0.0 * v2.0 + v0.1 * v2.1;
    let dot11 = v1.0 * v1.0 + v1.1 * v1.1;
    let dot12 = v1.0 * v2.0 + v1.1 * v2.1;

    let inv_denom = 1.0 / (dot00 * dot11 - dot01 * dot01);
    let u = (dot11 * dot02 - dot01 * dot12) * inv_denom;
    let v = (dot00 * dot12 - dot01 * dot02) * inv_denom;

    // Use small epsilon to avoid boundary issues
    let eps = 1e-10;
    u > eps && v > eps && (u + v) < 1.0 - eps
}

/// Simple fan triangulation for a convex polygon.
fn tessellate_simple_polygon(verts: &[Point3], reversed: bool) -> TriangleMesh {
    let mut mesh = TriangleMesh::new();

    for v in verts {
        mesh.vertices.push(v.x as f32);
        mesh.vertices.push(v.y as f32);
        mesh.vertices.push(v.z as f32);
    }

    for i in 1..(verts.len() - 1) {
        if reversed {
            mesh.indices.push(0);
            mesh.indices.push((i + 1) as u32);
            mesh.indices.push(i as u32);
        } else {
            mesh.indices.push(0);
            mesh.indices.push(i as u32);
            mesh.indices.push((i + 1) as u32);
        }
    }

    mesh
}

/// Tessellate a cylindrical face (lateral surface of a cylinder).
fn tessellate_cylindrical_face(
    topo: &Topology,
    geom: &GeometryStore,
    face_id: FaceId,
    params: &TessellationParams,
    reversed: bool,
) -> TriangleMesh {
    let face = &topo.faces[face_id];
    let surface = &geom.surfaces[face.surface_index];
    let n_circ = params.circle_segments as usize;
    let n_height = params.height_segments as usize;

    // Determine the v (height) parameter range by projecting seam vertices
    // onto the cylinder axis. This works correctly after any transform.
    let verts: Vec<_> = topo
        .loop_half_edges(face.outer_loop)
        .map(|he| topo.vertices[topo.half_edges[he].origin].point)
        .collect();

    let (v_min, v_max) = if let Some(cyl) = surface
        .as_any()
        .downcast_ref::<vcad_kernel_geom::CylinderSurface>()
    {
        // Project vertices onto axis to get v parameter
        let mut vmin = f64::MAX;
        let mut vmax = f64::MIN;
        for pt in &verts {
            let d = pt - cyl.center;
            let v = d.dot(cyl.axis.as_ref());
            vmin = vmin.min(v);
            vmax = vmax.max(v);
        }
        (vmin, vmax)
    } else {
        // Fallback: use z coordinates
        let z_min = verts.iter().map(|v| v.z).fold(f64::MAX, f64::min);
        let z_max = verts.iter().map(|v| v.z).fold(f64::MIN, f64::max);
        (z_min, z_max)
    };

    let height = v_max - v_min;
    let mut mesh = TriangleMesh::new();

    // Generate grid of vertices using surface.evaluate
    for j in 0..=n_height {
        let v = v_min + height * (j as f64 / n_height as f64);
        for i in 0..=n_circ {
            let u = 2.0 * PI * (i as f64 / n_circ as f64);
            let pt = surface.evaluate(Point2::new(u, v));
            mesh.vertices.push(pt.x as f32);
            mesh.vertices.push(pt.y as f32);
            mesh.vertices.push(pt.z as f32);
        }
    }

    // Generate triangles
    let stride = (n_circ + 1) as u32;
    for j in 0..n_height {
        for i in 0..n_circ {
            let bl = j as u32 * stride + i as u32;
            let br = bl + 1;
            let tl = bl + stride;
            let tr = tl + 1;

            if reversed {
                mesh.indices.extend_from_slice(&[bl, tl, br]);
                mesh.indices.extend_from_slice(&[br, tl, tr]);
            } else {
                mesh.indices.extend_from_slice(&[bl, br, tl]);
                mesh.indices.extend_from_slice(&[br, tr, tl]);
            }
        }
    }

    mesh
}

/// Tessellate a spherical face.
/// Uses a single vertex at each pole to avoid normal computation artifacts.
fn tessellate_spherical_face(
    geom: &GeometryStore,
    face_id: FaceId,
    params: &TessellationParams,
    reversed: bool,
) -> TriangleMesh {
    let _ = face_id; // We use the sphere surface directly
    let surface = &geom.surfaces[0]; // Sphere is always surface 0
    let n_lon = params.circle_segments as usize;
    let n_lat = params.latitude_segments as usize;

    let mut mesh = TriangleMesh::new();

    // South pole - single vertex (index 0)
    let south = surface.evaluate(Point2::new(0.0, -PI / 2.0));
    mesh.vertices.push(south.x as f32);
    mesh.vertices.push(south.y as f32);
    mesh.vertices.push(south.z as f32);

    // Middle latitude bands (j = 1 to n_lat - 1)
    for j in 1..n_lat {
        let v = -PI / 2.0 + PI * (j as f64 / n_lat as f64);
        for i in 0..=n_lon {
            let u = 2.0 * PI * (i as f64 / n_lon as f64);
            let pt = surface.evaluate(Point2::new(u, v));
            mesh.vertices.push(pt.x as f32);
            mesh.vertices.push(pt.y as f32);
            mesh.vertices.push(pt.z as f32);
        }
    }

    // North pole - single vertex (last index)
    let north = surface.evaluate(Point2::new(0.0, PI / 2.0));
    mesh.vertices.push(north.x as f32);
    mesh.vertices.push(north.y as f32);
    mesh.vertices.push(north.z as f32);

    let south_idx = 0u32;
    let north_idx = mesh.num_vertices() as u32 - 1;
    let stride = (n_lon + 1) as u32;

    // South pole triangles (fan from south pole to first latitude band)
    let first_band_start = 1u32;
    for i in 0..n_lon {
        let v1 = first_band_start + i as u32;
        let v2 = first_band_start + (i + 1) as u32;
        if reversed {
            mesh.indices.extend_from_slice(&[south_idx, v1, v2]);
        } else {
            mesh.indices.extend_from_slice(&[south_idx, v2, v1]);
        }
    }

    // Middle bands (quads between latitude bands)
    for j in 0..(n_lat - 2) {
        let band_start = 1 + j as u32 * stride;
        let next_band_start = band_start + stride;
        for i in 0..n_lon {
            let bl = band_start + i as u32;
            let br = band_start + (i + 1) as u32;
            let tl = next_band_start + i as u32;
            let tr = next_band_start + (i + 1) as u32;

            if reversed {
                mesh.indices.extend_from_slice(&[bl, tl, br]);
                mesh.indices.extend_from_slice(&[br, tl, tr]);
            } else {
                mesh.indices.extend_from_slice(&[bl, br, tl]);
                mesh.indices.extend_from_slice(&[br, tr, tl]);
            }
        }
    }

    // North pole triangles (fan from last latitude band to north pole)
    let last_band_start = 1 + (n_lat - 2) as u32 * stride;
    for i in 0..n_lon {
        let v1 = last_band_start + i as u32;
        let v2 = last_band_start + (i + 1) as u32;
        if reversed {
            mesh.indices.extend_from_slice(&[north_idx, v2, v1]);
        } else {
            mesh.indices.extend_from_slice(&[north_idx, v1, v2]);
        }
    }

    mesh
}

/// Tessellate a conical face (lateral surface of a cone/frustum).
fn tessellate_conical_face(
    topo: &Topology,
    geom: &GeometryStore,
    face_id: FaceId,
    params: &TessellationParams,
    reversed: bool,
) -> TriangleMesh {
    let face = &topo.faces[face_id];
    let surface = &geom.surfaces[face.surface_index];
    let n_circ = params.circle_segments as usize;
    let n_height = params.height_segments as usize;

    // Get seam vertices to determine the cone extent
    let verts: Vec<_> = topo
        .loop_half_edges(face.outer_loop)
        .map(|he| topo.vertices[topo.half_edges[he].origin].point)
        .collect();

    // Extract cone geometry for axis-aware parameterization
    let (axis, apex, ref_dir, half_angle) = if let Some(cone) = surface
        .as_any()
        .downcast_ref::<vcad_kernel_geom::ConeSurface>(
    ) {
        (
            *cone.axis.as_ref(),
            cone.apex,
            *cone.ref_dir.as_ref(),
            cone.half_angle,
        )
    } else {
        // Fallback: assume Z-axis cone at origin
        let z_min = verts.iter().map(|v| v.z).fold(f64::MAX, f64::min);
        let z_max = verts.iter().map(|v| v.z).fold(f64::MIN, f64::max);
        let r_min = verts
            .iter()
            .filter(|v| (v.z - z_min).abs() < 1e-6)
            .map(|v| (v.x * v.x + v.y * v.y).sqrt())
            .next()
            .unwrap_or(0.0);
        return tessellate_cone_direct(&verts, z_min, z_max, r_min, n_circ, n_height, reversed);
    };

    // Project vertices onto axis to get v parameter range (distance from apex)
    let mut v_min = f64::MAX;
    let mut v_max = f64::MIN;
    for pt in &verts {
        let d = pt - apex;
        let v = d.dot(&axis) / half_angle.cos();
        v_min = v_min.min(v);
        v_max = v_max.max(v);
    }

    // Generate mesh using surface.evaluate()
    let y_dir = axis.cross(&ref_dir);
    let mut mesh = TriangleMesh::new();
    let mut rows: Vec<Vec<u32>> = Vec::new();

    for j in 0..=n_height {
        let t = j as f64 / n_height as f64;
        let v = v_min + (v_max - v_min) * t;
        let r = v * half_angle.sin();

        let mut row = Vec::new();

        if r.abs() < 1e-12 {
            // Apex point
            let pt = apex + v * half_angle.cos() * axis;
            let idx = mesh.num_vertices() as u32;
            mesh.vertices.push(pt.x as f32);
            mesh.vertices.push(pt.y as f32);
            mesh.vertices.push(pt.z as f32);
            row.push(idx);
        } else {
            let center = apex + v * half_angle.cos() * axis;
            for i in 0..=n_circ {
                let u = 2.0 * PI * (i as f64 / n_circ as f64);
                let pt = center + r * (u.cos() * ref_dir + u.sin() * y_dir);
                let idx = mesh.num_vertices() as u32;
                mesh.vertices.push(pt.x as f32);
                mesh.vertices.push(pt.y as f32);
                mesh.vertices.push(pt.z as f32);
                row.push(idx);
            }
        }

        rows.push(row);
    }

    // Generate triangles between adjacent rows
    for j in 0..n_height {
        let bot = &rows[j];
        let top = &rows[j + 1];

        if bot.len() == 1 {
            let apex_idx = bot[0];
            for i in 0..(top.len() - 1) {
                if reversed {
                    mesh.indices
                        .extend_from_slice(&[apex_idx, top[i + 1], top[i]]);
                } else {
                    mesh.indices
                        .extend_from_slice(&[apex_idx, top[i], top[i + 1]]);
                }
            }
        } else if top.len() == 1 {
            let apex_idx = top[0];
            for i in 0..(bot.len() - 1) {
                if reversed {
                    mesh.indices
                        .extend_from_slice(&[bot[i], apex_idx, bot[i + 1]]);
                } else {
                    mesh.indices
                        .extend_from_slice(&[bot[i], bot[i + 1], apex_idx]);
                }
            }
        } else {
            for i in 0..n_circ {
                let bl = bot[i];
                let br = bot[i + 1];
                let tl = top[i];
                let tr = top[i + 1];
                if reversed {
                    mesh.indices.extend_from_slice(&[bl, tl, br]);
                    mesh.indices.extend_from_slice(&[br, tl, tr]);
                } else {
                    mesh.indices.extend_from_slice(&[bl, br, tl]);
                    mesh.indices.extend_from_slice(&[br, tr, tl]);
                }
            }
        }
    }

    mesh
}

/// Fallback cone tessellation using direct z-axis coordinates.
fn tessellate_cone_direct(
    verts: &[Point3],
    z_min: f64,
    z_max: f64,
    r_at_zmin: f64,
    n_circ: usize,
    n_height: usize,
    reversed: bool,
) -> TriangleMesh {
    let r_at_zmax = verts
        .iter()
        .filter(|v| (v.z - z_max).abs() < 1e-6)
        .map(|v| (v.x * v.x + v.y * v.y).sqrt())
        .next()
        .unwrap_or(0.0);

    let mut mesh = TriangleMesh::new();
    let mut rows: Vec<Vec<u32>> = Vec::new();

    for j in 0..=n_height {
        let t = j as f64 / n_height as f64;
        let z = z_min + (z_max - z_min) * t;
        let r = r_at_zmin + (r_at_zmax - r_at_zmin) * t;

        let mut row = Vec::new();
        if r < 1e-12 {
            let idx = mesh.num_vertices() as u32;
            mesh.vertices.extend_from_slice(&[0.0f32, 0.0f32, z as f32]);
            row.push(idx);
        } else {
            for i in 0..=n_circ {
                let u = 2.0 * PI * (i as f64 / n_circ as f64);
                let idx = mesh.num_vertices() as u32;
                mesh.vertices.extend_from_slice(&[
                    (r * u.cos()) as f32,
                    (r * u.sin()) as f32,
                    z as f32,
                ]);
                row.push(idx);
            }
        }
        rows.push(row);
    }

    for j in 0..n_height {
        let bot = &rows[j];
        let top = &rows[j + 1];
        if bot.len() == 1 {
            let a = bot[0];
            for i in 0..(top.len() - 1) {
                if reversed {
                    mesh.indices.extend_from_slice(&[a, top[i + 1], top[i]]);
                } else {
                    mesh.indices.extend_from_slice(&[a, top[i], top[i + 1]]);
                }
            }
        } else if top.len() == 1 {
            let a = top[0];
            for i in 0..(bot.len() - 1) {
                if reversed {
                    mesh.indices.extend_from_slice(&[bot[i], a, bot[i + 1]]);
                } else {
                    mesh.indices.extend_from_slice(&[bot[i], bot[i + 1], a]);
                }
            }
        } else {
            for i in 0..n_circ {
                let bl = bot[i];
                let br = bot[i + 1];
                let tl = top[i];
                let tr = top[i + 1];
                if reversed {
                    mesh.indices.extend_from_slice(&[bl, tl, br]);
                    mesh.indices.extend_from_slice(&[br, tl, tr]);
                } else {
                    mesh.indices.extend_from_slice(&[bl, br, tl]);
                    mesh.indices.extend_from_slice(&[br, tr, tl]);
                }
            }
        }
    }

    mesh
}

/// Tessellate a planar disk with arbitrary orientation.
/// `x_dir` and `y_dir` define the disk plane.
fn tessellate_disk_general(
    center: Point3,
    radius: f64,
    x_dir: vcad_kernel_math::Vec3,
    y_dir: vcad_kernel_math::Vec3,
    segments: u32,
    flip: bool,
) -> TriangleMesh {
    let mut mesh = TriangleMesh::new();
    let n = segments as usize;

    // Center vertex
    mesh.vertices.push(center.x as f32);
    mesh.vertices.push(center.y as f32);
    mesh.vertices.push(center.z as f32);

    // Rim vertices
    for i in 0..=n {
        let u = 2.0 * PI * (i as f64 / n as f64);
        let pt = center + radius * (u.cos() * x_dir + u.sin() * y_dir);
        mesh.vertices.push(pt.x as f32);
        mesh.vertices.push(pt.y as f32);
        mesh.vertices.push(pt.z as f32);
    }

    // Fan triangles
    for i in 0..n {
        let v0 = 0u32;
        let v1 = (i + 1) as u32;
        let v2 = (i + 2) as u32;
        if flip {
            mesh.indices.extend_from_slice(&[v0, v2, v1]);
        } else {
            mesh.indices.extend_from_slice(&[v0, v1, v2]);
        }
    }

    mesh
}

/// Tessellate a planar disk (cap face) with a circular boundary.
/// Used for cylinder and cone caps.
pub fn tessellate_disk(
    center: Point3,
    radius: f64,
    z: f64,
    segments: u32,
    flip: bool,
) -> TriangleMesh {
    let mut mesh = TriangleMesh::new();
    let n = segments as usize;

    // Center vertex
    mesh.vertices.push(center.x as f32);
    mesh.vertices.push(center.y as f32);
    mesh.vertices.push(z as f32);

    // Rim vertices
    for i in 0..=n {
        let u = 2.0 * PI * (i as f64 / n as f64);
        mesh.vertices.push((radius * u.cos()) as f32);
        mesh.vertices.push((radius * u.sin()) as f32);
        mesh.vertices.push(z as f32);
    }

    // Fan triangles
    for i in 0..n {
        let v0 = 0u32; // center
        let v1 = (i + 1) as u32;
        let v2 = (i + 2) as u32;
        if flip {
            mesh.indices.extend_from_slice(&[v0, v2, v1]);
        } else {
            mesh.indices.extend_from_slice(&[v0, v1, v2]);
        }
    }

    mesh
}

/// Full tessellation of a B-rep solid, using `segments` as a quality hint.
///
/// This is the main entry point for converting a B-rep to a triangle mesh.
/// The output format matches manifold-rs `Mesh` exactly:
/// - `vertices`: flat `Vec<f32>` of `[x, y, z, x, y, z, ...]`
/// - `indices`: flat `Vec<u32>` of triangle vertex indices
pub fn tessellate(brep: &BRepSolid, segments: u32) -> TriangleMesh {
    let params = TessellationParams::from_segments(segments);
    let solid = &brep.topology.solids[brep.solid_id];
    let shell = &brep.topology.shells[solid.outer_shell];

    let mut mesh = TriangleMesh::new();

    for &face_id in &shell.faces {
        let face = &brep.topology.faces[face_id];
        let surface = &brep.geometry.surfaces[face.surface_index];
        let reversed = face.orientation == Orientation::Reversed;

        match surface.surface_type() {
            SurfaceKind::Plane => {
                let face_mesh = tessellate_planar_face(&brep.topology, face_id, reversed);
                mesh.merge(&face_mesh);
            }
            SurfaceKind::Cylinder => {
                let face_mesh = tessellate_cylindrical_face(
                    &brep.topology,
                    &brep.geometry,
                    face_id,
                    &params,
                    reversed,
                );
                mesh.merge(&face_mesh);

                // Also tessellate the caps
                // (Caps are separate faces and will be handled as planar faces
                //  if they have enough vertices. But our cylinder caps only have
                //  1 vertex in the loop, so we generate disks directly.)
            }
            SurfaceKind::Sphere => {
                let face_mesh =
                    tessellate_spherical_face(&brep.geometry, face_id, &params, reversed);
                mesh.merge(&face_mesh);
            }
            SurfaceKind::Cone => {
                let face_mesh = tessellate_conical_face(
                    &brep.topology,
                    &brep.geometry,
                    face_id,
                    &params,
                    reversed,
                );
                mesh.merge(&face_mesh);
            }
        }
    }

    mesh
}

/// Tessellate a B-rep solid with special handling for cap faces that
/// have degenerate (single-vertex) loops.
///
/// This is the primary tessellation function used by the facade crate.
pub fn tessellate_brep(brep: &BRepSolid, segments: u32) -> TriangleMesh {
    let params = TessellationParams::from_segments(segments);
    let solid = &brep.topology.solids[brep.solid_id];
    let shell = &brep.topology.shells[solid.outer_shell];

    let mut mesh = TriangleMesh::new();

    for &face_id in &shell.faces {
        let face = &brep.topology.faces[face_id];
        let surface = &brep.geometry.surfaces[face.surface_index];
        let reversed = face.orientation == Orientation::Reversed;
        let loop_len = brep.topology.loop_len(face.outer_loop);

        match surface.surface_type() {
            SurfaceKind::Plane => {
                if loop_len <= 1 {
                    // Cap face with a single vertex — this is a circular disk.
                    // Use the plane surface's origin as center and compute
                    // the radius from the vertex's distance to the center.
                    let verts: Vec<_> = brep
                        .topology
                        .loop_half_edges(face.outer_loop)
                        .map(|he| brep.topology.vertices[brep.topology.half_edges[he].origin].point)
                        .collect();
                    if let Some(&v) = verts.first() {
                        let plane = &brep.geometry.surfaces[face.surface_index];
                        let center = plane.evaluate(Point2::origin());
                        let r = (v - center).norm();
                        let x_dir = if r > 1e-12 {
                            (v - center).normalize()
                        } else {
                            plane.d_du(Point2::origin()).normalize()
                        };
                        let normal = plane.normal(Point2::origin());
                        let y_dir = normal.as_ref().cross(&x_dir);
                        let disk = tessellate_disk_general(
                            center,
                            r,
                            x_dir,
                            y_dir,
                            params.circle_segments,
                            reversed,
                        );
                        mesh.merge(&disk);
                    }
                } else {
                    let face_mesh = tessellate_planar_face(&brep.topology, face_id, reversed);
                    mesh.merge(&face_mesh);
                }
            }
            SurfaceKind::Cylinder => {
                let face_mesh = tessellate_cylindrical_face(
                    &brep.topology,
                    &brep.geometry,
                    face_id,
                    &params,
                    reversed,
                );
                mesh.merge(&face_mesh);
            }
            SurfaceKind::Sphere => {
                let face_mesh =
                    tessellate_spherical_face(&brep.geometry, face_id, &params, reversed);
                mesh.merge(&face_mesh);
            }
            SurfaceKind::Cone => {
                let face_mesh = tessellate_conical_face(
                    &brep.topology,
                    &brep.geometry,
                    face_id,
                    &params,
                    reversed,
                );
                mesh.merge(&face_mesh);
            }
        }
    }

    mesh
}

#[cfg(test)]
mod tests {
    use super::*;
    use vcad_kernel_primitives::{make_cone, make_cube, make_cylinder, make_sphere};

    #[test]
    fn test_tessellate_cube() {
        let brep = make_cube(10.0, 10.0, 10.0);
        let mesh = tessellate_brep(&brep, 32);
        // A cube should have at least 12 triangles (2 per face × 6 faces)
        assert!(
            mesh.num_triangles() >= 12,
            "expected >= 12 triangles, got {}",
            mesh.num_triangles()
        );
        assert!(mesh.num_vertices() > 0);
    }

    #[test]
    fn test_tessellate_cylinder() {
        let brep = make_cylinder(5.0, 10.0, 32);
        let mesh = tessellate_brep(&brep, 32);
        // Cylinder: lateral (32 quads = 64 tris) + 2 caps (32 tris each) = ~128
        assert!(
            mesh.num_triangles() >= 64,
            "expected >= 64 triangles, got {}",
            mesh.num_triangles()
        );
    }

    #[test]
    fn test_tessellate_sphere() {
        let brep = make_sphere(10.0, 32);
        let mesh = tessellate_brep(&brep, 32);
        assert!(
            mesh.num_triangles() >= 100,
            "expected >= 100 triangles, got {}",
            mesh.num_triangles()
        );
    }

    #[test]
    fn test_tessellate_cone() {
        let brep = make_cone(5.0, 0.0, 10.0, 32);
        let mesh = tessellate_brep(&brep, 32);
        assert!(
            mesh.num_triangles() >= 32,
            "expected >= 32 triangles, got {}",
            mesh.num_triangles()
        );
    }

    #[test]
    fn test_cube_volume_from_mesh() {
        let brep = make_cube(10.0, 10.0, 10.0);
        let mesh = tessellate_brep(&brep, 32);
        let vol = compute_mesh_volume(&mesh);
        assert!((vol - 1000.0).abs() < 1.0, "expected ~1000, got {vol}");
    }

    #[test]
    fn test_cube_surface_area_from_mesh() {
        let brep = make_cube(10.0, 10.0, 10.0);
        let mesh = tessellate_brep(&brep, 32);
        let area = compute_mesh_surface_area(&mesh);
        assert!((area - 600.0).abs() < 1.0, "expected ~600, got {area}");
    }

    #[test]
    fn test_cylinder_volume_from_mesh() {
        let brep = make_cylinder(5.0, 10.0, 64);
        let mesh = tessellate_brep(&brep, 64);
        let expected = PI * 25.0 * 10.0; // π r² h
        let vol = compute_mesh_volume(&mesh);
        assert!(
            (vol - expected).abs() < expected * 0.05,
            "expected ~{expected}, got {vol}"
        );
    }

    #[test]
    fn test_sphere_volume_from_mesh() {
        let brep = make_sphere(10.0, 64);
        let mesh = tessellate_brep(&brep, 64);
        let expected = (4.0 / 3.0) * PI * 1000.0; // (4/3)πr³
        let vol = compute_mesh_volume(&mesh);
        // Sphere tessellation is less accurate, allow 5% error
        assert!(
            (vol - expected).abs() < expected * 0.05,
            "expected ~{expected}, got {vol}"
        );
    }

    /// Compute signed volume of a triangle mesh using the divergence theorem.
    fn compute_mesh_volume(mesh: &TriangleMesh) -> f64 {
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

    /// Compute surface area of a triangle mesh.
    fn compute_mesh_surface_area(mesh: &TriangleMesh) -> f64 {
        let verts = &mesh.vertices;
        let indices = &mesh.indices;
        let mut area = 0.0;
        for tri in indices.chunks(3) {
            let (i0, i1, i2) = (
                tri[0] as usize * 3,
                tri[1] as usize * 3,
                tri[2] as usize * 3,
            );
            let v0 = [verts[i0] as f64, verts[i0 + 1] as f64, verts[i0 + 2] as f64];
            let v1 = [verts[i1] as f64, verts[i1 + 1] as f64, verts[i1 + 2] as f64];
            let v2 = [verts[i2] as f64, verts[i2 + 1] as f64, verts[i2 + 2] as f64];
            let e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
            let e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
            let cross = [
                e1[1] * e2[2] - e1[2] * e2[1],
                e1[2] * e2[0] - e1[0] * e2[2],
                e1[0] * e2[1] - e1[1] * e2[0],
            ];
            area += (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]).sqrt() / 2.0;
        }
        area
    }

    #[test]
    fn test_triangulate_square_with_circular_hole() {
        // Test the triangulation of a square with a circular hole in the center
        // This is what happens when a cylinder cuts through a planar face
        use vcad_kernel_math::Point3;

        // Square: 10x10 in XY plane at Z=0 (CCW winding)
        let outer_2d: Vec<(f64, f64)> = vec![
            (0.0, 0.0),
            (10.0, 0.0),
            (10.0, 10.0),
            (0.0, 10.0),
        ];
        let outer_3d: Vec<Point3> = vec![
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(10.0, 0.0, 0.0),
            Point3::new(10.0, 10.0, 0.0),
            Point3::new(0.0, 10.0, 0.0),
        ];

        // Circular hole: radius 2, center at (5, 5), 8 segments
        // CW winding (opposite to outer) - this is how B-rep stores inner loops
        let n_seg = 8usize;
        let hole_2d: Vec<(f64, f64)> = (0..n_seg)
            .rev() // CW winding: reverse the order
            .map(|i| {
                let theta = 2.0 * std::f64::consts::PI * (i as f64) / (n_seg as f64);
                (5.0 + 2.0 * theta.cos(), 5.0 + 2.0 * theta.sin())
            })
            .collect();
        let hole_3d: Vec<Point3> = hole_2d
            .iter()
            .map(|&(x, y)| Point3::new(x, y, 0.0))
            .collect();

        let inner_2d = vec![hole_2d];
        let inner_3d = vec![hole_3d];

        let mesh = triangulate_polygon_with_holes(&outer_2d, &inner_2d, &outer_3d, &inner_3d, false);

        println!("Square with hole: {} triangles, {} vertices", mesh.num_triangles(), mesh.num_vertices());

        // Should have triangles
        assert!(mesh.num_triangles() > 0, "Should produce triangles");

        // Compute mesh area - should be square area minus circle area
        let area = compute_mesh_surface_area(&mesh);
        let expected_area = 100.0 - std::f64::consts::PI * 4.0; // 100 - 4π ≈ 87.4
        println!("Mesh area: {:.2}, expected: {:.2}", area, expected_area);

        // Allow some tolerance due to polygon approximation of circle
        assert!(
            (area - expected_area).abs() < 5.0,
            "Area should be ~{:.1}, got {:.1}",
            expected_area,
            area
        );
    }
}
