//! GPU context management for wgpu device and queue.

use std::sync::OnceLock;
use thiserror::Error;
use wgpu::{Device, Instance, Queue};

static GPU_CONTEXT: OnceLock<GpuContext> = OnceLock::new();

/// Errors that can occur during GPU operations.
#[derive(Debug, Error)]
pub enum GpuError {
    /// No compatible GPU adapter found.
    #[error("No compatible GPU adapter found")]
    NoAdapter,

    /// GPU context was already initialized.
    #[error("GPU context already initialized")]
    AlreadyInitialized,

    /// Failed to request GPU device.
    #[error("Failed to request GPU device: {0}")]
    DeviceRequest(#[from] wgpu::RequestDeviceError),

    /// Buffer mapping failed.
    #[error("Buffer mapping failed")]
    BufferMapping,

    /// GPU context not initialized.
    #[error("GPU context not initialized - call GpuContext::init() first")]
    NotInitialized,
}

/// Global GPU context holding device and queue.
pub struct GpuContext {
    /// The wgpu device for creating resources and pipelines.
    pub device: Device,
    /// The command queue for submitting work.
    pub queue: Queue,
}

impl GpuContext {
    /// Initialize the GPU context asynchronously.
    ///
    /// This should be called once at application startup. Subsequent calls
    /// will return the existing context.
    pub async fn init() -> Result<&'static Self, GpuError> {
        if let Some(ctx) = GPU_CONTEXT.get() {
            return Ok(ctx);
        }

        let instance = Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU | wgpu::Backends::GL,
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .ok_or(GpuError::NoAdapter)?;

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default(), None)
            .await?;

        GPU_CONTEXT
            .set(GpuContext { device, queue })
            .map_err(|_| GpuError::AlreadyInitialized)?;

        Ok(GPU_CONTEXT.get().unwrap())
    }

    /// Get the GPU context if it has been initialized.
    pub fn get() -> Option<&'static Self> {
        GPU_CONTEXT.get()
    }

    /// Get the GPU context, returning an error if not initialized.
    pub fn require() -> Result<&'static Self, GpuError> {
        GPU_CONTEXT.get().ok_or(GpuError::NotInitialized)
    }

    /// Initialize the GPU context synchronously (native only).
    #[cfg(not(target_arch = "wasm32"))]
    pub fn init_blocking() -> Result<&'static Self, GpuError> {
        pollster::block_on(Self::init())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires GPU"]
    fn test_gpu_init() {
        let ctx = GpuContext::init_blocking();
        assert!(ctx.is_ok() || matches!(ctx, Err(GpuError::NoAdapter)));
    }
}
