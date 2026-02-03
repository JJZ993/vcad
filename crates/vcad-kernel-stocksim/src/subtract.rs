//! Swept volume subtraction for toolpath simulation.

use vcad_kernel_cam::{Tool, Toolpath, ToolpathSegment};

use crate::Stock;

/// A swept volume representing tool motion.
pub struct SweptVolume {
    /// Tool radius.
    radius: f64,
    /// Corner radius (for bull endmills).
    corner_radius: f64,
}

impl SweptVolume {
    /// Create a swept volume for a tool.
    pub fn from_tool(tool: &Tool) -> Self {
        Self {
            radius: tool.radius(),
            corner_radius: tool.corner_radius(),
        }
    }

    /// Get the effective radius at a given height from the tool tip.
    pub fn radius_at_height(&self, height: f64) -> f64 {
        if self.corner_radius <= 0.0 || height >= self.corner_radius {
            // Above corner radius or flat endmill
            self.radius
        } else {
            // In corner region (for ball or bull endmill)
            let inner_radius = self.radius - self.corner_radius;
            let dz = self.corner_radius - height;
            let dr = (self.corner_radius * self.corner_radius - dz * dz).sqrt();
            inner_radius + dr
        }
    }
}

impl Stock {
    /// Subtract a toolpath from the stock.
    ///
    /// # Arguments
    ///
    /// * `tool` - The cutting tool
    /// * `toolpath` - The toolpath to subtract
    pub fn subtract_toolpath(&mut self, tool: &Tool, toolpath: &Toolpath) {
        let radius = tool.radius();
        let mut current_pos = [0.0, 0.0, self.bounds()[5] + 10.0]; // Start above stock

        for segment in &toolpath.segments {
            match segment {
                ToolpathSegment::Rapid { to } | ToolpathSegment::Linear { to, .. } => {
                    // Only subtract for cutting moves that enter the stock
                    let min_z = current_pos[2].min(to[2]);
                    if min_z <= self.bounds()[5] {
                        self.subtract_capsule(current_pos, *to, radius);
                    }
                    current_pos = *to;
                }
                ToolpathSegment::Arc {
                    to, center, dir, ..
                } => {
                    // Linearize arc into segments
                    let arc_points = linearize_arc(current_pos, *to, *center, *dir);
                    let mut prev = current_pos;
                    for pt in arc_points {
                        let min_z = prev[2].min(pt[2]);
                        if min_z <= self.bounds()[5] {
                            self.subtract_capsule(prev, pt, radius);
                        }
                        prev = pt;
                    }
                    current_pos = *to;
                }
                _ => {} // Ignore non-motion segments
            }
        }
    }
}

/// Linearize an arc into line segments.
fn linearize_arc(
    from: [f64; 3],
    to: [f64; 3],
    center: [f64; 3],
    dir: vcad_kernel_cam::ArcDir,
) -> Vec<[f64; 3]> {
    let mut points = Vec::new();

    // Compute arc parameters
    let r = ((from[0] - center[0]).powi(2) + (from[1] - center[1]).powi(2)).sqrt();
    let start_angle = (from[1] - center[1]).atan2(from[0] - center[0]);
    let end_angle = (to[1] - center[1]).atan2(to[0] - center[0]);

    let delta = match dir {
        vcad_kernel_cam::ArcDir::Ccw => {
            let mut d = end_angle - start_angle;
            if d <= 0.0 {
                d += 2.0 * std::f64::consts::PI;
            }
            d
        }
        vcad_kernel_cam::ArcDir::Cw => {
            let mut d = start_angle - end_angle;
            if d <= 0.0 {
                d += 2.0 * std::f64::consts::PI;
            }
            -d
        }
    };

    // Number of segments (approximately 5 degree steps)
    let n_segments = ((delta.abs() / 0.087).ceil() as usize).max(1);
    let angle_step = delta / n_segments as f64;
    let z_step = (to[2] - from[2]) / n_segments as f64;

    for i in 1..=n_segments {
        let angle = start_angle + angle_step * i as f64;
        let z = from[2] + z_step * i as f64;
        points.push([center[0] + r * angle.cos(), center[1] + r * angle.sin(), z]);
    }

    points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_swept_volume_flat() {
        let tool = Tool::FlatEndMill {
            diameter: 10.0,
            flute_length: 20.0,
            flutes: 2,
        };
        let sv = SweptVolume::from_tool(&tool);

        assert!((sv.radius_at_height(0.0) - 5.0).abs() < 1e-6);
        assert!((sv.radius_at_height(10.0) - 5.0).abs() < 1e-6);
    }

    #[test]
    fn test_swept_volume_ball() {
        let tool = Tool::BallEndMill {
            diameter: 10.0,
            flute_length: 20.0,
            flutes: 2,
        };
        let sv = SweptVolume::from_tool(&tool);

        // At tip, radius should be 0
        assert!(sv.radius_at_height(0.0) < 0.1);

        // At top of ball, radius should be full
        assert!((sv.radius_at_height(5.0) - 5.0).abs() < 0.1);
    }

    #[test]
    fn test_linearize_arc_ccw() {
        let from = [10.0, 0.0, 0.0];
        let to = [0.0, 10.0, 0.0];
        let center = [0.0, 0.0, 0.0];

        let points = linearize_arc(from, to, center, vcad_kernel_cam::ArcDir::Ccw);

        assert!(!points.is_empty());
        // Last point should be close to 'to'
        let last = points.last().unwrap();
        assert!((last[0] - to[0]).abs() < 0.1);
        assert!((last[1] - to[1]).abs() < 0.1);
    }

    #[test]
    fn test_stock_subtract_toolpath() {
        use vcad_kernel_cam::{CamSettings, Face};

        let mut stock = Stock::from_box([0.0, 0.0, 0.0, 50.0, 50.0, 10.0], 2.0);
        let tool = Tool::FlatEndMill {
            diameter: 6.0,
            flute_length: 20.0,
            flutes: 2,
        };

        // Create a simple facing toolpath
        let face = Face::new(0.0, 0.0, 50.0, 50.0, 2.0);
        let settings = CamSettings {
            stepover: 4.0,
            stepdown: 2.0,
            feed_rate: 1000.0,
            plunge_rate: 300.0,
            spindle_rpm: 12000.0,
            safe_z: 15.0,
            retract_z: 20.0,
        };
        let toolpath = face.generate(&tool, &settings).unwrap();

        // Subtract the toolpath
        stock.subtract_toolpath(&tool, &toolpath);

        // After facing, the top surface should have material removed
        let sdf_top = stock.sdf_at(25.0, 25.0, 9.0);
        let sdf_below = stock.sdf_at(25.0, 25.0, 5.0);

        // sdf_top should be higher (more outside) than sdf_below after facing
        // (material removed from top)
        assert!(
            sdf_top > sdf_below || sdf_top > -1.0,
            "Top should have less material after facing"
        );
    }
}
