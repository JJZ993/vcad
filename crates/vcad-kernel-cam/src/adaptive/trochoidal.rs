//! Trochoidal motion generation for high-engagement situations.
//!
//! Trochoidal milling uses circular loops to maintain constant engagement
//! when the direct path would cause excessive tool load.

use crate::operation::Point2D;

/// Parameters for trochoidal motion.
#[derive(Debug, Clone)]
pub struct TrochoidalParams {
    /// Loop diameter as fraction of tool diameter (typically 0.5-0.9).
    pub loop_diameter_ratio: f64,
    /// Stepover per loop (mm).
    pub stepover: f64,
    /// Points per loop for discretization.
    pub points_per_loop: usize,
}

impl Default for TrochoidalParams {
    fn default() -> Self {
        Self {
            loop_diameter_ratio: 0.7,
            stepover: 1.0,
            points_per_loop: 16,
        }
    }
}

/// Generate trochoidal toolpath from start to end.
///
/// # Arguments
///
/// * `start` - Start point
/// * `end` - End point
/// * `tool_radius` - Tool radius
/// * `params` - Trochoidal parameters
///
/// # Returns
///
/// Vector of points forming the trochoidal path.
pub fn generate_trochoidal(
    start: Point2D,
    end: Point2D,
    tool_radius: f64,
    params: &TrochoidalParams,
) -> Vec<Point2D> {
    let mut points = Vec::new();

    // Direction vector
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let distance = (dx * dx + dy * dy).sqrt();

    if distance < 1e-6 {
        return vec![start, end];
    }

    // Unit direction and perpendicular
    let ux = dx / distance;
    let uy = dy / distance;
    let px = -uy; // Perpendicular
    let py = ux;

    // Loop radius
    let loop_radius = tool_radius * params.loop_diameter_ratio;

    // Number of loops needed
    let n_loops = (distance / params.stepover).ceil() as usize;
    let actual_stepover = distance / n_loops as f64;

    points.push(start);

    for i in 0..n_loops {
        let loop_center_t = (i as f64 + 0.5) * actual_stepover;
        let cx = start.x + loop_center_t * ux;
        let cy = start.y + loop_center_t * uy;

        // Generate loop points
        for j in 0..params.points_per_loop {
            let angle = j as f64 * 2.0 * std::f64::consts::PI / params.points_per_loop as f64;
            // Add slight forward motion during loop
            let forward_offset = (angle / (2.0 * std::f64::consts::PI)) * actual_stepover;

            let x = cx + forward_offset * ux + loop_radius * angle.cos() * px
                - loop_radius * angle.sin() * ux;
            let y = cy + forward_offset * uy + loop_radius * angle.cos() * py
                - loop_radius * angle.sin() * uy;

            points.push(Point2D::new(x, y));
        }
    }

    points.push(end);

    // Simplify to remove redundant points
    simplify_path(&points, 0.01)
}

/// Generate a single trochoidal loop at a position.
///
/// # Arguments
///
/// * `center` - Center of the loop
/// * `radius` - Loop radius
/// * `entry_angle` - Starting angle (radians)
/// * `exit_angle` - Ending angle (radians)
/// * `n_points` - Number of points in the arc
///
/// # Returns
///
/// Vector of points forming the loop.
#[allow(dead_code)]
pub fn generate_loop(
    center: Point2D,
    radius: f64,
    entry_angle: f64,
    exit_angle: f64,
    n_points: usize,
) -> Vec<Point2D> {
    let mut points = Vec::with_capacity(n_points);

    let angle_span = exit_angle - entry_angle;
    let n = n_points.max(2);

    for i in 0..n {
        let t = i as f64 / (n - 1) as f64;
        let angle = entry_angle + t * angle_span;

        points.push(Point2D::new(
            center.x + radius * angle.cos(),
            center.y + radius * angle.sin(),
        ));
    }

    points
}

