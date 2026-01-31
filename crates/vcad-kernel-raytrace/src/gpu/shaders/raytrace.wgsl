// Ray tracing compute shader for direct BRep rendering.
//
// This shader traces rays against analytic surfaces without tessellation,
// achieving pixel-perfect silhouettes at any zoom level.

// Constants
const SURFACE_PLANE: u32 = 0u;
const SURFACE_CYLINDER: u32 = 1u;
const SURFACE_SPHERE: u32 = 2u;
const SURFACE_CONE: u32 = 3u;
const SURFACE_TORUS: u32 = 4u;
const SURFACE_BILINEAR: u32 = 5u;

const MAX_T: f32 = 1e10;
const EPSILON: f32 = 1e-6;
const PI: f32 = 3.14159265359;

// Structures matching Rust definitions

struct GpuSurface {
    surface_type: u32,
    // Use explicit u32 padding instead of vec3<u32> to match Rust layout
    // vec3<u32> in WGSL has 16-byte alignment which would misalign params
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
    params: array<f32, 32>,
}

struct GpuMaterial {
    color: vec4<f32>,
    metallic: f32,
    roughness: f32,
    _pad: vec2<f32>,
}

struct GpuFace {
    surface_idx: u32,
    orientation: u32,
    trim_start: u32,
    trim_count: u32,
    aabb_min: vec4<f32>,
    aabb_max: vec4<f32>,
    inner_start: u32,
    inner_count: u32,
    inner_loop_count: u32,
    inner_desc_start: u32,
    material_idx: u32,
    _pad2: vec3<u32>,
}

struct GpuBvhNode {
    aabb_min: vec4<f32>,
    aabb_max: vec4<f32>,
    left_or_first: u32,
    right_or_count: u32,
    is_leaf: u32,
    _pad: u32,
}

struct Camera {
    position: vec4<f32>,
    look_at: vec4<f32>,
    up: vec4<f32>,
    fov: f32,
    width: u32,
    height: u32,
    _pad: u32,
}

struct RenderState {
    frame_index: u32,
    jitter_x: f32,
    jitter_y: f32,
    enable_edges: u32,
    edge_depth_threshold: f32,
    edge_normal_threshold: f32,
    _pad: vec2<f32>,
}

struct RayHit {
    t: f32,
    face_idx: u32,
    uv: vec2<f32>,
}

// Bind groups

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> surfaces: array<GpuSurface>;
@group(0) @binding(2) var<storage, read> faces: array<GpuFace>;
@group(0) @binding(3) var<storage, read> bvh_nodes: array<GpuBvhNode>;
@group(0) @binding(4) var<storage, read> trim_verts: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read> inner_loop_descs: array<u32>;
@group(0) @binding(6) var output: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(7) var<uniform> render_state: RenderState;
@group(0) @binding(8) var<storage, read_write> accum_buffer: array<vec4<f32>>;
@group(0) @binding(9) var<storage, read> materials: array<GpuMaterial>;
@group(0) @binding(10) var<storage, read_write> depth_normal_buffer: array<vec4<f32>>;

// Helper functions for buffer indexing (2D coords to 1D index)
fn pixel_index(coord: vec2<u32>) -> u32 {
    return coord.y * camera.width + coord.x;
}

fn pixel_index_i32(coord: vec2<i32>) -> u32 {
    return u32(coord.y) * camera.width + u32(coord.x);
}

// Utility functions

fn ray_origin_and_direction(pixel: vec2<u32>) -> mat2x3<f32> {
    let aspect = f32(camera.width) / f32(camera.height);
    let fov_tan = tan(camera.fov * 0.5);

    // Apply sub-pixel jitter for anti-aliasing (Halton sequence from render_state)
    let jitter = vec2<f32>(render_state.jitter_x, render_state.jitter_y);

    // Compute normalized device coordinates with jitter
    let ndc = vec2<f32>(
        (f32(pixel.x) + 0.5 + jitter.x) / f32(camera.width) * 2.0 - 1.0,
        1.0 - (f32(pixel.y) + 0.5 + jitter.y) / f32(camera.height) * 2.0
    );

    // Build camera coordinate system
    let forward = normalize(camera.look_at.xyz - camera.position.xyz);
    let right = normalize(cross(forward, camera.up.xyz));
    let up = cross(right, forward);

    // Compute ray direction
    let dir = normalize(
        forward +
        right * ndc.x * fov_tan * aspect +
        up * ndc.y * fov_tan
    );

    return mat2x3<f32>(camera.position.xyz, dir);
}

fn intersect_aabb(origin: vec3<f32>, inv_dir: vec3<f32>, aabb_min: vec3<f32>, aabb_max: vec3<f32>) -> vec2<f32> {
    let t1 = (aabb_min - origin) * inv_dir;
    let t2 = (aabb_max - origin) * inv_dir;

    let t_min = min(t1, t2);
    let t_max = max(t1, t2);

    let t_enter = max(max(t_min.x, t_min.y), t_min.z);
    let t_exit = min(min(t_max.x, t_max.y), t_max.z);

    return vec2<f32>(t_enter, t_exit);
}

