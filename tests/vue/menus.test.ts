// @vitest-environment jsdom
import { TextSelection } from 'prosemirror-state';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { defineProfile, withoutFeatures, type Doc } from '../../src/core';
import type { EditorHandle } from '../../src/editor';
import { TaoEditorView } from '../../src/vue';
import { TaoEditor } from '../../src/vue/taoui';
import { press, type } from '../editor/helpers';

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
    const app = createApp({ render: () => h(TaoEditor, { ref: comp, modelValue: model.value, 'onUpdate:modelValue': (d: Doc) => (model.value = d), ...props }) });
    app.mount(host);
    apps.push(app);
    return { host, model, engine: () => comp.value!.engine() };
}

const names = (host: HTMLElement): string[] => [...host.querySelectorAll('.tao-editor-toolbar button')].map((b) => b.getAttribute('aria-label')!).filter((n) => n !== 'More'); // jsdom has no widths: TaoUI's overflow button (More) is not one of ours
const button = (host: HTMLElement, label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll<HTMLButtonElement>('.tao-editor-toolbar button')].find((b) => b.getAttribute('aria-label') === label);
    if (!found) throw new Error(`no button "${label}" in: ${names(host).join(', ')}`);
    return found;
};
const selectAll = (e: EditorHandle): void => e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 1, e.view.state.doc.content.size - 1)));
const inPopup = (host: HTMLElement, cls: string): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>(`.${cls} button`)];

describe('the toolbar shows only what the profile has', () => {
    it('a made profile: no Bold, no Align, no Quote; the rest stays', async () => {
        const profile = withoutFeatures('article', { marks: ['bold'], nodes: ['blockquote'], features: ['align'] });
        const m = mount({ profile });
        await nextTick();
        const list = names(m.host);
        expect(list).not.toContain('Bold');
        expect(list).not.toContain('Align');
        expect(list).not.toContain('Quote');
        expect(list).toEqual(expect.arrayContaining(['Italic', 'Underline', 'Text size', 'Text and background color', 'Increase indent', 'Numbered list']));
    });

    it('the hotkey of a mark that is out does nothing in the component either', async () => {
        const m = mount({ profile: withoutFeatures('article', { marks: ['bold'] }) });
        await nextTick();
        type(m.engine(), 'abc');
        selectAll(m.engine());
        press(m.engine(), 'b', { ctrlKey: true });
        expect(JSON.stringify(m.engine().getDoc())).not.toContain('bold');
    });

    it('size, colours, lists and indents go when their features go', async () => {
        const profile = withoutFeatures('article', { marks: ['size', 'color', 'background'], nodes: ['bulletList', 'orderedList'], features: ['indent'] });
        const m = mount({ profile });
        await nextTick();
        const list = names(m.host);
        for (const gone of ['Text size', 'Text and background color', 'Numbered list', 'Bulleted list', 'Increase indent', 'Decrease indent']) expect(list).not.toContain(gone);
        expect(list).toContain('Align');
    });

    it('with only one of the colours there is one section', async () => {
        const m = mount({ profile: withoutFeatures('article', { marks: ['background'] }) });
        await nextTick();
        button(m.host, 'Text and background color').click();
        await nextTick();
        const titles = [...m.host.querySelectorAll('.tao-editor-colors-title')].map((t) => t.textContent);
        expect(titles).toEqual(['Text color']);
    });

    it('the chat profile has no alignment and no indents; a profile of nothing but a link has no Clear formatting', async () => {
        const chat = mount({ profile: 'chat' });
        await nextTick();
        expect(names(chat.host)).not.toContain('Align');
        expect(names(chat.host)).not.toContain('Increase indent');
        const bare = mount({ profile: defineProfile({ name: 'bare', nodes: [], marks: ['link'] }) });
        await nextTick();
        expect(names(bare.host)).toEqual(['Link']);
    });

    it('the viewer takes the same profile object, and its spacing hint', () => {
        const doc: Doc = { v: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'bold' }] }] }] };
        const host = document.createElement('div');
        document.body.append(host);
        const app = createApp({ render: () => h(TaoEditorView, { doc, profile: withoutFeatures('article', { marks: ['bold'] }) }) });
        app.mount(host);
        apps.push(app);
        expect(host.querySelector('strong')).toBeNull();
        expect(host.querySelector('.tao-content')!.classList.contains('tao-compact')).toBe(false); // the article hint is kept
    });
});

