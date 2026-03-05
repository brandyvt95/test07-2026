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
        // Traverse up to find the actual sanphamchon group (since raycaster hits child meshes)
        let productNode = object;
        while (productNode) {
            if (productNode.name && productNode.name.toLowerCase().includes('sanphamchon') && !productNode.name.toLowerCase().includes('_dummy')) {
                break;
            }
            productNode = productNode.parent;
        }

        if (productNode) {
            const productId = productNode.name;
            // Extract number from product name, e.g. "sanpham_1" -> "1"
            const numMatch = productId.match(/(\d+)/);
            const productNum = numMatch ? numMatch[1] : null;

            // Find the product group by name in the model tree
            let targetProduct = null;
            let targetDummy = null;
            const dummyName = productNum ? `sanpham_${productNum}_dummy` : `${productId}_dummy`;

            state.modelCar.traverse(child => {
                if (child.name === productId) targetProduct = child;
                if (child.name === dummyName || child.name === `${productId}_dummy`) targetDummy = child;
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
                        // Do NOT dispose material or geometry here, as they are shared with the original model!
                        state.hudClones.delete(productId);
                    }

                    // Reset material to original
                    targetProduct.traverse(child => {
                        if (child.isMesh && child.userData.originalMaterial) {
                            // Dispose the temporary RED material we created
                            if (child.material) child.material.dispose();
                            // Restore original
                            child.material = child.userData.originalMaterial;
                        }
                    });

                    state.activeProductId = null;
                    return; // done
                }

                // -------- ACTIVATE --------
                console.log(`[Interaction] Activating ${productId}`);
                state.activeProductId = productId;

                // 1) Tạo clone trước khi đổi màu vật thể gốc (để clone giữ nguyên material/texture chuẩn)
                const clone = targetProduct.clone();

                // MẤU CHỐT: Phải set layer 1 cho clone thì Camera FBO mới nhìn thấy nó (main camera sẽ không thấy)
                clone.traverse(child => {
                    child.layers.set(1);
                });

                state.hudClones.set(productId, clone);
                state.scene.add(clone);

                // 2) Đổi màu vất thể gốc sang ĐỎ (highlight)
                targetProduct.traverse(child => {
                    if (child.isMesh) {
                        // Lưu material gốc lại nếu chưa có
                        if (!child.userData.originalMaterial) {
                            child.userData.originalMaterial = child.material;
                        }

                        // Gán một material hoàn toàn mới cho vật thể gốc
                        child.material = new MeshStandardMaterial({
                            color: 0xff0000,
                            roughness: 0.5,
                            metalness: 0.5
                        });
                    }
                });

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

                if (!isInBooth) {
                    if (productNum) {
                        const targetCamName = `camera_gianhang_${productNum}`;
                        const bbox = new Box3().setFromObject(targetProduct);
                        const center = new Vector3();
                        bbox.getCenter(center);
                        this.teleportToCamera(targetCamName, center);
                        console.log(`[Interaction] ${productId} activated, teleporting to ${targetCamName}`);
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

        // ================ AUTOMATIC BOOTH TELEPORT ================
        if (!isInBooth && object.name.includes('bound_gianhang')) {
            const numMatch = object.name.match(/(\d+)/);
            if (numMatch) {
                const targetCamera = `camera_gianhang_${numMatch[1]}`;
                console.log(`[Interaction] Auto-teleport triggered for ${object.name} -> ${targetCamera}`);
                const boundingBox = new Box3().setFromObject(object);
                const center = new Vector3();
                boundingBox.getCenter(center);
                this.teleportToCamera(targetCamera, center);
                return;
            }
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