// Ray-surface intersection functions

fn intersect_plane(origin: vec3<f32>, dir: vec3<f32>, params: array<f32, 32>) -> RayHit {
    var hit: RayHit;
    hit.t = MAX_T;
    hit.face_idx = 0xFFFFFFFFu;

    let plane_origin = vec3<f32>(params[0], params[1], params[2]);
    let plane_normal = vec3<f32>(params[9], params[10], params[11]);

    let denom = dot(dir, plane_normal);
    if abs(denom) < EPSILON {
        return hit;
    }

    let t = dot(plane_origin - origin, plane_normal) / denom;
    if t < 0.0 {
        return hit;
    }

    hit.t = t;

    // Compute UV
    let p = origin + t * dir;
    let x_dir = vec3<f32>(params[3], params[4], params[5]);
    let y_dir = vec3<f32>(params[6], params[7], params[8]);
    let to_p = p - plane_origin;
    hit.uv = vec2<f32>(dot(to_p, x_dir), dot(to_p, y_dir));

    return hit;
}

fn intersect_sphere(origin: vec3<f32>, dir: vec3<f32>, params: array<f32, 32>) -> RayHit {
    var hit: RayHit;
    hit.t = MAX_T;
    hit.face_idx = 0xFFFFFFFFu;

    let center = vec3<f32>(params[0], params[1], params[2]);
    let radius = params[3];

    let oc = origin - center;
    let a = dot(dir, dir);
    let b = 2.0 * dot(oc, dir);
    let c = dot(oc, oc) - radius * radius;

    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 {
        return hit;
    }

    let sqrt_disc = sqrt(disc);
    var t = (-b - sqrt_disc) / (2.0 * a);
    if t < 0.0 {
        t = (-b + sqrt_disc) / (2.0 * a);
    }
    if t < 0.0 {
        return hit;
    }

    hit.t = t;

    // Compute UV (spherical coordinates)
    let p = origin + t * dir;
    let ref_dir = vec3<f32>(params[4], params[5], params[6]);
    let axis = vec3<f32>(params[7], params[8], params[9]);
    let y_dir = cross(axis, ref_dir);

    let to_p = normalize((p - center) / radius);
    let z = clamp(dot(to_p, axis), -1.0, 1.0);
    let v = asin(z);

    let proj = to_p - z * axis;
    let proj_len = length(proj);
    var u = 0.0;
    if proj_len > EPSILON {
        let x = dot(proj, ref_dir) / proj_len;
        let y = dot(proj, y_dir) / proj_len;
        u = atan2(y, x);
        if u < 0.0 { u += 2.0 * PI; }
    }

    hit.uv = vec2<f32>(u, v);
    return hit;
}

fn intersect_cylinder(origin: vec3<f32>, dir: vec3<f32>, params: array<f32, 32>) -> RayHit {
    var hit: RayHit;
    hit.t = MAX_T;
    hit.face_idx = 0xFFFFFFFFu;

    let center = vec3<f32>(params[0], params[1], params[2]);
    let axis = vec3<f32>(params[3], params[4], params[5]);
    let ref_dir = vec3<f32>(params[6], params[7], params[8]);
    let radius = params[9];

    let oc = origin - center;

    // Project onto plane perpendicular to axis
    let d_perp = dir - dot(dir, axis) * axis;
    let oc_perp = oc - dot(oc, axis) * axis;

    let a = dot(d_perp, d_perp);
    if a < EPSILON {
        return hit; // Ray parallel to axis
    }

    let b = 2.0 * dot(oc_perp, d_perp);
    let c = dot(oc_perp, oc_perp) - radius * radius;

    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 {
        return hit;
    }

    let sqrt_disc = sqrt(disc);
    var t = (-b - sqrt_disc) / (2.0 * a);
    if t < 0.0 {
        t = (-b + sqrt_disc) / (2.0 * a);
    }
    if t < 0.0 {
        return hit;
    }

    hit.t = t;

    // Compute UV
    let p = origin + t * dir;
    let y_dir = cross(axis, ref_dir);
    let to_p = p - center;
    let v = dot(to_p, axis);
    let proj = to_p - v * axis;
    let x = dot(proj, ref_dir);
    let y = dot(proj, y_dir);
    var u = atan2(y, x);
    if u < 0.0 { u += 2.0 * PI; }

    hit.uv = vec2<f32>(u, v);
    return hit;
}

