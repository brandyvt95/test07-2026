import { Raycaster, Vector2, Box3, Vector3, Quaternion, MeshStandardMaterial } from 'three';
import { state } from './state.js';

export class RayInteraction {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();

        this.onPointerDown = this.onPointerDown.bind(this);
        this.domElement.addEventListener('pointerdown', this.onPointerDown);

        // Hide all dummy meshes on construction (will also be called after model loads)
        this._hideDummies();
    }

    /** Ensure all *_dummy meshes are always invisible */
    _hideDummies() {
        if (!state.modelCar) return;
        state.modelCar.traverse(child => {
            if (child.name && child.name.toLowerCase().includes('_dummy')) {
                child.visible = false;
            }
        });
    }

    onPointerDown(event) {
        if (!this.domElement) return;

        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (!state.modelCar) return;

        // Filter intersections based on context
        let intersects = this.raycaster.intersectObject(state.modelCar, true);

        const currentCam = state.controls?.currentCameraName || '';

        // When in booth, ignore the outer bounds so we can hit products inside
        if (currentCam.includes('gianhang')) {
            intersects = intersects.filter(hit => !hit.object.name.includes('bound_gianhang'));
        }

        if (intersects.length > 0) {
            const hitObject = intersects[0].object;
            console.log(`[Ray] Hit discovered: ${hitObject.name}`);
            this.handleInteraction(hitObject);
        }
    }

    handleInteraction(object) {
        const controls = state.controls;
        if (!controls) return;

        // Always keep dummies hidden
        this._hideDummies();

        const currentCam = controls.currentCameraName || '';
        const isInBooth = currentCam.includes('gianhang');

        // ===================== PRODUCT INTERACTION =====================
        if (object.name.toLowerCase().includes('sanpham') && !object.name.toLowerCase().includes('_dummy')) {
            const productId = object.name;
            // Extract number from product name, e.g. "sanpham_1" -> "1"
            const numMatch = productId.match(/(\d+)/);
            const productNum = numMatch ? numMatch[1] : null;

            // Find the product group by name in the model tree
            let targetProduct = null;
            let targetDummy = null;
            state.modelCar.traverse(child => {
                if (child.name === productId) targetProduct = child;
                if (child.name === `${productId}_dummy`) targetDummy = child;
            });

            if (!targetProduct) {
                console.warn(`[Interaction] Could not find product mesh ${productId}`);
                // Fall through to hook-based interaction below
            } else {
                // Keep dummy invisible always
                if (targetDummy) targetDummy.visible = false;

                // -------- TOGGLE OFF --------
                if (state.activeProductId === productId) {
                    console.log(`[Interaction] Toggling OFF ${productId}`);

                    // Remove HUD clone if exists
                    const existingClone = state.hudClones.get(productId);
                    if (existingClone) {
                        state.scene.remove(existingClone);
                        existingClone.traverse(c => {
                            if (c.material) c.material.dispose();
                            if (c.geometry) c.geometry.dispose();
                        });
                        state.hudClones.delete(productId);
                    }

                    // Reset material to random colour (original)
                    targetProduct.traverse(child => {
                        if (child.isMesh) {
                            child.material = new MeshStandardMaterial({
                                color: Math.floor(Math.random() * 16777215),
                                roughness: 0.5,
                                metalness: 0.5
                            });
                        }
                    });

                    state.activeProductId = null;
                    return; // done
                }

                // -------- ACTIVATE --------
                console.log(`[Interaction] Activating ${productId} (inBooth: ${isInBooth})`);
                state.activeProductId = productId;

                if (isInBooth) {
                    // === INSIDE BOOTH: turn RED + create HUD clone ===
                    targetProduct.traverse(child => {
                        if (child.isMesh) {
                            child.material = new MeshStandardMaterial({
                                color: 0xff0000,
                                roughness: 0.5,
                                metalness: 0.5
                            });
                        }
                    });

                    // Dispose previous clone if any
                    if (state.hudClones.has(productId)) {
                        const oldClone = state.hudClones.get(productId);
                        state.scene.remove(oldClone);
                        oldClone.traverse(c => {
                            if (c.material) c.material.dispose();
                            if (c.geometry) c.geometry.dispose();
                        });
                        state.hudClones.delete(productId);
                    }

                    // Create clone for HUD (Layer 1 only, random colour)
                    const clone = targetProduct.clone();
                    state.hudClones.set(productId, clone);

                    clone.traverse(child => {
                        child.layers.set(1);
                        if (child.isMesh) {
                            child.material = new MeshStandardMaterial({
                                color: Math.floor(Math.random() * 16777215),
                                roughness: 0.5,
                                metalness: 0.5
                            });
                        }
                    });

                    state.scene.add(clone);

                    // Position clone at dummy location (dummy is hidden but we use its transform)
                    if (targetDummy) {
                        targetDummy.updateMatrixWorld(true);
                        const worldPos = new Vector3();
                        const worldQuat = new Quaternion();
                        targetDummy.getWorldPosition(worldPos);
                        targetDummy.getWorldQuaternion(worldQuat);

                        if (clone.parent) {
                            const p = clone.parent;
                            p.updateMatrixWorld(true);
                            p.worldToLocal(worldPos);
                            const pQuat = new Quaternion();
                            p.getWorldQuaternion(pQuat);
                            worldQuat.premultiply(pQuat.invert());
                        }
                        clone.position.copy(worldPos);
                        clone.quaternion.copy(worldQuat);
                        clone.updateMatrixWorld(true);
                    }

                    console.log(`[Interaction] ${productId} activated: main=RED, HUD clone created.`);
                } else {
                    // === OUTSIDE BOOTH: turn BLUE + teleport to booth ===
                    targetProduct.traverse(child => {
                        if (child.isMesh) {
                            child.material = new MeshStandardMaterial({
                                color: 0x0000ff,
                                roughness: 0.5,
                                metalness: 0.5
                            });
                        }
                    });

                    // Teleport to matching booth camera
                    if (productNum) {
                        const targetCamName = `camera_gianhang_${productNum}`;
                        const bbox = new Box3().setFromObject(targetProduct);
                        const center = new Vector3();
                        bbox.getCenter(center);
                        this.teleportToCamera(targetCamName, center);
                        console.log(`[Interaction] ${productId} activated: main=BLUE, teleporting to ${targetCamName}`);
                    }
                }

                return; // product handled, skip hook logic
            }
        }

        // ================ BLOCK RE-TRANSITION IN BOOTH ================
        if (isInBooth && object.name.includes('bound_gianhang')) {
            console.log("[Ray] Already in booth view, ignoring bound click.");
            return;
        }

        // ================ EXISTING: Hook-based Teleport logic ================
        const modelInfo = Object.values(state.models)[0];
        if (!modelInfo || !modelInfo.hooks) return;

        modelInfo.hooks.forEach(hook => {
            if (hook.type === 'click_interaction') {
                const patternStr = hook.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
                const pattern = new RegExp(`^${patternStr}$`, 'i');

                if (pattern.test(object.name)) {
                    console.log(`[Interaction] Identified pattern match: ${hook.id} for ${object.name}`);

                    if (hook.action === 'teleport_camera' && hook.params?.targetCamera) {
                        const boundingBox = new Box3().setFromObject(object);
                        const center = new Vector3();
                        boundingBox.getCenter(center);
                        this.teleportToCamera(hook.params.targetCamera, center);
                    }
                }
            }
        });
    }

    teleportToCamera(cameraName, targetLookAt) {
        if (!state.modelCar || !state.controls) return;

        let targetCam = null;
        state.modelCar.traverse(child => {
            if (child.isCamera && child.name === cameraName) {
                targetCam = child;
            }
        });

        if (targetCam) {
            console.log(`[Ray] Teleporting to: ${cameraName}`);
            state.controls.transitionTo(targetCam, targetLookAt);
            if (state.nav) state.nav.sync();
        } else {
            console.warn(`[Ray] Camera "${cameraName}" not found in GLB.`);
        }
    }

    dispose() {
        if (this.domElement) {
            this.domElement.removeEventListener('pointerdown', this.onPointerDown);
        }
    }
}
