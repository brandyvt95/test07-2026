import { state } from './state.js';
import { Vector3, Quaternion, Layers, InstancedMesh, Matrix4 } from 'three';

export class Customizer {
    constructor() {
        this.config = null;
        this.activeParts = new Map(); // category -> Set<optionId> or optionId
        this.instancedMeshes = new Map(); // key -> InstancedMesh[]
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

        const isMulti = !!catConfig.multiSelect;

        // 0. Toggle Logic Check
        if (isMulti) {
            let activeSet = this.activeParts.get(category);
            if (!(activeSet instanceof Set)) {
                activeSet = new Set();
                this.activeParts.set(category, activeSet);
            }
            if (activeSet.has(optionId)) {
                // TOGGLE OFF
                console.log(`[Customizer] Toggle OFF detected for ${optionId}`);
                this._removeSpecificPart(category, optionId);
                activeSet.delete(optionId);
                if (state.ptManager) state.ptManager.reset();
                return;
            }
        }

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
        if (!isMulti) {
            const previousOptionId = this.activeParts.get(category);
            if (previousOptionId && previousOptionId !== optionId) {
                this._removeSpecificPart(category, previousOptionId);
            }
            this.activeParts.set(category, optionId);
        } else {
            this.activeParts.get(category).add(optionId);
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

        // Selection Logic: 
        // 1. If more than 1 dummy -> InstancedMesh (Exhausts/Wheels potentially)
        // 2. Otherwise -> Move original to dummy

        const isMultiPlacement = dummies.length > 1;

        if (isMultiPlacement) {
            console.log(`[Customizer] Applying InstancedMesh(es) for category "${category}" (${dummies.length} dummies)`);

            const instanceKey = `${category}_${optionId}`;
            let instances = this.instancedMeshes.get(instanceKey);

            if (!instances) {
                instances = [];
                const isWheel = category === 'wheels';

                incomingMesh.traverse(c => {
                    if (c.isMesh) {
                        const geometry = c.geometry;
                        const material = c.material;

                        if (isWheel && Array.isArray(material) && geometry.groups && geometry.groups.length > 0) {
                            // Multi-Material Wheel: Create one instance per material group
                            geometry.groups.forEach((group, gidx) => {
                                // Create a slim geometry for this group
                                const groupGeo = geometry.clone();
                                groupGeo.setDrawRange(group.start, group.count);
                                
                                const groupMat = material[group.materialIndex] || material[0];
                                const iMesh = new InstancedMesh(groupGeo, groupMat, dummies.length);
                                
                                iMesh.userData.category = category;
                                iMesh.userData.optionId = optionId;
                                state.modelCar.add(iMesh);
                                instances.push(iMesh);
                            });
                        } else {
                            // Single Material or Exhaust (take first material)
                            const useMat = Array.isArray(material) ? material[0] : material;
                            const iMesh = new InstancedMesh(geometry, useMat, dummies.length);
                            
                            iMesh.userData.category = category;
                            iMesh.userData.optionId = optionId;
                            state.modelCar.add(iMesh);
                            instances.push(iMesh);
                        }
                    }
                });
                this.instancedMeshes.set(instanceKey, instances);
            }

            if (instances.length > 0) {
                const carInv = new Matrix4().copy(state.modelCar.matrixWorld).invert();
                const mat4 = new Matrix4();

                instances.forEach(iMesh => {
                    iMesh.visible = true;
                    dummies.forEach((dummy, idx) => {
                        dummy.visible = true;
                        dummy.updateMatrixWorld(true);
                        mat4.multiplyMatrices(carInv, dummy.matrixWorld);
                        iMesh.setMatrixAt(idx, mat4);
                    });
                    iMesh.instanceMatrix.needsUpdate = true;
                    iMesh.layers.enable(0);
                    iMesh.layers.enable(1);
                });
            }

            // Original stays in booth, visuals hidden, label shown
            this._setUsedMode(incomingMesh, true);
        } else {
            // SINGLE PLACEMENT: Move ORIGINAL children to dummy
            console.log(`[Customizer] Moving children for category "${category}" (single-placement)`);
            const firstDummy = dummies[0];
            firstDummy.visible = true;
            
            const meshesToMove = [];
            incomingMesh.traverse(c => {
                if (c.isMesh && !c.userData.isUsedLabel) meshesToMove.push(c);
            });
            
            if (!incomingMesh.userData.movedMeshes) incomingMesh.userData.movedMeshes = [];
            
            meshesToMove.forEach(m => {
                firstDummy.add(m);
                m.position.set(0, 0, 0);
                m.quaternion.set(0, 0, 0, 1);
                m.scale.set(1, 1, 1);
                m.visible = true;
                m.traverse(c => { if (c.layers) { c.layers.enable(0); c.layers.enable(1); } });
                incomingMesh.userData.movedMeshes.push(m);
            });

            // Show "USED" label in booth
            this._setUsedMode(incomingMesh, true);
        }

        if (state.ptManager) state.ptManager.reset();
    }

    /**
     * Surgical hide: hide the material only, but keep the object enabled for raycasting via Label
     */
    _setUsedMode(product, isUsed) {
        if (!product) return;
        console.log(`[Customizer] _setUsedMode: ${product.name}, isUsed=${isUsed}`);

        product.userData.isUsed = isUsed;

        product.traverse(c => {
            if (c.userData.isUsedLabel) {
                c.visible = isUsed;
            } else if (c.isMesh) {
                // Surgical hide: hide the MESH object, not the material (to avoid affecting Instances)
                c.visible = !isUsed;
            }
        });

        product.visible = true; // Root must stay visible to hold label
    }

    _removeSpecificPart(category, optionId) {
        const catConfig = state.boothConfig.customization[category];
        const option = catConfig.options.find(o => o.id === optionId);
        if (!option) return;

        let originalMesh = null;
        state.modelCar.traverse(child => {
            if (child.name === option.meshName && child.userData.initParent) {
                originalMesh = child;
            }
        });

        if (originalMesh) {
            // 1. Restore moved meshes (for single-placement)
            if (originalMesh.userData.movedMeshes) {
                originalMesh.userData.movedMeshes.forEach(m => {
                    originalMesh.add(m);
                    m.position.set(0, 0, 0);
                    m.quaternion.set(0, 0, 0, 1);
                    m.scale.set(1, 1, 1);
                    m.visible = true;
                });
                originalMesh.userData.movedMeshes = [];
            }

            // 2. Restore Original Root to Booth (if it was ever moved)
            if (originalMesh.userData.initParent) {
                originalMesh.userData.initParent.add(originalMesh);
                originalMesh.position.copy(originalMesh.userData.initPos);
                originalMesh.quaternion.copy(originalMesh.userData.initQuat);
                originalMesh.scale.copy(originalMesh.userData.initScale);
            }

            this._setUsedMode(originalMesh, false);
            originalMesh.visible = true;
            originalMesh.traverse(c => { if (c.layers) c.layers.set(0); });
        }

        // Hide Instances
        const instances = this.instancedMeshes.get(`${category}_${optionId}`);
        if (instances) {
            instances.forEach(iMesh => { iMesh.visible = false; });
        }
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

        if (previousOptionId instanceof Set) {
            [...previousOptionId].forEach(id => this._removeSpecificPart(category, id));
        } else {
            this._removeSpecificPart(category, previousOptionId);
        }

        console.log(`[Customizer] applyBasePart: category=${category}`);

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
