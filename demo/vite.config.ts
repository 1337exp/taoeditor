import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = fileURLToPath(new URL('../src', import.meta.url));

// The demo imports the package the way a project would (`@1337exp/taoeditor/vue/taoui`), and Vite points those names
// at the sources in this repository. It is a page for looking at everything at once, not a part of the package.
// Демо импортирует пакет так же, как проект (`@1337exp/taoeditor/vue/taoui`), а Vite наводит эти имена на исходники
// в этом репозитории. Это страница, чтобы разглядывать всё сразу, а не часть пакета.
export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    base: './',
    plugins: [vue()],
    resolve: {
        alias: [
            { find: /^@1337exp\/taoeditor\/core$/, replacement: `${src}/core/index.ts` },
            { find: /^@1337exp\/taoeditor\/editor$/, replacement: `${src}/editor/index.ts` },
            { find: /^@1337exp\/taoeditor\/vue\/taoui$/, replacement: `${src}/vue/taoui/index.ts` },
            { find: /^@1337exp\/taoeditor\/vue$/, replacement: `${src}/vue/index.ts` },
            { find: /^@1337exp\/taoeditor\/(content|editor|taoui)\.css$/, replacement: `${src}/styles/$1.css` },
        ],
    },
    server: { port: 5197, strictPort: true },
    build: { outDir: '../demo-dist', emptyOutDir: true, sourcemap: true },
});
