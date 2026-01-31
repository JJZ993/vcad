//! wgpu compute pipeline for ray tracing.

#[cfg(feature = "gpu")]
use vcad_kernel_gpu::{GpuContext, GpuError};

#[cfg(feature = "gpu")]
use bytemuck::Zeroable;

#[cfg(feature = "gpu")]
use super::buffers::{GpuCamera, GpuScene};

#[cfg(not(feature = "gpu"))]
use super::buffers::GpuCamera;

/// Ray tracing compute pipeline.
///
/// Note: This requires the `gpu` feature to be enabled.
#[cfg(feature = "gpu")]
pub struct RayTracePipeline {
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

#[cfg(feature = "gpu")]
impl RayTracePipeline {
    /// Create a new ray trace pipeline.
    pub fn new(ctx: &GpuContext) -> Result<Self, GpuError> {
        let shader_module = ctx.device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Ray Trace Shader"),
            source: wgpu::ShaderSource::Wgsl(super::shaders::RAYTRACE_SHADER.into()),
        });

        let bind_group_layout = ctx.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Ray Trace Bind Group Layout"),
            entries: &[
                // Camera uniform
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Surfaces storage
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Faces storage
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // BVH nodes storage
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Trim vertices storage
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Output texture
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::Rgba8Unorm,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = ctx.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Ray Trace Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pipeline = ctx.device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Ray Trace Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader_module,
            entry_point: Some("main"),
            compilation_options: Default::default(),
            cache: None,
        });

        Ok(Self {
            pipeline,
            bind_group_layout,
        })
    }

    /// Render a scene to an output texture.
    pub fn render(
        &self,
        ctx: &GpuContext,
        scene: &GpuScene,
        camera: &GpuCamera,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>, GpuError> {
        use wgpu::util::DeviceExt;

        // Create camera buffer
        let camera_buffer = ctx.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Camera Buffer"),
            contents: bytemuck::bytes_of(camera),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        // Create scene buffers (with at least 1 element to avoid zero-size buffers)
        let surfaces = if scene.surfaces.is_empty() {
            vec![super::buffers::GpuSurface::zeroed()]
        } else {
            scene.surfaces.clone()
        };
        let surfaces_buffer = ctx.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Surfaces Buffer"),
            contents: bytemuck::cast_slice(&surfaces),
            usage: wgpu::BufferUsages::STORAGE,
        });

        let faces = if scene.faces.is_empty() {
            vec![super::buffers::GpuFace::zeroed()]
        } else {
            scene.faces.clone()
        };
        let faces_buffer = ctx.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Faces Buffer"),
            contents: bytemuck::cast_slice(&faces),
            usage: wgpu::BufferUsages::STORAGE,
        });

        let bvh_nodes = if scene.bvh_nodes.is_empty() {
            vec![super::buffers::GpuBvhNode::zeroed()]
        } else {
            scene.bvh_nodes.clone()
        };
        let bvh_buffer = ctx.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("BVH Buffer"),
            contents: bytemuck::cast_slice(&bvh_nodes),
            usage: wgpu::BufferUsages::STORAGE,
        });

        let trim_verts = if scene.trim_verts.is_empty() {
            vec![super::buffers::GpuVec2 { x: 0.0, y: 0.0 }]
        } else {
            scene.trim_verts.clone()
        };
        let trim_buffer = ctx.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Trim Buffer"),
            contents: bytemuck::cast_slice(&trim_verts),
            usage: wgpu::BufferUsages::STORAGE,
        });

        // Create output texture
        let output_texture = ctx.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Output Texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let output_view = output_texture.create_view(&Default::default());

        // Create readback buffer
        let output_size = (width * height * 4) as u64;
        let padded_bytes_per_row = (width * 4).div_ceil(256) * 256;
        let readback_buffer = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Readback Buffer"),
            size: (padded_bytes_per_row * height) as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        // Create bind group
        let bind_group = ctx.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Ray Trace Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: camera_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: surfaces_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: faces_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: bvh_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: trim_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(&output_view),
                },
            ],
        });

        // Dispatch compute shader
        let mut encoder = ctx.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Ray Trace Encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Ray Trace Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.dispatch_workgroups(width.div_ceil(8), height.div_ceil(8), 1);
        }

        // Copy texture to readback buffer
        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: &output_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &readback_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        ctx.queue.submit(Some(encoder.finish()));

        // Map and read buffer
        let buffer_slice = readback_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });
        ctx.device.poll(wgpu::Maintain::Wait);
        rx.recv().unwrap().map_err(|_| GpuError::BufferMapping)?;

        let data = buffer_slice.get_mapped_range();

        // Remove padding from rows
        let mut result = Vec::with_capacity(output_size as usize);
        for row in 0..height {
            let row_start = (row * padded_bytes_per_row) as usize;
            let row_end = row_start + (width * 4) as usize;
            result.extend_from_slice(&data[row_start..row_end]);
        }

        drop(data);
        readback_buffer.unmap();

        Ok(result)
    }
}

/// Stub for when GPU feature is not enabled.
#[cfg(not(feature = "gpu"))]
pub struct RayTracePipeline;

#[cfg(not(feature = "gpu"))]
impl RayTracePipeline {
    /// Returns an error when GPU feature is not enabled.
    pub fn new() -> Result<Self, String> {
        Err("GPU feature not enabled. Compile with --features gpu".to_string())
    }
}
