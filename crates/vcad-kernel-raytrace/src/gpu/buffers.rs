//! GPU buffer management for ray tracing data.

use bytemuck::{Pod, Zeroable};
use vcad_kernel_booleans::bbox::face_aabb;
use vcad_kernel_geom::{Surface, SurfaceKind};
use vcad_kernel_primitives::BRepSolid;
use vcad_kernel_topo::FaceId;

use crate::bvh::Bvh;
use crate::trim;

/// Maximum number of surfaces supported in a single scene.
pub const MAX_SURFACES: usize = 1024;

/// Maximum number of faces supported in a single scene.
pub const MAX_FACES: usize = 4096;

/// Maximum BVH nodes.
pub const MAX_BVH_NODES: usize = 8192;

/// Maximum trim loop vertices.
pub const MAX_TRIM_VERTS: usize = 32768;

/// GPU-compatible surface representation.
///
/// Each surface type is packed into 32 floats:
/// - Type discriminant (as f32)
/// - Surface-specific parameters
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct GpuSurface {
    /// Surface type: 0=Plane, 1=Cylinder, 2=Sphere, 3=Cone, 4=Torus, 5=Bilinear
    pub surface_type: u32,
    /// Padding for alignment
    pub _pad: [u32; 3],
    /// Surface parameters (32 floats, interpretation depends on type)
    pub params: [f32; 32],
}

impl GpuSurface {
    /// Create a GPU surface from a kernel surface.
    pub fn from_surface(surface: &dyn Surface) -> Self {
        let mut params = [0.0f32; 32];

        let surface_type = match surface.surface_type() {
            SurfaceKind::Plane => {
                if let Some(plane) = surface.as_any().downcast_ref::<vcad_kernel_geom::Plane>() {
                    // origin (3), x_dir (3), y_dir (3), normal (3)
                    params[0] = plane.origin.x as f32;
                    params[1] = plane.origin.y as f32;
                    params[2] = plane.origin.z as f32;
                    params[3] = plane.x_dir.x as f32;
                    params[4] = plane.x_dir.y as f32;
                    params[5] = plane.x_dir.z as f32;
                    params[6] = plane.y_dir.x as f32;
                    params[7] = plane.y_dir.y as f32;
                    params[8] = plane.y_dir.z as f32;
                    params[9] = plane.normal_dir.x as f32;
                    params[10] = plane.normal_dir.y as f32;
                    params[11] = plane.normal_dir.z as f32;
                }
                0
            }
            SurfaceKind::Cylinder => {
                if let Some(cyl) = surface.as_any().downcast_ref::<vcad_kernel_geom::CylinderSurface>() {
                    // center (3), axis (3), ref_dir (3), radius (1)
                    params[0] = cyl.center.x as f32;
                    params[1] = cyl.center.y as f32;
                    params[2] = cyl.center.z as f32;
                    params[3] = cyl.axis.x as f32;
                    params[4] = cyl.axis.y as f32;
                    params[5] = cyl.axis.z as f32;
                    params[6] = cyl.ref_dir.x as f32;
                    params[7] = cyl.ref_dir.y as f32;
                    params[8] = cyl.ref_dir.z as f32;
                    params[9] = cyl.radius as f32;
                }
                1
            }
            SurfaceKind::Sphere => {
                if let Some(sph) = surface.as_any().downcast_ref::<vcad_kernel_geom::SphereSurface>() {
                    // center (3), radius (1), ref_dir (3), axis (3)
                    params[0] = sph.center.x as f32;
                    params[1] = sph.center.y as f32;
                    params[2] = sph.center.z as f32;
                    params[3] = sph.radius as f32;
                    params[4] = sph.ref_dir.x as f32;
                    params[5] = sph.ref_dir.y as f32;
                    params[6] = sph.ref_dir.z as f32;
                    params[7] = sph.axis.x as f32;
                    params[8] = sph.axis.y as f32;
                    params[9] = sph.axis.z as f32;
                }
                2
            }
            SurfaceKind::Cone => {
                if let Some(cone) = surface.as_any().downcast_ref::<vcad_kernel_geom::ConeSurface>() {
                    // apex (3), axis (3), ref_dir (3), half_angle (1)
                    params[0] = cone.apex.x as f32;
                    params[1] = cone.apex.y as f32;
                    params[2] = cone.apex.z as f32;
                    params[3] = cone.axis.x as f32;
                    params[4] = cone.axis.y as f32;
                    params[5] = cone.axis.z as f32;
                    params[6] = cone.ref_dir.x as f32;
                    params[7] = cone.ref_dir.y as f32;
                    params[8] = cone.ref_dir.z as f32;
                    params[9] = cone.half_angle as f32;
                }
                3
            }
            SurfaceKind::Torus => {
                if let Some(torus) = surface.as_any().downcast_ref::<vcad_kernel_geom::TorusSurface>() {
                    // center (3), axis (3), ref_dir (3), major_radius (1), minor_radius (1)
                    params[0] = torus.center.x as f32;
                    params[1] = torus.center.y as f32;
                    params[2] = torus.center.z as f32;
                    params[3] = torus.axis.x as f32;
                    params[4] = torus.axis.y as f32;
                    params[5] = torus.axis.z as f32;
                    params[6] = torus.ref_dir.x as f32;
                    params[7] = torus.ref_dir.y as f32;
                    params[8] = torus.ref_dir.z as f32;
                    params[9] = torus.major_radius as f32;
                    params[10] = torus.minor_radius as f32;
                }
                4
            }
            SurfaceKind::Bilinear => {
                if let Some(bil) = surface.as_any().downcast_ref::<vcad_kernel_geom::BilinearSurface>() {
                    // p00 (3), p10 (3), p01 (3), p11 (3)
                    params[0] = bil.p00.x as f32;
                    params[1] = bil.p00.y as f32;
                    params[2] = bil.p00.z as f32;
                    params[3] = bil.p10.x as f32;
                    params[4] = bil.p10.y as f32;
                    params[5] = bil.p10.z as f32;
                    params[6] = bil.p01.x as f32;
                    params[7] = bil.p01.y as f32;
                    params[8] = bil.p01.z as f32;
                    params[9] = bil.p11.x as f32;
                    params[10] = bil.p11.y as f32;
                    params[11] = bil.p11.z as f32;
                }
                5
            }
            SurfaceKind::BSpline => {
                // B-spline not directly supported on GPU - use tessellation fallback
                6
            }
        };

        Self {
            surface_type,
            _pad: [0; 3],
            params,
        }
    }
}

