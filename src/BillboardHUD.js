import {
    PlaneGeometry, MeshBasicMaterial, MeshStandardMaterial, Mesh, DoubleSide, MathUtils,
    WebGLRenderTarget, PerspectiveCamera, Vector3, Box3, Raycaster, Vector2, Quaternion
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from './state.js';

export class BillboardHUD {
    constructor(camera, sizeRatio = 0.42) {
        this.mainCamera = camera;
        this.isVisible = false;
        this._baseX = 0;
        this._baseY = 0;
        this.sizeRatio = sizeRatio; // Default to 35% of viewport

        this.raycaster = new Raycaster();
        this.mouse = new Vector2();
        this._isMouseOver = false;

        // Transition State for HUD Camera
        this.isTransitioning = false;
        this.transitionProgress = 0;
        this.transitionDuration = 1.2;
        this.startPos = new Vector3();
        this.startQuat = new Quaternion();
        this.endPos = new Vector3();
        this.endQuat = new Quaternion();
        this.midPos = new Vector3();

        // FBO Setup
        this.renderTarget = new WebGLRenderTarget(1024, 1024, { samples: 1 });

        // HUD Camera (Layer 1 only for selective rendering)
        this.hudCamera = new PerspectiveCamera(60, 1, 0.1, 50000);
        this.hudCamera.layers.set(1);

        // Plane for display
        const geometry = new PlaneGeometry(1, 1);
        this.hudMaterial = new MeshBasicMaterial({
            map: this.renderTarget.texture,
            transparent: true,
            opacity: 1.0,
            side: DoubleSide,
            depthTest: false,
            depthWrite: false
        });

        this.mesh = new Mesh(geometry, this.hudMaterial);
        this.mesh.visible = false;
        this.mesh.renderOrder = 9999;
        this.mainCamera.add(this.mesh);

        // Interaction for HUD Orbit
        this.hudOrbit = null;
        this._initInteraction();

        console.log(`[BillboardHUD] Optimized FBO HUD with Layer 1 (Size Ratio: ${sizeRatio})`);
    }

    _initInteraction() {
        this.hudOrbit = new OrbitControls(this.hudCamera, state.renderer.domElement);
        this.hudOrbit.enabled = false;

        this.isDragging = false;
        this.hudOrbit.addEventListener('start', () => { this.isDragging = true; });
        this.hudOrbit.addEventListener('end', () => { this.isDragging = false; });

        const onMouseMove = (e) => {
            const rect = state.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            if (this.isVisible) {
                this.raycaster.setFromCamera(this.mouse, this.mainCamera);
                const intersects = this.raycaster.intersectObject(this.mesh);
                this._isMouseOver = intersects.length > 0;

                // Toggle Orbit enabled states to prevent main scene drag
                if (this._isMouseOver) {
                    this.hudOrbit.enabled = true;
                    if (state.controls && state.controls.orbit) {
                        state.controls.orbit.enabled = false;
                    }
                } else {
                    this.hudOrbit.enabled = false;
                    if (state.controls && state.controls.orbit) {
                        state.controls.orbit.enabled = true;
                    }
                }
            }
        };

        state.renderer.domElement.addEventListener('mousemove', onMouseMove);
    }

    syncCameraWithMain(glbCamera) {
        if (!glbCamera) return;

        glbCamera.updateMatrixWorld(true);

        if (this.isVisible) {
            // Already visible: Animate to the new camera
            this.startPos.copy(this.hudCamera.position);
            this.startQuat.copy(this.hudCamera.quaternion);

            glbCamera.getWorldPosition(this.endPos);
            glbCamera.getWorldQuaternion(this.endQuat);

            // Calculate bezier mid-point to arc over the object
            this.midPos.addVectors(this.startPos, this.endPos).multiplyScalar(0.5);
            const dist = this.startPos.distanceTo(this.endPos);
            if (dist > 1) {
                this.midPos.y += Math.max(dist * 0.4, 2);
            }

            this.isTransitioning = true;
            this.transitionProgress = 0;
        } else {
            // Instant snap if not visible
            glbCamera.getWorldPosition(this.hudCamera.position);
            glbCamera.getWorldQuaternion(this.hudCamera.quaternion);
        }

        this.hudCamera.fov = glbCamera.fov;
        this.hudCamera.updateProjectionMatrix();

        // Target remains the center of MODEL_CAR
        if (state.modelCarObj) {
            const box = new Box3().setFromObject(state.modelCarObj);
            const center = new Vector3();
            box.getCenter(center);
            this.hudOrbit.target.copy(center);
        }
        this.hudOrbit.update();
    }

    show() {
        this.isVisible = true;
        this.mesh.visible = true;
        this.updatePosition();

        let targetCamName = 'camera_main';

        // 1. Dynamic ID lookup based on current booth config
        if (state.boothConfig && state.controls?.currentCameraName) {
            const currentBooth = state.boothConfig.booths.find(b => b.boothCamera === state.controls.currentCameraName);
            if (currentBooth && currentBooth.modelCamera) {
                targetCamName = currentBooth.modelCamera;
                console.log(`[BillboardHUD] Config balance sync: ${targetCamName}`);
            } else if (state.boothConfig.mainFBOCamera) {
                targetCamName = state.boothConfig.mainFBOCamera;
                console.log(`[BillboardHUD] Defaulting to Main FBO Cam: ${targetCamName}`);
            }
        }

        // 2. CONTEXT AWARE VISIBILITY: 
        // Hide MODEL_CAR from Main Scene (Layer 0), Show in HUD (Layer 1)
        const car = state.modelCar;
        if (car) {
            car.traverse(c => {
                if (c.layers) {
                    // Only show to HUD camera (Layer 1) if it's actually visible on the car
                    // Avoid showing hidden base parts or booth items
                    if (c.visible && !c.name.includes('bound') && !c.name.includes('point')) {
                        c.layers.enable(1);
                    } else {
                        c.layers.disable(1);
                    }
                }
            });
        }

        // 3. Keep existing HUD clones intact (they persist across booth views)
        //    Do NOT clear clones or reset product materials here.

        // 4. Find and sync the Target Camera
        let glbTargetCam = null;
        if (state.modelCar) {
            state.modelCar.traverse(c => {
                if (c.isCamera && c.name === targetCamName) {
                    glbTargetCam = c;
                }
            });

            // Fallback to camera_main
            if (!glbTargetCam) {
                state.modelCar.traverse(c => {
                    if (c.isCamera && (c.name.toLowerCase() === 'camera_main' || c.name === 'Camera_Main')) {
                        glbTargetCam = c;
                    }
                });
            }
        }

        if (glbTargetCam) {
            console.log(`[BillboardHUD] HUD Camera Sync: ${glbTargetCam.name}`);
        }
        this.syncCameraWithMain(glbTargetCam);
    }

    hide() {
        this.isVisible = false;
        this.mesh.visible = false;

        // Restore MODEL_CAR to Main Scene (Layer 0), Hide from HUD (Layer 1)
        if (state.modelCarObj) {
            state.modelCarObj.traverse(c => {
                if (c.layers) {
                    // Restore main view
                    c.layers.enable(0);
                    c.layers.disable(1);
                }
            });
        }

        // Clear clones and reset product colours ONLY when fully exiting booth mode
        this.clearAllClones();

        if (this.hudOrbit) this.hudOrbit.enabled = false;
        if (state.controls && state.controls.orbit) {
            state.controls.orbit.enabled = true;
        }
    }

    update(time, deltaTime = 0.016) {
        if (!this.isVisible) return;

        // FBO Camera Transition Logic
        if (this.isTransitioning) {
            this.transitionProgress += deltaTime / this.transitionDuration;
            const t = MathUtils.smoothstep(this.transitionProgress, 0, 1);
            const t1 = 1 - t;

            // Quadratic Bezier Arc
            this.hudCamera.position.set(
                t1 * t1 * this.startPos.x + 2 * t1 * t * this.midPos.x + t * t * this.endPos.x,
                t1 * t1 * this.startPos.y + 2 * t1 * t * this.midPos.y + t * t * this.endPos.y,
                t1 * t1 * this.startPos.z + 2 * t1 * t * this.midPos.z + t * t * this.endPos.z
            );
            this.hudCamera.quaternion.slerpQuaternions(this.startQuat, this.endQuat, t);

            if (this.transitionProgress >= 1) {
                this.isTransitioning = false;
            }
        }

        // Floating Animation (Very Subtle, like Drei)
        const t = time * 0.001; // Normalize time
        const dragFactor = this.isDragging ? 0.0 : 1.0;

        // 1. Float Displacement (super gentle drift)
        const floatX = Math.cos(t / 2) * 0.003 * dragFactor;
        const floatY = Math.sin(t / 2) * 0.006 * dragFactor;

        // 2. Float Rotation (independent axis tilt, very slight)
        const floatRotX = Math.cos(t / 4) * 0.01 * dragFactor;
        const floatRotY = Math.sin(t / 4) * 0.01 * dragFactor;
        const floatRotZ = Math.sin(t / 4) * 0.01 * dragFactor;

        // Combine Targets
        const targetX = this._baseX + floatX;
        const targetY = this._baseY + floatY;

        const targetRotX = floatRotX;
        const targetRotY = floatRotY;
        const targetRotZ = floatRotZ;

        // Smoothly interpolate position
        this.mesh.position.x += (targetX - this.mesh.position.x) * 8 * deltaTime;
        this.mesh.position.y += (targetY - this.mesh.position.y) * 8 * deltaTime;

        // Smoothly interpolate rotation (creating the 3D float feel)
        this.mesh.rotation.x += (targetRotX - this.mesh.rotation.x) * 8 * deltaTime;
        this.mesh.rotation.y += (targetRotY - this.mesh.rotation.y) * 8 * deltaTime;
        this.mesh.rotation.z += (targetRotZ - this.mesh.rotation.z) * 8 * deltaTime;

        this.renderFBO();
    }

    renderFBO() {
        const renderer = state.renderer;
        const scene = state.scene;

        // HUD Mesh itself is on Layer 0 (default), so hudCamera (Layer 1) won't see it.
        // No need for traverse visibility toggling anymore!

        const oldTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.renderTarget);

        // We use the existing scene but hudCamera only sees Layer 1
        renderer.render(scene, this.hudCamera);

        renderer.setRenderTarget(oldTarget);
    }

    updatePosition() {
        if (!this.mainCamera) return;
        const distance = 0.8;
        const aspect = window.innerWidth / window.innerHeight;
        const fovRad = MathUtils.degToRad(this.mainCamera.fov);
        const h = 2 * distance * Math.tan(fovRad / 2);
        const w = h * aspect;

        // Apply custom size ratio - Make it square to match 1:1 FBO texture
        const planeW = w * this.sizeRatio;
        const planeH = planeW;

        this.mesh.scale.set(planeW, planeH, 1);

        const x = (w / 2) - (planeW / 2) - (w * 0.05);
        const y = -(h / 2) + (planeH / 2) + (h * 0.05);
        this.mesh.position.set(x, y, -distance);
        this._baseX = x;
        this._baseY = y;

        // Force camera to match 1:1 aspect
        this.hudCamera.aspect = 1;
        this.hudCamera.updateProjectionMatrix();
    }

    /** Remove all HUD clones and reset product materials — called when exiting booth mode */
    clearAllClones() {
        state.hudClones.forEach((clone, key) => {
            state.scene.remove(clone);
            clone.traverse(c => {
                if (c.material) c.material.dispose();
                if (c.geometry) c.geometry.dispose();
            });
        });
        state.hudClones.clear();
        state.activeProductId = null;

        // Reset product materials to random colours
        if (state.modelCar) {
            state.modelCar.traverse(c => {
                if (c.isMesh && c.name.toLowerCase().includes('sanpham')) {
                    c.material = new MeshStandardMaterial({
                        color: Math.floor(Math.random() * 16777215),
                        roughness: 0.5,
                        metalness: 0.5
                    });
                }
            });
        }
    }

    dispose() {
        this.mainCamera.remove(this.mesh);
        this.renderTarget.dispose();
        this.hudMaterial.dispose();
        this.mesh.geometry.dispose();
        if (this.hudOrbit) this.hudOrbit.dispose();
    }
}
