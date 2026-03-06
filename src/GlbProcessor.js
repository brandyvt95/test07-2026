import { Box3, Sphere, Vector3, MeshStandardMaterial } from 'three';
import { params } from './params.js';
import { state } from './state.js';
import { loadModel, convertOpacityToTransmission } from './loader.js';
import { buildGui } from './gui.js';
import { onParamsChange } from './utils.js';
import { applyMeshHooks } from './Material/MeshHook.js';

export async function processGlb() {
    if (!state.models) return;
    const modelInfo = Object.values(state.models)[0];
    const config = modelInfo.config || {};

    state.renderer.domElement.style.visibility = 'hidden';
    state.loader.setPercentage(0);

    // 1. Cleanup old model
    if (state.modelCar) {
        state.modelCar.traverse(c => {
            if (c.material) {
                const material = c.material;
                const mats = Array.isArray(material) ? material : [material];
                mats.forEach(m => {
                    for (const key in m) {
                        if (m[key] && m[key].isTexture) m[key].dispose();
                    }
                    m.dispose();
                });
            }
        });
        state.scene.remove(state.modelCar);
        state.modelCar = null;
    }

    // 2. Load GLB
    try {
        console.log(`[GlbProcessor] Loading GLB from: ${modelInfo.url}`);
        state.modelCar = await loadModel(modelInfo.url, v => {
            state.loader.setPercentage(0.5 * v);
        });
        console.log("[GlbProcessor] GLB Loaded successfully.");
    } catch (err) {
        console.error("[GlbProcessor] Load Error:", err);
        state.loader.setCredits('Failed to load GLB: ' + err.message);
        state.loader.setPercentage(1);
        return;
    }

    if (!state.modelCar) {
        console.error("[GlbProcessor] modelCar is null after loading.");
        return;
    }

    // --- RESET VISIBILITY FROM GLB ---
    state.modelCar.traverse(c => {
        if (c.isMesh) c.visible = true;
    });

    const box = new Box3().setFromObject(state.modelCar);
    console.log("[GlbProcessor] Loaded World Box:", {
        min: box.min,
        max: box.max,
        size: box.getSize(new Vector3())
    });

    // --- RESET VISIBILITY FROM GLB (Second pass removed as redundant) ---

    // 3. Geometry Pass
    console.log("[GlbProcessor] Running Geometry Pass...");
    runGeometryPass(state.modelCar, modelInfo, config);

    // 4. Material Pass
    console.log("[GlbProcessor] Running Material Pass...");
    runMaterialPass(state.modelCar, modelInfo, config);

    // 5. Finalize Scene Graph
    console.log(`[GlbProcessor] Finalizing model. Adding to scene...`);
    state.modelCar.updateMatrixWorld(true);
    state.scene.add(state.modelCar);

    // 6. Apply SceneGraph Hooks (Material or Visibility/Ray Overrides)
    // CRITICAL: Must be done AFTER adding to scene to ensure no overrides
    if (modelInfo.hooks) {
        console.log("[GlbProcessor] Applying Mesh Hooks...");
        applyMeshHooks(state.modelCar, modelInfo.hooks);
    }

    // Hide all *_dummy meshes permanently — they only provide position data
    state.modelCar.traverse(c => {
        if (c.name && c.name.toLowerCase().includes('_dummy')) {
            c.visible = false;
        }
    });
    console.log("[GlbProcessor] All *_dummy meshes hidden.");

    // Inspect first few meshes for debug
    let totalMeshCount = 0;
    let visibleMeshCount = 0;
    let meshNames = [];
    state.modelCar.traverse(c => {
        if (c.isMesh) {
            totalMeshCount++;
            if (c.parent && !c.parent.visible) {
                // Parent hidden!
            }
            if (c.visible) visibleMeshCount++;
            if (meshNames.length < 30) meshNames.push(`${c.name}(${c.visible ? "VIS" : "HID"})`);
        }
    });
    console.log(`[GlbProcessor] Mesh Visibility Report: Total=${totalMeshCount}, Visible=${visibleMeshCount}`);
    console.log("[GlbProcessor] Sample Mesh States:", meshNames);

    // Look for Camera_Main (via Controls Hook)
    if (state.controls && state.controls.applyGlbCamera) {
        state.controls.applyGlbCamera(state.modelCar);
    }

    await state.ptManager.setSceneAsync(state.scene, state.perspectiveCamera || state.activeCamera, {
        onProgress: v => state.loader.setPercentage(0.5 + 0.5 * v),
    });
    console.log("[GlbProcessor] PathTracer setup completed");

    finalizeProcess(modelInfo, config);
}

function runGeometryPass(model, modelInfo, config) {
    // Basic transforms from config (DISABLED)
    /*
    const rotation = modelInfo.rotation || config.rotation;
    if (rotation) {
        model.rotation.set(...rotation);
    }

    const box = new Box3();
    box.setFromObject(model);
    model.position.addScaledVector(box.min, -0.5).addScaledVector(box.max, -0.5);

    const sphere = new Sphere();
    box.getBoundingSphere(sphere);
    model.scale.setScalar(1 / (sphere.radius || 1));
    model.position.multiplyScalar(1 / (sphere.radius || 1));

    box.setFromObject(model);
    const center = new Vector3();
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    */
}

function runMaterialPass(model, modelInfo, config) {
    model.traverse(c => {
        // 1. Identify MODEL_CAR container
        if (c.name === 'MODEL_CAR') {
            state.modelCarObj = c;
            // Visible in main scene by default (Layer 0)
            c.traverse(child => {
                if (child.layers) {
                    child.layers.set(0);
                }
            });
            console.log("[GlbProcessor] Identified MODEL_CAR. Defaulting to Layer 0.");
        }

        // 2. Process all Meshes
        if (c.isMesh) {
            // Apply unique colors/materials to EVERYTHING initially
            const randomColor = Math.floor(Math.random() * 16777215);
            c.material = new MeshStandardMaterial({
                color: randomColor,
                roughness: 0.5,
                metalness: 0.5
            });
        }
    });

    // 2. Custom post-process hook (if any in JS)
    if (modelInfo.postProcess) {
        modelInfo.postProcess(model);
    }
}

function finalizeProcess(modelInfo, config) {
    state.loader.setPercentage(1);
    state.loader.setCredits(modelInfo.credit || '');

    params.bounces = config.bounces || 5;
    params.floorColor = config.floorColor || '#111111';
    params.floorRoughness = config.floorRoughness || 0.2;
    params.floorMetalness = config.floorMetalness || 0.2;
    params.bgGradientTop = config.gradientTop || '#111111';
    params.bgGradientBottom = config.gradientBot || '#000000';

    buildGui();
    onParamsChange();

    state.renderer.domElement.style.visibility = 'visible';
    if (params.checkerboardTransparency) {
        document.body.classList.add('checkerboard');
    }
}
