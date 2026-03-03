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

    const pathTracingFolder = state.gui.addFolder('Path Tracer');
    pathTracingFolder.add(params, 'enable');
    pathTracingFolder.add(params, 'pause');
    pathTracingFolder.add(params, 'multipleImportanceSampling').onChange(onParamsChange);
    pathTracingFolder.add(params, 'acesToneMapping').onChange(v => {
        state.renderer.toneMapping = v ? ACESFilmicToneMapping : NoToneMapping;
    });
    pathTracingFolder.add(params, 'bounces', 1, 20, 1).onChange(onParamsChange);
    pathTracingFolder.add(params, 'filterGlossyFactor', 0, 1).onChange(onParamsChange);
    pathTracingFolder.add(params, 'renderScale', 0.1, 1.0, 0.01).onChange(() => {
        onParamsChange();
    });
    pathTracingFolder.add(params, 'tiles', 1, 10, 1).onChange(v => {
        state.pathTracer.tiles.set(v, v);
    });
    pathTracingFolder.add(params, 'cameraProjection', ['Perspective', 'Orthographic']).onChange(v => {
        updateCameraProjection(v);
    });
    pathTracingFolder.close();

    const preprocessingFolder = state.gui.addFolder('Preprocessing');
    preprocessingFolder.add(params, 'showBoundingBoxes').onChange(updateModel);
    preprocessingFolder.add(params, 'arrangeInRow').onChange(updateModel);
    preprocessingFolder.close();

    const environmentFolder = state.gui.addFolder('environment');
    environmentFolder.add(params, 'envMap', envMaps).name('map').onChange(updateEnvMap);
    environmentFolder.add(params, 'environmentIntensity', 0.0, 10.0).onChange(onParamsChange).name('intensity');
    environmentFolder.add(params, 'environmentRotation', 0, 2 * Math.PI).onChange(onParamsChange);
    environmentFolder.close();

    const backgroundFolder = state.gui.addFolder('background');
    backgroundFolder.add(params, 'backgroundType', ['Environment', 'Gradient']).onChange(onParamsChange);
    backgroundFolder.addColor(params, 'bgGradientTop').onChange(onParamsChange);
    backgroundFolder.addColor(params, 'bgGradientBottom').onChange(onParamsChange);
    backgroundFolder.add(params, 'backgroundBlur', 0, 1).onChange(onParamsChange);
    backgroundFolder.add(params, 'transparentBackground', 0, 1).onChange(onParamsChange);
    backgroundFolder.add(params, 'checkerboardTransparency').onChange(v => {
        if (v) document.body.classList.add('checkerboard');
        else document.body.classList.remove('checkerboard');
    });
    backgroundFolder.close();

    const floorFolder = state.gui.addFolder('floor');
    floorFolder.addColor(params, 'floorColor').onChange(onParamsChange);
    floorFolder.add(params, 'floorRoughness', 0, 1).onChange(onParamsChange);
    floorFolder.add(params, 'floorMetalness', 0, 1).onChange(onParamsChange);
    floorFolder.add(params, 'floorOpacity', 0, 1).onChange(onParamsChange);
    floorFolder.close();

    // Scene Graph
    new SceneGraph(state.scene, state.gui);
}
