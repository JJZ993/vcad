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
fn tessellate_planar_face(topo: &Topology, face_id: FaceId, reversed: bool) -> TriangleMesh {
    let face = &topo.faces[face_id];
    let verts: Vec<_> = topo
        .loop_half_edges(face.outer_loop)
        .map(|he| topo.vertices[topo.half_edges[he].origin].point)
        .collect();

    if verts.len() < 3 {
        return TriangleMesh::new();
    }

    let mut mesh = TriangleMesh::new();

    // Add all vertices
    for v in &verts {
        mesh.vertices.push(v.x as f32);
        mesh.vertices.push(v.y as f32);
        mesh.vertices.push(v.z as f32);
    }

    // Fan triangulation (valid for convex polygons — all our planar primitives are convex)
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

    // Generate vertices in a latitude/longitude grid
    for j in 0..=n_lat {
        let v = -PI / 2.0 + PI * (j as f64 / n_lat as f64);
        for i in 0..=n_lon {
            let u = 2.0 * PI * (i as f64 / n_lon as f64);
            let pt = surface.evaluate(Point2::new(u, v));
            mesh.vertices.push(pt.x as f32);
            mesh.vertices.push(pt.y as f32);
            mesh.vertices.push(pt.z as f32);
        }
    }

    // Generate triangles
    let stride = (n_lon + 1) as u32;
    for j in 0..n_lat {
        for i in 0..n_lon {
            let bl = j as u32 * stride + i as u32;
            let br = bl + 1;
            let tl = bl + stride;
            let tr = tl + 1;

            if j == 0 {
                // Bottom row: only one triangle (degenerate at south pole)
                if reversed {
                    mesh.indices.extend_from_slice(&[bl, tl, tr]);
                } else {
                    mesh.indices.extend_from_slice(&[bl, tr, tl]);
                }
            } else if j == n_lat - 1 {
                // Top row: only one triangle (degenerate at north pole)
                if reversed {
                    mesh.indices.extend_from_slice(&[bl, br, tr]);
                } else {
                    mesh.indices.extend_from_slice(&[bl, tr, br]);
                }
            } else if reversed {
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
}
