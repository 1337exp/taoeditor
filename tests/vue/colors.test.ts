// @vitest-environment jsdom
import { TextSelection } from 'prosemirror-state';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import type { Doc } from '../../src/core';
import type { EditorHandle } from '../../src/editor';
import { TaoEditor } from '../../src/vue/taoui';
import { PALETTE } from '../../src/vue/taoui/palette';
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
    const app = createApp({ render: () => h(TaoEditor, { ref: comp, modelValue: model.value, 'onUpdate:modelValue': (d: Doc) => (model.value = d), profile: 'chat', ...props }) });
    app.mount(host);
    apps.push(app);
    return { host, model, engine: () => comp.value!.engine() };
}

const open = async (m: ReturnType<typeof mount>): Promise<void> => {
    m.host.querySelector<HTMLButtonElement>('.tao-editor-colors-button')!.click();
    await nextTick();
};
const sections = (host: HTMLElement): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.tao-editor-colors-section')];
const swatches = (section: HTMLElement): HTMLButtonElement[] => [...section.querySelectorAll<HTMLButtonElement>('.tao-editor-swatch')];
const selectAll = (e: EditorHandle): void => e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 1, e.view.state.doc.content.size - 1)));

describe('the colour panel', () => {
    it('opens from the toolbar: two sections, the whole palette in each, and a field for another colour', async () => {
        const m = mount();
        await nextTick();
        expect(m.host.querySelector('.tao-editor-colors')).toBeNull();
        await open(m);
        const [text, background] = sections(m.host);
        expect(text.querySelector('.tao-editor-colors-title')!.textContent).toBe('Text color');
        expect(background.querySelector('.tao-editor-colors-title')!.textContent).toBe('Background color');
        expect(swatches(text).map((s) => s.title)).toEqual([...PALETTE]);
        expect(swatches(background)).toHaveLength(PALETTE.length);
        expect(PALETTE).toHaveLength(80);
        expect(new Set(PALETTE).size).toBe(80);
        expect(text.querySelector('.tao-color-input')).not.toBeNull();
        expect(m.host.querySelector('.tao-editor-colors-button')!.getAttribute('aria-pressed')).toBe('true');
    });

    it('a swatch colours the selection (text and background apart), shows as chosen, and Default takes it off', async () => {
        const m = mount();
        await nextTick();
        type(m.engine(), 'abc');
        selectAll(m.engine());
        await open(m);
        const [text, background] = sections(m.host);
        const red = swatches(text).find((s) => s.title === '#ff0000')!;
        expect(red.getAttribute('aria-pressed')).toBe('false');
        red.click();
        swatches(background).find((s) => s.title === '#ffff00')!.click();
        await nextTick();
        expect(m.model.value!.content[0].content![0].marks).toEqual([
            { type: 'color', attrs: { value: '#ff0000' } },
            { type: 'background', attrs: { value: '#ffff00' } },
        ]);
        expect(swatches(sections(m.host)[0]).find((s) => s.title === '#ff0000')!.getAttribute('aria-pressed')).toBe('true');
        const reset = sections(m.host)[0].querySelector<HTMLButtonElement>('.tao-editor-colors-head button')!;
        expect(reset.disabled).toBe(false);
        reset.click();
        await nextTick();
        expect(m.model.value!.content[0].content![0].marks).toEqual([{ type: 'background', attrs: { value: '#ffff00' } }]);
        expect(sections(m.host)[0].querySelector<HTMLButtonElement>('.tao-editor-colors-head button')!.disabled).toBe(true);
    });

    it('arrow keys walk the swatches and only one is a Tab stop', async () => {
        const m = mount();
        await nextTick();
        await open(m);
        const list = swatches(sections(m.host)[0]);
        expect(list.filter((s) => s.tabIndex === 0)).toHaveLength(1);
        expect(list[0].tabIndex).toBe(0);
        const press = (key: string): void => {
            document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        };
        list[0].focus();
        press('ArrowRight');
        expect(document.activeElement).toBe(list[1]);
        expect(list[1].tabIndex).toBe(0);
        expect(list[0].tabIndex).toBe(-1);
        press('ArrowDown');
        expect(document.activeElement).toBe(list[11]);
        press('ArrowUp');
        press('ArrowLeft');
        expect(document.activeElement).toBe(list[0]);
        press('ArrowLeft'); // the edge: stays
        expect(document.activeElement).toBe(list[0]);
    });

    it('closes on a press outside and on one into the text, not on one inside it or in the popup of the custom field', async () => {
        const m = mount();
        await nextTick();
        await open(m);
        const fire = (el: Element): void => void el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        fire(m.host.querySelector('.tao-editor-colors')!);
        const popup = document.createElement('div');
        popup.className = 'tao-popover__panel';
        document.body.append(popup);
        fire(popup);
        await nextTick();
        expect(m.host.querySelector('.tao-editor-colors')).not.toBeNull();
        fire(m.host.querySelector('.tao-editor')!);
        await nextTick();
        expect(m.host.querySelector('.tao-editor-colors')).toBeNull();
        await open(m);
        fire(document.body);
        await nextTick();
        expect(m.host.querySelector('.tao-editor-colors')).toBeNull();
    });

    it('Escape closes it, from the text and from inside the panel', async () => {
        const m = mount();
        await nextTick();
        await open(m);
        m.engine().view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-colors')).toBeNull();
        await open(m);
        swatches(sections(m.host)[0])[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-colors')).toBeNull();
    });

    it('in the floating toolbar the panel lives in the floating box and keeps it open', async () => {
        const m = mount({ floating: true });
        await nextTick();
        const e = m.engine();
        type(e, 'ab');
        selectAll(e);
        m.host.querySelector('.tao-editor-root')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        await nextTick();
        await open(m);
        expect(m.host.querySelector('.tao-editor-floating .tao-editor-colors')).not.toBeNull();
        // the selection is cleared by clicking elsewhere in the text; the open panel keeps the box (like the link form)
        e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 1, 1)));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-floating .tao-editor-colors')).not.toBeNull();
    });

    it('the texts can be translated', async () => {
        const m = mount({ labels: { colors: 'Цвета', colorText: 'Цвет текста', colorBackground: 'Цвет фона', colorReset: 'По умолчанию' } });
        await nextTick();
        expect(m.host.querySelector('.tao-editor-colors-button')!.getAttribute('aria-label')).toBe('Цвета');
        await open(m);
        expect(m.host.querySelector('.tao-editor-colors')!.getAttribute('aria-label')).toBe('Цвета');
        expect(sections(m.host)[1].querySelector('.tao-editor-colors-title')!.textContent).toBe('Цвет фона');
        expect(sections(m.host)[0].querySelector('.tao-editor-colors-head button')!.textContent).toContain('По умолчанию');
    });
});
