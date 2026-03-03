import { WebGLRenderTarget, PerspectiveCamera, ShaderMaterial, DoubleSide, LinearFilter, Vector2, Box3, Vector3 } from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { params } from './params.js';
import { state } from './state.js';

export class MinimapManager {
    constructor() {
        this.resolution = params.minimap.resolution;
        this.renderTarget = new WebGLRenderTarget(this.resolution, this.resolution, {
            magFilter: LinearFilter,
            minFilter: LinearFilter,
            generateMipmaps: false
        });

        this.camera = new PerspectiveCamera(params.minimap.fov, 1, 0.1, 1000);
        this.camera.layers.set(1); // Crucial for focused view

        this.controls = new OrbitControls(this.camera, state.renderer.domElement);
        this.controls.enabled = false;
        this.controls.enableDamping = true;

        this.camera.position.set(params.minimap.posX, params.minimap.posY, params.minimap.posZ);
        this.controls.target.set(params.minimap.targetX, params.minimap.targetY, params.minimap.targetZ);
        this.controls.update();

        this.material = new ShaderMaterial({
            uniforms: {
                tDiffuse: { value: this.renderTarget.texture },
                uFlipX: { value: params.minimap.flipX },
                uFlipY: { value: params.minimap.flipY }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform bool uFlipX;
                uniform bool uFlipY;
                varying vec2 vUv;
                void main() {
                    vec2 uv = vUv;
                    uv.x = 1.0 - uv.x;
                    uv.y = 1.0 - uv.y;
                    gl_FragColor = texture2D(tDiffuse, uv);
                }
            `,
            side: DoubleSide,
            transparent: true
        });

        this.initialized = false;
    }

    fitCameraToModel() {
        if (!state.model || !state.minimapGroup || this.initialized) return;

        // Combine Car (state.model) and Clones (state.minimapGroup) in one box
        const combinedBox = new Box3();
        combinedBox.setFromObject(state.model);
        combinedBox.expandByObject(state.minimapGroup);

        const center = new Vector3();
        combinedBox.getCenter(center);
        const size = new Vector3();
        combinedBox.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraDistance *= 2.2; // Zoom out a bit for better overview

        this.camera.position.set(center.x + cameraDistance, center.y + cameraDistance * 0.5, center.z + cameraDistance);
        this.controls.target.copy(center);
        this.controls.update();

        this.initialized = true;
    }


    updateCamera() {
        const p = params.minimap;
        this.camera.fov = p.fov;
        this.camera.aspect = 1;
        this.camera.layers.set(1);
        this.camera.updateProjectionMatrix();

        if (state.minimapGroup && !this.initialized) {
            this.fitCameraToModel();
        }
        this.controls.update();
    }

    setupMinimapMesh(model) {
        if (!model) return;
        model.traverse(child => {
            if (child.isMesh && child.name.toLowerCase().startsWith('minimap')) {
                child.material = this.material;
            }
        });
    }

    render() {
        if (!params.minimap.enabled || !state.renderer || !state.scene) return;

        if (this.resolution !== params.minimap.resolution) {
            this.resolution = params.minimap.resolution;
            this.renderTarget.setSize(this.resolution, this.resolution);
        }

        this.material.uniforms.uFlipX.value = params.minimap.flipX;
        this.material.uniforms.uFlipY.value = params.minimap.flipY;

        this.updateCamera();

        const currentTarget = state.renderer.getRenderTarget();
        const prevBackground = state.scene.background;

        state.scene.background = state.scene.environment;

        state.renderer.setRenderTarget(this.renderTarget);
        state.renderer.clear();
        state.renderer.render(state.scene, this.camera);

        state.renderer.setRenderTarget(currentTarget);
        state.scene.background = prevBackground;
    }
}
