// Creased normal computation shader
//
// This shader computes smooth normals with crease angle support.
// Normals are averaged across faces that share a vertex, but only
// if the angle between faces is less than the crease threshold.

struct Params {
    crease_angle_cos: f32,
    vertex_count: u32,
    triangle_count: u32,
    _padding: u32,
}

@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> normals: array<f32>;
@group(0) @binding(3) var<storage, read_write> face_normals: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

fn get_position(idx: u32) -> vec3<f32> {
    let base = idx * 3u;
    return vec3<f32>(positions[base], positions[base + 1u], positions[base + 2u]);
}

fn set_normal(idx: u32, n: vec3<f32>) {
    let base = idx * 3u;
    normals[base] = n.x;
    normals[base + 1u] = n.y;
    normals[base + 2u] = n.z;
}

fn get_normal(idx: u32) -> vec3<f32> {
    let base = idx * 3u;
    return vec3<f32>(normals[base], normals[base + 1u], normals[base + 2u]);
}

fn set_face_normal(tri_idx: u32, n: vec3<f32>) {
    let base = tri_idx * 3u;
    face_normals[base] = n.x;
    face_normals[base + 1u] = n.y;
    face_normals[base + 2u] = n.z;
}

fn get_face_normal(tri_idx: u32) -> vec3<f32> {
    let base = tri_idx * 3u;
    return vec3<f32>(face_normals[base], face_normals[base + 1u], face_normals[base + 2u]);
}

// Phase 1: Compute face normals
@compute @workgroup_size(256)
fn compute_face_normals(@builtin(global_invocation_id) gid: vec3<u32>) {
    let tri_idx = gid.x;
    if (tri_idx >= params.triangle_count) {
        return;
    }

    let i0 = indices[tri_idx * 3u];
    let i1 = indices[tri_idx * 3u + 1u];
    let i2 = indices[tri_idx * 3u + 2u];

    let v0 = get_position(i0);
    let v1 = get_position(i1);
    let v2 = get_position(i2);

    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let normal = cross(edge1, edge2);
    let len = length(normal);

    if (len > 0.0) {
        set_face_normal(tri_idx, normal / len);
    } else {
        set_face_normal(tri_idx, vec3<f32>(0.0, 1.0, 0.0));
    }
}

// Phase 2: Accumulate normals to vertices with crease angle check
// This is a simple O(V*T) approach - for production, use atomic operations
// or a more sophisticated algorithm
@compute @workgroup_size(256)
fn accumulate_normals(@builtin(global_invocation_id) gid: vec3<u32>) {
    let vert_idx = gid.x;
    if (vert_idx >= params.vertex_count) {
        return;
    }

    var accumulated = vec3<f32>(0.0, 0.0, 0.0);
    var first_normal = vec3<f32>(0.0, 0.0, 0.0);
    var has_first = false;

    // Find all triangles that use this vertex
    for (var tri_idx = 0u; tri_idx < params.triangle_count; tri_idx++) {
        let i0 = indices[tri_idx * 3u];
        let i1 = indices[tri_idx * 3u + 1u];
        let i2 = indices[tri_idx * 3u + 2u];

        if (i0 == vert_idx || i1 == vert_idx || i2 == vert_idx) {
            let face_n = get_face_normal(tri_idx);

            if (!has_first) {
                first_normal = face_n;
                has_first = true;
                accumulated += face_n;
            } else {
                // Check crease angle
                let cos_angle = dot(first_normal, face_n);
                if (cos_angle >= params.crease_angle_cos) {
                    accumulated += face_n;
                }
            }
        }
    }

    let len = length(accumulated);
    if (len > 0.0) {
        set_normal(vert_idx, accumulated / len);
    } else {
        set_normal(vert_idx, vec3<f32>(0.0, 1.0, 0.0));
    }
}
