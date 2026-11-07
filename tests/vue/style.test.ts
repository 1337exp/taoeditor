// @vitest-environment jsdom
import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import type { Doc } from '../../src/core';
import type { EditorHandle } from '../../src/editor';
import { TaoEditor } from '../../src/vue/taoui';
import { type } from '../editor/helpers';

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

const names = (host: HTMLElement): string[] => [...host.querySelectorAll('.tao-editor-toolbar button')].map((b) => b.getAttribute('aria-label')!);
const button = (host: HTMLElement, label: string): HTMLButtonElement => [...host.querySelectorAll<HTMLButtonElement>('.tao-editor-toolbar button')].find((b) => b.getAttribute('aria-label') === label)!;
const choices = (host: HTMLElement): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('.tao-editor-style button')];
// a row says its name, and its key at the end (a button with text prints the key, as the menus of Docs do)
const label = (b: HTMLElement): string => b.querySelector('.tao-button__content')!.textContent!.trim();
const keyOf = (b: HTMLElement): string => b.querySelector('kbd')!.textContent!.trim();

describe('the paragraph style popup', () => {
    it('only a profile with headings has the button, and it is the first tool of the text group', async () => {
        const article = mount({ profile: 'article' });
        await nextTick();
        expect(names(article.host).slice(0, 4)).toEqual(['Undo', 'Redo', 'Paragraph style', 'Text size']);
        const comment = mount({ profile: 'comment' });
        await nextTick();
        expect(names(comment.host)).not.toContain('Paragraph style');
    });

    it('offers normal text and three headings with their keys; a choice makes the line that and closes the popup', async () => {
        const m = mount({ profile: 'article' });
        await nextTick();
        type(m.engine(), 'Title');
        button(m.host, 'Paragraph style').click();
        await nextTick();
        await nextTick();
        const list = choices(m.host);
        expect(list.map(label)).toEqual(['Normal text', 'Heading 1', 'Heading 2', 'Heading 3']);
        expect(list.map(keyOf)).toEqual(['Ctrl+Alt+0', 'Ctrl+Alt+1', 'Ctrl+Alt+2', 'Ctrl+Alt+3']);
        expect(list.map((b) => b.getAttribute('aria-keyshortcuts'))).toEqual(['Ctrl+Alt+0', 'Ctrl+Alt+1', 'Ctrl+Alt+2', 'Ctrl+Alt+3']);
        expect(list[0].getAttribute('aria-pressed')).toBe('true');
        list[2].click();
        await nextTick();
        expect(m.model.value!.content[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
        expect(m.host.querySelector('.tao-editor-style')).toBeNull();
        button(m.host, 'Paragraph style').click();
        await nextTick();
        expect(choices(m.host)[2].getAttribute('aria-pressed')).toBe('true'); // it shows where we are
        choices(m.host)[0].click();
        await nextTick();
        expect(m.model.value!.content[0].type).toBe('paragraph');
    });

    it('is one popup at a time with the others, and a press outside closes it', async () => {
        const m = mount({ profile: 'article' });
        await nextTick();
        button(m.host, 'Paragraph style').click();
        await nextTick();
        button(m.host, 'Text size').click();
        await nextTick();
        expect(m.host.querySelector('.tao-editor-style')).toBeNull();
        button(m.host, 'Paragraph style').click();
        await nextTick();
        expect(m.host.querySelector('.tao-editor-size')).toBeNull();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-style')).toBeNull();
    });

    it('the texts can be translated', async () => {
        const m = mount({ profile: 'article', labels: { blockStyle: 'Стиль абзаца', styleHeading1: 'Заголовок 1' } });
        await nextTick();
        button(m.host, 'Стиль абзаца').click();
        await nextTick();
        expect(choices(m.host).map(label)).toContain('Заголовок 1');
    });
});
