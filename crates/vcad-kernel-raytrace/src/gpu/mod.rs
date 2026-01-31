//! GPU-accelerated ray tracing using wgpu compute shaders.
//!
//! This module provides WebGPU-based ray tracing that renders BRep surfaces
//! directly without tessellation.

mod pipeline;
mod buffers;
pub mod shaders;

pub use pipeline::RayTracePipeline;
pub use buffers::{GpuScene, GpuSceneError, GpuCamera, GpuSurface, GpuFace, GpuBvhNode, GpuVec2};