fn intersect_cone(origin: vec3<f32>, dir: vec3<f32>, params: array<f32, 32>) -> RayHit {
    var hit: RayHit;
    hit.t = MAX_T;
    hit.face_idx = 0xFFFFFFFFu;

    // Cone parameters: apex (3), axis (3), ref_dir (3), half_angle (1)
    let apex = vec3<f32>(params[0], params[1], params[2]);
    let axis = vec3<f32>(params[3], params[4], params[5]);
    let ref_dir = vec3<f32>(params[6], params[7], params[8]);
    let half_angle = params[9];

    let cos_a = cos(half_angle);
    let cos2 = cos_a * cos_a;

    let co = origin - apex;
    let d_dot_a = dot(dir, axis);
    let co_dot_a = dot(co, axis);

    // Quadratic coefficients
    let a = d_dot_a * d_dot_a - cos2;
    let b = 2.0 * (d_dot_a * co_dot_a - cos2 * dot(dir, co));
    let c = co_dot_a * co_dot_a - cos2 * dot(co, co);

    if abs(a) < EPSILON {
        // Linear case
        if abs(b) > EPSILON {
            let t = -c / b;
            if t >= 0.0 {
                let point = origin + t * dir;
                let v = dot(point - apex, axis) / cos_a;
                if v >= 0.0 {
                    hit.t = t;
                    // Compute UV
                    let y_dir = cross(axis, ref_dir);
                    let to_p = point - apex;
                    let height = dot(to_p, axis);
                    let proj = to_p - height * axis;
                    let proj_len = length(proj);
                    var u = 0.0;
                    if proj_len > EPSILON {
                        let x = dot(proj, ref_dir) / proj_len;
                        let y = dot(proj, y_dir) / proj_len;
                        u = atan2(y, x);
                        if u < 0.0 { u += 2.0 * PI; }
                    }
                    hit.uv = vec2<f32>(u, v);
                }
            }
        }
        return hit;
    }

    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 {
        return hit;
    }

    let sqrt_disc = sqrt(disc);
    var t1 = (-b - sqrt_disc) / (2.0 * a);
    var t2 = (-b + sqrt_disc) / (2.0 * a);

    // Try both solutions, take the closer valid one
    for (var i = 0; i < 2; i++) {
        let t = select(t2, t1, i == 0);
        if t < 0.0 { continue; }

        let point = origin + t * dir;
        let to_point = point - apex;
        let height_along_axis = dot(to_point, axis);
        let v = height_along_axis / cos_a;

        if v >= 0.0 {
            hit.t = t;
            // Compute UV
            let y_dir = cross(axis, ref_dir);
            let proj = to_point - height_along_axis * axis;
            let proj_len = length(proj);
            var u = 0.0;
            if proj_len > EPSILON {
                let x = dot(proj, ref_dir) / proj_len;
                let y = dot(proj, y_dir) / proj_len;
                u = atan2(y, x);
                if u < 0.0 { u += 2.0 * PI; }
            }
            hit.uv = vec2<f32>(u, v);
            return hit;
        }
    }

    return hit;
}

// Solve cubic: x^3 + px^2 + qx + r = 0 (normalized form)
// Returns up to 3 roots
fn solve_cubic_normalized(p: f32, q: f32, r: f32) -> vec3<f32> {
    // Depressed cubic via substitution x = t - p/3
    let p2 = p * p;
    let aa = q - p2 / 3.0;
    let bb = r - p * q / 3.0 + 2.0 * p2 * p / 27.0;

    let delta = bb * bb / 4.0 + aa * aa * aa / 27.0;
    let shift = p / 3.0;

    if delta > EPSILON {
        // One real root
        let sqrt_delta = sqrt(delta);
        let u = sign(-bb / 2.0 + sqrt_delta) * pow(abs(-bb / 2.0 + sqrt_delta), 1.0 / 3.0);
        let v = sign(-bb / 2.0 - sqrt_delta) * pow(abs(-bb / 2.0 - sqrt_delta), 1.0 / 3.0);
        let root = u + v - shift;
        return vec3<f32>(root, root, root);
    } else if abs(delta) <= EPSILON {
        // Multiple roots
        if abs(aa) < EPSILON && abs(bb) < EPSILON {
            // Triple root
            return vec3<f32>(-shift, -shift, -shift);
        } else {
            // Double root
            let u = sign(-bb / 2.0) * pow(abs(-bb / 2.0), 1.0 / 3.0);
            return vec3<f32>(2.0 * u - shift, -u - shift, -u - shift);
        }
    } else {
        // Three real roots (Vieta's trigonometric solution)
        let m = 2.0 * sqrt(-aa / 3.0);
        let theta = acos(3.0 * bb / (aa * m)) / 3.0;
        return vec3<f32>(
            m * cos(theta) - shift,
            m * cos(theta - 2.0 * PI / 3.0) - shift,
            m * cos(theta + 2.0 * PI / 3.0) - shift
        );
    }
}

