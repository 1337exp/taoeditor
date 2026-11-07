// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The bridge is a contract (the same one as in TaoUX 0.9):
 *  - `src/styles/taoui.css` is the ONLY file that names a `--tao-*` token; everything else reads `--te-*` with a
 *    built-in fallback, so the package looks right without TaoUI;
 *  - every theme variable (colour, font, radius, shadow) that the package reads is mapped by the bridge;
 *  - the bridge points only at tokens that the installed TaoUI defines, and maps only variables that are read.
 * If TaoUI renames or drops a token, or a component starts reading a new themed variable, a test names it.
 *
 * Мост — контракт (тот же, что в TaoUX 0.9): только `taoui.css` называет токены `--tao-*`; всё остальное читает
 * `--te-*` с запасным значением; каждая тематическая переменная (цвет, шрифт, радиус, тень) сопоставлена мосту;
 * мост указывает только на токены установленного TaoUI и сопоставляет только читаемые переменные.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
    });
const rel = (file: string): string => file.slice(root.length).replaceAll('\\', '/');

const bridge = read('src/styles/taoui.css');
const mapped = new Map([...bridge.matchAll(/(--te-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));

const sources = walk(join(root, 'src')).filter((f) => /\.(css|ts|vue)$/.test(f) && !f.endsWith('taoui.css'));
const used = new Set(sources.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/var\((--te-[a-z0-9-]+)/g)].map((m) => m[1]!)));

/** What the bridge is for: colours, fonts, corner radii, shadows. Sizes, gaps, columns and z-order stay with the package. */
const isThemed = (name: string): boolean =>
    /(-bg|-text|-text-muted|-link|-border|-border-focus|-focus|-placeholder|-radius|-shadow|-font-family|-code-font|-error)$/.test(name) ||
    name === '--te-text' ||
    name === '--te-link' ||
    name === '--te-border' ||
    name === '--te-radius' ||
    name === '--te-focus' ||
    name === '--te-font-family';

describe('the TaoUI bridge (src/styles/taoui.css)', () => {
    it('reads what it should (guards the test itself against an empty parse)', () => {
        expect(mapped.size).toBeGreaterThan(20);
        expect(used.size).toBeGreaterThan(20);
    });

    it('maps every theme variable (colour, font, radius, shadow) that the package reads', () => {
        const missing = [...used].filter((name) => isThemed(name) && !mapped.has(name));
        expect(missing, `read but not mapped: ${missing.join(', ')}`).toEqual([]);
    });

    it('maps only variables that the package reads', () => {
        const unknown = [...mapped.keys()].filter((name) => !used.has(name));
        expect(unknown, `mapped but never read: ${unknown.join(', ')}`).toEqual([]);
    });

    it('points only at tokens that the installed TaoUI defines', () => {
        // TaoUI keeps its tokens in src/styles/{tokens,themes,contexts}/*.css: read them all, not one file name
        const styles = walk(join(root, 'node_modules/@1337exp/taoui/src/styles'))
            .filter((f) => f.endsWith('.css'))
            .map((f) => readFileSync(f, 'utf8'))
            .join('\n');
        const defined = new Set([...styles.matchAll(/(--tao-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
        expect(defined.size).toBeGreaterThan(150);
        const referenced = [...new Set([...bridge.matchAll(/var\((--tao-[a-z0-9-]+)/g)].map((m) => m[1]!))];
        expect(referenced.length).toBeGreaterThan(15);
        expect(referenced.filter((name) => !defined.has(name))).toEqual([]);
    });

    it('is the only place that names a TaoUI token, and it sets only --te-* variables', () => {
        const offenders = sources.filter((f) => /--tao-/.test(readFileSync(f, 'utf8'))).map(rel);
        expect(offenders).toEqual([]);
        const set = [...bridge.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!);
        expect(set.filter((name) => !name.startsWith('--te-'))).toEqual([]);
    });

    it('is shipped: exported and in the build', () => {
        const pkg = JSON.parse(read('package.json')) as { exports: Record<string, unknown>; files: string[] };
        expect(pkg.exports['./taoui.css']).toBe('./dist/taoui.css');
        expect(pkg.files).toContain('dist');
        expect(read('scripts/copy-css.mjs')).toContain('src/styles');
    });
});
