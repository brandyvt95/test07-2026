import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import { state } from './state.js';
import { params } from './params.js';

export class PathTracingManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.pt = new WebGLPathTracer(renderer);
        this.pt.setBVHWorker(new GenerateMeshBVHWorker());
        this.pt.physicallyCorrectLights = true;
        this.pt.transmissiveBounces = 10;

        this.init();
    }

    init() {
        this.pt.tiles.set(params.tiles, params.tiles);
        this.pt.multipleImportanceSampling = params.multipleImportanceSampling;
    }

    updateMaterials() {
        this.pt.updateMaterials();
    }

    updateEnvironment() {
        this.pt.updateEnvironment();
    }

    updateCamera() {
        this.pt.updateCamera();
    }

    reset() {
        this.pt.reset();
    }

    setCamera(camera) {
        this.pt.setCamera(camera);
    }

    async setSceneAsync(scene, camera, options) {
        await this.pt.setSceneAsync(scene, camera, options);
    }

    renderSample() {
        this.pt.renderSample();
    }

    get samples() {
        return this.pt.samples;
    }

    get isCompiling() {
        return this.pt.isCompiling;
    }

    // Proxy cho các thuộc tính cần thiết
    get tiles() { return this.pt.tiles; }
    set multipleImportanceSampling(v) { this.pt.multipleImportanceSampling = v; }
    set bounces(v) { this.pt.bounces = v; }
    set filterGlossyFactor(v) { this.pt.filterGlossyFactor = v; }
    set renderScale(v) { this.pt.renderScale = v; }
    set transmissiveBounces(v) { this.pt.transmissiveBounces = v; }
}


