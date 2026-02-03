//! Adaptive clearing toolpath generation.
//!
//! Adaptive clearing maintains constant tool engagement by varying the
//! toolpath density based on material conditions. This reduces tool wear,
//! improves surface finish, and allows higher material removal rates.
//!
//! # Key Concepts
//!
//! - **Radial Engagement**: The arc angle where the tool contacts material
//! - **Target Engagement**: Desired engagement angle (typically 40-90 degrees)
//! - **Trochoidal Motion**: Circular loops used when engagement is too high

mod engagement;
mod trochoidal;

pub use engagement::{compute_engagement, EngagementResult};
pub use trochoidal::{generate_trochoidal, TrochoidalParams};

use serde::{Deserialize, Serialize};

/// Parameters for adaptive clearing operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveParams {
    /// Target engagement angle in radians (typical: 0.7-1.5).
    pub target_engagement: f64,
    /// Maximum engagement before switching to trochoidal (radians).
    pub max_engagement: f64,
    /// Stepdown per Z level (mm).
    pub stepdown: f64,
    /// Ramp angle for entry moves (degrees).
    pub ramp_angle: f64,
    /// Minimum arc radius for transitions (mm).
    pub min_arc_radius: f64,
    /// Lift amount for transitions between passes (mm).
    pub lift_height: f64,
}

impl Default for AdaptiveParams {
    fn default() -> Self {
        Self {
            target_engagement: 1.05, // ~60 degrees
            max_engagement: 1.57,    // 90 degrees
            stepdown: 3.0,
            ramp_angle: 3.0,
            min_arc_radius: 0.5,
            lift_height: 0.5,
        }
    }
}

impl AdaptiveParams {
    /// Create new adaptive parameters.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set target engagement angle in degrees.
    pub fn with_target_engagement_deg(mut self, degrees: f64) -> Self {
        self.target_engagement = degrees.to_radians();
        self
    }

    /// Set maximum engagement angle in degrees.
    pub fn with_max_engagement_deg(mut self, degrees: f64) -> Self {
        self.max_engagement = degrees.to_radians();
        self
    }

    /// Set stepdown.
    pub fn with_stepdown(mut self, stepdown: f64) -> Self {
        self.stepdown = stepdown;
        self
    }

    /// Set ramp angle in degrees.
    pub fn with_ramp_angle(mut self, degrees: f64) -> Self {
        self.ramp_angle = degrees;
        self
    }
}

/// Direction of adaptive clearing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClearingDirection {
    /// Climb milling (conventional for pockets).
    Climb,
    /// Conventional milling.
    Conventional,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adaptive_params_default() {
        let params = AdaptiveParams::default();
        assert!(params.target_engagement > 0.0);
        assert!(params.max_engagement > params.target_engagement);
        assert!(params.stepdown > 0.0);
    }

    #[test]
    fn test_adaptive_params_builder() {
        let params = AdaptiveParams::new()
            .with_target_engagement_deg(45.0)
            .with_max_engagement_deg(90.0)
            .with_stepdown(2.5);

        assert!((params.target_engagement - 0.785).abs() < 0.01); // 45 deg in radians
        assert!((params.max_engagement - 1.571).abs() < 0.01); // 90 deg in radians
        assert!((params.stepdown - 2.5).abs() < 1e-6);
    }
}
