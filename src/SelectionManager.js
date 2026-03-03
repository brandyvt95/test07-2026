import { Raycaster, Vector2, Mesh } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { params } from './params.js';

// Lưu trữ hàm raycast gốc của Three.js
const standardRaycast = Mesh.prototype.raycast;

export class SelectionManager {
    constructor(state) {
        // Singleton pattern
        if (window._selectionInstance) {
            window._selectionInstance.dispose();
        }
        window._selectionInstance = this;

        this.state = state;
        this.raycaster = new Raycaster();

        this.mouse = new Vector2();
        this.rawMouse = new Vector2();

        this._onMouseMove = (e) => {
            this.rawMouse.x = e.clientX;
            this.rawMouse.y = e.clientY;
        };

        this._onMouseDown = (e) => {
            if (e.button !== 0) return; // Only left click

            const pickedMaterial = this.pick();
            if (pickedMaterial) {
                const mode = params.raycastMode || 'BVH';
                console.log(`%c [${mode} Picked] `, 'background: #4facfe; color: black; font-weight: bold', pickedMaterial.name || pickedMaterial.uuid);

                if (this.state.logger) {
                    this.state.logger.log(`Selected [${mode}]: ${pickedMaterial.name || "Unnamed Material"}`);
                }
                this.highlightByMaterial(pickedMaterial);
            }
        };

        this.initEvents();
    }

    initEvents() {
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mousedown', this._onMouseDown);
    }

    dispose() {
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mousedown', this._onMouseDown);
    }

    pick() {
        const { renderer, scene, perspectiveCamera, activeCamera } = this.state;
        const camera = activeCamera || perspectiveCamera;
        if (!renderer || !scene || !camera) return null;

        // Cấu hình linh hoạt giữa BVH và Standard Raycast
        if (params.raycastMode === 'BVH') {
            Mesh.prototype.raycast = acceleratedRaycast;
            this.raycaster.firstHitOnly = true;
        } else {
            Mesh.prototype.raycast = standardRaycast;
            this.raycaster.firstHitOnly = false;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((this.rawMouse.x - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((this.rawMouse.y - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, camera);

        const meshes = [];
        scene.traverse(child => {
            if (child.isMesh && child.visible) meshes.push(child);
        });

        const intersects = this.raycaster.intersectObjects(meshes, false);

        if (intersects.length > 0) {
            const pickedObject = intersects[0].object;
            const mat = Array.isArray(pickedObject.material) ? pickedObject.material[0] : pickedObject.material;
            return mat;
        }

        return null;
    }

    highlightByMaterial(material) {
        if (this._lastMaterial && this._lastMaterial.emissive) {
            this._lastMaterial.emissive.setHex(this._lastMaterial._origEmissive || 0);
        }

        if (material && material.emissive) {
            if (material._origEmissive === undefined) {
                material._origEmissive = material.emissive.getHex();
            }
            material.emissive.setHex(0x4facfe);
            this._lastMaterial = material;

            setTimeout(() => {
                if (material.emissive) {
                    material.emissive.setHex(material._origEmissive || 0);
                }
            }, 1000);
        }
    }
}