fn intersect_torus(origin: vec3<f32>, dir: vec3<f32>, params: array<f32, 32>) -> RayHit {
    var hit: RayHit;
    hit.t = MAX_T;
    hit.face_idx = 0xFFFFFFFFu;

    // Torus parameters: center (3), axis (3), ref_dir (3), major_radius (1), minor_radius (1)
    let center = vec3<f32>(params[0], params[1], params[2]);
    let axis = vec3<f32>(params[3], params[4], params[5]);
    let ref_dir = vec3<f32>(params[6], params[7], params[8]);
    let R = params[9];  // Major radius
    let r = params[10]; // Minor radius

    let R2 = R * R;
    let r2 = r * r;

    let o = origin - center;
    let od = dot(o, dir);
    let oo = dot(o, o);
    let dd = dot(dir, dir);
    let oa = dot(o, axis);
    let da = dot(dir, axis);

    // Quartic coefficients
    let sum_r2_r2 = R2 + r2;
    let k = oo - sum_r2_r2;

    let c4 = dd * dd;
    let c3 = 4.0 * dd * od;
    let c2 = 2.0 * dd * k + 4.0 * od * od + 4.0 * R2 * da * da;
    let c1 = 4.0 * k * od + 8.0 * R2 * oa * da;
    let c0 = k * k - 4.0 * R2 * (r2 - oa * oa);

    // Normalize to monic quartic: t^4 + at^3 + bt^2 + ct + d = 0
    let a_norm = c3 / c4;
    let b_norm = c2 / c4;
    let c_norm = c1 / c4;
    let d_norm = c0 / c4;

    // Depressed quartic via substitution t = y - a/4
    let a2 = a_norm * a_norm;
    let a3 = a2 * a_norm;
    let a4 = a2 * a2;

    let p = b_norm - 3.0 * a2 / 8.0;
    let q = c_norm - a_norm * b_norm / 2.0 + a3 / 8.0;
    let rr = d_norm - a_norm * c_norm / 4.0 + a2 * b_norm / 16.0 - 3.0 * a4 / 256.0;

    // Solve resolvent cubic: u^3 + (p/2)*u^2 + ((p^2 - 4*rr)/16)*u - q^2/64 = 0
    let cubic_roots = solve_cubic_normalized(
        p / 2.0,
        (p * p - 4.0 * rr) / 16.0,
        -q * q / 64.0
    );

    // Find positive root
    var u = 0.0;
    if cubic_roots.x > EPSILON { u = cubic_roots.x; }
    else if cubic_roots.y > EPSILON { u = cubic_roots.y; }
    else if cubic_roots.z > EPSILON { u = cubic_roots.z; }

    let sqrt_2u = sqrt(max(2.0 * u, 0.0));

    // Two quadratics
    var best_t = MAX_T;
    var best_uv = vec2<f32>(0.0, 0.0);

    if sqrt_2u > EPSILON {
        let alpha = p + 2.0 * u;
        let beta = q / sqrt_2u;

        // First quadratic: y^2 + sqrt_2u*y + (alpha + beta)/2 = 0
        let disc1 = sqrt_2u * sqrt_2u - 2.0 * (alpha + beta);
        if disc1 >= 0.0 {
            let sqrt_disc1 = sqrt(disc1);
            let y1 = (-sqrt_2u + sqrt_disc1) / 2.0;
            let y2 = (-sqrt_2u - sqrt_disc1) / 2.0;
            let t1 = y1 - a_norm / 4.0;
            let t2 = y2 - a_norm / 4.0;
            if t1 >= 0.0 && t1 < best_t { best_t = t1; }
            if t2 >= 0.0 && t2 < best_t { best_t = t2; }
        }

        // Second quadratic: y^2 - sqrt_2u*y + (alpha - beta)/2 = 0
        let disc2 = sqrt_2u * sqrt_2u - 2.0 * (alpha - beta);
        if disc2 >= 0.0 {
            let sqrt_disc2 = sqrt(disc2);
            let y3 = (sqrt_2u + sqrt_disc2) / 2.0;
            let y4 = (sqrt_2u - sqrt_disc2) / 2.0;
            let t3 = y3 - a_norm / 4.0;
            let t4 = y4 - a_norm / 4.0;
            if t3 >= 0.0 && t3 < best_t { best_t = t3; }
            if t4 >= 0.0 && t4 < best_t { best_t = t4; }
        }
    } else {
        // Biquadratic case: y^4 + p*y^2 + rr = 0
        let disc = p * p - 4.0 * rr;
        if disc >= 0.0 {
            let sqrt_disc = sqrt(disc);
            let y2_1 = (-p + sqrt_disc) / 2.0;
            let y2_2 = (-p - sqrt_disc) / 2.0;

            if y2_1 >= 0.0 {
                let y = sqrt(y2_1);
                let t1 = y - a_norm / 4.0;
                let t2 = -y - a_norm / 4.0;
                if t1 >= 0.0 && t1 < best_t { best_t = t1; }
                if t2 >= 0.0 && t2 < best_t { best_t = t2; }
            }
            if y2_2 >= 0.0 {
                let y = sqrt(y2_2);
                let t3 = y - a_norm / 4.0;
                let t4 = -y - a_norm / 4.0;
                if t3 >= 0.0 && t3 < best_t { best_t = t3; }
                if t4 >= 0.0 && t4 < best_t { best_t = t4; }
            }
        }
    }

    if best_t < MAX_T {
        hit.t = best_t;
        // Compute UV
        let point = origin + best_t * dir;
        let y_dir = cross(axis, ref_dir);
        let to_point = point - center;
        let h = dot(to_point, axis);
        let proj = to_point - h * axis;
        let proj_len = length(proj);

        // u = toroidal angle
        var u_angle = 0.0;
        if proj_len > EPSILON {
            let x = dot(proj, ref_dir) / proj_len;
            let y = dot(proj, y_dir) / proj_len;
            u_angle = atan2(y, x);
            if u_angle < 0.0 { u_angle += 2.0 * PI; }
        }

        // v = poloidal angle
        let tube_center_dist = proj_len - R;
        var v_angle = atan2(h, tube_center_dist);
        if v_angle < 0.0 { v_angle += 2.0 * PI; }

        hit.uv = vec2<f32>(u_angle, v_angle);
    }

    return hit;
}

