// @vitest-environment jsdom
import { DOMParser as PMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { PROFILES, toHtml, toPlainText } from '../../src/core';
import { createSchema, nodeToDoc, type EditorHandle } from '../../src/editor';
import { mount, press, runs, type } from './helpers';

const selectAll = (ed: EditorHandle): void => {
    const { doc } = ed.view.state;
    ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(doc, 1, doc.content.size - 1)));
};
const types = (ed: EditorHandle): string[] => ed.getDoc().content.map((b) => b.type);
const shape = (ed: EditorHandle): unknown => JSON.stringify(ed.getDoc().content);

describe('underline', () => {
    it('Ctrl+U and the toolbar toggle it; it renders as <u>', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'abc');
        selectAll(ed);
        press(ed, 'u', { ctrlKey: true });
        expect(runs(ed)).toEqual([['abc', 'underline']]);
        expect(toHtml(ed.getDoc())).toBe('<p><u>abc</u></p>');
        ed.toggleMark('underline');
        expect(runs(ed)).toEqual([['abc', '']]);
    });

    it('a link already shows underlined, so the link wins; code wins too', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'abc');
        selectAll(ed);
        ed.toggleMark('underline');
        ed.setLink('https://666.io');
        expect(runs(ed)).toEqual([['abc', 'link']]);
        expect(ed.issues()).toEqual([]);
        const code = mount({ profile: 'article' });
        type(code, 'x');
        selectAll(code);
        code.toggleMark('underline');
        code.toggleMark('code');
        expect(runs(code)).toEqual([['x', 'code']]);
    });

    it('pasted <u> and text-decoration: underline become the mark', () => {
        const schema = createSchema(PROFILES.article);
        const parse = (html: string) => {
            const dom = new window.DOMParser().parseFromString(html, 'text/html').body;
            return nodeToDoc(PMParser.fromSchema(schema).parse(dom), PROFILES.article).doc.content[0].content;
        };
        expect(parse('<p><u>a</u><span style="text-decoration:underline">b</span></p>')).toEqual([
            { type: 'text', text: 'ab', marks: [{ type: 'underline' }] },
        ]);
    });
});

