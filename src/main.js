import {
    ACESFilmicToneMapping,
    DoubleSide,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    Scene,
    PerspectiveCamera,
    OrthographicCamera,
    WebGLRenderer,
} from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GradientEquirectTexture } from 'three-gpu-pathtracer';
import { PathTracingManager } from './PathTracingManager.js';

import { params, orthoWidth } from './params.js';
import { state } from './state.js';
import { LoaderElement } from '../utils/LoaderElement.js';
import { generateRadialFloorTexture } from '../utils/generateRadialFloorTexture.js';
import { onResize, updateCameraProjection, updateEnvMap } from './utils.js';
import { updateModel } from './modelActions.js';
import { ModelProcessor } from './ModelProcessor.js';
import { RenderManager } from './RenderManager.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { SelectionManager } from './SelectionManager.js';
import './renderStyles.css';

import { Logger } from './Logger.js';
import './loadingStyles.css';

async function waitFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

async function init() {
    // Initialize Logger Overlay
    state.logger = new Logger();
    state.logger.log("SYSTEM BOOTING...");

    while (!window.MODEL_LIST) {
        await waitFrame();
    }

    state.models = window.MODEL_LIST || {};
    state.logger.log("RESOURCE LIST IDENTIFIED.");

    state.loader = new LoaderElement();
    state.loader.attach(document.body);

    // 1. renderer
    state.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    state.renderer.toneMapping = ACESFilmicToneMapping;
    document.body.appendChild(state.renderer.domElement);
    state.logger.log("WEBGL RENDERER INITIALIZED.");

    // 2. scene
    state.scene = new Scene();

    // 3. Initial processor
    state.modelProcessor = new ModelProcessor(state.scene);

    // 4. path tracer manager
    state.ptManager = new PathTracingManager(state.renderer);

    // camera
    const aspect = window.innerWidth / window.innerHeight;
    state.perspectiveCamera = new PerspectiveCamera(60, aspect, 0.025, 500);
    state.perspectiveCamera.position.set(- 1, 0.25, 1);

    const orthoHeight = orthoWidth / aspect;
    state.orthoCamera = new OrthographicCamera(orthoWidth / - 2, orthoWidth / 2, orthoHeight / 2, orthoHeight / - 2, 0, 100);
    state.orthoCamera.position.set(- 1, 0.25, 1);

    // background map
    state.gradientMap = new GradientEquirectTexture();
    state.gradientMap.topColor.set(params.bgGradientTop);
    state.gradientMap.bottomColor.set(params.bgGradientBottom);
    state.gradientMap.update();

    // controls
    state.controls = new OrbitControls(state.perspectiveCamera, state.renderer.domElement);
    state.controls.addEventListener('change', () => {
        state.ptManager.updateCamera();
    });

    state.scene.background = state.gradientMap;

    const floorTex = generateRadialFloorTexture(2048);
    state.floorPlane = new Mesh(
        new PlaneGeometry(),
        new MeshStandardMaterial({
            map: floorTex,
            transparent: true,
            color: 0x111111,
            roughness: 0.1,
            metalness: 0.0,
            side: DoubleSide,
        })
    );
    state.floorPlane.scale.setScalar(5);
    state.floorPlane.rotation.x = - Math.PI / 2;
    state.scene.add(state.floorPlane);

    state.stats = new Stats();
    document.body.appendChild(state.stats.dom);

    state.renderManager = new RenderManager();
    state.perfMonitor = new PerformanceMonitor(state);
    state.selectionManager = new SelectionManager(state);

    updateCameraProjection(params.cameraProjection);


    // Performance and Asset Load Tracking
    const loadStartTime = performance.now();
    state.logger.log("LOADING 3D ASSETS AND ENV-MAP...");
    await updateModel();
    await updateEnvMap();
    const loadTime = ((performance.now() - loadStartTime) / 1000).toFixed(2);
    state.logger.log(`ASSETS READY IN ${loadTime}s`);


    // Start animation loop early so Performance Monitor can start measuring
    animate();

    state.logger.log("STARTING PERFORMANCE STRESS TEST (2s)...");
    await new Promise(r => setTimeout(r, 2000));

    const limitInfo = state.perfMonitor.isThrottled ? "Low Performance Detected: Throttling to 30 FPS" : "High Performance Detected: Running at 60 FPS";
    state.logger.log(limitInfo);

    onResize();

    // Final Fade
    await state.logger.hide();

    window.addEventListener('resize', onResize);
}


function animate() {
    requestAnimationFrame(animate);

    state.stats.update();

    if (!state.model || !state.ptManager) return;

    // Update performance monitor
    state.perfMonitor.update();

    // Check if we should render this frame (Performance Throttling)
    if (!state.perfMonitor.shouldRender()) return;

    if (params.enable) {
        if (!params.pause || state.ptManager.samples < 1) {
            state.ptManager.renderSample();
        }
    } else {
        state.renderer.render(state.scene, state.activeCamera);
    }

    state.loader.setSamples(state.ptManager.samples, state.ptManager.isCompiling);
}


init();
