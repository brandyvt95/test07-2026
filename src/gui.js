import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { params, envMaps } from './params.js';
import { state } from './state.js';
import { onParamsChange, updateEnvMap } from './utils.js';
import { processGlb } from './GlbProcessor.js';

export function buildGui() {
    if (state.gui) {
        state.gui.destroy();
    }

    state.gui = new GUI();

    const debugFolder = state.gui.addFolder('Debug Controls');
    debugFolder.add(params, 'showHulls').name('Show Hitboxes').onChange(onParamsChange);
    debugFolder.close();



    // 3. Standard Render (Rasterization)


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

}

