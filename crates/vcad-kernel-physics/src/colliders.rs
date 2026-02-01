//! Collision shape generation from vcad geometry.

use nalgebra::{Point3, Vector3};
use parry3d::shape::{ConvexPolyhedron, SharedShape, TriMesh};
use vcad_kernel_tessellate::TriangleMesh;

use crate::error::PhysicsError;

/// Strategy for generating collision shapes.
#[derive(Debug, Clone, Copy, Default)]
#[allow(dead_code)]
pub enum ColliderStrategy {
    /// Use convex hull (fast, approximate).
    #[default]
    ConvexHull,
    /// Use triangle mesh (accurate, slower).
    TriMesh,
    /// Use axis-aligned bounding box (fastest, rough).
    Aabb,
}

/// Generate a collision shape from a triangle mesh.
///
/// # Arguments
///
/// * `mesh` - The triangle mesh to convert
/// * `strategy` - The collision shape strategy to use
/// * `name` - Name for error messages
///
/// # Returns
///
/// A shared collision shape ready for use with Rapier.
pub fn mesh_to_collider(
    mesh: &TriangleMesh,
    strategy: ColliderStrategy,
    name: &str,
) -> Result<SharedShape, PhysicsError> {
    if mesh.vertices.is_empty() || mesh.indices.is_empty() {
        return Err(PhysicsError::CollisionShape {
            name: name.to_string(),
            reason: "Empty mesh".to_string(),
        });
    }

    match strategy {
        ColliderStrategy::ConvexHull => create_convex_hull(mesh, name),
        ColliderStrategy::TriMesh => create_trimesh(mesh, name),
        ColliderStrategy::Aabb => create_aabb(mesh, name),
    }
}

fn create_convex_hull(mesh: &TriangleMesh, name: &str) -> Result<SharedShape, PhysicsError> {
    // Extract points from mesh vertices
    let points: Vec<Point3<f32>> = mesh
        .vertices
        .chunks(3)
        .map(|v| {
            // Convert from mm to meters
            Point3::new(v[0] / 1000.0, v[1] / 1000.0, v[2] / 1000.0)
        })
        .collect();

    if points.len() < 4 {
        return Err(PhysicsError::CollisionShape {
            name: name.to_string(),
            reason: "Need at least 4 points for convex hull".to_string(),
        });
    }

    // Create convex hull
    match ConvexPolyhedron::from_convex_hull(&points) {
        Some(hull) => Ok(SharedShape::new(hull)),
        None => {
            // Fall back to AABB if convex hull fails (degenerate geometry)
            create_aabb(mesh, name)
        }
    }
}

fn create_trimesh(mesh: &TriangleMesh, name: &str) -> Result<SharedShape, PhysicsError> {
    // Extract vertices
    let vertices: Vec<Point3<f32>> = mesh
        .vertices
        .chunks(3)
        .map(|v| {
            // Convert from mm to meters
            Point3::new(v[0] / 1000.0, v[1] / 1000.0, v[2] / 1000.0)
        })
        .collect();

    // Extract triangle indices
    let indices: Vec<[u32; 3]> = mesh
        .indices
        .chunks(3)
        .map(|i| [i[0], i[1], i[2]])
        .collect();

    if indices.is_empty() {
        return Err(PhysicsError::CollisionShape {
            name: name.to_string(),
            reason: "No triangles in mesh".to_string(),
        });
    }

    match TriMesh::new(vertices, indices) {
        Ok(trimesh) => Ok(SharedShape::new(trimesh)),
        Err(e) => Err(PhysicsError::CollisionShape {
            name: name.to_string(),
            reason: format!("Failed to create trimesh: {:?}", e),
        }),
    }
}

fn create_aabb(mesh: &TriangleMesh, _name: &str) -> Result<SharedShape, PhysicsError> {
    // Compute bounding box
    let mut min = Vector3::new(f32::INFINITY, f32::INFINITY, f32::INFINITY);
    let mut max = Vector3::new(f32::NEG_INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY);

    for v in mesh.vertices.chunks(3) {
        // Convert from mm to meters
        let x = v[0] / 1000.0;
        let y = v[1] / 1000.0;
        let z = v[2] / 1000.0;

        min.x = min.x.min(x);
        min.y = min.y.min(y);
        min.z = min.z.min(z);
        max.x = max.x.max(x);
        max.y = max.y.max(y);
        max.z = max.z.max(z);
    }

    let half_extents = (max - min) / 2.0;

    Ok(SharedShape::cuboid(half_extents.x, half_extents.y, half_extents.z))
}

