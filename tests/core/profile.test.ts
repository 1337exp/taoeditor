import { describe, expect, it } from 'vitest';
import { PROFILES, defineProfile, normalizeDoc, resolveProfile, toHtml, withoutFeatures } from '../../src/core';

const text = (value: string, marks?: unknown) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const wrap = (...content: unknown[]) => ({ v: 1, content });
const para = (attrs: unknown, ...content: unknown[]) => ({ type: 'paragraph', attrs, content });

describe('withoutFeatures', () => {
    it('takes marks, nodes and features out of a ready profile, and says it is a made one', () => {
        const p = withoutFeatures('article', { marks: ['bold', 'spoiler'], nodes: ['blockquote'], features: ['align'] });
        expect(p.name).toBe('article*');
        expect(p.marks).not.toContain('bold');
        expect(p.marks).not.toContain('spoiler');
        expect(p.marks).toContain('italic');
        expect(p.nodes).not.toContain('blockquote');
        expect(p.nodes).toContain('bulletList');
        expect(p.features).toEqual(['indent']);
    });

    it('does not change the ready profile', () => {
        withoutFeatures('article', { marks: ['bold'] });
        expect(PROFILES.article.marks).toContain('bold');
    });

    it('lists go with their items: no list left, no listItem', () => {
        const p = withoutFeatures('article', { nodes: ['bulletList', 'orderedList'] });
        expect(p.nodes).not.toContain('listItem');
        expect(withoutFeatures('article', { nodes: ['bulletList'] }).nodes).toContain('listItem');
    });

    it('the spacing hint of the base is kept', () => {
        expect(withoutFeatures('article', { marks: ['bold'] }).spaced).toBe(true);
        expect(withoutFeatures('chat', { marks: ['bold'] }).spaced).toBeUndefined();
    });

    it('a typo throws, and so does removing what cannot go', () => {
        expect(() => withoutFeatures('chat', { marks: ['bolt'] })).toThrow(/unknown mark "bolt"/);
        expect(() => withoutFeatures('chat', { nodes: ['tabel'] })).toThrow(/unknown node/);
        expect(() => withoutFeatures('chat', { features: ['alin'] })).toThrow(/unknown feature/);
        expect(() => withoutFeatures('chat', { nodes: ['paragraph'] })).toThrow(/cannot be removed/);
        expect(() => withoutFeatures('chat', { nodes: ['text'] })).toThrow(/cannot be removed/);
        expect(() => withoutFeatures('chat', { nodes: ['doc'] })).toThrow(/unknown node/);
        expect(() => withoutFeatures('chat', { marks: ['constructor'] })).toThrow(/unknown mark/);
    });
});

describe('defineProfile', () => {
    it('makes a profile from nothing: paragraph, text and line breaks are always there', () => {
        const p = defineProfile({ name: 'notes', nodes: ['blockquote'], marks: ['bold', 'link'] });
        expect(p.nodes).toEqual(expect.arrayContaining(['paragraph', 'text', 'hardBreak', 'blockquote']));
        expect(p.marks).toEqual(['bold', 'link']);
        expect(p.features).toEqual([]);
    });

    it('lists bring listItem, a lone listItem is dropped', () => {
        expect(defineProfile({ name: 'a', nodes: ['bulletList'], marks: [] }).nodes).toContain('listItem');
        expect(defineProfile({ name: 'b', nodes: ['listItem'], marks: [] }).nodes).not.toContain('listItem');
    });

    it('checks the names', () => {
        expect(() => defineProfile({ name: 'x', nodes: ['nope'], marks: [] })).toThrow(/unknown node/);
        expect(() => defineProfile({ name: 'x', nodes: [], marks: ['nope'] })).toThrow(/unknown mark/);
        expect(() => defineProfile({ name: 'x', nodes: [], marks: [], features: ['nope'] })).toThrow(/unknown feature/);
    });

    it('resolveProfile takes a name or a profile', () => {
        expect(resolveProfile('chat')).toBe(PROFILES.chat);
        const own = defineProfile({ name: 'own', nodes: [], marks: [] });
        expect(resolveProfile(own)).toBe(own);
    });
});

