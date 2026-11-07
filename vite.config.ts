import { defineConfig } from 'vite';

// The package is a library; the lab (lab/index.html, served at /lab/ in dev) is not part of the build.
// Пакет это библиотека; лаборатория (lab/index.html, в dev на /lab/) в сборку не входит.
export default defineConfig({
    base: './',
    build: {
        sourcemap: true,
        lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index' },
        rollupOptions: { external: [/^prosemirror-/] },
    },
});
