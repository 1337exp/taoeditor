// @vitest-environment jsdom
import { DOMParser as PMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { PROFILES, toPlainText, withoutFeatures, type Profile } from '../../src/core';
import { createSchema, nodeToDoc, type EditorHandle } from '../../src/editor';
import { mount, press, runs, type } from './helpers';

const select = (ed: EditorHandle, from: number, to: number): void => {
    ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, from, to)));
};
const pasteInto = (profile: Profile, html: string) => {
    const dom = new window.DOMParser().parseFromString(html, 'text/html').body;
    const { doc, issues } = nodeToDoc(PMParser.fromSchema(createSchema(profile)).parse(dom), profile);
    expect(issues).toEqual([]);
    return doc.content;
};

describe('what the project leaves out is out for the engine too', () => {
    const noBold = withoutFeatures('article', { marks: ['bold'] });

    it('the mark is not in the schema: no command, the hotkey does nothing, the document stays plain', () => {
        const ed = mount({ profile: noBold });
        expect(ed.schema.marks.bold).toBeUndefined();
        type(ed, 'abc');
        select(ed, 1, 4);
        expect(ed.toggleMark('bold')).toBe(false);
        expect(ed.isMarkActive('bold')).toBe(false);
        press(ed, 'b', { ctrlKey: true });
        expect(runs(ed)).toEqual([['abc', '']]);
        ed.toggleMark('italic'); // the others still work
        expect(runs(ed)).toEqual([['abc', 'italic']]);
    });

    it('pasted bold comes in as plain text (the tag, the Docs wrapper, the style), the rest is kept', () => {
        const content = pasteInto(noBold, '<p><strong>a</strong><b>b</b><span style="font-weight:700">c</span><em>d</em></p>');
        expect(content[0].content).toEqual([
            { type: 'text', text: 'abc' },
            { type: 'text', text: 'd', marks: [{ type: 'italic' }] },
        ]);
    });

    it('a document with bold set into that editor shows without it', () => {
        const ed = mount({ profile: noBold });
        ed.setDoc({ v: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] }] });
        expect(runs(ed)).toEqual([['x', '']]);
        expect(ed.issues()).toEqual([]);
    });

    it('colours, size and links follow the same rule', () => {
        const none = withoutFeatures('article', { marks: ['color', 'background', 'size', 'link'] });
        const content = pasteInto(none, '<p><span style="color:#ff0000">a</span><span style="background-color:#ffff00">b</span><big>c</big><a href="https://666.io">d</a></p>');
        expect(content[0].content).toEqual([{ type: 'text', text: 'abcd' }]);
        const ed = mount({ profile: none });
        type(ed, 'x');
        select(ed, 1, 2);
        expect(ed.setColor('color', '#ff0000')).toBe(false);
        expect(ed.setSize('large')).toBe(false);
        expect(ed.setLink('https://666.io')).toBe(false);
        expect(runs(ed)).toEqual([['x', '']]);
    });

    it('a node that is out: pasted quote and list come in as paragraphs, the commands do nothing', () => {
        const none = withoutFeatures('article', { nodes: ['blockquote', 'bulletList', 'orderedList'] });
        const content = pasteInto(none, '<blockquote>q</blockquote><ul><li>one</li></ul>');
        expect(content.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
        const ed = mount({ profile: none });
        type(ed, 'a');
        expect(ed.toggleQuote()).toBe(false);
        expect(ed.toggleList('bulletList')).toBe(false);
    });

    it('a feature that is out: indent and alignment do nothing and pasted ones are ignored', () => {
        const none = withoutFeatures('article', { features: ['indent', 'align'] });
        const content = pasteInto(none, '<p style="margin-left:80px;text-align:center">a</p>');
        expect(content[0].attrs).toBeUndefined();
        const ed = mount({ profile: none });
        type(ed, 'a');
        expect(ed.indent()).toBe(false);
        expect(ed.setAlign('center')).toBe(false);
        expect(ed.alignOf()).toBe('left');
        expect(ed.getDoc().content[0].attrs).toBeUndefined();
    });

    it('a profile that has no hardBreak-less paragraphs problem: Shift+Enter still breaks the line', () => {
        const ed = mount({ profile: withoutFeatures('chat', { marks: ['bold', 'italic', 'underline', 'strike', 'code', 'spoiler', 'link', 'size', 'color', 'background'] }) });
        type(ed, 'a');
        press(ed, 'Enter', { shiftKey: true });
        type(ed, 'b');
        expect(toPlainText(ed.getDoc())).toBe('a\nb');
    });
});

