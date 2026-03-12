import { Box3, Sphere, Vector3, MeshStandardMaterial, PlaneGeometry, BoxGeometry, Mesh, Scene, Quaternion, AmbientLight } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
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

    // 1. Cleanup
    if (state.modelCar) {
        state.scene.remove(state.modelCar);
        state.modelCar = null;
    }

    // 2. Load
    try {
        console.log(`[GlbProcessor] Loading GLB from: ${modelInfo.url}`);
        state.modelCar = await loadModel(modelInfo.url, v => {
            state.loader.setPercentage(0.5 * v);
        });
        console.log("[GlbProcessor] GLB Loaded successfully.");
    } catch (err) {
        console.error("[GlbProcessor] Load Error:", err);
        return;
    }

    if (!state.modelCar) return;

    // --- RESET VISIBILITY ---
    state.modelCar.traverse(c => {
        if (c.isMesh) c.visible = true;
    });

    // 3. Material Pass
    runMaterialPass(state.modelCar, modelInfo, config);

    // 4. Finalize Scene Graph
    state.modelCar.updateMatrixWorld(true);
    state.scene.add(state.modelCar);

    // 5. Apply SceneGraph Hooks
    if (modelInfo.hooks) {
        applyMeshHooks(state.modelCar, modelInfo.hooks);
    }

    // 6. Interaction Setup (Layers & Hulls)
    setupInteraction(state.modelCar);

    // Look for Camera_Main
    if (state.controls && state.controls.applyGlbCamera) {
        state.controls.applyGlbCamera(state.modelCar);
    }

    // PathTracer Init (ISOLATED DUMMY SCENE)
    const dummyPtScene = new Scene();
    const ptCube = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial({ color: 0xff0000 }));
    ptCube.name = "PT_DUMMY_CUBE";
    dummyPtScene.add(ptCube);

    const ptLight = new AmbientLight(0xffffff, 2.0);
    dummyPtScene.add(ptLight);

    await state.ptManager.setSceneAsync(dummyPtScene, state.perspectiveCamera || state.activeCamera, {
        onProgress: v => state.loader.setPercentage(0.5 + 0.5 * v),
    });

    finalizeProcess(modelInfo, config);
}

/**
 * Capture showroom slots (*_dummy_gianhang) and setup interactions
 */
function setupInteraction(model) {
    let productCount = 0;
    state.showroomSlots = {}; // Store world transforms for swapped-out parts

    // Ensure world matrices are fresh for transform capture
    model.updateMatrixWorld(true);

    const productRoots = [];
    model.traverse(child => {
        if (child.userData.isHull) return;

        // Capture Showroom Slots (e.g. banhxegoc_dummy_gianhang)
        if (child.name.toLowerCase().includes('_dummy_gianhang')) {
            const wPos = new Vector3();
            const wQuat = new Quaternion();
            child.getWorldPosition(wPos);
            child.getWorldQuaternion(wQuat);

            // Extract category by checking dummyPatterns
            let category = null;
            if (state.boothConfig.customization) {
                for (const catKey in state.boothConfig.customization) {
                    const cat = state.boothConfig.customization[catKey];
                    const baseBase = cat.dummyPattern.replace('_dummy', '').replace('*', '').replace('_', '');
                    if (child.name.toLowerCase().replace('_', '').includes(baseBase.toLowerCase())) {
                        category = catKey;
                        break;
                    }
                }
            }
            if (category) {
                state.showroomSlots[category] = { position: wPos, quaternion: wQuat };
                console.log(`[InteractionDebug] Showroom Slot captured for category "${category}": ${child.name}. Pos: ${wPos.x.toFixed(2)}, ${wPos.y.toFixed(2)}, ${wPos.z.toFixed(2)}`);
            } else {
                console.warn(`[InteractionDebug] Showroom Slot found but category NOT matched for: ${child.name}`);
            }
            child.visible = false;
            return;
        }

        // Hide other dummies
        if (child.name.toLowerCase().includes('_dummy')) {
            child.visible = false;
            return;
        }

        if (state.boothConfig?.booths) {
            // A) Check against productPattern (The options in booths)
            let isOption = state.boothConfig.booths.some(b => {
                const pattern = b.productPattern.replace('*', '.*');
                const regex = new RegExp(`^${pattern}$`, 'i');
                return regex.test(child.name);
            });

            // B) Check against base/goc parts (e.g. banhxegoc_1, lốp_goc)
            let isBase = false;
            if (state.boothConfig.customization) {
                if (!state.baseParts) state.baseParts = {};

                for (const catKey in state.boothConfig.customization) {
                    const cat = state.boothConfig.customization[catKey];
                    // Derive a prefix from dummyPattern (e.g. "banhxe" from "banhxe_goc_*_dummy")
                    const prefix = cat.dummyPattern.split('_')[0].toLowerCase();

                    // Match if name contains the prefix AND contains "goc"
                    const lowerName = child.name.toLowerCase();
                    if ((lowerName.includes(prefix) || lowerName.includes('ongxa')) && lowerName.includes('goc')) {
                        isBase = true;
                        child.userData.isBasePart = true;
                        child.userData.category = catKey;
                        child.userData.isOriginal = true;
                        child.userData.isInteractive = true;

                        if (!state.baseParts[catKey]) state.baseParts[catKey] = [];
                        // Avoid duplicates if init is called twice
                        if (!state.baseParts[catKey].includes(child)) {
                            state.baseParts[catKey].push(child);
                        }

                        console.log(`[InteractionDebug] Base part ARCHIVED: "${child.name}" in category "${catKey}"`);
                        break;
                    }
                }
            }

            if (isOption || isBase) {
                child.userData.isInteractive = true;
                child.userData.isOriginal = true; // All booth items and car base items are originals

                // Store initial world transform and hierarchy for swapping
                child.updateMatrixWorld(true);
                child.userData.initPos = child.position.clone();
                child.userData.initQuat = child.quaternion.clone();
                child.userData.initScale = child.scale.clone();

                // CRITICAL: initParent is a circular reference for JSON.stringify (used in .clone())
                // We make it non-enumerable so Three.js clone/copy ignores it
                Object.defineProperty(child.userData, 'initParent', {
                    value: child.parent,
                    enumerable: false,
                    writable: true,
                    configurable: true
                });

                const wPos = new Vector3();
                const wQuat = new Quaternion();
                child.getWorldPosition(wPos);
                child.getWorldQuaternion(wQuat);
                child.userData.worldInitPos = wPos;
                child.userData.worldInitQuat = wQuat;

                productRoots.push(child);
            }
        }
    });

    productRoots.forEach(root => {
        console.log(`[InteractionDebug] Configuring Product/Base: ${root.name}`);
        root.userData.isInteractive = true;
        productCount++;

        const hull = createConvexHull(root);
        if (hull) {
            hull.layers.set(0);
            root.add(hull);
        }
    });

    console.log(`[InteractionDebug] Setup complete. Total interactive objects: ${productCount}`);
}