fn intersect_surface(origin: vec3<f32>, dir: vec3<f32>, surface_idx: u32) -> RayHit {
    let surface = surfaces[surface_idx];

    switch surface.surface_type {
        case SURFACE_PLANE: {
            return intersect_plane(origin, dir, surface.params);
        }
        case SURFACE_SPHERE: {
            return intersect_sphere(origin, dir, surface.params);
        }
        case SURFACE_CYLINDER: {
            return intersect_cylinder(origin, dir, surface.params);
        }
        case SURFACE_CONE: {
            return intersect_cone(origin, dir, surface.params);
        }
        case SURFACE_TORUS: {
            return intersect_torus(origin, dir, surface.params);
        }
        default: {
            var hit: RayHit;
            hit.t = MAX_T;
            hit.face_idx = 0xFFFFFFFFu;
            return hit;
        }
    }
}

// Compute winding number for a single polygon
fn winding_number_polygon(uv: vec2<f32>, start: u32, count: u32) -> i32 {
    if count < 3u {
        return 0;
    }

    var winding: i32 = 0;

    for (var i = 0u; i < count; i++) {
        let p1 = trim_verts[start + i];
        let p2 = trim_verts[start + ((i + 1u) % count)];

        if p1.y <= uv.y {
            if p2.y > uv.y {
                let cross_val = (p2.x - p1.x) * (uv.y - p1.y) - (uv.x - p1.x) * (p2.y - p1.y);
                if cross_val > 0.0 {
                    winding++;
                }
            }
        } else {
            if p2.y <= uv.y {
                let cross_val = (p2.x - p1.x) * (uv.y - p1.y) - (uv.x - p1.x) * (p2.y - p1.y);
                if cross_val < 0.0 {
                    winding--;
                }
            }
        }
    }

    return winding;
}

// Simple AABB check for outer loop (for debugging)
fn uv_in_trim_bounds(uv: vec2<f32>, start: u32, count: u32) -> bool {
    if count == 0u {
        return false;
    }

    var min_uv = trim_verts[start];
    var max_uv = trim_verts[start];

    for (var i = 1u; i < count; i++) {
        let v = trim_verts[start + i];
        min_uv = min(min_uv, v);
        max_uv = max(max_uv, v);
    }

    // Add small epsilon for numerical tolerance
    let eps = 0.001;
    return uv.x >= min_uv.x - eps && uv.x <= max_uv.x + eps &&
           uv.y >= min_uv.y - eps && uv.y <= max_uv.y + eps;
}

// Point-in-polygon test with inner loops (holes)
fn point_in_face(uv: vec2<f32>, face_idx: u32) -> bool {
    let face = faces[face_idx];

    // Check outer loop - point must be inside
    if face.trim_count < 3u {
        // For faces with < 3 trim vertices (e.g., full cylinder walls),
        // the 2 vertices define a v-range (height bounds).
        // The u-coordinate wraps around 0 to 2π.
        if face.trim_count == 2u {
            let v1 = trim_verts[face.trim_start];
            let v2 = trim_verts[face.trim_start + 1u];
            let v_min = min(v1.y, v2.y);
            let v_max = max(v1.y, v2.y);
            // Check v is in range (u is assumed valid for full wrap-around)
            return uv.y >= v_min && uv.y <= v_max;
        }
        // For 0 or 1 vertices, reject
        return false;
    }

    // Quick AABB rejection before expensive winding number test
    if !uv_in_trim_bounds(uv, face.trim_start, face.trim_count) {
        return false;
    }

    // Winding number test for proper polygon boundary
    let outer_winding = winding_number_polygon(uv, face.trim_start, face.trim_count);
    if outer_winding == 0 {
        return false; // Outside outer boundary
    }

    // Check inner loops (holes) - point must be outside all holes
    if face.inner_loop_count > 0u {
        var inner_offset = face.inner_start;
        for (var loop_idx = 0u; loop_idx < face.inner_loop_count; loop_idx++) {
            let loop_size = inner_loop_descs[face.inner_desc_start + loop_idx];
            if loop_size >= 3u {
                let inner_winding = winding_number_polygon(uv, inner_offset, loop_size);
                if inner_winding != 0 {
                    return false; // Inside a hole
                }
            }
            inner_offset += loop_size;
        }
    }

    return true;
}

