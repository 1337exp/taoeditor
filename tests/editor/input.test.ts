// @vitest-environment jsdom
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { toPlainText } from '../../src/core';
import type { EditorHandle } from '../../src/editor';
import { mount, press, runs, type } from './helpers';

function selectAll(ed: EditorHandle): TextSelection {
    const { doc } = ed.view.state;
    return TextSelection.create(doc, 1, doc.content.size - 1);
}

describe('what is typed stays what was typed', () => {
    it('Markdown-looking text is never converted, in any profile', () => {
        for (const profile of ['chat', 'comment', 'article'] as const) {
            const ed = mount({ profile });
            type(ed, '**foo** *a* _b_ ~~c~~ `d` ||e|| ');
            press(ed, 'Enter');
            type(ed, '> q');
            press(ed, 'Enter');
            type(ed, '- a');
            press(ed, 'Enter');
            type(ed, '1. b');
            press(ed, 'Enter');
            type(ed, '# T');
            press(ed, 'Enter');
            type(ed, '```');
            expect(ed.getDoc().content.map((block) => block.type), profile).toEqual(Array(6).fill('paragraph'));
            expect(toPlainText(ed.getDoc()), profile).toBe('**foo** *a* _b_ ~~c~~ `d` ||e|| \n> q\n- a\n1. b\n# T\n```');
            expect(runs(ed, 0).every(([, marks]) => marks === ''), profile).toBe(true);
        }
    });

    it('formatting comes only from the hotkeys and the toolbar', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'a');
        press(ed, 'b', { ctrlKey: true });
        type(ed, 'b');
        expect(runs(ed)).toEqual([['a', ''], ['b', 'bold']]);
    });
});

describe('keys', () => {
    it('Enter sends in submit:"enter", with the document, and does not insert a paragraph', () => {
        const onSend = vi.fn();
        const ed = mount({ profile: 'chat', submit: 'enter', onSend });
        type(ed, 'hello');
        expect(press(ed, 'Enter')).toBe(true);
        expect(onSend).toHaveBeenCalledTimes(1);
        expect(onSend.mock.calls[0][0].content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]);
        expect(ed.getDoc().content).toHaveLength(1);
    });

    it('Enter does not send an empty or whitespace-only message', () => {
        const onSend = vi.fn();
        const ed = mount({ profile: 'chat', submit: 'enter', onSend });
        press(ed, 'Enter');
        type(ed, '  ');
        press(ed, 'Enter');
        expect(onSend).not.toHaveBeenCalled();
    });

    it('our handler itself refuses to send on isComposing and on keyCode 229 (the Android shape)', () => {
        const onSend = vi.fn();
        const ed = mount({ profile: 'chat', submit: 'enter', onSend });
        type(ed, 'あ');
        press(ed, 'Enter', { isComposing: true });
        press(ed, 'Enter', { keyCode: 229 });
        expect(onSend).not.toHaveBeenCalled();
    });

    it('through real DOM events: Enter in the middle of a composition neither sends nor splits the paragraph', () => {
        const onSend = vi.fn();
        const ed = mount({ profile: 'chat', submit: 'enter', onSend });
        const dom = ed.view.dom;
        dom.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
        expect(ed.view.composing).toBe(true);
        const enter = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
        dom.dispatchEvent(enter);
        expect(onSend).not.toHaveBeenCalled();
        expect(ed.getDoc().content).toHaveLength(1);
    });

    it('Shift+Enter is a line break, Enter sends only without Shift', () => {
        const onSend = vi.fn();
        const ed = mount({ profile: 'chat', submit: 'enter', onSend });
        type(ed, 'a');
        press(ed, 'Enter', { shiftKey: true });
        type(ed, 'b');
        expect(runs(ed)).toEqual([['a', ''], ['<hardBreak>', ''], ['b', '']]);
        expect(onSend).not.toHaveBeenCalled();
    });

    it('submit:"mod-enter" sends on Ctrl+Enter and lets plain Enter split the paragraph', () => {
        const onSend = vi.fn();
        const ed = mount({ profile: 'comment', submit: 'mod-enter', onSend });
        type(ed, 'a');
        press(ed, 'Enter');
        type(ed, 'b');
        expect(ed.getDoc().content).toHaveLength(2);
        expect(onSend).not.toHaveBeenCalled();
        press(ed, 'Enter', { ctrlKey: true });
        expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('submit:"none" never sends', () => {
        const onSend = vi.fn();
        const ed = mount({ profile: 'comment', onSend });
        type(ed, 'a');
        press(ed, 'Enter');
        expect(onSend).not.toHaveBeenCalled();
    });

    it('Ctrl+B toggles bold on the selection and the toolbar state follows', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'abc');
        ed.view.dispatch(ed.view.state.tr.setSelection(selectAll(ed)));
        expect(ed.isMarkActive('bold')).toBe(false);
        press(ed, 'b', { ctrlKey: true });
        expect(ed.isMarkActive('bold')).toBe(true);
        expect(runs(ed)).toEqual([['abc', 'bold']]);
        press(ed, 'b', { ctrlKey: true });
        expect(runs(ed)).toEqual([['abc', '']]);
    });

    it('a caret toggle sets a stored mark for the next typing', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'a');
        ed.toggleMark('bold');
        expect(ed.isMarkActive('bold')).toBe(true);
        type(ed, 'b');
        expect(runs(ed)).toEqual([
            ['a', ''],
            ['b', 'bold'],
        ]);
    });
});

describe('links', () => {
    it('sets a safe link on the selection, refuses javascript: and can remove it', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'site');
        ed.view.dispatch(ed.view.state.tr.setSelection(selectAll(ed)));
        expect(ed.setLink('javascript:alert(1)')).toBe(false);
        expect(ed.setLink('https://666.io')).toBe(true);
        expect(ed.getDoc().content[0].content?.[0].marks).toEqual([{ type: 'link', attrs: { href: 'https://666.io/' } }]);
        expect(ed.setLink(null)).toBe(true);
        expect(runs(ed)).toEqual([['site', '']]);
    });
});

describe('the engine agrees with the core', () => {
    it('after typing, marks and line breaks there are no normalizer issues', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'Title');
        press(ed, 'Enter');
        type(ed, 'a ');
        ed.toggleMark('bold');
        type(ed, 'b');
        press(ed, 'Enter', { shiftKey: true });
        type(ed, 'c');
        expect(ed.issues()).toEqual([]);
    });
});