describe('the alignment popup', () => {
    it('opens under its button, offers four, aligns the paragraph and closes', async () => {
        const m = mount({ profile: 'article' });
        await nextTick();
        type(m.engine(), 'abc');
        expect(m.host.querySelector('.tao-editor-align')).toBeNull();
        button(m.host, 'Align').click();
        await nextTick();
        await nextTick();
        const popup = m.host.querySelector<HTMLElement>('.tao-editor-align')!;
        expect(popup.parentElement!.classList.contains('tao-editor-root')).toBe(true);
        expect(popup.style.visibility).not.toBe('hidden');
        expect(button(m.host, 'Align').getAttribute('aria-pressed')).toBe('true');
        const choices = inPopup(m.host, 'tao-editor-align');
        expect(choices.map((b) => b.getAttribute('aria-label'))).toEqual(['Align left', 'Align center', 'Align right', 'Justify']);
        expect(choices[0].getAttribute('aria-pressed')).toBe('true');
        choices[1].click();
        await nextTick();
        expect(m.model.value!.content[0].attrs).toEqual({ align: 'center' });
        expect(m.host.querySelector('.tao-editor-align')).toBeNull();
        button(m.host, 'Align').click();
        await nextTick();
        expect(inPopup(m.host, 'tao-editor-align')[1].getAttribute('aria-pressed')).toBe('true'); // it shows where we are
        inPopup(m.host, 'tao-editor-align')[0].click();
        await nextTick();
        expect(m.model.value!.content[0].attrs).toBeUndefined();
    });

    it('one popup at a time, and a press outside or Escape in the text closes it', async () => {
        const m = mount({ profile: 'article', emoji: true });
        await nextTick();
        button(m.host, 'Align').click();
        await nextTick();
        button(m.host, 'Text size').click();
        await nextTick();
        expect(m.host.querySelector('.tao-editor-align')).toBeNull();
        expect(m.host.querySelector('.tao-editor-size')).not.toBeNull();
        button(m.host, 'Text and background color').click();
        await nextTick();
        expect(m.host.querySelector('.tao-editor-size')).toBeNull();
        expect(m.host.querySelector('.tao-editor-colors')).not.toBeNull();
        m.host.querySelector<HTMLButtonElement>('.tao-editor-emoji-button')!.click();
        await nextTick();
        expect(m.host.querySelector('.tao-editor-colors')).toBeNull();
        expect(m.host.querySelector('.tao-editor-emoji')).not.toBeNull();

        button(m.host, 'Align').click();
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).toBeNull();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-align')).toBeNull();

        button(m.host, 'Text size').click();
        await nextTick();
        m.engine().view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-size')).toBeNull();
    });

    it('a press on its own button or inside it does not close it', async () => {
        const m = mount({ profile: 'article' });
        await nextTick();
        button(m.host, 'Align').click();
        await nextTick();
        m.host.querySelector('.tao-editor-align')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        button(m.host, 'Align').dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-align')).not.toBeNull();
    });
});

describe('the size popup', () => {
    it('offers small, normal, large, huge; a choice sizes the selection; normal takes it off', async () => {
        const m = mount({ profile: 'article' });
        await nextTick();
        type(m.engine(), 'abc');
        selectAll(m.engine());
        button(m.host, 'Text size').click();
        await nextTick();
        await nextTick();
        const choices = inPopup(m.host, 'tao-editor-size');
        expect(choices.map((b) => b.textContent!.trim())).toEqual(['Small', 'Normal', 'Large', 'Huge']);
        expect(choices[1].getAttribute('aria-pressed')).toBe('true');
        choices[2].click();
        await nextTick();
        expect(m.model.value!.content[0].content![0].marks).toEqual([{ type: 'size', attrs: { value: 'large' } }]);
        expect(m.host.querySelector('.tao-editor-size')).toBeNull();
        button(m.host, 'Text size').click();
        await nextTick();
        expect(inPopup(m.host, 'tao-editor-size')[2].getAttribute('aria-pressed')).toBe('true');
        inPopup(m.host, 'tao-editor-size')[1].click();
        await nextTick();
        expect(JSON.stringify(m.model.value)).not.toContain('size');
    });

    it('the texts can be translated', async () => {
        const m = mount({ profile: 'article', labels: { size: 'Размер', sizeHuge: 'Огромный', align: 'Выравнивание', alignCenter: 'По центру' } });
        await nextTick();
        button(m.host, 'Размер').click();
        await nextTick();
        expect(inPopup(m.host, 'tao-editor-size').map((b) => b.textContent!.trim())).toContain('Огромный');
        button(m.host, 'Выравнивание').click();
        await nextTick();
        expect(inPopup(m.host, 'tao-editor-align').map((b) => b.getAttribute('aria-label'))).toContain('По центру');
    });
});
