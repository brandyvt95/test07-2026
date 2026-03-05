import { MeshStandardMaterial, Color } from 'three';

export class MonochromeMaterial extends MeshStandardMaterial {
    constructor(colorString = '#ffffff', metalness = 0.5, roughness = 0.5) {
        super({
            color: new Color(colorString),
            metalness: metalness,
            roughness: roughness,
            // You can add custom shader logic here using onBeforeCompile if needed 
            // but for PathTracer, standard properties are best.
        });
    }
}
