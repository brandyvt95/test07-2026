import { state } from './state.js';
import { Vector3, Quaternion, Layers, InstancedMesh, Matrix4 } from 'three';

export class Customizer {
    constructor() {
        this.config = null;
        this.activeParts = new Map(); // category -> optionId
        this.instancedMeshes = new Map(); // category -> InstancedMesh
    }

    async init() {
        // boothConfig is already loaded by RayInteraction in main.js
        console.log("[Customizer] Ready.");
    }

    /**
     * Swap car components with Showroom <-> Car swapping logic
     */
    applyPart(category, optionId) {
        if (!state.boothConfig || !state.modelCar) return;
        const catConfig = state.boothConfig.customization[category];
        if (!catConfig) return;

        // 1. Identify Incoming (Selected) Mesh (Original)
        const incomingOption = catConfig.options.find(o => o.id === optionId);
        let incomingMesh = null;
        state.modelCar.traverse(child => {
            // Pick the ORIGINAL mesh (the one with initParent)
            if (child.name === incomingOption.meshName && child.userData.initParent) {
                incomingMesh = child;
            }
        });
        if (!incomingMesh) return;

        console.log(`[Customizer] applyPart: category=${category}, incoming=${incomingMesh.name}`);

        // 2. Identify and handle Outgoing part
        const previousOptionId = this.activeParts.get(category);

        if (previousOptionId) {
            // A previous custom option was active. Return it to its booth slot.
            const previousOption = catConfig.options.find(o => o.id === previousOptionId);
            let prevMesh = null;
            state.modelCar.traverse(child => {
                if (child.name === previousOption.meshName && child.userData.initParent) {
                    prevMesh = child;
                }
            });

            if (prevMesh && prevMesh.userData.initParent) {
                console.log(`[Customizer] Returning previous option "${prevMesh.name}" to booth`);
                prevMesh.userData.initParent.add(prevMesh);
                prevMesh.position.copy(prevMesh.userData.initPos);
                prevMesh.quaternion.copy(prevMesh.userData.initQuat);
                prevMesh.scale.copy(prevMesh.userData.initScale);
                prevMesh.visible = true;
                prevMesh.traverse(c => { if (c.layers) c.layers.set(0); });
            }
        }

        // 3. Hide ALL base parts on the car and move ONE to showroom
        const basePieces = state.baseParts[category] || [];
        console.log(`[Customizer] applyPart: Hiding ${basePieces.length} base pieces for category "${category}"`);

        let firstBaseMesh = null;
        basePieces.forEach(piece => {
            piece.visible = false;
            // Also ensure layers are reset for pieces staying on the car
            piece.traverse(c => { if (c.layers) c.layers.set(0); });
            if (piece.userData.isOriginal) firstBaseMesh = piece;
        });

        // SAFETY FALLBACK: If some pieces weren't archived, hide them by name pattern
        const prefixPattern = catConfig.dummyPattern.split('_')[0].toLowerCase();
        state.modelCar.traverse(c => {
            const low = c.name.toLowerCase();
            // Important: DO NOT hide dummies!
            if (low.includes(prefixPattern) && low.includes('goc') && !low.includes('_dummy')) {
                c.visible = false;
                if (c.layers) c.layers.set(0);
            }
        });

        if (firstBaseMesh) {
            const slot = state.showroomSlots?.[category];
            if (slot) {
                console.log(`[Customizer] Moving base part "${firstBaseMesh.name}" to showroom slot`);
                state.scene.add(firstBaseMesh); // Detach from car hierarchy
                firstBaseMesh.position.copy(slot.position);
                firstBaseMesh.quaternion.copy(slot.quaternion);
                firstBaseMesh.scale.copy(firstBaseMesh.userData.initScale);
                firstBaseMesh.visible = true;
                firstBaseMesh.traverse(c => { if (c.layers) c.layers.set(0); });
                firstBaseMesh.updateMatrixWorld(true);
            }
        }

        // 4. Update HUD & Car Clones at dummies
        this._removeClones(category);

        // REFINED DUMMY SEARCH logic
        const dummies = [];
        const isExhaust = (category === 'exhausts' || catConfig.swapLogic === 'full_replacement');

        if (isExhaust) {
            // Rule: Find ongxa_goc_N_dummy* where N is extracted from incomingMesh name (ongxa_mau_N)
            const match = incomingMesh.name.match(/_mau_(\d+)/i);
            const indexN = match ? match[1] : null;
            if (indexN) {
                const specificPattern = new RegExp(`ongxa_goc_${indexN}_dummy`, 'i');
                state.modelCar.traverse(child => {
                    if (specificPattern.test(child.name)) dummies.push(child);
                });
                console.log(`[Customizer] Exhaust Search: index=${indexN}, found ${dummies.length} dummies.`);
            }
        } else {
            // Default pattern search (for wheels, etc)
            const pattern = new RegExp(catConfig.dummyPattern.replace('*', '.*'), 'i');
            state.modelCar.traverse(child => {
                if (pattern.test(child.name)) dummies.push(child);
            });
        }

        if (dummies.length === 0) {
            console.warn(`[Customizer] No dummies found for category "${category}"`);
            return;
        }

        // Logic selection: 
        // 1. If Exhaust AND multiple dummies with numbered suffix (_1, _2) -> InstancedMesh
        // 2. Otherwise -> Standard placement (Original + Clones)

        const hasNumberedSuffix = dummies.some(d => d.name.match(/_dummy_\d+$/i));
        const useInstanced = isExhaust && (dummies.length > 1 && hasNumberedSuffix);

        if (useInstanced) {
            console.log(`[Customizer] Applying InstancedMesh for category "${category}" (numbered dummies)`);

            let geometry = null;
            let material = null;
            incomingMesh.traverse(c => {
                if (c.isMesh && !geometry) {
                    geometry = c.geometry;
                    material = c.material.clone();
                    if (material.metalness !== undefined) {
                        material.metalness = 1.0;
                        material.roughness = 0.05;
                    }
                }
            });

            if (geometry && material) {
                const iMesh = new InstancedMesh(geometry, material, dummies.length);
                iMesh.userData.category = category;
                iMesh.userData.isCustomPart = true;

                state.modelCar.add(iMesh);
                iMesh.position.set(0, 0, 0);
                iMesh.quaternion.set(0, 0, 0, 1);
                iMesh.scale.set(1, 1, 1);

                state.modelCar.updateMatrixWorld(true);
                const carInv = new Matrix4().copy(state.modelCar.matrixWorld).invert();
                const mat4 = new Matrix4();

                dummies.forEach((dummy, i) => {
                    dummy.visible = true;
                    dummy.updateMatrixWorld(true);
                    mat4.multiplyMatrices(carInv, dummy.matrixWorld);
                    iMesh.setMatrixAt(i, mat4);
                });

                iMesh.instanceMatrix.needsUpdate = true;
                iMesh.layers.enable(0);
                iMesh.layers.enable(1);

                state.hudClones.set(`${category}_instanced`, iMesh);
                incomingMesh.visible = false;
            }
        } else {
            // STANDARD PLACEMENT ENGINE
            console.log(`[Customizer] Applying Standard Placement for category "${category}"`);

            // A) For exhausts, we might still want to tune material but keep standard cloning
            if (isExhaust) {
                incomingMesh.traverse(c => {
                    if (c.isMesh && c.material) {
                        if (c.material.metalness !== undefined) {
                            c.material.metalness = 1.0;
                            c.material.roughness = 0.05;
                        }
                    }
                });
            }

            // B) Move ORIGINAL to first dummy
            const firstDummy = dummies[0];
            firstDummy.visible = true;
            firstDummy.add(incomingMesh);

            incomingMesh.position.set(0, 0, 0);
            incomingMesh.quaternion.set(0, 0, 0, 1);
            incomingMesh.scale.set(1, 1, 1);
            incomingMesh.visible = true;

            incomingMesh.traverse(c => {
                if (c.layers) {
                    c.layers.enable(0);
                    c.layers.enable(1);
                }
            });
            incomingMesh.updateMatrixWorld(true);

            // C) Clone for the rest (if any)
            for (let i = 1; i < dummies.length; i++) {
                const dummy = dummies[i];
                dummy.visible = true;
                const clone = incomingMesh.clone();
                const hulls = [];
                clone.traverse(c => { if (c.userData.isHull) hulls.push(c); });
                hulls.forEach(h => h.parent.remove(h));

                clone.visible = true;
                clone.userData.isCustomPart = true;
                clone.userData.category = category;

                dummy.add(clone);
                clone.position.set(0, 0, 0);
                clone.quaternion.set(0, 0, 0, 1);
                clone.scale.set(1, 1, 1);
                clone.traverse(c => {
                    if (c.layers) {
                        c.layers.enable(0);
                        c.layers.enable(1);
                    }
                });
                clone.updateMatrixWorld(true);
                state.hudClones.set(`${category}_${i}`, clone);
            }
        }

        this.activeParts.set(category, optionId);
        if (state.ptManager) state.ptManager.reset();
    }

