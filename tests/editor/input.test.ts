// @vitest-environment jsdom
import { closeHistory } from 'prosemirror-history';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import type { EditorHandle } from '../../src/editor';
import { mount, press, runs, type } from './helpers';

describe('markdown shortcuts: marks', () => {
    it.each([
        ['**foo**', 'bold'],
        ['__foo__', 'bold'],
        ['*foo*', 'italic'],
        ['_foo_', 'italic'],
        ['~~foo~~', 'strike'],
        ['`foo`', 'code'],
        ['||foo||', 'spoiler'],
    ])('%s becomes %s and the next characters are plain', (typed, mark) => {
        const ed = mount({ profile: 'chat' });
        type(ed, typed + ' x');
        expect(runs(ed)).toEqual([
            ['foo', mark],
            [' x', ''],
        ]);
    });

    it('works in the middle of a sentence, keeping the text before', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'say **hi** now');
        expect(runs(ed)).toEqual([
            ['say ', ''],
            ['hi', 'bold'],
            [' now', ''],
        ]);
    });

    it('does not fire for snake_case_, 2*3*4 or spaces inside the markers', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'my_var_ 2*3*4 ** a **');
        expect(runs(ed)).toEqual([['my_var_ 2*3*4 ** a **', '']]);
    });

    it('does not fire inside the code mark', () => {
        const ed = mount({ profile: 'chat' });
        ed.toggleMark('code');
        type(ed, '**y**');
        expect(runs(ed)).toEqual([['**y**', 'code']]);
    });

    it('does not fire inside a code block', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, '```');
        type(ed, '**y**');
        expect(ed.getDoc().content).toEqual([{ type: 'codeBlock', content: [{ type: 'text', text: '**y**' }] }]);
    });

    it('Backspace right after a shortcut brings the typed characters back, as plain text', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, '**foo**');
        expect(runs(ed)).toEqual([['foo', 'bold']]);
        expect(press(ed, 'Backspace')).toBe(true);
        expect(runs(ed)).toEqual([['**foo**', '']]);
    });

    it('Backspace after the shortcut and more typing is left to the browser (our undo does not hijack it)', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, '**foo** ab');
        expect(press(ed, 'Backspace')).toBe(false);
        expect(runs(ed)).toEqual([
            ['foo', 'bold'],
            [' ab', ''],
        ]);
    });

    // Undo grain, pinned as it is today (see docs/architecture.ru.md): the shortcut joins the history group of
    // the characters typed with it, so undo takes the whole phrase back, not just the formatting.
    // Зерно undo, зафиксировано как есть: правило входит в группу истории с набранными символами,
    // поэтому undo откатывает всю фразу, а не только форматирование.
    it('undo after a shortcut reverts the whole typed group, the text before the group stays', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'x ');
        ed.view.dispatch(closeHistory(ed.view.state.tr));
        type(ed, '**foo**');
        expect(runs(ed)).toEqual([
            ['x ', ''],
            ['foo', 'bold'],
        ]);
        ed.undo();
        expect(runs(ed)).toEqual([['x ', '']]);
    });
});

describe('markdown shortcuts: blocks', () => {
    it('"> " makes a quote', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, '> hi');
        expect(ed.getDoc().content).toEqual([{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }]);
    });

    it('``` makes a code block', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, '```');
        expect(ed.getDoc().content).toEqual([{ type: 'codeBlock' }]);
    });

    it('"# " is a heading only in the article profile', () => {
        const article = mount({ profile: 'article' });
        type(article, '## T');
        expect(article.getDoc().content).toEqual([{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'T' }] }]);
        const chat = mount({ profile: 'chat' });
        type(chat, '## T');
        expect(chat.getDoc().content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: '## T' }] }]);
    });

    it('"- " and "3. " make lists in comment, and stay text in chat', () => {
        const comment = mount({ profile: 'comment' });
        type(comment, '- a');
        expect(comment.getDoc().content[0].type).toBe('bulletList');
        const numbered = mount({ profile: 'comment' });
        type(numbered, '3. a');
        expect(numbered.getDoc().content[0]).toMatchObject({ type: 'orderedList', attrs: { start: 3 } });
        const chat = mount({ profile: 'chat' });
        type(chat, '- a');
        expect(chat.getDoc().content[0].type).toBe('paragraph');
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
    it('after typing and marks there are no normalizer issues', () => {
        const ed = mount({ profile: 'article' });
        type(ed, '# Title');
        press(ed, 'Enter');
        type(ed, 'a **b** *c* `d` ~~e~~ ||f||');
        press(ed, 'Enter', { shiftKey: true });
        type(ed, '> q');
        expect(ed.issues()).toEqual([]);
    });
});

function selectAll(ed: EditorHandle): TextSelection {
    const { doc } = ed.view.state;
    return TextSelection.create(doc, 1, doc.content.size - 1);
}