/// GPU-compatible face representation.
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct GpuFace {
    /// Index into surface array.
    pub surface_idx: u32,
    /// Face orientation: 0=forward, 1=reversed.
    pub orientation: u32,
    /// Start index in trim vertex array.
    pub trim_start: u32,
    /// Number of trim vertices.
    pub trim_count: u32,
    /// AABB min.
    pub aabb_min: [f32; 4], // padded for alignment
    /// AABB max.
    pub aabb_max: [f32; 4], // padded for alignment
}

/// GPU-compatible BVH node.
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct GpuBvhNode {
    /// AABB min.
    pub aabb_min: [f32; 4],
    /// AABB max.
    pub aabb_max: [f32; 4],
    /// For leaves: start face index. For internal: left child index.
    pub left_or_first: u32,
    /// For leaves: face count. For internal: right child index.
    pub right_or_count: u32,
    /// Is this a leaf node? (0 = internal, 1 = leaf)
    pub is_leaf: u32,
    /// Padding.
    pub _pad: u32,
}

/// GPU-compatible 2D point for trim loops.
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct GpuVec2 {
    /// X coordinate.
    pub x: f32,
    /// Y coordinate.
    pub y: f32,
}

/// Camera parameters for the ray tracer.
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct GpuCamera {
    /// Camera position.
    pub position: [f32; 4],
    /// Look-at target.
    pub target: [f32; 4],
    /// Up vector.
    pub up: [f32; 4],
    /// Field of view in radians.
    pub fov: f32,
    /// Image width.
    pub width: u32,
    /// Image height.
    pub height: u32,
    /// Padding.
    pub _pad: u32,
}

impl GpuCamera {
    /// Create a new camera for rendering.
    pub fn new(
        position: [f32; 3],
        target: [f32; 3],
        up: [f32; 3],
        fov: f32,
        width: u32,
        height: u32,
    ) -> Self {
        Self {
            position: [position[0], position[1], position[2], 1.0],
            target: [target[0], target[1], target[2], 1.0],
            up: [up[0], up[1], up[2], 0.0],
            fov,
            width,
            height,
            _pad: 0,
        }
    }
}

/// Scene data prepared for GPU upload.
pub struct GpuScene {
    /// Surfaces.
    pub surfaces: Vec<GpuSurface>,
    /// Faces.
    pub faces: Vec<GpuFace>,
    /// BVH nodes.
    pub bvh_nodes: Vec<GpuBvhNode>,
    /// Trim loop vertices (UV coordinates).
    pub trim_verts: Vec<GpuVec2>,
    /// Mapping from FaceId to GPU face index.
    pub face_index_map: std::collections::HashMap<FaceId, u32>,
}

/// Error building GPU scene.
#[derive(Debug)]
pub enum GpuSceneError {
    /// Too many surfaces (exceeds GPU limit).
    TooManySurfaces(usize),
    /// Too many faces (exceeds GPU limit).
    TooManyFaces(usize),
    /// Too many BVH nodes.
    TooManyBvhNodes(usize),
    /// Too many trim vertices.
    TooManyTrimVerts(usize),
}

