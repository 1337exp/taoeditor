// @vitest-environment jsdom
import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { withoutFeatures, type Doc } from '../../src/core';
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

const button = (host: HTMLElement, label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll<HTMLButtonElement>('.tao-editor-toolbar button')].find((b) => b.getAttribute('aria-label') === label);
    if (!found) throw new Error(`no button "${label}"`);
    return found;
};
const popupButtons = (host: HTMLElement): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('.tao-editor-table button')];
const byLabel = (host: HTMLElement, label: string): HTMLButtonElement => {
    const found = popupButtons(host).find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === label);
    if (!found) throw new Error(`no "${label}" in the popup`);
    return found;
};
const tick = async (): Promise<void> => {
    await nextTick();
    await nextTick();
};

describe('the table button', () => {
    it('is there when the profile has tables and gone when it does not', async () => {
        const some = mount({ profile: 'comment' });
        const none = mount({ profile: 'chat' });
        const noTables = mount({ profile: withoutFeatures('comment', { nodes: ['table'] }) });
        await nextTick();
        expect(() => button(some.host, 'Table')).not.toThrow();
        expect(() => button(none.host, 'Table')).toThrow();
        expect(() => button(noTables.host, 'Table')).toThrow();
    });

    it('outside a table it opens the size picker; pointing at a cell shows the size; a click inserts that table', async () => {
        const m = mount({ profile: 'comment' });
        await nextTick();
        button(m.host, 'Table').click();
        await tick();
        const cells = m.host.querySelectorAll<HTMLButtonElement>('.tao-editor-grid-cell');
        expect(cells).toHaveLength(48); // 8 columns by 6 rows
        const target = m.host.querySelector<HTMLButtonElement>('[aria-label="3 × 2"]')!;
        target.dispatchEvent(new MouseEvent('mouseenter'));
        await tick();
        expect(m.host.querySelector('.tao-editor-grid-label')!.textContent).toBe('3 × 2');
        expect(m.host.querySelectorAll('.tao-editor-grid-cell--on')).toHaveLength(6);
        target.click();
        await tick();
        const table = m.engine().getDoc().content[0];
        expect(table.type).toBe('table');
        expect(table.content).toHaveLength(2);
        expect(table.content![0].content).toHaveLength(3);
        expect(m.host.querySelector('.tao-editor-table')).toBeNull(); // closed
        expect(m.host.querySelector('.tao-editor td')).not.toBeNull();
    });

    it('in a table it lists what can be done, and does it', async () => {
        const m = mount({ profile: 'comment' });
        await nextTick();
        m.engine().insertTable(2, 2);
        type(m.engine(), 'x');
        await tick();
        expect(button(m.host, 'Table').getAttribute('aria-pressed')).toBe('true');
        button(m.host, 'Table').click();
        await tick();
        expect(m.host.querySelector('.tao-editor-grid')).toBeNull();
        expect(popupButtons(m.host).map((b) => b.getAttribute('aria-label') ?? b.textContent!.trim())).toEqual([
            'Insert row above', 'Insert row below', 'Delete row', 'Insert column before', 'Insert column after', 'Delete column', 'Header row', 'Delete table',
        ]);
        byLabel(m.host, 'Insert row below').click();
        await tick();
        expect(m.engine().getDoc().content[0].content).toHaveLength(3);
        button(m.host, 'Table').click();
        await tick();
        byLabel(m.host, 'Delete table').click();
        await tick();
        expect(m.engine().getDoc().content.map((n) => n.type)).toEqual(['paragraph']);
    });

    it('closes with Escape and with a press outside', async () => {
        const m = mount({ profile: 'comment' });
        await nextTick();
        button(m.host, 'Table').click();
        await tick();
        expect(m.host.querySelector('.tao-editor-table')).not.toBeNull();
        m.host.querySelector('.tao-editor-grid-cell')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick();
        expect(m.host.querySelector('.tao-editor-table')).toBeNull();
        button(m.host, 'Table').click();
        await tick();
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await tick();
        expect(m.host.querySelector('.tao-editor-table')).toBeNull();
    });

    it('arrows walk the grid and only one cell is a Tab stop', async () => {
        const m = mount({ profile: 'comment' });
        await nextTick();
        button(m.host, 'Table').click();
        await tick();
        const cells = [...m.host.querySelectorAll<HTMLButtonElement>('.tao-editor-grid-cell')];
        expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);
        cells[0].focus();
        cells[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(cells[8]);
        cells[8].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(cells[9]);
    });
});
