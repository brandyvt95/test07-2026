import { Raycaster, Vector2, Mesh, Box3, Vector3, Color, BoxGeometry, MeshBasicMaterial, Group, Quaternion } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { params } from './params.js';

const standardRaycast = Mesh.prototype.raycast;

export class SelectionManager {
    constructor(state) {
        if (window._selectionInstance) {
            window._selectionInstance.dispose();
        }
        window._selectionInstance = this;

        this.state = state;
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();
        this.rawMouse = new Vector2();

        this.hoveredMesh = null;
        this.isMovingCamera = false;
        this.targetPos = new Vector3();
        this.targetLookAt = new Vector3();
        this.lerpSpeed = 0.05;

        // Drag State
        this.isDragging = false;
        this.draggedMesh = null;
        this.dragLerpSpeed = 0.2;

        // Key: offset from mesh root to its bbox center (to place by center, not root)
        this.internalCenterOffset = new Vector3();
        // NDC z-depth at the moment of grab - this is FIXED during drag so object stays at same depth
        this.grabNdcZ = 0;
        // Visual lerp target
        this._dragTarget = new Vector3();

        this.originalParent = null;
        this.originalPosition = new Vector3();
        this.originalQuaternion = new Quaternion();
        this.originalScale = new Vector3();

        this.boundModel = null;
        this.dummies = new Map();
        this.productRoots = new Map();
        this.pickingBoxes = new Map();

        this._onMouseMove = (e) => {
            this.rawMouse.x = e.clientX;
            this.rawMouse.y = e.clientY;
            if (this.isDragging) {
                this.handleDragMove();
            } else {
                this.handleHover();
            }
        };

        this._onMouseDown = (e) => {
            if (e.button !== 0) return;
            const hit = this.pickObject(Array.from(this.pickingBoxes.values()));
            if (hit) {
                const productId = hit.object.userData.productId;
                const productMesh = this.productRoots.get(productId);
                if (productMesh) {
                    this.startDragging(productMesh);
                    return;
                }
            }
            const sceneHit = this.pickObject();
            if (sceneHit) this.handleClick(sceneHit.object);
        };

        this._onMouseUp = (e) => {
            if (this.isDragging) this.stopDragging();
        };

        this.initEvents();
    }

    initEvents() {
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
    }

    dispose() {
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        this.pickingBoxes.forEach(box => {
            if (box.parent) box.parent.remove(box);
            box.geometry.dispose();
            box.material.dispose();
        });
    }

