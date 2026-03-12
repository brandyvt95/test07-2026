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
    Vector3,
    Group,
    AmbientLight,
    DirectionalLight,
    Box3,
} from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Controls } from './Controls.js';
import { BillboardHUD } from './BillboardHUD.js';
import { RayInteraction } from './RayInteraction.js';
import { NavigationUI } from './NavigationUI.js';
import { GradientEquirectTexture } from 'three-gpu-pathtracer';
import { PathTracingManager } from './PathTracingManager.js';

import { params, orthoWidth } from './params.js';
import { state } from './state.js';
import { LoaderElement } from '../utils/LoaderElement.js';
import { generateRadialFloorTexture } from '../utils/generateRadialFloorTexture.js';
import { onResize, updateCameraProjection, updateEnvMap } from './utils.js';
import { processGlb } from './GlbProcessor.js';
import { RenderManager } from './RenderManager.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { customizer } from './Customizer.js';
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

    // Fetch the scenegraph config
    try {
        const response = await fetch('/assets/scenegraph.json');
        const config = await response.json();
        state.models = config.models.reduce((acc, m) => {
            acc[m.id || m.name] = m;
            return acc;
        }, {});
        state.logger.log("SCENEGRAPH CONFIG LOADED.");
    } catch (err) {
        state.logger.log("FAILED TO LOAD SCENEGRAPH JSON: " + err.message);
        state.models = window.MODEL_LIST || {};
    }

    state.loader = new LoaderElement();
    state.loader.attach(document.body);

    // 1. renderer
    state.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, stencil: true });
    state.renderer.toneMapping = ACESFilmicToneMapping;
    document.body.appendChild(state.renderer.domElement);
    state.logger.log("WEBGL RENDERER INITIALIZED.");

    // 2. scene
    state.scene = new Scene();

    // Standard Lighting
    const ambient = new AmbientLight(0xffffff, 1.5);
    ambient.layers.enable(1); // Enable for HUD
    state.scene.add(ambient);

    const sun = new DirectionalLight(0xffffff, 4.0);
    sun.position.set(5, 10, 7);
    sun.layers.enable(1); // Enable for HUD
    state.scene.add(sun);

    const fill = new DirectionalLight(0xffffff, 2.0);
    fill.position.set(-5, 0, -5);
    fill.layers.enable(1); // Enable for HUD
    state.scene.add(fill);

    // 4. path tracer manager
    state.ptManager = new PathTracingManager(state.renderer);

    // camera
    const aspect = window.innerWidth / window.innerHeight;
    state.perspectiveCamera = new PerspectiveCamera(60, aspect, 0.025, 50000);
    state.perspectiveCamera.position.set(- 1, 0.25, 1);
    state.scene.add(state.perspectiveCamera); // Added to allow camera-space children (HUD)

    const orthoHeight = orthoWidth / aspect;
    state.orthoCamera = new OrthographicCamera(orthoWidth / - 2, orthoWidth / 2, orthoHeight / 2, orthoHeight / - 2, 0, 100);
    state.orthoCamera.position.set(- 1, 0.25, 1);

    // background map
    state.gradientMap = new GradientEquirectTexture();
    state.gradientMap.topColor.set(params.bgGradientTop);
    state.gradientMap.bottomColor.set(params.bgGradientBottom);
    state.gradientMap.update();

    // Interaction and HUD system
    state.controls = new Controls(state.perspectiveCamera, state.renderer.domElement);
    state.billboard = new BillboardHUD(state.perspectiveCamera);
    state.ray = new RayInteraction(state.perspectiveCamera, state.renderer.domElement);
    await state.ray.init();
    state.nav = new NavigationUI();

    await customizer.init();



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
    state.floorPlane.layers.enable(1); // Enable for HUD
    state.scene.add(state.floorPlane);

    state.stats = new Stats();
    document.body.appendChild(state.stats.dom);

    state.renderManager = new RenderManager();
    state.perfMonitor = new PerformanceMonitor(state);

    updateCameraProjection(params.cameraProjection);


    // Performance and Asset Load Tracking
    const loadStartTime = performance.now();
    state.logger.log("LOADING 3D ASSETS AND ENV-MAP...");
    await processGlb();
    if (state.nav) state.nav.refresh();
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

    // ── Update Controls (Lerp) ──────────────────────────────────────────────
    if (state.controls?.update) {
        state.controls.update(0.016);
    }

    if (state.billboard?.update) {
        state.billboard.update(performance.now());
    }



    // Update performance monitor
    state.perfMonitor.update();
    state.stats.update();

    if (!state.perfMonitor.shouldRender()) return;

    if (params.enable) {
        if (!params.pause || state.ptManager.samples < 1) {
            state.ptManager.renderSample();
        }
    } else {
        state.renderer.autoClear = true;
        state.renderer.render(state.scene, state.perspectiveCamera || state.activeCamera);
    }

    if (state.loader && state.ptManager) {
        state.loader.setSamples(state.ptManager.samples, state.ptManager.isCompiling);
    }
}


init();
