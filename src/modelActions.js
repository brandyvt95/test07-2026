import { Box3, Sphere, Vector3 } from 'three';

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

    // Recalculate box after scale
    box.setFromObject(state.model);

    // Center locally and ground it (BOTTOM at Y=0)
    const center = new Vector3();
    box.getCenter(center);
    state.model.position.x -= center.x;
    state.model.position.z -= center.z;
    state.model.position.y -= box.min.y; // Lowest point at 0

    // Add the model to the scene normally
    state.scene.add(state.model);

    // Filter and set Layer 1 for Car meshes WITHOUT moving them (to preserve transforms/scale)
    state.model.traverse(child => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            const isStall = name.includes('gianhang') || name.includes('sanpham');
            if (!isStall) {
                child.layers.enable(1); // Seen by Minimap Camera
            }
        }
    });

    // Initialize Selection Manager for this model (Dummies, etc)
    if (state.selectionManager) {
        state.selectionManager.setupModel(state.model);
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