    setupModel(model) {
        if (!model) return;
        this.dummies.clear();
        this.productRoots.clear();
        this.pickingBoxes.forEach(box => {
            if (box.parent) box.parent.remove(box);
            box.geometry.dispose();
            box.material.dispose();
        });
        this.pickingBoxes.clear();

        model.traverse(child => {
            const name = child.name.toLowerCase();
            if (child.isMesh) {
                child.visible = true;
                child.layers.enable(0);
            }

            if (name.includes('boundmodel')) {
                this.boundModel = child;
                child.visible = false;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => { m.transparent = true; m.opacity = 0; m.visible = true; });
                }
            }

            if (name.startsWith('sanpham') && !name.includes('dummy') && !name.includes('gianhang')) {
                const id = child.name;
                this.productRoots.set(id, child);
                this.createPickingBox(child, id);
            }

            if (name.startsWith('sanpham') && name.includes('_dummy')) {
                const productId = child.name.replace('_dummy', '');
                this.dummies.set(productId, child);
                child.visible = false;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => { m.transparent = true; m.opacity = 0; m.visible = true; });
                }
            }
        });
    }

    createPickingBox(mesh, id) {
        mesh.updateMatrixWorld(true);
        const box3 = new Box3().setFromObject(mesh);
        const size = new Vector3(); box3.getSize(size);
        const center = new Vector3(); box3.getCenter(center);

        const geo = new BoxGeometry(size.x, size.y, size.z);
        const mat = new MeshBasicMaterial({ visible: false });
        const boxMesh = new Mesh(geo, mat);
        boxMesh.position.copy(center);
        boxMesh.userData.productId = id;

        this.pickingBoxes.set(id, boxMesh);
        this.state.scene.add(boxMesh);
    }

    pickObject(customTargets = null) {
        const { renderer, scene, perspectiveCamera, activeCamera } = this.state;
        const camera = activeCamera || perspectiveCamera;
        if (!renderer || !scene || !camera || params.raycastMode === 'Off') return null;

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

        const targets = customTargets || [];
        if (!customTargets) {
            scene.traverse(child => {
                if (child.isMesh && child.visible) targets.push(child);
            });
        }

        const intersects = this.raycaster.intersectObjects(targets, false);
        return intersects.length > 0 ? intersects[0] : null;
    }

    handleHover() {
        const hit = this.pickObject(Array.from(this.pickingBoxes.values()));
        const id = hit ? hit.object.userData.productId : null;
        const productRoot = id ? this.productRoots.get(id) : null;

        if (this.hoveredMesh && (!productRoot || productRoot !== this.hoveredMesh)) {
            this.resetHoverEffect(this.hoveredMesh);
            this.hoveredMesh = null;
        }
        if (productRoot && productRoot !== this.hoveredMesh) {
            this.hoveredMesh = productRoot;
            this.applyHoverEffect(productRoot);
        }
    }

    applyHoverEffect(group) {
        group.traverse(child => {
            if (child.isMesh) {
                if (!child._origMaterial) {
                    child._prevMaterial = child.material;
                    child.material = Array.isArray(child.material) ? child.material.map(m => m.clone()) : child.material.clone();
                    child._origMaterial = true;
                }
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => { if (m && m.color) m.color.set(0xff5555); });
            }
        });
    }

    resetHoverEffect(group) {
        if (!group) return;
        group.traverse(child => {
            if (child.isMesh && child._origMaterial) {
                const currentMats = Array.isArray(child.material) ? child.material : [child.material];
                currentMats.forEach(m => m.dispose());
                child.material = child._prevMaterial;
                child._origMaterial = false;
            }
        });
    }

    startDragging(mesh) {
        this.isDragging = true;
        this.draggedMesh = mesh;

        const camera = this.state.activeCamera || this.state.perspectiveCamera;

        mesh.updateMatrixWorld(true);
        const worldPos = new Vector3();
        mesh.getWorldPosition(worldPos);

        const box3 = new Box3().setFromObject(mesh);
        const worldCenter = new Vector3();
        box3.getCenter(worldCenter);

        // Offset so we can position the mesh by its bbox center, not its pivot
        this.internalCenterOffset.copy(worldPos).sub(worldCenter);

        // STRATEGY: Use the z-depth of the DUMMY on the car, not the shelf.
        // Because user wants to drag at the car's depth, not the shelf's depth.
        // If no matching dummy found, fall back to the product's own depth.
        const matchingDummy = this.dummies.get(mesh.name);
        let depthRef = worldCenter; // default: use product's own depth

        if (matchingDummy) {
            matchingDummy.updateMatrixWorld(true);
            const dummyBox = new Box3().setFromObject(matchingDummy);
            const dummyCenter = new Vector3();
            dummyBox.getCenter(dummyCenter);

            // Only use dummy depth if it's in front of camera (not behind)
            const dummyNdc = dummyCenter.clone().project(camera);
            if (dummyNdc.z > -1 && dummyNdc.z < 1) {
                depthRef = dummyCenter;
                console.log(`[Drag] Using dummy z-depth from: ${matchingDummy.name}`);
            }
        }

        // Project chosen reference point to NDC - z is our FIXED depth
        const ndc = depthRef.clone().project(camera);
        this.grabNdcZ = ndc.z;

        // Save original state to restore on cancel
        this.originalParent = mesh.parent;
        this.originalPosition.copy(mesh.position);
        this.originalQuaternion.copy(mesh.quaternion);
        this.originalScale.copy(mesh.scale);

        // Detach from stall hierarchy → world space (preserves visual position)
        this.state.scene.attach(mesh);

        // CRITICAL FIX: Immediately compute the correct world position 
        // by unprojecting current mouse coords with grabNdcZ.
        // Without this, frame-1 lerp target differs from current position → visible jump.
        const rect = this.state.renderer.domElement.getBoundingClientRect();
        const initNdcX = ((this.rawMouse.x - rect.left) / rect.width) * 2 - 1;
        const initNdcY = -((this.rawMouse.y - rect.top) / rect.height) * 2 + 1;
        const initWorld = new Vector3(initNdcX, initNdcY, this.grabNdcZ).unproject(camera);
        const initRootPos = initWorld.add(this.internalCenterOffset);

        // Teleport mesh to correct start position (no lerp jump on frame 1)
        mesh.position.copy(initRootPos);
        this._dragTarget.copy(initRootPos);

        // Activate invisible collision targets
        if (this.boundModel) this.boundModel.visible = true;
        this.dummies.forEach(d => d.visible = true);

        if (this.state.controls) this.state.controls.enabled = false;
        console.log(`[Drag] Start at correct depth. NDC z=${this.grabNdcZ.toFixed(4)}`);
    }

    handleDragMove() {
        if (!this.isDragging || !this.draggedMesh) return;

        const camera = this.state.activeCamera || this.state.perspectiveCamera;
        const rect = this.state.renderer.domElement.getBoundingClientRect();

        // Step 1: Mouse position in NDC (x, y)
        const ndcX = ((this.rawMouse.x - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((this.rawMouse.y - rect.top) / rect.height) * 2 + 1;

        // Step 2: Unproject with FIXED z-depth captured at grab time.
        // This maps the 2D screen position back to 3D world space AT THE SAME DEPTH.
        // Result: object always appears under mouse cursor, never flies to far/near plane.
        const worldPos = new Vector3(ndcX, ndcY, this.grabNdcZ).unproject(camera);

        // Step 3: Target = unprojected center position + root-to-center offset
        this._dragTarget.copy(worldPos).add(this.internalCenterOffset);

        // Step 4: Check for snap targets (dummies) using same NDC x,y
        this.mouse.x = ndcX;
        this.mouse.y = ndcY;
        const snapTargets = [];
        if (this.boundModel) snapTargets.push(this.boundModel);
        this.dummies.forEach(d => snapTargets.push(d));
        const hit = this.pickObject(snapTargets);

        if (hit) {
            const hitName = hit.object.name.toLowerCase();
            if (hitName.includes('dummy')) {
                const dummy = hit.object;
                const productId = dummy.name.replace('_dummy', '');
                if (productId === this.draggedMesh.name) {
                    this.snapToSlot(this.draggedMesh, dummy);
                    this.stopDragging(true);
                    return;
                }
            }
        }

        // Step 5: Lerp towards target smoothly
        this.draggedMesh.position.lerp(this._dragTarget, this.dragLerpSpeed);
        this.draggedMesh.quaternion.set(0, 0, 0, 1);
    }

    snapToSlot(mesh, dummy) {
        this.state.minimapGroup.attach(mesh);
        dummy.updateMatrixWorld(true);
        const worldMatrix = dummy.matrixWorld.clone();
        mesh.matrix.copy(this.state.minimapGroup.matrixWorld).invert().multiply(worldMatrix);
        mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.layers.enable(1);
        if (this.state.logger) this.state.logger.log(`Configured: ${mesh.name} placed on car.`);
    }

    stopDragging(didSnap = false) {
        if (!this.isDragging || !this.draggedMesh) return;

        if (!didSnap) {
            this.originalParent.attach(this.draggedMesh);
            this.draggedMesh.position.copy(this.originalPosition);
            this.draggedMesh.quaternion.copy(this.originalQuaternion);
            this.draggedMesh.scale.copy(this.originalScale);
        }

        if (this.boundModel) this.boundModel.visible = false;
        this.dummies.forEach(d => d.visible = false);

        this.isDragging = false;
        this.draggedMesh = null;
        if (this.state.controls && !this.isMovingCamera) this.state.controls.enabled = true;
    }

    handleClick(obj) {
        let current = obj;
        while (current) {
            if (current.name && current.name.toLowerCase().startsWith('gianhang')) {
                this.focusOnStall(current);
                return;
            }
            current = current.parent;
        }
    }

    focusOnStall(stall) {
        const box = new Box3().setFromObject(stall);
        const center = new Vector3(); box.getCenter(center);
        const size = new Vector3(); box.getSize(size);
        const radius = size.length() * 0.5;
        this.targetLookAt.copy(center);
        this.targetPos.copy(center).add(new Vector3(radius * 1.5, radius, radius * 1.5));
        this.isMovingCamera = true;
        if (this.state.controls) this.state.controls.enabled = false;
    }

    update() {
        if (this.isMovingCamera) {
            const { perspectiveCamera, activeCamera, controls } = this.state;
            const camera = activeCamera || perspectiveCamera;
            camera.position.lerp(this.targetPos, this.lerpSpeed);
            if (controls) {
                controls.target.lerp(this.targetLookAt, this.lerpSpeed);
                controls.update();
            } else {
                camera.lookAt(this.targetLookAt);
            }
            if (camera.position.distanceTo(this.targetPos) < 0.01) {
                this.isMovingCamera = false;
                if (controls) controls.enabled = true;
            }
        }

        // Keep proxy boxes in sync with product positions
        if (!this.isDragging) {
            this.pickingBoxes.forEach((box, id) => {
                const mesh = this.productRoots.get(id);
                if (mesh) {
                    const box3 = new Box3().setFromObject(mesh);
                    box3.getCenter(box.position);
                }
            });
        }
    }
}