/**
 * Creates a single ConvexHull mesh by aggregating all geometry points from the root and its children.
 * Points are transformed into the root's local coordinate space.
 */
function createConvexHull(root) {
    const pts = [];

    // Ensure world matrices are up to date for correct vertex transformation
    root.updateMatrixWorld(true);

    const worldToRoot = root.matrixWorld.clone().invert();

    root.traverse(child => {
        if (!child.isMesh || child.userData.isHull) return;
        if (!child.geometry) return;

        const posAttr = child.geometry.attributes.position;
        if (!posAttr) return;

        // Determine sampling rate for performance (max ~1000 points total per hull)
        const totalPointsInMesh = posAttr.count;
        const stride = 42;

        const localToWorld = child.matrixWorld;

        for (let i = 0; i < totalPointsInMesh; i += stride) {
            // Get local mesh vertex
            const v = new Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));

            // Convert Mesh Local -> World -> Product Root Local
            v.applyMatrix4(localToWorld);
            v.applyMatrix4(worldToRoot);

            pts.push(v);
        }
    });

    if (pts.length < 4) {
        console.warn(`[GlbProcessor] Not enough points to create hull for ${root.name}`);
        return null;
    }

    try {
        const hullGeo = new ConvexGeometry(pts);
        const hullMat = new MeshStandardMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: params.showHulls ? 0.2 : 0, // Respect param
            depthWrite: false,
            wireframe: params.showHulls
        });
        const hullMesh = new Mesh(hullGeo, hullMat);
        hullMesh.name = `hull_${root.name}`;
        hullMesh.visible = params.showHulls; // Respect param
        hullMesh.userData.isHull = true;

        // Use non-enumerable property to avoid circular reference errors during cloning/serialization
        Object.defineProperty(hullMesh.userData, 'sourceMesh', {
            value: root,
            enumerable: false,
            writable: true,
            configurable: true
        });

        return hullMesh;
    } catch (e) {
        console.warn(`[GlbProcessor] ConvexHull construction failed for ${root.name}:`, e);
        return null;
    }
}

function runMaterialPass(model, modelInfo, config) {
    model.traverse(c => {
        if (c.name === 'MODEL_CAR') {
            state.modelCarObj = c;
            c.traverse(child => {
                if (child.layers) child.layers.set(0);
            });
        }
    });
}

function finalizeProcess(modelInfo, config) {
    state.loader.setPercentage(1);
    buildGui();
    onParamsChange();
    state.renderer.domElement.style.visibility = 'visible';
}
