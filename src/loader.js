import {
    MeshPhysicalMaterial,
    LoadingManager,
    MeshStandardMaterial,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js';
import { LDrawUtils } from 'three/examples/jsm/utils/LDrawUtils.js';
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js';

export function convertOpacityToTransmission(model, ior) {
    model.traverse(c => {
        if (c.material) {
            const material = c.material;
            if (material.opacity < 0.65 && material.opacity > 0.2) {
                const newMaterial = new MeshPhysicalMaterial();
                for (const key in material) {
                    if (key in material) {
                        if (material[key] === null) continue;
                        if (material[key].isTexture) {
                            newMaterial[key] = material[key];
                        } else if (material[key].copy && material[key].constructor === newMaterial[key].constructor) {
                            newMaterial[key].copy(material[key]);
                        } else if ((typeof material[key]) === 'number') {
                            newMaterial[key] = material[key];
                        }
                    }
                }
                newMaterial.opacity = 1.0;
                newMaterial.transmission = 1.0;
                newMaterial.ior = ior;
                const hsl = {};
                newMaterial.color.getHSL(hsl);
                hsl.l = Math.max(hsl.l, 0.35);
                newMaterial.color.setHSL(hsl.h, hsl.s, hsl.l);
                c.material = newMaterial;
            }
        }
    });
}

export async function loadModel(url, onProgress) {
    const manager = new LoadingManager();
    if (/dae$/i.test(url)) {
        const complete = new Promise(resolve => manager.onLoad = resolve);
        const res = await new ColladaLoader(manager).loadAsync(url, progress => {
            if (progress.total !== 0 && progress.total >= progress.loaded) {
                onProgress(progress.loaded / progress.total);
            }
        });
        await complete;
        res.scene.scale.setScalar(1);
        res.scene.traverse(c => {
            const { material } = c;
            if (material && material.isMeshPhongMaterial) {
                c.material = new MeshStandardMaterial({
                    color: material.color,
                    roughness: material.roughness || 0,
                    metalness: material.metalness || 0,
                    map: material.map || null,
                });
            }
        });
        return res.scene;
    } else if (/(gltf|glb)$/i.test(url)) {
        const complete = new Promise(resolve => manager.onLoad = resolve);
        const gltf = await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).loadAsync(url, progress => {
            if (progress.total !== 0 && progress.total >= progress.loaded) {
                onProgress(progress.loaded / progress.total);
            }
        });
        await complete;
        return gltf.scene;
    } else if (/mpd$/i.test(url)) {
        manager.onProgress = (url, loaded, total) => {
            onProgress(loaded / total);
        };
        const complete = new Promise(resolve => manager.onLoad = resolve);
        const ldrawLoader = new LDrawLoader(manager);
        ldrawLoader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
        await ldrawLoader.preloadMaterials('https://raw.githubusercontent.com/gkjohnson/ldraw-parts-library/master/colors/ldcfgalt.ldr');
        const result = await ldrawLoader
            .setPartsLibraryPath('https://raw.githubusercontent.com/gkjohnson/ldraw-parts-library/master/complete/ldraw/')
            .loadAsync(url);
        await complete;
        const model = LDrawUtils.mergeObject(result);
        model.rotation.set(Math.PI, 0, 0);
        const toRemove = [];
        model.traverse(c => {
            if (c.isLineSegments) toRemove.push(c);
            if (c.isMesh) c.material.roughness *= 0.25;
        });
        toRemove.forEach(c => c.parent.remove(c));
        return model;
    }
}
