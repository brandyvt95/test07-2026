import { ACESFilmicToneMapping, NoToneMapping } from 'three';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { params, envMaps } from './params.js';
import { state } from './state.js';
import { onParamsChange, updateEnvMap, updateCameraProjection } from './utils.js';
import { SceneGraph } from './SceneGraph.js';
import { updateModel } from './modelActions.js';

export function buildGui() {
    if (state.gui) {
        state.gui.destroy();
    }

    state.gui = new GUI();

    // No model selection since we only have one model

    // 1. Selection Settings
    const selectionFolder = state.gui.addFolder('Selection System');
    selectionFolder.add(params, 'raycastMode', ['Off', 'BVH', 'Standard']).name('Raycast Engine');
    selectionFolder.close();


    // 2. Performance & System
    const perfFolder = state.gui.addFolder('Performance & System');
    perfFolder.add(params, 'fpsLimitMode', ['Auto', '60 FPS', '30 FPS']).name('FPS Limit');
    perfFolder.add(params, 'enableDamping').name('Orbit Smoothing (Lerp)').onChange(v => {
        state.controls.enableDamping = v;
    });
    perfFolder.close();


    // 3. Standard Render (Rasterization)

    const standardFolder = state.gui.addFolder('Standard Render (WebGL)');
    standardFolder.add(params, 'acesToneMapping').name('ACES ToneMapping').onChange(v => {
        state.renderer.toneMapping = v ? ACESFilmicToneMapping : NoToneMapping;
    });
    standardFolder.add(params, 'standardResolutionScale', 0.1, 2.0, 0.1).name('Res Scale');
    standardFolder.close();

    // 3. Path Tracing (Interactive)
    const ptFolder = state.gui.addFolder('Path Tracing (Real-time)');
    ptFolder.add(params, 'enable').name('Enable PT');
    ptFolder.add(params, 'pause').name('Pause Accumulation');
    ptFolder.add(params, 'bounces', 1, 20, 1).onChange(onParamsChange);
    ptFolder.add(params, 'filterGlossyFactor', 0, 1).onChange(onParamsChange);
    ptFolder.add(params, 'renderScale', 0.1, 1.0, 0.01).name('Internal Scale').onChange(onParamsChange);
    ptFolder.add(params, 'multipleImportanceSampling').onChange(onParamsChange);
    ptFolder.close();

    // 4. Snapshot Configuration (Config for overlay buttons)
    const snapshotFolder = state.gui.addFolder('Snapshot Configuration');

    ['low', 'med', 'high'].forEach(level => {
        const folder = snapshotFolder.addFolder(`Config: ${level.toUpperCase()}`);
        folder.add(params.snapshots[level], 'samples', 1, 4096, 1).name('Target Samples');
        folder.add(params.snapshots[level], 'bounces', 1, 25, 1).name('Bounces');
        folder.add(params.snapshots[level], 'renderScale', 0.1, 1.0, 0.05).name('Precision Scale');
        folder.close();
    });
    snapshotFolder.close();

    // 5. Minimap Configuration
    const minimapFolder = state.gui.addFolder('Minimap (FBO)');
    minimapFolder.add(params.minimap, 'enabled').name('Enable Minimap');
    minimapFolder.add(params.minimap, 'posX', -50, 50).name('Camera X');
    minimapFolder.add(params.minimap, 'posY', 1, 100).name('Camera Y');
    minimapFolder.add(params.minimap, 'posZ', -50, 50).name('Camera Z');
    minimapFolder.add(params.minimap, 'targetX', -50, 50).name('Target X');
    minimapFolder.add(params.minimap, 'targetY', -50, 50).name('Target Y');
    minimapFolder.add(params.minimap, 'targetZ', -50, 50).name('Target Z');
    minimapFolder.add(params.minimap, 'fov', 1, 120).name('Perspective FOV');
    minimapFolder.add(params.minimap, 'flipX').name('Flip Horizontal');
    minimapFolder.add(params.minimap, 'flipY').name('Flip Vertical');
    minimapFolder.close();







    const preprocessingFolder = state.gui.addFolder('Preprocessing');
    preprocessingFolder.add(params, 'showBoundingBoxes').onChange(updateModel);
    preprocessingFolder.add(params, 'arrangeInRow').onChange(updateModel);
    preprocessingFolder.close();

    const environmentFolder = state.gui.addFolder('Environment');
    environmentFolder.add(params, 'envMap', envMaps).name('Map').onChange(updateEnvMap);
    environmentFolder.add(params, 'environmentIntensity', 0.0, 10.0).onChange(onParamsChange).name('Intensity');
    environmentFolder.add(params, 'environmentRotation', 0, 2 * Math.PI).onChange(onParamsChange).name('Rotation');
    environmentFolder.close();

    const backgroundFolder = state.gui.addFolder('Background');
    backgroundFolder.add(params, 'backgroundType', ['Environment', 'Gradient']).onChange(onParamsChange);
    backgroundFolder.addColor(params, 'bgGradientTop').onChange(onParamsChange);
    backgroundFolder.addColor(params, 'bgGradientBottom').onChange(onParamsChange);
    backgroundFolder.add(params, 'backgroundBlur', 0, 1).onChange(onParamsChange);
    backgroundFolder.add(params, 'transparentBackground').onChange(onParamsChange);
    backgroundFolder.add(params, 'checkerboardTransparency').onChange(v => {
        if (v) document.body.classList.add('checkerboard');
        else document.body.classList.remove('checkerboard');
    });
    backgroundFolder.close();

    const floorFolder = state.gui.addFolder('Floor');
    floorFolder.addColor(params, 'floorColor').onChange(onParamsChange);
    floorFolder.add(params, 'floorRoughness', 0, 1).onChange(onParamsChange);
    floorFolder.add(params, 'floorMetalness', 0, 1).onChange(onParamsChange);
    floorFolder.add(params, 'floorOpacity', 0, 1).onChange(onParamsChange);
    floorFolder.close();

    // Scene Graph
    new SceneGraph(state.scene, state.gui);
}

