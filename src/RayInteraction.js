import { Raycaster, Vector2, Box3, Vector3, Quaternion, MeshStandardMaterial, Layers } from 'three';
import { state } from './state.js';
import { customizer } from './Customizer.js';

export class RayInteraction {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();

        this.hoverMat = new MeshStandardMaterial({ color: 0x00ff00, roughness: 0.3, metalness: 0.8 });

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);

        this.domElement.addEventListener('pointerdown', this.onPointerDown);
        this.domElement.addEventListener('pointermove', this.onPointerMove);
    }

    async init() {
        try {
            const resp = await fetch('/assets/booth_config.json');
            state.boothConfig = await resp.json();
            console.log("[Ray] Booth config loaded.");
        } catch (e) {
            console.warn("[Ray] Booth config not found.");
        }
    }

    _updateRaycaster(event) {
        if (!this.domElement) return;
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
    }

    _setHover(target) {
        if (state.hoveredObject === target) return;
        this._resetHover();
        if (target) {
            state.hoveredObject = target;
            this._highlightObject(target);
        }
    }

    _highlightObject(obj) {
        const target = obj.userData.sourceMesh || obj;
        target.traverse(child => {
            if (child.isMesh && !child.userData.isHull) {
                if (!child.userData.originalMaterial) {
                    child.userData.originalMaterial = child.material;
                }
                child.material = this.hoverMat;
            }
        });
    }

    _resetHover() {
        if (state.hoveredObject) {
            const target = state.hoveredObject.userData.sourceMesh || state.hoveredObject;
            target.traverse(child => {
                if (child.isMesh && child.userData.originalMaterial) {
                    child.material = child.userData.originalMaterial;
                }
            });
            state.hoveredObject = null;
        }
    }

    onPointerMove(event) {
        if (!this.domElement || !state.modelCar) return;
        this._updateRaycaster(event);

        // Intersect Model AND anything detached in the scene (like showroom parts)
        const candidates = [state.modelCar, ...state.scene.children.filter(c => c.userData?.isInteractive)];
        const hits = this.raycaster.intersectObjects(candidates, true);

        if (state.currentBoothId) {
            // BOOTH MODE: Looking for products (Options or Swapped Bases)
            const booth = state.boothConfig?.booths?.find(b => b.id === state.currentBoothId);
            const pattern = booth?.productPattern?.replace('*', '.*');
            const regex = pattern ? new RegExp(`^${pattern}$`, 'i') : null;

            const interactiveHit = hits.find(h => {
                const target = h.object.userData.sourceMesh || h.object;
                const isOption = regex && regex.test(target.name);
                const isSwappedBase = target.userData.isBasePart;
                return (isOption || isSwappedBase) && target.userData.isInteractive;
            });

            if (interactiveHit) {
                const target = interactiveHit.object.userData.sourceMesh || interactiveHit.object;
                this._setHover(target);
                this.domElement.style.cursor = 'pointer';
            } else {
                this._setHover(null);
                this.domElement.style.cursor = 'default';
            }
        } else {
            // GLOBAL MODE
            this._setHover(null);
            const boundHit = hits.find(h => h.object.name.includes('bound_gianhang'));
            this.domElement.style.cursor = boundHit ? 'pointer' : 'default';
        }
    }

    onPointerDown(event) {
        if (!this.domElement || !state.modelCar) return;
        this.onPointerMove(event);

        const candidates = [state.modelCar, ...state.scene.children.filter(c => c.userData?.isInteractive)];
        const hits = this.raycaster.intersectObjects(candidates, true);

        if (state.currentBoothId) {
            // Click Product/Base
            const booth = state.boothConfig?.booths?.find(b => b.id === state.currentBoothId);
            const pattern = booth?.productPattern?.replace('*', '.*');
            const regex = pattern ? new RegExp(`^${pattern}$`, 'i') : null;

            const productHit = hits.find(h => {
                const target = h.object.userData.sourceMesh || h.object;
                const isOption = regex && regex.test(target.name);
                const isSwappedBase = target.userData.isBasePart;
                return (isOption || isSwappedBase) && target.userData.isInteractive;
            });

            if (productHit) {
                const target = productHit.object.userData.sourceMesh || productHit.object;
                if (target.userData.isBasePart) {
                    customizer.applyBasePart(target.userData.category);
                } else {
                    this._handleProductClick(target);
                }
                return;
            }
        }

        const boundHit = hits.find(h => h.object.name.includes('bound_gianhang'));
        if (boundHit) {
            const booth = state.boothConfig?.booths?.find(b => boundHit.object.name === b.clickPattern);
            if (booth) {
                this.teleportToBooth(booth);
            }
        }
    }

    _handleProductClick(obj) {
        const sourceMesh = obj.userData.sourceMesh || obj;
        console.log(`[Ray] Product Clicked: ${sourceMesh.name}`);

        const booth = state.boothConfig.booths.find(b => b.id === state.currentBoothId);
        if (!booth) return;

        // Hide entire group/mesh
        sourceMesh.visible = false;
        this._resetHover();

        for (const catKey in state.boothConfig.customization) {
            const cat = state.boothConfig.customization[catKey];
            const opt = cat.options.find(o => o.meshName === sourceMesh.name);
            if (opt) {
                customizer.applyPart(catKey, opt.id);
                break;
            }
        }
    }

    teleportToBooth(booth) {
        const obj = state.modelCar.getObjectByName(booth.clickPattern);
        if (!obj) return;

        const bbox = new Box3().setFromObject(obj);
        const center = new Vector3();
        bbox.getCenter(center);

        state.currentBoothId = booth.id;
        this.teleportToCamera(booth.boothCamera, center);
    }

    teleportToCamera(cameraName, targetLookAt) {
        if (!state.modelCar || !state.controls) return;
        let targetCam = null;
        state.modelCar.traverse(child => {
            if (child.isCamera && child.name === cameraName) targetCam = child;
        });

        if (targetCam) {
            state.controls.transitionTo(targetCam, targetLookAt);
            if (state.nav) state.nav.sync();
        }
    }

    dispose() {
        this.domElement.removeEventListener('pointerdown', this.onPointerDown);
        this.domElement.removeEventListener('pointermove', this.onPointerMove);
    }
}
