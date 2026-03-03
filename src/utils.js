import { EquirectangularReflectionMapping } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { params, orthoWidth } from './params.js';
import { state } from './state.js';

export function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio;

    state.renderer.setSize(w, h);
    state.renderer.setPixelRatio(dpr);

    const aspect = w / h;
    state.perspectiveCamera.aspect = aspect;
    state.perspectiveCamera.updateProjectionMatrix();

    const orthoHeight = orthoWidth / aspect;
    state.orthoCamera.top = orthoHeight / 2;
    state.orthoCamera.bottom = orthoHeight / - 2;
    state.orthoCamera.updateProjectionMatrix();

    state.ptManager.updateCamera();
}

export function updateCameraProjection(cameraProjection) {
    if (state.activeCamera) {
        state.perspectiveCamera.position.copy(state.activeCamera.position);
        state.orthoCamera.position.copy(state.activeCamera.position);
    }

    if (cameraProjection === 'Perspective') {
        state.activeCamera = state.perspectiveCamera;
    } else {
        state.activeCamera = state.orthoCamera;
    }

    state.controls.object = state.activeCamera;
    state.controls.update();
    state.ptManager.setCamera(state.activeCamera);
}

export function updateEnvMap() {
    new HDRLoader()
        .load(params.envMap, texture => {
            if (state.scene.environment) {
                state.scene.environment.dispose();
            }
            texture.mapping = EquirectangularReflectionMapping;
            state.scene.environment = texture;
            state.ptManager.updateEnvironment();
            onParamsChange();
        });
}

export function onParamsChange() {
    const { ptManager, floorPlane, scene, renderer, gradientMap } = state;

    ptManager.multipleImportanceSampling = params.multipleImportanceSampling;
    ptManager.bounces = params.bounces;
    ptManager.filterGlossyFactor = params.filterGlossyFactor;
    ptManager.renderScale = params.renderScale;

    floorPlane.material.color.set(params.floorColor);
    floorPlane.material.roughness = params.floorRoughness;
    floorPlane.material.metalness = params.floorMetalness;
    floorPlane.material.opacity = params.floorOpacity;

    scene.environmentIntensity = params.environmentIntensity;
    scene.environmentRotation.y = params.environmentRotation;
    scene.backgroundBlurriness = params.backgroundBlur;

    if (params.backgroundType === 'Gradient') {
        gradientMap.topColor.set(params.bgGradientTop);
        gradientMap.bottomColor.set(params.bgGradientBottom);
        gradientMap.update();

        scene.background = gradientMap;
        scene.backgroundIntensity = 1;
        scene.environmentRotation.y = 0;
    } else {
        scene.background = scene.environment;
        scene.backgroundIntensity = params.environmentIntensity;
        scene.backgroundRotation.y = params.environmentRotation;
    }

    if (params.transparentBackground) {
        scene.background = null;
        renderer.setClearAlpha(0);
    }

    ptManager.updateMaterials();
    ptManager.updateEnvironment();
}
