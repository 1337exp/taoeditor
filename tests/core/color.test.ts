import { describe, expect, it } from 'vitest';
import { PROFILES, isPageInk, normalizeDoc, parseColor, toHtml, toPlainText } from '../../src/core';

describe('parseColor', () => {
    it.each([
        ['#ff0000', '#ff0000'],
        ['#FF0000', '#ff0000'],
        ['#f00', '#ff0000'],
        ['#AbC', '#aabbcc'],
        ['rgb(255, 0, 0)', '#ff0000'],
        ['rgb(255,0,0)', '#ff0000'],
        ['rgb(0 128 255)', '#0080ff'],
        ['rgba(1, 2, 3, 1)', '#010203'],
        ['rgba(1, 2, 3, 100%)', '#010203'],
        ['  #123456  ', '#123456'],
    ])('reads %s as %s', (input, expected) => {
        expect(parseColor(input)).toBe(expected);
    });

    it.each([
        'red',
        'transparent',
        'currentColor',
        'var(--x)',
        '#ff',
        '#fffff',
        '#fffffff',
        '#gg0000',
        'rgb(256, 0, 0)',
        'rgb(1, 2)',
        'rgba(1, 2, 3, 0.5)',
        'rgba(1, 2, 3, 0)',
        'hsl(0, 100%, 50%)',
        '#ff0000;background:url(x)',
        '#ff0000" onclick="x',
        'url(javascript:alert(1))',
        'expression(alert(1))',
        '',
        '#' + 'f'.repeat(50),
    ])('refuses %j', (input) => {
        expect(parseColor(input)).toBeUndefined();
    });

    it.each([null, undefined, 5, {}, []])('refuses a non-string %j', (input) => {
        expect(parseColor(input)).toBeUndefined();
    });

    it('black and white are the page ink, nothing else is', () => {
        expect(isPageInk('#000000')).toBe(true);
        expect(isPageInk('#ffffff')).toBe(true);
        expect(isPageInk('#000001')).toBe(false);
        expect(isPageInk('#ff0000')).toBe(false);
    });
});

const text = (value: string, marks?: unknown) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const wrap = (...content: unknown[]) => ({ v: 1, content });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const norm = (input: unknown) => normalizeDoc(input, PROFILES.chat);

describe('colour marks in the document', () => {
    it('are stored as #rrggbb, whatever form came in, in canonical order between strike and spoiler', () => {
        const { doc, issues } = norm(
            wrap(para(text('x', [{ type: 'spoiler' }, { type: 'background', attrs: { value: 'RGB(0, 255, 0)' } }, { type: 'color', attrs: { value: '#F00' } }, { type: 'strike' }]))),
        );
        expect(issues).toEqual([]);
        expect(doc.content[0].content![0].marks).toEqual([
            { type: 'strike' },
            { type: 'color', attrs: { value: '#ff0000' } },
            { type: 'background', attrs: { value: '#00ff00' } },
            { type: 'spoiler' },
        ]);
    });

    it.each([
        [{ type: 'color', attrs: { value: 'red' } }],
        [{ type: 'color', attrs: { value: '#ff0000;background:url(x)' } }],
        [{ type: 'background', attrs: {} }],
        [{ type: 'color' }],
        [{ type: 'color', attrs: { value: 5 } }],
    ])('a bad colour loses the mark, the text stays: %j', (mark) => {
        const { doc, issues } = norm(wrap(para(text('x', [mark]))));
        expect(doc).toEqual(wrap(para(text('x'))));
        expect(issues.map((i) => i.code)).toContain('bad-attr');
    });

    it('code wins over colours; a colour and a link live together', () => {
        const color = { type: 'color', attrs: { value: '#ff0000' } };
        expect(norm(wrap(para(text('c', [color, { type: 'code' }])))).doc.content[0].content![0].marks).toEqual([{ type: 'code' }]);
        const link = { type: 'link', attrs: { href: 'https://666.io' } };
        expect(norm(wrap(para(text('l', [color, link])))).doc.content[0].content![0].marks?.map((m) => m.type)).toEqual(['link', 'color']);
    });

    it('neighbours with the same colour merge, with another colour stay apart', () => {
        const red = { type: 'color', attrs: { value: '#ff0000' } };
        const blue = { type: 'color', attrs: { value: '#0000ff' } };
        const { doc } = norm(wrap(para(text('a', [red]), text('b', [{ type: 'color', attrs: { value: '#F00' } }]), text('c', [blue]))));
        expect(doc.content[0].content).toEqual([text('ab', [red]), text('c', [blue])]);
    });

    it('do not change the plain text', () => {
        const { doc } = norm(wrap(para(text('hi', [{ type: 'color', attrs: { value: '#ff0000' } }]))));
        expect(toPlainText(doc)).toBe('hi');
    });
});

describe('colour marks when shown', () => {
    it('are a span with a style that holds the colour and nothing else', () => {
        const input = wrap(para(text('a', [{ type: 'color', attrs: { value: '#ff0000' } }, { type: 'background', attrs: { value: '#ffff00' } }])));
        expect(toHtml(input)).toBe('<p><span style="color:#ff0000"><span style="background-color:#ffff00">a</span></span></p>');
    });

    it('a forged value cannot reach the style attribute', () => {
        const out = toHtml(wrap(para(text('a', [{ type: 'color', attrs: { value: '#f00" onmouseover="x' } }, { type: 'background', attrs: { value: 'url(javascript:x)' } }]))));
        expect(out).toBe('<p>a</p>');
        expect(out).not.toMatch(/style|onmouseover|javascript/);
    });
});