// Debug: trace with bounds checking but without BVH
fn trace_debug(origin: vec3<f32>, dir: vec3<f32>) -> RayHit {
    var best_hit: RayHit;
    best_hit.t = MAX_T;
    best_hit.face_idx = 0xFFFFFFFFu;

    let num_faces = arrayLength(&faces);
    for (var i = 0u; i < num_faces; i++) {
        let face = faces[i];
        let hit = intersect_surface(origin, dir, face.surface_idx);
        if hit.t > EPSILON && hit.t < best_hit.t {
            // Apply bounds checking to reject hits outside face boundary
            if point_in_face(hit.uv, i) {
                best_hit = hit;
                best_hit.face_idx = i;
            }
        }
    }

    return best_hit;
}

// BVH traversal
fn trace_bvh(origin: vec3<f32>, dir: vec3<f32>) -> RayHit {
    var best_hit: RayHit;
    best_hit.t = MAX_T;
    best_hit.face_idx = 0xFFFFFFFFu;

    let inv_dir = 1.0 / dir;

    // Stack-based traversal
    var stack: array<u32, 32>;
    var stack_ptr = 0;
    stack[0] = 0u; // Root node
    stack_ptr = 1;

    while stack_ptr > 0 {
        stack_ptr--;
        let node_idx = stack[stack_ptr];
        let node = bvh_nodes[node_idx];

        // Test AABB
        let t_range = intersect_aabb(origin, inv_dir, node.aabb_min.xyz, node.aabb_max.xyz);
        if t_range.y < 0.0 || t_range.x > t_range.y || t_range.x > best_hit.t {
            continue;
        }

        if node.is_leaf == 1u {
            // Leaf node: test faces
            for (var i = 0u; i < node.right_or_count; i++) {
                let face_idx = node.left_or_first + i;
                let face = faces[face_idx];

                let hit = intersect_surface(origin, dir, face.surface_idx);
                if hit.t < best_hit.t && hit.t > 0.0 {
                    // Use proper UV-based point-in-polygon test
                    if point_in_face(hit.uv, face_idx) {
                        best_hit = hit;
                        best_hit.face_idx = face_idx;
                    }
                }
            }
        } else {
            // Internal node: push children
            if stack_ptr < 31 {
                stack[stack_ptr] = node.left_or_first;
                stack_ptr++;
            }
            if stack_ptr < 31 {
                stack[stack_ptr] = node.right_or_count;
                stack_ptr++;
            }
        }
    }

    return best_hit;
}

// Compute surface normal at hit point
fn compute_normal(hit: RayHit) -> vec3<f32> {
    let face = faces[hit.face_idx];
    let surface = surfaces[face.surface_idx];

    var normal: vec3<f32>;

    switch surface.surface_type {
        case SURFACE_PLANE: {
            normal = vec3<f32>(surface.params[9], surface.params[10], surface.params[11]);
        }
        case SURFACE_SPHERE: {
            let center = vec3<f32>(surface.params[0], surface.params[1], surface.params[2]);
            let ref_dir = vec3<f32>(surface.params[4], surface.params[5], surface.params[6]);
            let axis = vec3<f32>(surface.params[7], surface.params[8], surface.params[9]);
            let y_dir = cross(axis, ref_dir);

            let u = hit.uv.x;
            let v = hit.uv.y;
            let cos_v = cos(v);
            let sin_v = sin(v);
            let cos_u = cos(u);
            let sin_u = sin(u);

            normal = cos_v * (cos_u * ref_dir + sin_u * y_dir) + sin_v * axis;
        }
        case SURFACE_CYLINDER: {
            let ref_dir = vec3<f32>(surface.params[6], surface.params[7], surface.params[8]);
            let axis = vec3<f32>(surface.params[3], surface.params[4], surface.params[5]);
            let y_dir = cross(axis, ref_dir);

            let u = hit.uv.x;
            let cos_u = cos(u);
            let sin_u = sin(u);

            normal = cos_u * ref_dir + sin_u * y_dir;
        }
        case SURFACE_CONE: {
            // Cone: apex (3), axis (3), ref_dir (3), half_angle (1)
            let axis = vec3<f32>(surface.params[3], surface.params[4], surface.params[5]);
            let ref_dir = vec3<f32>(surface.params[6], surface.params[7], surface.params[8]);
            let half_angle = surface.params[9];
            let y_dir = cross(axis, ref_dir);

            let u = hit.uv.x;
            let cos_u = cos(u);
            let sin_u = sin(u);
            let cos_a = cos(half_angle);
            let sin_a = sin(half_angle);

            // Normal points outward from cone surface
            // Radial direction at angle u
            let radial = cos_u * ref_dir + sin_u * y_dir;
            // Normal = radial * cos(half_angle) - axis * sin(half_angle)
            normal = radial * cos_a - axis * sin_a;
        }
        case SURFACE_TORUS: {
            // Torus: center (3), axis (3), ref_dir (3), R (1), r (1)
            let center = vec3<f32>(surface.params[0], surface.params[1], surface.params[2]);
            let axis = vec3<f32>(surface.params[3], surface.params[4], surface.params[5]);
            let ref_dir = vec3<f32>(surface.params[6], surface.params[7], surface.params[8]);
            let R = surface.params[9];
            let y_dir = cross(axis, ref_dir);

            let u = hit.uv.x;
            let v = hit.uv.y;
            let cos_u = cos(u);
            let sin_u = sin(u);
            let cos_v = cos(v);
            let sin_v = sin(v);

            // Direction from center to tube center at angle u
            let tube_dir = cos_u * ref_dir + sin_u * y_dir;
            // Normal at poloidal angle v
            normal = tube_dir * cos_v + axis * sin_v;
        }
        default: {
            normal = vec3<f32>(0.0, 0.0, 1.0);
        }
    }

    // Apply face orientation
    if face.orientation == 1u {
        normal = -normal;
    }

    return normalize(normal);
}