/// Compute the center of mass from a triangle mesh.
///
/// Returns the center of mass in meters.
#[allow(dead_code)]
pub fn compute_center_of_mass(mesh: &TriangleMesh) -> Point3<f32> {
    if mesh.vertices.is_empty() {
        return Point3::origin();
    }

    let mut sum = Vector3::zeros();
    let count = mesh.vertices.len() / 3;

    for v in mesh.vertices.chunks(3) {
        // Convert from mm to meters
        sum.x += v[0] / 1000.0;
        sum.y += v[1] / 1000.0;
        sum.z += v[2] / 1000.0;
    }

    Point3::from(sum / count as f32)
}

/// Estimate mass from mesh volume assuming uniform density.
///
/// # Arguments
///
/// * `mesh` - The triangle mesh
/// * `density` - Density in kg/m³ (default: 1000 for plastic-like material)
///
/// # Returns
///
/// Estimated mass in kg.
pub fn estimate_mass(mesh: &TriangleMesh, density: f32) -> f32 {
    // Use signed volume method
    let mut volume = 0.0f32;

    for tri in mesh.indices.chunks(3) {
        let i0 = tri[0] as usize * 3;
        let i1 = tri[1] as usize * 3;
        let i2 = tri[2] as usize * 3;

        // Convert from mm to meters
        let v0 = Point3::new(
            mesh.vertices[i0] / 1000.0,
            mesh.vertices[i0 + 1] / 1000.0,
            mesh.vertices[i0 + 2] / 1000.0,
        );
        let v1 = Point3::new(
            mesh.vertices[i1] / 1000.0,
            mesh.vertices[i1 + 1] / 1000.0,
            mesh.vertices[i1 + 2] / 1000.0,
        );
        let v2 = Point3::new(
            mesh.vertices[i2] / 1000.0,
            mesh.vertices[i2 + 1] / 1000.0,
            mesh.vertices[i2 + 2] / 1000.0,
        );

        // Signed volume of tetrahedron with origin
        volume += v0.coords.dot(&v1.coords.cross(&v2.coords)) / 6.0;
    }

    (volume.abs() * density).max(0.001) // Minimum mass of 1 gram
}

#[cfg(test)]
mod tests {
    use super::*;

    fn simple_cube_mesh() -> TriangleMesh {
        // 10mm cube centered at origin
        let s = 5.0; // half-size in mm
        TriangleMesh {
            vertices: vec![
                // Front face
                -s, -s, s, s, -s, s, s, s, s, -s, s, s, // Back face
                -s, -s, -s, -s, s, -s, s, s, -s, s, -s, -s,
            ],
            indices: vec![
                // Front
                0, 1, 2, 0, 2, 3, // Back
                4, 5, 6, 4, 6, 7, // Top
                3, 2, 6, 3, 6, 5, // Bottom
                0, 7, 1, 0, 4, 7, // Right
                1, 7, 6, 1, 6, 2, // Left
                0, 3, 5, 0, 5, 4,
            ],
            normals: vec![],
        }
    }

    #[test]
    fn test_convex_hull() {
        let mesh = simple_cube_mesh();
        let shape = mesh_to_collider(&mesh, ColliderStrategy::ConvexHull, "test").unwrap();
        assert!(shape.as_ball().is_none()); // Not a ball
    }

    #[test]
    fn test_trimesh() {
        let mesh = simple_cube_mesh();
        let shape = mesh_to_collider(&mesh, ColliderStrategy::TriMesh, "test").unwrap();
        assert!(shape.as_trimesh().is_some());
    }

    #[test]
    fn test_aabb() {
        let mesh = simple_cube_mesh();
        let shape = mesh_to_collider(&mesh, ColliderStrategy::Aabb, "test").unwrap();
        assert!(shape.as_cuboid().is_some());
    }

    #[test]
    fn test_center_of_mass() {
        let mesh = simple_cube_mesh();
        let com = compute_center_of_mass(&mesh);
        // Should be near origin
        assert!(com.coords.norm() < 0.001);
    }
}
