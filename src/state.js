export const state = {
    floorPlane: null,
    gui: null,
    stats: null,
    ptManager: null, // renamed from pathTracer to match usage in main.js
    renderer: null,
    orthoCamera: null,
    perspectiveCamera: null,
    activeCamera: null,
    controls: null,
    scene: null,
    model: null,
    gradientMap: null,
    loader: null,
    models: {},
    keys: null,
    _fpHint: null,
    modelCarObj: null,
    hudClones: new Map(), // Map to track product clones by booth ID
    originalMaterials: new Map(), // Map<productId, Map<childUuid, material>> — saved before colour change
    activeProductId: null,
    nav: null,
};