// Fresnel-Schlick approximation
fn fresnel_schlick(cos_theta: f32, f0: vec3<f32>) -> vec3<f32> {
    return f0 + (1.0 - f0) * pow(1.0 - cos_theta, 5.0);
}

// GGX/Trowbridge-Reitz normal distribution
fn distribution_ggx(n_dot_h: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let denom = n_dot_h * n_dot_h * (a2 - 1.0) + 1.0;
    return a2 / (PI * denom * denom);
}

// Smith geometry function (GGX)
fn geometry_smith(n_dot_v: f32, n_dot_l: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    let ggx_v = n_dot_v / (n_dot_v * (1.0 - k) + k);
    let ggx_l = n_dot_l / (n_dot_l * (1.0 - k) + k);
    return ggx_v * ggx_l;
}

// PBR shading with Cook-Torrance BRDF
fn shade(hit: RayHit, dir: vec3<f32>) -> vec4<f32> {
    if hit.face_idx == 0xFFFFFFFFu {
        // Background color (sky blue gradient)
        let t = dir.y * 0.5 + 0.5;
        return mix(vec4<f32>(0.3, 0.4, 0.5, 1.0), vec4<f32>(0.6, 0.7, 0.9, 1.0), t);
    }

    // Get material
    let face = faces[hit.face_idx];
    let mat = materials[face.material_idx];
    let albedo = mat.color.rgb;
    let metallic = mat.metallic;
    let roughness = max(mat.roughness, 0.04); // Avoid division by zero

    // Compute normal and view direction
    let normal = compute_normal(hit);
    let view_dir = -dir;

    // Light setup (two lights for better coverage)
    let light_dir1 = normalize(vec3<f32>(0.5, 0.8, 0.3));
    let light_dir2 = normalize(vec3<f32>(-0.3, 0.4, -0.5));
    let light_color = vec3<f32>(1.0, 0.98, 0.95); // Warm white
    let light_intensity1 = 1.0;
    let light_intensity2 = 0.3;

    // F0 for Fresnel (0.04 for dielectrics, albedo for metals)
    let f0 = mix(vec3<f32>(0.04, 0.04, 0.04), albedo, metallic);

    // Ambient term (simple hemisphere)
    let ambient_sky = vec3<f32>(0.4, 0.45, 0.5);
    let ambient_ground = vec3<f32>(0.15, 0.12, 0.1);
    let ambient_factor = normal.y * 0.5 + 0.5;
    let ambient = mix(ambient_ground, ambient_sky, ambient_factor) * albedo * 0.2;

    var lo = vec3<f32>(0.0);

    // First light
    {
        let halfway = normalize(view_dir + light_dir1);
        let n_dot_v = max(dot(normal, view_dir), 0.001);
        let n_dot_l = max(dot(normal, light_dir1), 0.0);
        let n_dot_h = max(dot(normal, halfway), 0.0);
        let h_dot_v = max(dot(halfway, view_dir), 0.0);

        // Cook-Torrance BRDF
        let d = distribution_ggx(n_dot_h, roughness);
        let g = geometry_smith(n_dot_v, n_dot_l, roughness);
        let f = fresnel_schlick(h_dot_v, f0);

        let specular = (d * g * f) / (4.0 * n_dot_v * n_dot_l + 0.001);
        let kd = (1.0 - f) * (1.0 - metallic);
        let diffuse = kd * albedo / PI;

        lo += (diffuse + specular) * light_color * light_intensity1 * n_dot_l;
    }

    // Second light (fill)
    {
        let halfway = normalize(view_dir + light_dir2);
        let n_dot_v = max(dot(normal, view_dir), 0.001);
        let n_dot_l = max(dot(normal, light_dir2), 0.0);
        let n_dot_h = max(dot(normal, halfway), 0.0);
        let h_dot_v = max(dot(halfway, view_dir), 0.0);

        let d = distribution_ggx(n_dot_h, roughness);
        let g = geometry_smith(n_dot_v, n_dot_l, roughness);
        let f = fresnel_schlick(h_dot_v, f0);

        let specular = (d * g * f) / (4.0 * n_dot_v * n_dot_l + 0.001);
        let kd = (1.0 - f) * (1.0 - metallic);
        let diffuse = kd * albedo / PI;

        lo += (diffuse + specular) * light_color * light_intensity2 * n_dot_l;
    }

    // Combine ambient and direct lighting
    var color = ambient + lo;

    // Tone mapping (simple Reinhard)
    color = color / (color + vec3<f32>(1.0));

    // Gamma correction
    color = pow(color, vec3<f32>(1.0 / 2.2));

    return vec4<f32>(color, 1.0);
}

