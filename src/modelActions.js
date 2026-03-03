import { Box3, Sphere } from 'three';
import { params } from './params.js';
import { state } from './state.js';
import { loadModel, convertOpacityToTransmission } from './loader.js';
import { buildGui } from './gui.js';
import { onParamsChange } from './utils.js';

export async function updateModel() {
    if (!state.models) return;
    const modelInfo = Object.values(state.models)[0];
    state.renderer.domElement.style.visibility = 'hidden';
    state.loader.setPercentage(0);

    if (state.model) {
        state.model.traverse(c => {
            if (c.material) {
                const material = c.material;
                for (const key in material) {
                    if (material[key] && material[key].isTexture) {
                        material[key].dispose();
                    }
                }
            }
        });
        state.scene.remove(state.model);
        state.model = null;
    }

    try {
        state.model = await loadModel(modelInfo.url, v => {
            state.loader.setPercentage(0.5 * v);
        });
    } catch (err) {
        state.loader.setCredits('Failed to load model:' + err.message);
        state.loader.setPercentage(1);
    }

    if (modelInfo.removeEmission) {
        state.model.traverse(c => {
            if (c.material) {
                c.material.emissiveMap = null;
                c.material.emissiveIntensity = 0;
            }
        });
    }

    if (modelInfo.opacityToTransmission) {
        convertOpacityToTransmission(state.model, modelInfo.ior || 1.5);
    }

    state.model.traverse(c => {
        if (c.material) {
            c.material.thickness = 1.0;
        }
    });

    if (modelInfo.postProcess) {
        modelInfo.postProcess(state.model);
    }

    if (modelInfo.rotation) {
        state.model.rotation.set(...modelInfo.rotation);
    }

    const box = new Box3();
    box.setFromObject(state.model);
    state.model.position.addScaledVector(box.min, - 0.5).addScaledVector(box.max, - 0.5);

    const sphere = new Sphere();
    box.getBoundingSphere(sphere);

    state.model.scale.setScalar(1 / sphere.radius);
    state.model.position.multiplyScalar(1 / sphere.radius);
    box.setFromObject(state.model);
    state.floorPlane.position.y = box.min.y;

    state.scene.add(state.model);

    // Apply model processing (arrange meshes in row, bounding boxes)
    if (state.modelProcessor) {
        state.modelProcessor.process(state.model, {
            showBoxes: params.showBoundingBoxes,
            arrangeInRow: params.arrangeInRow,
        });
    }

    await state.ptManager.setSceneAsync(state.scene, state.activeCamera, {
        onProgress: v => state.loader.setPercentage(0.5 + 0.5 * v),
    });

    state.loader.setPercentage(1);
    state.loader.setCredits(modelInfo.credit || '');
    params.bounces = modelInfo.bounces || 5;
    params.floorColor = modelInfo.floorColor || '#111111';
    params.floorRoughness = modelInfo.floorRoughness || 0.2;
    params.floorMetalness = modelInfo.floorMetalness || 0.2;
    params.bgGradientTop = modelInfo.gradientTop || '#111111';
    params.bgGradientBottom = modelInfo.gradientBot || '#000000';

    buildGui();
    onParamsChange();

    state.renderer.domElement.style.visibility = 'visible';
    if (params.checkerboardTransparency) {
        document.body.classList.add('checkerboard');
    }
}
