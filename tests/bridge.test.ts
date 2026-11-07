// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The contract of the TaoUI bridge: every `--tao-*` token that `src/styles/taoui.css` points at must be declared by the
 * installed TaoUI. If TaoUI renames or drops a token, this test says which one, instead of the editor quietly falling
 * back to its neutral look. (The fallback is the safety net, this test is the alarm.)
 *
 * Контракт моста к TaoUI: каждый токен `--tao-*`, на который указывает `src/styles/taoui.css`, должен объявляться
 * установленным TaoUI. Если TaoUI переименует или уберёт токен, тест скажет какой, а не редактор молча вернётся к
 * нейтральному виду. (Запасное значение — страховка, тест — сигнализация.)
 */
const read = (url: string): string => readFileSync(fileURLToPath(new URL(url, import.meta.url)), 'utf8');

const taoui = read('../node_modules/@1337exp/taoui/dist/styles.css');
const bridge = read('../src/styles/taoui.css');

const declared = new Set([...taoui.matchAll(/(--tao-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
const used = [...new Set([...bridge.matchAll(/var\((--tao-[a-z0-9-]+)/g)].map((m) => m[1]!))];

describe('TaoUI bridge', () => {
    it('reads the installed TaoUI tokens (guards the test itself against a silent empty parse)', () => {
        expect(declared.size).toBeGreaterThan(150);
        expect(used.length).toBeGreaterThan(15);
    });

    it('every token the bridge uses is declared by TaoUI', () => {
        const missing = used.filter((name) => !declared.has(name));
        expect(missing, `missing in TaoUI: ${missing.join(', ')}`).toEqual([]);
    });

    it('the bridge sets only --te-* variables', () => {
        const set = [...bridge.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!);
        expect(set.length).toBeGreaterThan(15);
        expect(set.filter((name) => !name.startsWith('--te-'))).toEqual([]);
    });
});
