import { MeshStandardMaterial, Color } from 'three';

/**
 * Applies various hooks to model meshes based on patterns in scenegraph.json.
 * @param {THREE.Object3D} model The loaded model (group)
 * @param {Array} hooks Array of hook objects from JSON
 */
export function applyMeshHooks(model, hooks) {
    if (!hooks || !model) return;

    model.traverse(child => {
        if (!child.isMesh) return;

        hooks.forEach(hook => {
            if (!hook.pattern) return;

            // Regex conversion for names
            const patternStr = hook.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            const pattern = new RegExp(`^${patternStr}$`, 'i');

            if (pattern.test(child.name)) {

                // --- Hook 1: Material Override ---
                if (hook.type === 'material_override') {
                    console.log(`[MeshHook] Material Override for: ${child.name}`);
                    const params = hook.params || {};
                    const newMat = new MeshStandardMaterial({
                        color: new Color(params.color || '#ffffff'),
                        metalness: params.metalness !== undefined ? params.metalness : 0.0,
                        roughness: params.roughness !== undefined ? params.roughness : 1.0,
                        emissive: new Color(params.emissive || '#000000'),
                        emissiveIntensity: params.emissiveIntensity !== undefined ? params.emissiveIntensity : 0.0,
                        transparent: params.transparent || false,
                        opacity: params.opacity !== undefined ? params.opacity : 1.0
                    });

                    // Safe Disposal
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => m.dispose());
                    }
                    child.material = newMat;
                }

                // --- Hook 2: Visibility / Raycasting Override ---
                if (hook.type === 'visibility_override') {
                    const visible = hook.params?.visible !== undefined ? hook.params.visible : false;
                    const forRayOnly = hook.params?.rayOnly || false;

                    console.log(`[MeshHook] Pattern "${hook.pattern}" matched mesh: "${child.name}" (Visible=${visible}, RayOnly=${forRayOnly})`);

                    if (forRayOnly && !visible) {
                        // Special mode: Invisible to camera, but exists for Raycaster
                        // console.log(`[MeshHook] Setting Ray-Only trigger (invisible): ${child.name}`);

                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material = child.material.map(m => {
                                    const mClone = m.clone();
                                    mClone.visible = false;
                                    mClone.transparent = true;
                                    mClone.opacity = 0;
                                    return mClone;
                                });
                            } else {
                                const mClone = child.material.clone();
                                mClone.visible = false;
                                mClone.transparent = true;
                                mClone.opacity = 0;
                                child.material = mClone;
                            }
                        }
                        child.visible = true; // Essential for Raycaster interaction
                    } else {
                        // Regular visibility toggle
                        console.log(`[MeshHook] Visibility Override for: ${child.name} -> ${visible}`);
                        child.visible = visible;
                    }
                }
            }
        });
    });
}