// Compute depth and normal for a pixel
fn trace_depth_normal(pixel: vec2<u32>) -> vec4<f32> {
    let ray = ray_origin_and_direction(pixel);
    let origin = ray[0];
    let dir = ray[1];

    let hit = trace_bvh(origin, dir);

    if hit.face_idx == 0xFFFFFFFFu {
        // Background: max depth, zero normal
        return vec4<f32>(0.0, 0.0, 0.0, MAX_T);
    }

    let normal = compute_normal(hit);
    return vec4<f32>(normal, hit.t);
}

// Detect edges based on depth and normal discontinuity
fn detect_edge(pixel_coord: vec2<i32>, center_depth_normal: vec4<f32>) -> f32 {
    let depth_threshold = render_state.edge_depth_threshold;
    let normal_threshold_cos = cos(radians(render_state.edge_normal_threshold));

    let center_normal = center_depth_normal.xyz;
    let center_depth = center_depth_normal.w;

    // Sample neighbors (4-connected)
    let offsets = array<vec2<i32>, 4>(
        vec2<i32>(-1, 0),
        vec2<i32>(1, 0),
        vec2<i32>(0, -1),
        vec2<i32>(0, 1)
    );

    var edge_strength = 0.0;

    for (var i = 0; i < 4; i++) {
        let neighbor_coord = pixel_coord + offsets[i];

        // Bounds check
        if neighbor_coord.x < 0 || neighbor_coord.x >= i32(camera.width) ||
           neighbor_coord.y < 0 || neighbor_coord.y >= i32(camera.height) {
            continue;
        }

        let neighbor = depth_normal_buffer[pixel_index_i32(neighbor_coord)];
        let neighbor_normal = neighbor.xyz;
        let neighbor_depth = neighbor.w;

        // Depth discontinuity
        let depth_diff = abs(center_depth - neighbor_depth) / max(center_depth, 0.1);
        if depth_diff > depth_threshold {
            edge_strength = max(edge_strength, clamp(depth_diff * 2.0, 0.0, 1.0));
        }

        // Normal discontinuity (silhouette edges)
        if length(center_normal) > 0.5 && length(neighbor_normal) > 0.5 {
            let normal_dot = dot(normalize(center_normal), normalize(neighbor_normal));
            if normal_dot < normal_threshold_cos {
                let normal_edge = 1.0 - normal_dot;
                edge_strength = max(edge_strength, clamp(normal_edge, 0.0, 1.0));
            }
        }

        // Background boundary (silhouette)
        if (center_depth < MAX_T - 1.0 && neighbor_depth > MAX_T - 1.0) ||
           (center_depth > MAX_T - 1.0 && neighbor_depth < MAX_T - 1.0) {
            edge_strength = 1.0;
        }
    }

    return edge_strength;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pixel = global_id.xy;

    if pixel.x >= camera.width || pixel.y >= camera.height {
        return;
    }

    let ray = ray_origin_and_direction(pixel);
    let origin = ray[0];
    let dir = ray[1];

    // Trace ray using BVH acceleration
    let hit = trace_bvh(origin, dir);
    let new_color = shade(hit, dir);

    // Store depth and normal for edge detection
    let pixel_coord = vec2<i32>(pixel);
    var depth_normal: vec4<f32>;
    if hit.face_idx == 0xFFFFFFFFu {
        depth_normal = vec4<f32>(0.0, 0.0, 0.0, MAX_T);
    } else {
        let normal = compute_normal(hit);
        depth_normal = vec4<f32>(normal, hit.t);
    }

    // Always store depth/normal on first frame
    if render_state.frame_index <= 1u {
        depth_normal_buffer[pixel_index_i32(pixel_coord)] = depth_normal;
    }

    // Progressive accumulation
    var accumulated: vec4<f32>;

    if render_state.frame_index <= 1u {
        // First frame: start fresh
        accumulated = new_color;
    } else {
        // Blend with previous samples using running average
        let prev = accum_buffer[pixel_index_i32(pixel_coord)];
        let weight = 1.0 / f32(render_state.frame_index);
        accumulated = mix(prev, new_color, weight);
    }

    // Apply edge detection on later frames (when we have stable depth/normal data)
    var final_color = accumulated;
    if render_state.enable_edges == 1u && render_state.frame_index >= 2u {
        let stored_depth_normal = depth_normal_buffer[pixel_index_i32(pixel_coord)];
        let edge = detect_edge(pixel_coord, stored_depth_normal);
        if edge > 0.1 {
            // Darken edges
            let edge_color = vec4<f32>(0.1, 0.1, 0.12, 1.0);
            final_color = mix(accumulated, edge_color, edge * 0.8);
        }
    }

    // Store to accumulation buffer and output
    accum_buffer[pixel_index_i32(pixel_coord)] = accumulated;
    textureStore(output, pixel_coord, final_color);
}
