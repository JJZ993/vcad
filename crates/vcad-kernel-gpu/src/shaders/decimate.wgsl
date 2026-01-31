// Mesh decimation shader using quadric error metrics
//
// This implements GPU-accelerated edge collapse decimation:
// 1. Compute quadric error matrices per vertex
// 2. Compute edge collapse costs
// 3. Mark independent edges for collapse
// 4. Perform collapses in parallel

struct Params {
    vertex_count: u32,
    triangle_count: u32,
    edge_count: u32,
    target_triangles: u32,
}

// Symmetric 4x4 matrix stored as 10 floats (upper triangle)
// [a b c d]    [0 1 2 3]
// [b e f g] -> [  4 5 6]
// [c f h i]    [    7 8]
// [d g i j]    [      9]
struct Quadric {
    data: array<f32, 10>,
}

@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> quadrics: array<f32>; // 10 floats per vertex
@group(0) @binding(3) var<storage, read_write> edge_costs: array<f32>;
@group(0) @binding(4) var<storage, read_write> edge_targets: array<f32>; // optimal position for collapse
@group(0) @binding(5) var<storage, read_write> collapse_flags: array<u32>;
@group(0) @binding(6) var<uniform> params: Params;

fn get_position(idx: u32) -> vec3<f32> {
    let base = idx * 3u;
    return vec3<f32>(positions[base], positions[base + 1u], positions[base + 2u]);
}

fn get_quadric(idx: u32) -> array<f32, 10> {
    let base = idx * 10u;
    var q: array<f32, 10>;
    for (var i = 0u; i < 10u; i++) {
        q[i] = quadrics[base + i];
    }
    return q;
}

fn set_quadric(idx: u32, q: array<f32, 10>) {
    let base = idx * 10u;
    for (var i = 0u; i < 10u; i++) {
        quadrics[base + i] = q[i];
    }
}

fn add_quadrics(a: array<f32, 10>, b: array<f32, 10>) -> array<f32, 10> {
    var result: array<f32, 10>;
    for (var i = 0u; i < 10u; i++) {
        result[i] = a[i] + b[i];
    }
    return result;
}

// Compute plane quadric from triangle normal and point
fn plane_quadric(n: vec3<f32>, p: vec3<f32>) -> array<f32, 10> {
    let d = -dot(n, p);
    var q: array<f32, 10>;
    q[0] = n.x * n.x;
    q[1] = n.x * n.y;
    q[2] = n.x * n.z;
    q[3] = n.x * d;
    q[4] = n.y * n.y;
    q[5] = n.y * n.z;
    q[6] = n.y * d;
    q[7] = n.z * n.z;
    q[8] = n.z * d;
    q[9] = d * d;
    return q;
}

// Evaluate quadric error for a point
fn quadric_error(q: array<f32, 10>, p: vec3<f32>) -> f32 {
    // Q * [p 1]^T dot [p 1]
    let v = vec4<f32>(p, 1.0);
    var result = 0.0;

    // Row 0: a*x + b*y + c*z + d
    let r0 = q[0]*v.x + q[1]*v.y + q[2]*v.z + q[3]*v.w;
    // Row 1: b*x + e*y + f*z + g
    let r1 = q[1]*v.x + q[4]*v.y + q[5]*v.z + q[6]*v.w;
    // Row 2: c*x + f*y + h*z + i
    let r2 = q[2]*v.x + q[5]*v.y + q[7]*v.z + q[8]*v.w;
    // Row 3: d*x + g*y + i*z + j
    let r3 = q[3]*v.x + q[6]*v.y + q[8]*v.z + q[9]*v.w;

    return v.x*r0 + v.y*r1 + v.z*r2 + v.w*r3;
}

// Phase 1: Initialize quadrics from face planes
@compute @workgroup_size(256)
fn init_quadrics(@builtin(global_invocation_id) gid: vec3<u32>) {
    let vert_idx = gid.x;
    if (vert_idx >= params.vertex_count) {
        return;
    }

    var q: array<f32, 10>;
    for (var i = 0u; i < 10u; i++) {
        q[i] = 0.0;
    }
    set_quadric(vert_idx, q);
}

// Phase 2: Accumulate face quadrics to vertices
@compute @workgroup_size(256)
fn accumulate_quadrics(@builtin(global_invocation_id) gid: vec3<u32>) {
    let tri_idx = gid.x;
    if (tri_idx >= params.triangle_count) {
        return;
    }

    let i0 = indices[tri_idx * 3u];
    let i1 = indices[tri_idx * 3u + 1u];
    let i2 = indices[tri_idx * 3u + 2u];

    // Skip degenerate triangles
    if (i0 == 0xFFFFFFFFu || i1 == 0xFFFFFFFFu || i2 == 0xFFFFFFFFu) {
        return;
    }

    let v0 = get_position(i0);
    let v1 = get_position(i1);
    let v2 = get_position(i2);

    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let normal = normalize(cross(edge1, edge2));

    let face_q = plane_quadric(normal, v0);

    // Add to all three vertices (atomic would be better but simplified here)
    let q0 = add_quadrics(get_quadric(i0), face_q);
    let q1 = add_quadrics(get_quadric(i1), face_q);
    let q2 = add_quadrics(get_quadric(i2), face_q);

    set_quadric(i0, q0);
    set_quadric(i1, q1);
    set_quadric(i2, q2);
}

// Phase 3: Compute edge collapse costs
@compute @workgroup_size(256)
fn compute_edge_costs(@builtin(global_invocation_id) gid: vec3<u32>) {
    let edge_idx = gid.x;
    if (edge_idx >= params.edge_count) {
        return;
    }

    // Edges are stored as pairs in the first part of indices buffer
    // after the triangle data
    let edge_base = params.triangle_count * 3u + edge_idx * 2u;
    let v0_idx = indices[edge_base];
    let v1_idx = indices[edge_base + 1u];

    if (v0_idx == 0xFFFFFFFFu || v1_idx == 0xFFFFFFFFu) {
        edge_costs[edge_idx] = 1e30;
        return;
    }

    let q0 = get_quadric(v0_idx);
    let q1 = get_quadric(v1_idx);
    let combined = add_quadrics(q0, q1);

    let p0 = get_position(v0_idx);
    let p1 = get_position(v1_idx);

    // Try midpoint as collapse target (simplified - full QEM would solve for optimal)
    let midpoint = (p0 + p1) * 0.5;
    let cost = quadric_error(combined, midpoint);

    edge_costs[edge_idx] = cost;
    let target_base = edge_idx * 3u;
    edge_targets[target_base] = midpoint.x;
    edge_targets[target_base + 1u] = midpoint.y;
    edge_targets[target_base + 2u] = midpoint.z;
}

// Phase 4: Mark independent edges for collapse (greedy independent set)
@compute @workgroup_size(256)
fn mark_collapses(@builtin(global_invocation_id) gid: vec3<u32>) {
    let edge_idx = gid.x;
    if (edge_idx >= params.edge_count) {
        return;
    }

    // Simple heuristic: collapse if this edge has lowest cost among neighbors
    // In practice this would need proper independent set computation
    collapse_flags[edge_idx] = 0u;

    let cost = edge_costs[edge_idx];
    if (cost >= 1e29) {
        return;
    }

    // For now, mark for collapse if cost is below threshold
    // A proper implementation would ensure no two adjacent edges collapse
    if (cost < 1e10) {
        collapse_flags[edge_idx] = 1u;
    }
}