describe('lists', () => {
    it('the button makes a list of the paragraph, again takes it out, the other kind changes it', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'a');
        expect(ed.isBlockActive('bulletList')).toBe(false);
        expect(ed.toggleList('bulletList')).toBe(true);
        expect(types(ed)).toEqual(['bulletList']);
        expect(ed.isBlockActive('bulletList')).toBe(true);
        ed.toggleList('orderedList');
        expect(types(ed)).toEqual(['orderedList']);
        ed.toggleList('orderedList');
        expect(types(ed)).toEqual(['paragraph']);
        expect(toPlainText(ed.getDoc())).toBe('a');
        expect(ed.issues()).toEqual([]);
    });

    it('a profile without lists has no list commands', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'a');
        expect(ed.toggleList('bulletList')).toBe(false);
        expect(types(ed)).toEqual(['paragraph']);
    });

    it('Enter makes a new item; Enter on the empty last item leaves the list', () => {
        const ed = mount({ profile: 'article' });
        ed.toggleList('bulletList');
        type(ed, 'one');
        press(ed, 'Enter');
        type(ed, 'two');
        expect(toPlainText(ed.getDoc())).toBe('one\ntwo');
        expect(ed.getDoc().content[0].content).toHaveLength(2);
        press(ed, 'Enter');
        press(ed, 'Enter');
        expect(types(ed)).toEqual(['bulletList', 'paragraph']);
        expect(ed.issues()).toEqual([]);
    });

    it('Tab nests an item under the one before, Shift+Tab brings it back; the first item cannot be nested', () => {
        const ed = mount({ profile: 'article' });
        ed.toggleList('bulletList');
        type(ed, 'one');
        expect(ed.canIndent()).toBe(false);
        expect(press(ed, 'Tab')).toBe(false); // the browser's Tab moves on
        press(ed, 'Enter');
        type(ed, 'two');
        expect(ed.canIndent()).toBe(true);
        expect(press(ed, 'Tab')).toBe(true);
        const items = ed.getDoc().content[0].content!;
        expect(items).toHaveLength(1);
        expect(items[0].content!.map((n) => n.type)).toEqual(['paragraph', 'bulletList']);
        expect(ed.canOutdent()).toBe(true);
        press(ed, 'Tab', { shiftKey: true });
        expect(ed.getDoc().content[0].content).toHaveLength(2);
        expect(ed.issues()).toEqual([]);
    });

    it('Tab outside a list is left to the browser (focus moves on); the indent buttons work on the paragraph', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'a');
        expect(press(ed, 'Tab')).toBe(false);
        expect(ed.canIndent()).toBe(true); // a paragraph can be indented
        expect(ed.canOutdent()).toBe(false); // but it has no indent to take back yet
    });

    it('Shift+Tab at the top level of a list is left to the browser, so the keyboard is never trapped', () => {
        const ed = mount({ profile: 'article' });
        ed.toggleList('bulletList');
        type(ed, 'one');
        expect(press(ed, 'Tab', { shiftKey: true })).toBe(false);
        expect(types(ed)).toEqual(['bulletList']);
        expect(ed.canOutdent()).toBe(true); // the toolbar button can still take it out of the list
        ed.outdent();
        expect(types(ed)).toEqual(['paragraph']);
    });

    it('the keys: Ctrl+Shift+8 bulleted, Ctrl+Shift+7 numbered', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'a');
        press(ed, '8', { ctrlKey: true, shiftKey: true });
        expect(types(ed)).toEqual(['bulletList']);
        press(ed, '7', { ctrlKey: true, shiftKey: true });
        expect(types(ed)).toEqual(['orderedList']);
    });
});

describe('quote', () => {
    it('the button wraps the paragraph and takes it out again; Ctrl+Shift+9 does the same', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'q');
        ed.toggleQuote();
        expect(types(ed)).toEqual(['blockquote']);
        expect(ed.isBlockActive('blockquote')).toBe(true);
        ed.toggleQuote();
        expect(types(ed)).toEqual(['paragraph']);
        press(ed, '9', { ctrlKey: true, shiftKey: true });
        expect(types(ed)).toEqual(['blockquote']);
        expect(ed.issues()).toEqual([]);
    });
});

describe('clear formatting', () => {
    it('removes bold, italic, code and the rest from the selection, keeps the link and the text', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'abc');
        selectAll(ed);
        ed.toggleMark('bold');
        ed.toggleMark('italic');
        ed.toggleMark('spoiler');
        ed.setLink('https://666.io');
        expect(ed.clearFormatting()).toBe(true);
        expect(runs(ed)).toEqual([['abc', 'link']]);
        expect(toPlainText(ed.getDoc())).toBe('abc');
    });

    it('with a caret it clears what the next typing would carry', () => {
        const ed = mount({ profile: 'chat' });
        ed.toggleMark('bold');
        expect(ed.isMarkActive('bold')).toBe(true);
        ed.clearFormatting();
        expect(ed.isMarkActive('bold')).toBe(false);
        type(ed, 'x');
        expect(runs(ed)).toEqual([['x', '']]);
    });

    it('leaves the structure alone (a list stays a list)', () => {
        const ed = mount({ profile: 'article' });
        ed.toggleList('bulletList');
        type(ed, 'a');
        // doc > bulletList > listItem > paragraph > text: the text of the item is positions 3 to 4
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, 3, 4)));
        ed.toggleMark('bold');
        expect(shape(ed)).toContain('"bold"');
        ed.clearFormatting();
        expect(types(ed)).toEqual(['bulletList']);
        expect(shape(ed)).not.toContain('"bold"');
        expect(toPlainText(ed.getDoc())).toBe('a');
    });
});
