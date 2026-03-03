import { defineConfig } from 'vite';

export default defineConfig({
    optimizeDeps: {
        exclude: ['three-mesh-bvh'],
    },
    worker: {
        format: 'es',
    },
});
