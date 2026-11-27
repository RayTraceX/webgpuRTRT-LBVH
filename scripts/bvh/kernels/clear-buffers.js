class ClearBuffer {

    // shader parameters
    WG_SIZE = 256

    device = null;

    BG_LAYOUT;
    PIPELINE;

    constructor( device ){

        if ( null == device ) {
            return false;
        }

        this.device = device;

        // create bind group layout, shader module and pipeline
        this.BG_LAYOUT = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "storage"
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "uniform"
                    }
                }
            ]
        })

        const SM = device.createShaderModule({
            code: this.SRC(),
            label: "init buffer shader module"
        })

        this.PIPELINE = device.createComputePipeline({
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.BG_LAYOUT]
            }),
            compute: {
                module: SM,
                entryPoint: "init_buffer"
            }
        })
    }

    BUFFER = null;
    UNIFORM_BUFFER;

    prepare_buffers( BUFFER, size ){

        if (BUFFER.size != 4 * size) {
            console.warn(`in clearbuffer: buffer size [ ${BUFFER.size} ] does not match requested size [ ${size} ]`)
            return
        }

        this.BUFFER = BUFFER;
        this.size = size;

        this.UNIFORM_BUFFER = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        // create the bind group
        this.BG = this.device.createBindGroup({
            layout: this.BG_LAYOUT,
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    resource: {
                        buffer: BUFFER
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    resource: {
                        buffer: this.UNIFORM_BUFFER
                    }
                }
            ]
        })
    }

    clear( value = 0) {
        this.init(value);
    }

    // initialize the index array
    init( value ) {

        const totalWG = Math.ceil(this.size / this.WG_SIZE);
        const wgX = Math.min(65535, Math.ceil(Math.sqrt(totalWG)));
        const wgY = Math.ceil(totalWG / wgX);
        this.device.queue.writeBuffer(this.UNIFORM_BUFFER, 0, new Uint32Array([this.size, value, wgX, 0]));
        //console.log("this.size:", this.size);

        const CE = this.device.createCommandEncoder()
        const  P = CE.beginComputePass()

        P.setPipeline(this.PIPELINE)
        P.setBindGroup(0, this.BG)
        P.dispatchWorkgroups(wgX, wgY, 1); 
        P.end()

        this.device.queue.submit([CE.finish()])
    }

    SRC() {
        return /* wgsl */ `

            struct Uniforms {
                num : i32,
                value : i32,
                wgX : i32,
                padding : i32
            };

            @group(0) @binding(0) var<storage, read_write> buffer : array<i32>;
            @group(0) @binding(1) var<uniform> uniforms : Uniforms;

            // set bvh in the buffer to 0, 0, 0, ...
            @compute @workgroup_size(${this.WG_SIZE})
            fn init_buffer(@builtin(workgroup_id) wid : vec3u, @builtin(local_invocation_id) lid : vec3u) { 
            
                let wg_flat : u32 = wid.x + wid.y * u32(uniforms.wgX);
                let idx : u32 = wg_flat * ${this.WG_SIZE} + lid.x;
                if (idx < u32(uniforms.num)) {
                    buffer[idx] = uniforms.value;
                }
            }
        `;
    }
}