    /**
     * Restore the original car part (e.g. banhxegoc_1) to its car position
     */
    applyBasePart(category) {
        if (!state.boothConfig || !state.modelCar) return;
        const catConfig = state.boothConfig.customization[category];
        if (!catConfig) return;

        const previousOptionId = this.activeParts.get(category);
        if (!previousOptionId) return;

        const previousOption = catConfig.options.find(o => o.id === previousOptionId);
        let activeCustomMesh = null;
        state.modelCar.traverse(child => {
            if (child.name === previousOption.meshName && child.userData.initParent) {
                activeCustomMesh = child;
            }
        });

        console.log(`[Customizer] applyBasePart: category=${category}`);

        // 1. Remove clones
        this._removeClones(category);

        // 2. Put Custom Mesh back into its original booth parent
        if (activeCustomMesh && activeCustomMesh.userData.initParent) {
            activeCustomMesh.userData.initParent.add(activeCustomMesh);
            activeCustomMesh.position.copy(activeCustomMesh.userData.initPos);
            activeCustomMesh.quaternion.copy(activeCustomMesh.userData.initQuat);
            activeCustomMesh.scale.copy(activeCustomMesh.userData.initScale);
            activeCustomMesh.visible = true;
            activeCustomMesh.traverse(c => { if (c.layers) c.layers.set(0); });
        }

        // 3. Restore ALL base pieces
        const basePieces = state.baseParts[category] || [];
        console.log(`[Customizer] applyBasePart: Restoring ${basePieces.length} base pieces for category "${category}"`);

        basePieces.forEach(child => {
            if (child.userData.initParent) {
                child.userData.initParent.add(child);
            }
            child.position.copy(child.userData.initPos);
            child.quaternion.copy(child.userData.initQuat);
            child.scale.copy(child.userData.initScale);
            child.visible = true;
            child.traverse(c => {
                if (c.layers) {
                    c.layers.enable(0);
                    c.layers.enable(1);
                }
            });
        });

        this.activeParts.delete(category);
        if (state.ptManager) state.ptManager.reset();
    }

    _removeClones(category) {
        const items = [];
        state.hudClones.forEach((clone, key) => {
            if (key.startsWith(category)) items.push({ key, clone });
        });
        items.forEach(item => {
            if (item.clone.parent) item.clone.parent.remove(item.clone);
            item.clone.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => m.dispose());
                }
            });
            state.hudClones.delete(item.key);
        });
    }
}

export const customizer = new Customizer();
