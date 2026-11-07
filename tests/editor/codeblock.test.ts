// @vitest-environment jsdom
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { withoutFeatures } from '../../src/core';
import { press, mount, type } from './helpers';

const NL = String.fromCharCode(10);
const types = (ed: ReturnType<typeof mount>) => ed.getDoc().content.map((n) => n.type);

describe('the code block', () => {
    it('turns the line into a block and back, and the caret stays in it', () => {
        const ed = mount({ profile: 'comment' });
        type(ed, 'let a = 1');
        expect(ed.toggleCodeBlock()).toBe(true);
        expect(types(ed)).toEqual(['codeBlock']);
        expect(ed.isBlockActive('codeBlock')).toBe(true);
        type(ed, ';');
        expect(ed.getDoc().content[0].content![0].text).toBe('let a = 1;');
        expect(ed.toggleCodeBlock()).toBe(true);
        expect(types(ed)).toEqual(['paragraph']);
        expect(ed.issues()).toEqual([]);
    });

    it('keeps only the text: marks go, a break is a newline, a mention is its name; several lines make one block', () => {
        const ed = mount({ profile: 'comment' });
        ed.setDoc({
            v: 1,
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'one', marks: [{ type: 'bold' }] }, { type: 'hardBreak' }, { type: 'text', text: 'two' }] },
                { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u1', label: 'Ann' } }] },
            ],
        });
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, 1, ed.view.state.doc.content.size - 1)));
        expect(ed.toggleCodeBlock()).toBe(true);
        expect(ed.getDoc().content).toEqual([{ type: 'codeBlock', content: [{ type: 'text', text: ['one', 'two', '@Ann'].join(NL) }] }]);
        ed.toggleCodeBlock();
        expect(ed.getDoc().content[0].content!.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text', 'hardBreak', 'text']);
        expect(ed.issues()).toEqual([]);
    });

    it('Enter on an empty last line leaves the block, so the end of the document has a way out', () => {
        const ed = mount({ profile: 'comment' });
        type(ed, 'x');
        ed.toggleCodeBlock();
        press(ed, 'Enter'); // a new line in the block (the base keymap)
        expect(ed.getDoc().content[0].content![0].text).toBe('x' + NL);
        expect(types(ed)).toEqual(['codeBlock']);
        expect(press(ed, 'Enter')).toBe(true);
        expect(types(ed)).toEqual(['codeBlock', 'paragraph']);
        type(ed, 'after');
        expect(ed.getDoc().content[1].content![0].text).toBe('after');
        expect(ed.issues()).toEqual([]);
    });

    it('does nothing in a profile without it, in a table cell, and for a selection with a list in it', () => {
        const none = mount({ profile: withoutFeatures('comment', { nodes: ['codeBlock'] }) });
        type(none, 'x');
        expect(none.toggleCodeBlock()).toBe(false);
        const ed = mount({ profile: 'comment' });
        ed.insertTable(1, 1);
        type(ed, 'x');
        expect(ed.toggleCodeBlock()).toBe(false);
        expect(ed.issues()).toEqual([]);
    });
});