describe('a profile that leaves a feature out leaves it out of the document', () => {
    const noBold = withoutFeatures('article', { marks: ['bold'] });

    it('a mark that is out is dropped from a stored document, the text stays, and it is reported', () => {
        const { doc, issues } = normalizeDoc(wrap(para({}, text('a', [{ type: 'bold' }, { type: 'italic' }]))), noBold);
        expect(doc.content[0].content).toEqual([text('a', [{ type: 'italic' }])]);
        expect(issues.map((i) => i.code)).toEqual(['bad-mark']);
    });

    it('the viewer of that profile shows it without the mark', () => {
        const input = wrap(para({}, text('a', [{ type: 'bold' }])));
        expect(toHtml(input, noBold)).toBe('<p>a</p>');
        expect(toHtml(input, PROFILES.article)).toBe('<p><strong>a</strong></p>');
    });

    it('a block attribute of a feature that is out is not there, quietly (a richer document in a poorer profile)', () => {
        const input = wrap(para({ indent: 2, align: 'center' }, text('a')));
        const none = withoutFeatures('article', { features: ['indent', 'align'] });
        const { doc, issues } = normalizeDoc(input, none);
        expect(doc.content[0].attrs).toBeUndefined();
        expect(issues).toEqual([]);
        expect(toHtml(input, none)).toBe('<p>a</p>');
        expect(toHtml(input, PROFILES.article)).toBe('<p class="tao-indent-2 tao-align-center">a</p>');
        expect(normalizeDoc(input, withoutFeatures('article', { features: ['align'] })).doc.content[0].attrs).toEqual({ indent: 2 });
    });

    it('a node that is out is unwrapped, its text stays', () => {
        const noQuote = withoutFeatures('article', { nodes: ['blockquote'] });
        const { doc } = normalizeDoc(wrap({ type: 'blockquote', content: [para({}, text('q'))] }), noQuote);
        expect(doc.content[0].type).toBe('paragraph');
    });

    it('the ready profiles: chat and comment have no indent or alignment, the article has', () => {
        expect(PROFILES.chat.features).toEqual([]);
        expect(PROFILES.comment.features).toEqual([]);
        expect(PROFILES.article.features).toEqual(['indent', 'align']);
        expect(PROFILES.article.spaced).toBe(true);
    });
});

describe('alignment and size in the document', () => {
    it('alignment: left is the default and is not written; the others are kept; nonsense is dropped', () => {
        const ok = normalizeDoc(wrap(para({ align: 'left' }, text('a')), para({ align: 'center' }, text('b')), para({ align: 'justify' }, text('c'))), PROFILES.article).doc;
        expect(ok.content.map((b) => b.attrs ?? null)).toEqual([null, { align: 'center' }, { align: 'justify' }]);
        for (const bad of ['middle', 'CENTER', 5, null, '']) {
            expect(normalizeDoc(wrap(para({ align: bad }, text('a'))), PROFILES.article).doc.content[0].attrs).toBeUndefined();
        }
    });

    it('alignment is a class, forged values cannot reach it', () => {
        expect(toHtml(wrap(para({ align: 'right', indent: 1 }, text('a'))))).toBe('<p class="tao-indent-1 tao-align-right">a</p>');
        expect(toHtml(wrap(para({ align: 'center onclick=x' }, text('a'))))).toBe('<p>a</p>');
    });

    it('size is a mark with three values, shown as a class; another value drops the mark', () => {
        for (const value of ['small', 'large', 'huge']) {
            expect(toHtml(wrap(para({}, text('a', [{ type: 'size', attrs: { value } }]))))).toBe(`<p><span class="tao-text-${value}">a</span></p>`);
        }
        for (const bad of ['normal', 'big', '', 5, 'huge onclick=x']) {
            expect(toHtml(wrap(para({}, text('a', [{ type: 'size', attrs: { value: bad } }]))))).toBe('<p>a</p>');
        }
    });
});
