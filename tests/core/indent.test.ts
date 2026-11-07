import { describe, expect, it } from 'vitest';
import { PROFILES, normalizeDoc, toHtml } from '../../src/core';

const text = (value: string) => ({ type: 'text', text: value });
const wrap = (...content: unknown[]) => ({ v: 1, content });
const para = (attrs: unknown, ...content: unknown[]) => ({ type: 'paragraph', attrs, content });

describe('indent in the document', () => {
    it('0 is the default and is not written; 1 to 8 are kept', () => {
        const { doc, issues } = normalizeDoc(wrap(para({ indent: 0 }, text('a')), para({ indent: 3 }, text('b')), para({ indent: 8 }, text('c'))), PROFILES.article);
        expect(issues).toEqual([]);
        expect(doc.content.map((b) => b.attrs ?? null)).toEqual([null, { indent: 3 }, { indent: 8 }]);
    });

    it.each([9, -1, 1.5, '2', null, {}])('%j is not an indent: back to 0 and reported', (value) => {
        const { doc, issues } = normalizeDoc(wrap(para({ indent: value }, text('a'))), PROFILES.article);
        expect(doc.content[0].attrs).toBeUndefined();
        expect(issues.length === 0 || issues[0].code === 'bad-attr').toBe(true);
    });

    it('a heading can be indented too', () => {
        const { doc } = normalizeDoc(wrap({ type: 'heading', attrs: { level: 2, indent: 1 }, content: [text('T')] }), PROFILES.article);
        expect(doc.content[0].attrs).toEqual({ level: 2, indent: 1 });
    });
});

describe('indent when shown', () => {
    it('is a class, never an inline style', () => {
        const html = toHtml(wrap(para({ indent: 2 }, text('a')), para({}, text('b')), { type: 'heading', attrs: { indent: 1 }, content: [text('T')] }));
        expect(html).toBe('<p class="tao-indent-2">a</p><p>b</p><h1 class="tao-indent-1">T</h1>');
        expect(html).not.toContain('style');
    });

    it('a forged value cannot put anything into the class', () => {
        const html = toHtml(wrap(para({ indent: '2 onclick=x' }, text('a')), para({ indent: 99 }, text('b'))));
        expect(html).toBe('<p>a</p><p>b</p>');
    });
});