impl std::fmt::Display for GpuSceneError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooManySurfaces(n) => write!(f, "too many surfaces: {} (max {})", n, MAX_SURFACES),
            Self::TooManyFaces(n) => write!(f, "too many faces: {} (max {})", n, MAX_FACES),
            Self::TooManyBvhNodes(n) => write!(f, "too many BVH nodes: {} (max {})", n, MAX_BVH_NODES),
            Self::TooManyTrimVerts(n) => write!(f, "too many trim vertices: {} (max {})", n, MAX_TRIM_VERTS),
        }
    }
}

impl std::error::Error for GpuSceneError {}

impl GpuScene {
    /// Build GPU scene data from a BRep solid.
    ///
    /// This builds the BVH internally and converts all data to GPU-compatible format.
    pub fn from_brep(brep: &BRepSolid) -> Result<Self, GpuSceneError> {
        // Build surface list
        let mut surfaces = Vec::with_capacity(brep.geometry.surfaces.len());
        for surface in &brep.geometry.surfaces {
            surfaces.push(GpuSurface::from_surface(surface.as_ref()));
        }
        if surfaces.len() > MAX_SURFACES {
            return Err(GpuSceneError::TooManySurfaces(surfaces.len()));
        }

        // Build face list with AABBs
        let mut faces = Vec::new();
        let mut face_index_map = std::collections::HashMap::new();
        let mut trim_verts = Vec::new();

        for (face_id, face) in &brep.topology.faces {

            // Compute face AABB
            let aabb = face_aabb(brep, face_id);

            // Get trim loop vertices in UV space using the trim module
            let trim_start = trim_verts.len() as u32;
            let mut trim_count = 0u32;

            // Extract UV coordinates for the trim loop
            let uvs = trim::extract_face_uv_loop(brep, face_id);
            for uv in &uvs {
                trim_verts.push(GpuVec2 { x: uv.x as f32, y: uv.y as f32 });
                trim_count += 1;
            }

            let orientation = match face.orientation {
                vcad_kernel_topo::Orientation::Forward => 0,
                vcad_kernel_topo::Orientation::Reversed => 1,
            };

            let gpu_face_idx = faces.len() as u32;
            face_index_map.insert(face_id, gpu_face_idx);

            faces.push(GpuFace {
                surface_idx: face.surface_index as u32,
                orientation,
                trim_start,
                trim_count,
                aabb_min: [aabb.min.x as f32, aabb.min.y as f32, aabb.min.z as f32, 0.0],
                aabb_max: [aabb.max.x as f32, aabb.max.y as f32, aabb.max.z as f32, 0.0],
            });
        }

        if faces.len() > MAX_FACES {
            return Err(GpuSceneError::TooManyFaces(faces.len()));
        }
        if trim_verts.len() > MAX_TRIM_VERTS {
            return Err(GpuSceneError::TooManyTrimVerts(trim_verts.len()));
        }

        // Build BVH from face AABBs and flatten for GPU
        let bvh = Bvh::build(brep);
        let (flat_nodes, bvh_faces) = bvh.flatten();

        // Convert flattened BVH to GPU format
        // Note: BVH faces are in leaf traversal order, we need to map to GPU face indices
        let mut bvh_nodes = Vec::with_capacity(flat_nodes.len().max(1));

        if flat_nodes.is_empty() {
            // Empty BVH - add a dummy node
            bvh_nodes.push(GpuBvhNode::zeroed());
        } else {
            for (aabb, is_leaf, left_or_first, right_or_count) in &flat_nodes {
                if *is_leaf {
                    // For leaves: left_or_first is start in bvh_faces, right_or_count is count
                    // We need to remap to our GPU face indices
                    let start = *left_or_first as usize;
                    let count = *right_or_count as usize;

                    // Get the first GPU face index from the BVH face list
                    let first_gpu_idx = if start < bvh_faces.len() {
                        face_index_map.get(&bvh_faces[start]).copied().unwrap_or(0)
                    } else {
                        0
                    };

                    bvh_nodes.push(GpuBvhNode {
                        aabb_min: [aabb.min.x as f32, aabb.min.y as f32, aabb.min.z as f32, 0.0],
                        aabb_max: [aabb.max.x as f32, aabb.max.y as f32, aabb.max.z as f32, 0.0],
                        left_or_first: first_gpu_idx,
                        right_or_count: count as u32,
                        is_leaf: 1,
                        _pad: 0,
                    });
                } else {
                    bvh_nodes.push(GpuBvhNode {
                        aabb_min: [aabb.min.x as f32, aabb.min.y as f32, aabb.min.z as f32, 0.0],
                        aabb_max: [aabb.max.x as f32, aabb.max.y as f32, aabb.max.z as f32, 0.0],
                        left_or_first: *left_or_first,
                        right_or_count: *right_or_count,
                        is_leaf: 0,
                        _pad: 0,
                    });
                }
            }
        }

        if bvh_nodes.len() > MAX_BVH_NODES {
            return Err(GpuSceneError::TooManyBvhNodes(bvh_nodes.len()));
        }

        Ok(Self {
            surfaces,
            faces,
            bvh_nodes,
            trim_verts,
            face_index_map,
        })
    }
}
