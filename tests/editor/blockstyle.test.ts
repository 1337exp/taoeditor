// @vitest-environment jsdom
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { withoutFeatures } from '../../src/core';
import type { EditorHandle } from '../../src/editor';
import { mount, press, type } from './helpers';

const kinds = (ed: EditorHandle): unknown[] => ed.getDoc().content.map((b) => (b.type === 'heading' ? `h${b.attrs?.level ?? 1}` : b.type));
const selectAll = (ed: EditorHandle): void => {
    const { doc } = ed.view.state;
    ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(doc, 1, doc.content.size - 1)));
};

describe('paragraph style', () => {
    it('makes the line a heading of a level, and back to a paragraph; blockStyleAt says which', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'Title');
        expect(ed.blockStyleAt()).toBe('paragraph');
        expect(ed.setBlockStyle(2)).toBe(true);
        expect(kinds(ed)).toEqual(['h2']);
        expect(ed.blockStyleAt()).toBe(2);
        expect(ed.setBlockStyle(2)).toBe(false); // already
        ed.setBlockStyle(1);
        expect(kinds(ed)).toEqual(['h1']);
        ed.setBlockStyle('paragraph');
        expect(kinds(ed)).toEqual(['paragraph']);
        expect(ed.getDoc().content[0].content).toEqual([{ type: 'text', text: 'Title' }]);
        expect(ed.issues()).toEqual([]);
    });

    it('every selected line changes, each keeps its indent and alignment and its marks', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'one');
        press(ed, 'Enter');
        type(ed, 'two');
        selectAll(ed);
        ed.setAlign('center');
        ed.indent();
        ed.toggleMark('bold');
        expect(ed.setBlockStyle(3)).toBe(true);
        expect(kinds(ed)).toEqual(['h3', 'h3']);
        expect(ed.getDoc().content[0]).toMatchObject({ attrs: { level: 3, align: 'center', indent: 1 }, content: [{ text: 'one', marks: [{ type: 'bold' }] }] });
        ed.setBlockStyle('paragraph');
        expect(ed.getDoc().content[1]).toMatchObject({ type: 'paragraph', attrs: { align: 'center', indent: 1 } });
    });

    it('a line that a heading cannot hold stays a paragraph: a line break or a mention in it', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'a');
        press(ed, 'Enter', { shiftKey: true });
        type(ed, 'b');
        expect(ed.setBlockStyle(1)).toBe(false);
        expect(kinds(ed)).toEqual(['paragraph']);
        const withMention = mount({ profile: 'article' });
        withMention.setDoc({ v: 1, content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u1', label: 'Ann' } }] }] });
        withMention.view.dispatch(withMention.view.state.tr.setSelection(TextSelection.create(withMention.view.state.doc, 1, 1)));
        expect(withMention.setBlockStyle(2)).toBe(false);
    });

    it('a line in a list item stays a paragraph: a heading is not allowed there', () => {
        const ed = mount({ profile: 'article' });
        ed.toggleList('bulletList');
        type(ed, 'item');
        expect(ed.setBlockStyle(1)).toBe(false);
        expect(ed.getDoc().content[0].type).toBe('bulletList');
        expect(ed.issues()).toEqual([]);
    });

    it('a profile without headings has no such command', () => {
        const ed = mount({ profile: 'comment' });
        type(ed, 'a');
        expect(ed.setBlockStyle(1)).toBe(false);
        expect(ed.blockStyleAt()).toBe('paragraph');
        const none = mount({ profile: withoutFeatures('article', { nodes: ['heading'] }) });
        type(none, 'a');
        expect(none.setBlockStyle(2)).toBe(false);
    });

    it('the keys of Docs: Ctrl+Alt+1 to 3 for headings, Ctrl+Alt+0 for normal text', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'x');
        press(ed, '2', { ctrlKey: true, altKey: true });
        expect(kinds(ed)).toEqual(['h2']);
        press(ed, '1', { ctrlKey: true, altKey: true });
        expect(kinds(ed)).toEqual(['h1']);
        press(ed, '3', { ctrlKey: true, altKey: true });
        expect(kinds(ed)).toEqual(['h3']);
        press(ed, '0', { ctrlKey: true, altKey: true });
        expect(kinds(ed)).toEqual(['paragraph']);
    });
});
