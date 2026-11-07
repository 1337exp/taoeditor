// @vitest-environment jsdom
import { TextSelection } from 'prosemirror-state';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { toPlainText, type Doc } from '../../src/core';
import type { EditorHandle } from '../../src/editor';
import { TaoEditor } from '../../src/vue/taoui';
import { press, runs, type } from '../editor/helpers';

const apps: App[] = [];
afterEach(() => {
    while (apps.length) apps.pop()!.unmount();
    document.body.replaceChildren();
});

function mount(props: Record<string, unknown> = {}) {
    const model = ref<Doc | null>(null);
    const comp = ref<{ engine: () => EditorHandle } | null>(null);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
        render: () => h(TaoEditor, { ref: comp, modelValue: model.value, 'onUpdate:modelValue': (d: Doc) => (model.value = d), ...props }),
    });
    app.mount(host);
    apps.push(app);
    return { host, model, engine: () => comp.value!.engine() };
}

const names = (host: HTMLElement): string[] => [...host.querySelectorAll('.tao-editor-toolbar button')].map((b) => b.getAttribute('aria-label')!);
const btn = (host: HTMLElement, label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll<HTMLButtonElement>('.tao-editor-toolbar button')].find((b) => b.getAttribute('aria-label') === label);
    if (!found) throw new Error(`no button "${label}" in: ${names(host).join(', ')}`);
    return found;
};
const selectText = (e: EditorHandle, from: number, to: number): void => {
    e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, from, to)));
};

describe('the toolbar follows the profile, in the order of Gmail\'s bar', () => {
    it('comment: undo and redo, the marks, lists and quote, clear formatting', async () => {
        const m = mount({ profile: 'comment' });
        await nextTick();
        expect(names(m.host)).toEqual([
            'Undo', 'Redo',
            'Text size', 'Bold', 'Italic', 'Underline', 'Strikethrough', 'Superscript', 'Code', 'Spoiler', 'Link',
            'Align', 'Numbered list', 'Bulleted list', 'Decrease indent', 'Increase indent', 'Quote', 'Table',
            'Clear formatting',
        ]);
        expect(m.host.querySelectorAll('.tao-editor-toolbar [role="separator"]').length).toBe(4);
    });

    it('chat has no lists and no indents, but keeps the quote', async () => {
        const m = mount({ profile: 'chat' });
        await nextTick();
        const list = names(m.host);
        expect(list).toContain('Quote');
        expect(list.filter((n) => /list|indent/i.test(n))).toEqual([]);
    });

    it('the keys are in the tooltips: Underline, lists, quote', async () => {
        const m = mount({ profile: 'comment' });
        await nextTick();
        expect(btn(m.host, 'Underline').title).toBe('Underline (Ctrl+U)');
        expect(btn(m.host, 'Numbered list').title).toBe('Numbered list (Ctrl+Shift+7)');
        expect(btn(m.host, 'Bulleted list').title).toBe('Bulleted list (Ctrl+Shift+8)');
        expect(btn(m.host, 'Quote').title).toBe('Quote (Ctrl+Shift+9)');
    });
});

describe('block buttons', () => {
    it('a list button makes the list, shows pressed, and the indent buttons wake up', async () => {
        const m = mount({ profile: 'comment' });
        await nextTick();
        type(m.engine(), 'one');
        expect(btn(m.host, 'Bulleted list').getAttribute('aria-pressed')).toBe('false');
        btn(m.host, 'Bulleted list').click();
        await nextTick();
        expect(m.model.value!.content[0].type).toBe('bulletList');
        expect(btn(m.host, 'Bulleted list').getAttribute('aria-pressed')).toBe('true');
        expect(btn(m.host, 'Increase indent').disabled).toBe(true); // the first item has nothing to go under
        press(m.engine(), 'Enter');
        type(m.engine(), 'two');
        await nextTick();
        expect(btn(m.host, 'Increase indent').disabled).toBe(false);
        btn(m.host, 'Increase indent').click();
        await nextTick();
        expect(btn(m.host, 'Decrease indent').disabled).toBe(false);
        btn(m.host, 'Decrease indent').click();
        await nextTick();
        expect(m.model.value!.content[0].content).toHaveLength(2);
        expect(m.engine().issues()).toEqual([]);
    });

    it('the quote button wraps and unwraps', async () => {
        const m = mount({ profile: 'chat' });
        await nextTick();
        type(m.engine(), 'q');
        btn(m.host, 'Quote').click();
        await nextTick();
        expect(m.model.value!.content[0].type).toBe('blockquote');
        expect(btn(m.host, 'Quote').getAttribute('aria-pressed')).toBe('true');
        btn(m.host, 'Quote').click();
        await nextTick();
        expect(m.model.value!.content[0].type).toBe('paragraph');
    });

    it('clear formatting removes the marks of the selection and keeps the text', async () => {
        const m = mount({ profile: 'chat' });
        await nextTick();
        type(m.engine(), 'abc');
        selectText(m.engine(), 1, 4);
        btn(m.host, 'Bold').click();
        btn(m.host, 'Underline').click();
        await nextTick();
        expect(runs(m.engine())).toEqual([['abc', 'bold+underline']]);
        btn(m.host, 'Clear formatting').click();
        await nextTick();
        expect(runs(m.engine())).toEqual([['abc', '']]);
        expect(toPlainText(m.engine().getDoc())).toBe('abc');
    });
});

describe('the emoji list closes', () => {
    const open = async (m: ReturnType<typeof mount>): Promise<void> => {
        m.host.querySelector<HTMLButtonElement>('.tao-editor-emoji-button')!.click();
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).not.toBeNull();
    };

    it('on a press anywhere outside the component, but not on one inside', async () => {
        const m = mount({ emoji: true });
        await nextTick();
        await open(m);
        m.host.querySelector('.tao-editor-emoji')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).not.toBeNull();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).toBeNull();
    });

    it('on a press into the text field too: that means back to typing, and the focus does not change', async () => {
        const m = mount({ emoji: true });
        await nextTick();
        await open(m);
        m.host.querySelector('.tao-editor-emoji-button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).not.toBeNull(); // its own button is not outside
        m.host.querySelector('.tao-editor')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).toBeNull();
    });

    it('on Escape typed in the text, and the listener goes away with the list', async () => {
        const m = mount({ emoji: true });
        await nextTick();
        await open(m);
        press(m.engine(), 'Escape');
        m.engine().view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).toBeNull();
        // a press outside with the list closed does nothing and does not fail
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).toBeNull();
    });

    it('unmounting while it is open leaves no listener behind', async () => {
        const m = mount({ emoji: true });
        await nextTick();
        await open(m);
        m.host.remove();
        apps.pop()!.unmount();
        expect(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))).not.toThrow();
    });
});
