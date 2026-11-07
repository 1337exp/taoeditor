// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The layers keep the promise "others can use it without TaoUI":
 *   core    imports nothing but itself (no DOM, no engine, no Vue): runs on a server;
 *   editor  imports the engine (prosemirror-*) and core;
 *   vue     imports vue and core (the viewer) and may import the editor; only files under `vue/taoui/` may import TaoUI.
 * And nothing in src may write markup from a string or run code from one.
 *
 * Слои держат обещание «другие могут пользоваться без TaoUI»: ядро ничего не импортирует, кроме себя;
 * editor — движок и ядро; vue — vue и ядро (показ), может editor; только файлам в `vue/taoui/` можно TaoUI.
 * И нигде в src нельзя собирать разметку из строки или выполнять код из строки.
 */
const src = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

const files = walk(src).filter((f) => /\.(ts|vue)$/.test(f));
const rel = (f: string): string => relative(src, f).replaceAll('\\', '/');

function imports(file: string): string[] {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

/** Where a relative import lands, as a path inside src (`core/index`, `editor/x`). */
function target(file: string, spec: string): string {
    return relative(src, join(file, '..', spec)).replaceAll('\\', '/');
}

describe('layers', () => {
    it('core imports only core', () => {
        for (const file of files.filter((f) => rel(f).startsWith('core/'))) {
            for (const spec of imports(file)) {
                expect(spec.startsWith('./') || (spec.startsWith('../') && target(file, spec).startsWith('core')), `${rel(file)} → ${spec}`).toBe(true);
            }
        }
    });

    it('editor imports the engine and core, nothing else', () => {
        for (const file of files.filter((f) => rel(f).startsWith('editor/'))) {
            for (const spec of imports(file)) {
                const ok = spec.startsWith('prosemirror-') || spec.startsWith('./') || (spec.startsWith('../') && /^core(\/|$)/.test(target(file, spec)));
                expect(ok, `${rel(file)} → ${spec}`).toBe(true);
            }
        }
    });

    it('vue imports vue, core and the editor; TaoUI only from vue/taoui/', () => {
        for (const file of files.filter((f) => rel(f).startsWith('vue/'))) {
            for (const spec of imports(file)) {
                if (spec.startsWith('@1337exp/taoui')) {
                    expect(rel(file).startsWith('vue/taoui/'), `${rel(file)} imports TaoUI outside vue/taoui/`).toBe(true);
                    continue;
                }
                const ok = spec === 'vue' || spec.startsWith('./') || (spec.startsWith('../') && /^(core|editor)(\/|$)/.test(target(file, spec)));
                expect(ok, `${rel(file)} → ${spec}`).toBe(true);
            }
        }
    });

    it('the viewer does not load the editing engine', () => {
        for (const file of files.filter((f) => rel(f) === 'vue/TaoEditorView.ts')) {
            for (const spec of imports(file)) expect(/editor|prosemirror/.test(spec), `${rel(file)} → ${spec}`).toBe(false);
        }
    });

    it('no markup from strings and no code from strings anywhere in src', () => {
        const banned = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|v-html|dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(/;
        for (const file of files) {
            // comments may name the banned things; code may not
            const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            expect(banned.test(code), rel(file)).toBe(false);
        }
    });
});
