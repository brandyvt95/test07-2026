import { Vector3, Quaternion, MathUtils } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state } from './state.js';

export class Controls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Transition tracking
        this.currentCameraName = 'camera_main';
        this.isTransitioning = false;
        this.transitionProgress = 0;
        this.transitionDuration = 1.2;

        this.startPos = new Vector3();
        this.startQuat = new Quaternion();
        this.startTarget = new Vector3();

        this.endPos = new Vector3();
        this.endQuat = new Quaternion();
        this.endTarget = new Vector3();

        // Standard Orbit Interaction
        this.orbit = new OrbitControls(this.camera, this.domElement);
        this.orbit.enableDamping = true;
        this.orbit.dampingFactor = 0.05;
        this.orbit.screenSpacePanning = true;

        console.log("[Controls] Initialized with Transition support (Independent Billboard Mode).");
    }

    applyGlbCamera(model) {
        let glbCamera = null;
        model.traverse(child => {
            if (child.isCamera && (child.name.toLowerCase() === 'camera_main' || child.name === 'Camera_Main')) {
                glbCamera = child;
            }
        });

        if (glbCamera) {
            console.log(`[Controls] Initialized at main view: ${glbCamera.name}`);
            glbCamera.updateMatrixWorld(true);

            const worldPos = new Vector3();
            const worldQuat = new Quaternion();
            glbCamera.getWorldPosition(worldPos);
            glbCamera.getWorldQuaternion(worldQuat);

            this.camera.position.copy(worldPos);
            this.camera.quaternion.copy(worldQuat);
            this.camera.updateMatrixWorld();

            if (glbCamera.isPerspectiveCamera) {
                this.camera.fov = glbCamera.fov;
                this.camera.updateProjectionMatrix();
            }

            this.orbit.target.set(0, 0, 0);
            this.orbit.update();
            this.currentCameraName = glbCamera.name;
        }
    }

    transitionTo(targetObj, orbitCenter) {
        // Validation: No redundant transitions
        if (this.currentCameraName === targetObj.name && !this.isTransitioning) {
            console.log(`[Controls] Camera [${targetObj.name}] is already active.`);
            return;
        }

        console.log(`[Controls] Transitioning: ${this.currentCameraName} -> ${targetObj.name}`);

        const goingToBooth = targetObj.name.includes('gianhang');
        const wasInBooth = this.currentCameraName.includes('gianhang');

        if (!goingToBooth && state.billboard) {
            // Leaving booth mode entirely -> hide billboard and clear all clones
            state.billboard.hide();
        } else if (goingToBooth && wasInBooth && state.billboard) {
            // Switching between booths -> trigger HUD camera transition
            const match = targetObj.name.match(/\d+$/);
            if (match && state.modelCar) {
                const targetCamName = `camera_sanpham_${match[0]}`;
                let glbTargetCam = null;
                state.modelCar.traverse(c => {
                    if (c.isCamera && c.name === targetCamName) glbTargetCam = c;
                });
                if (glbTargetCam) {
                    state.billboard.syncCameraWithMain(glbTargetCam);
                }
            }
        }

        // 1. Store START
        this.startPos.copy(this.camera.position);
        this.startQuat.copy(this.camera.quaternion);
        this.startTarget.copy(this.orbit.target);

        // 2. Define END (World Space)
        targetObj.updateMatrixWorld(true);
        targetObj.getWorldPosition(this.endPos);
        targetObj.getWorldQuaternion(this.endQuat);

        if (orbitCenter) {
            this.endTarget.copy(orbitCenter);
        } else {
            this.endTarget.set(0, 0, 0);
        }

        this.currentCameraName = targetObj.name;
        this.isTransitioning = true;
        this.transitionProgress = 0;

        if (state.ptManager) state.ptManager.reset();
    }

    update(deltaTime = 0.016) {
        if (this.isTransitioning) {
            this.transitionProgress += deltaTime / this.transitionDuration;
            const t = MathUtils.smoothstep(this.transitionProgress, 0, 1);

            // Interpolate View state
            this.camera.position.lerpVectors(this.startPos, this.endPos, t);
            this.camera.quaternion.slerpQuaternions(this.startQuat, this.endQuat, t);
            this.orbit.target.lerpVectors(this.startTarget, this.endTarget, t);

            this.camera.updateMatrixWorld();
            this.orbit.update();

            // Notify PathTracer to reset during motion for non-blurred visuals
            if (state.ptManager) state.ptManager.updateCamera();

            if (this.transitionProgress >= 1) {
                this.isTransitioning = false;
                console.log(`[Controls] ARRIVED at: ${this.currentCameraName}`);

                // Action: Show Billboard if we arrived at a booth view
                if (this.currentCameraName.includes('gianhang')) {
                    if (state.billboard) state.billboard.show();
                }

                if (state.ptManager) state.ptManager.reset();
            }
        } else {
            this.orbit.update();
        }
    }

    setTarget(v) {
        this.orbit.target.copy(v);
        this.orbit.update();
    }

    dispose() {
        this.orbit.dispose();
    }
}