/// Simplify a path by removing points that are nearly collinear.
fn simplify_path(points: &[Point2D], tolerance: f64) -> Vec<Point2D> {
    if points.len() <= 2 {
        return points.to_vec();
    }

    let mut result = Vec::with_capacity(points.len());
    result.push(points[0]);

    for i in 1..points.len() - 1 {
        let prev = result.last().unwrap();
        let curr = &points[i];
        let next = &points[i + 1];

        // Check if curr is on the line from prev to next
        let dx = next.x - prev.x;
        let dy = next.y - prev.y;
        let len = (dx * dx + dy * dy).sqrt();

        if len < 1e-10 {
            result.push(*curr);
            continue;
        }

        // Distance from curr to line prev-next
        let t = ((curr.x - prev.x) * dx + (curr.y - prev.y) * dy) / (len * len);
        let closest_x = prev.x + t * dx;
        let closest_y = prev.y + t * dy;
        let dist = ((curr.x - closest_x).powi(2) + (curr.y - closest_y).powi(2)).sqrt();

        if dist > tolerance {
            result.push(*curr);
        }
    }

    result.push(*points.last().unwrap());
    result
}

/// Generate an arc transition between two points.
///
/// Creates a smooth arc rather than a sharp corner.
#[allow(dead_code)]
pub fn arc_transition(
    from: Point2D,
    to: Point2D,
    from_direction: Point2D,
    to_direction: Point2D,
    min_radius: f64,
) -> Vec<Point2D> {
    // Compute intersection point of the two direction lines
    // This gives us the "corner" to round

    let det = from_direction.x * to_direction.y - from_direction.y * to_direction.x;

    if det.abs() < 1e-10 {
        // Parallel directions, just return direct path
        return vec![from, to];
    }

    // For a proper arc transition, we need to find the arc center
    // For now, return a simple 3-point arc approximation

    let mid = Point2D::new((from.x + to.x) / 2.0, (from.y + to.y) / 2.0);

    // Offset the midpoint perpendicular to the line from-to
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let len = (dx * dx + dy * dy).sqrt();

    if len < min_radius * 2.0 {
        return vec![from, to];
    }

    let offset = min_radius * 0.5;
    let arc_mid = Point2D::new(mid.x - dy / len * offset, mid.y + dx / len * offset);

    vec![from, arc_mid, to]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_trochoidal() {
        let start = Point2D::new(0.0, 0.0);
        let end = Point2D::new(50.0, 0.0);
        let params = TrochoidalParams {
            loop_diameter_ratio: 0.7,
            stepover: 2.0,
            points_per_loop: 8,
        };

        let path = generate_trochoidal(start, end, 5.0, &params);

        // Should have more points than just start/end
        assert!(path.len() > 2);

        // First point should be start
        assert!((path[0].x - start.x).abs() < 1e-6);
        assert!((path[0].y - start.y).abs() < 1e-6);

        // Last point should be end
        let last = path.last().unwrap();
        assert!((last.x - end.x).abs() < 1e-6);
        assert!((last.y - end.y).abs() < 1e-6);
    }

    #[test]
    fn test_generate_loop() {
        let center = Point2D::new(0.0, 0.0);
        let loop_pts = generate_loop(center, 5.0, 0.0, std::f64::consts::PI, 5);

        assert_eq!(loop_pts.len(), 5);

        // First point should be at (5, 0)
        assert!((loop_pts[0].x - 5.0).abs() < 1e-6);
        assert!(loop_pts[0].y.abs() < 1e-6);

        // Last point should be at (-5, 0)
        assert!((loop_pts[4].x + 5.0).abs() < 1e-6);
        assert!(loop_pts[4].y.abs() < 1e-6);
    }

    #[test]
    fn test_simplify_path() {
        // Collinear points should be simplified
        let points = vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(5.0, 0.0),
            Point2D::new(10.0, 0.0),
        ];
        let simplified = simplify_path(&points, 0.01);
        assert_eq!(simplified.len(), 2);

        // Non-collinear points should be kept
        let points = vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(5.0, 5.0),
            Point2D::new(10.0, 0.0),
        ];
        let simplified = simplify_path(&points, 0.01);
        assert_eq!(simplified.len(), 3);
    }

    #[test]
    fn test_arc_transition() {
        let from = Point2D::new(0.0, 0.0);
        let to = Point2D::new(10.0, 10.0);
        let from_dir = Point2D::new(1.0, 0.0);
        let to_dir = Point2D::new(0.0, 1.0);

        let arc = arc_transition(from, to, from_dir, to_dir, 1.0);

        // Should have at least start and end
        assert!(arc.len() >= 2);
        assert!((arc[0].x - from.x).abs() < 1e-6);
        assert!((arc.last().unwrap().x - to.x).abs() < 1e-6);
    }
}