describe('alignment', () => {
    it('setAlign aligns every selected paragraph and heading; alignOf reads where the caret is', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'one');
        press(ed, 'Enter');
        type(ed, 'two');
        press(ed, 'Enter');
        type(ed, 'three');
        select(ed, 7, 8); // inside "two"
        expect(ed.alignOf()).toBe('left');
        expect(ed.setAlign('center')).toBe(true);
        expect(ed.alignOf()).toBe('center');
        expect(ed.getDoc().content.map((b) => b.attrs?.align ?? 'left')).toEqual(['left', 'center', 'left']);
        const { doc } = ed.view.state;
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(doc, 1, doc.content.size - 1)));
        ed.setAlign('right');
        expect(ed.getDoc().content.map((b) => b.attrs?.align)).toEqual(['right', 'right', 'right']);
        expect(ed.setAlign('right')).toBe(false); // nothing to change
        ed.setAlign('left');
        expect(ed.getDoc().content.every((b) => b.attrs === undefined)).toBe(true); // left is not written
        expect(ed.issues()).toEqual([]);
    });

    it('refuses an alignment that does not exist', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'a');
        expect(ed.setAlign('middle' as never)).toBe(false);
    });

    it('a heading is aligned too', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'T');
        ed.view.dispatch(ed.view.state.tr.setBlockType(1, 1, ed.schema.nodes.heading, { level: 1, indent: 0, align: 'left' }));
        ed.setAlign('center');
        expect(ed.getDoc().content[0]).toMatchObject({ type: 'heading', attrs: { align: 'center' } });
    });

    it('pasted alignment: our class, the style, the align attribute (Docs, Word, Gmail); the rest is left', () => {
        const parse = (html: string) => pasteInto(PROFILES.article, html).map((b) => (b.attrs?.align as string | undefined) ?? 'left');
        expect(parse('<p class="tao-align-center">a</p><p class="tao-align-right">b</p><p class="tao-align-justify">c</p>')).toEqual(['center', 'right', 'justify']);
        expect(parse('<p style="text-align:center">a</p><p style="text-align: right">b</p><p style="text-align:justify">c</p><p style="text-align:end">d</p>')).toEqual(['center', 'right', 'justify', 'right']);
        expect(parse('<p align="center">a</p><div align="right"><p>b</p></div>')).toEqual(['center', 'left']);
        expect(parse('<p style="text-align:left">a</p><p style="text-align:start">b</p><p style="text-align:nonsense">c</p><p class="tao-align-evil">d</p>')).toEqual(['left', 'left', 'left', 'left']);
    });
});

describe('size', () => {
    it('setSize sets, replaces and takes off the size of the selection; sizeOf reads it', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'abcd');
        select(ed, 2, 4);
        expect(ed.sizeOf()).toBeNull();
        expect(ed.setSize('large')).toBe(true);
        expect(ed.sizeOf()).toBe('large');
        expect(JSON.stringify(ed.getDoc().content[0].content)).toContain('"size"');
        ed.setSize('huge');
        expect(ed.sizeOf()).toBe('huge');
        ed.setSize(null);
        expect(ed.sizeOf()).toBeNull();
        expect(runs(ed)).toEqual([['abcd', '']]);
        expect(ed.issues()).toEqual([]);
    });

    it('refuses another value, and with a caret sizes what is typed next', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'a');
        expect(ed.setSize('giant' as never)).toBe(false);
        expect(ed.setSize('small')).toBe(true);
        type(ed, 'b');
        ed.setSize(null);
        type(ed, 'c');
        expect(ed.getDoc().content[0].content!.map((n) => [n.text, n.marks?.[0]?.attrs?.value ?? null])).toEqual([
            ['a', null],
            ['b', 'small'],
            ['c', null],
        ]);
    });

    it('pasted <small>, <big> and our classes become sizes; font sizes from pages are not taken', () => {
        const content = pasteInto(PROFILES.chat, '<p><small>a</small><big>b</big><span class="tao-text-huge">c</span><span style="font-size:24pt">d</span></p>');
        expect(content[0].content!.map((n) => [n.text, n.marks?.[0]?.attrs?.value ?? null])).toEqual([
            ['a', 'small'],
            ['b', 'large'],
            ['c', 'huge'],
            ['d', null],
        ]);
    });
});
