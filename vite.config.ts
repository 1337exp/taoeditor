import { defineConfig } from 'vite';

// Three entries, like TaoUX: no root import, so nothing that is not imported reaches a bundle.
// The lab (lab/index.html, served at /lab/ in dev) is not part of the build.
// Три входа, как у TaoUX: корневого импорта нет, поэтому не импортированное в сборку не попадает.
// Лаборатория (lab/index.html, в dev на /lab/) в сборку не входит.
export default defineConfig({
    base: './',
    build: {
        sourcemap: true,
        lib: {
            entry: { core: 'src/core/index.ts', editor: 'src/editor/index.ts', vue: 'src/vue/index.ts', 'vue-taoui': 'src/vue/taoui/index.ts' },
            formats: ['es'],
            fileName: (_format, name) => `${name}.js`,
        },
        rollupOptions: { external: [/^prosemirror-/, /^vue(\/|$)/, /^@1337exp\//] },
    },
});
