// @vitest-environment jsdom
import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyDoc, toPlainText, type Doc } from '../../src/core';
import type { EditorHandle } from '../../src/editor';
import { TaoEditor } from '../../src/vue/taoui';
import '../editor/helpers'; // jsdom has no layout: the helpers stub the rectangles the engine asks for
import { press, runs, type } from '../editor/helpers';

type Props = Record<string, unknown>;
interface Mounted {
    app: App;
    host: HTMLElement;
    engine: () => EditorHandle;
    model: ReturnType<typeof ref<Doc | null>>;
    events: { name: string; doc?: Doc }[];
}

const apps: App[] = [];
afterEach(() => {
    while (apps.length) apps.pop()!.unmount();
    document.body.replaceChildren();
});

function mount(props: Props = {}, initial: Doc | null = null): Mounted {
    const model = ref<Doc | null>(initial);
    const events: Mounted['events'] = [];
    const comp = ref<{ engine: () => EditorHandle } | null>(null);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
        render: () =>
            h(TaoEditor, {
                ref: comp,
                modelValue: model.value,
                'onUpdate:modelValue': (doc: Doc) => (model.value = doc),
                onChange: (doc: Doc) => events.push({ name: 'change', doc }),
                onSend: (doc: Doc) => events.push({ name: 'send', doc }),
                onFocus: () => events.push({ name: 'focus' }),
                ...props,
            }),
    });
    app.mount(host);
    apps.push(app);
    return { app, host, engine: () => comp.value!.engine(), model, events };
}

const buttons = (host: HTMLElement): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('.tao-editor-toolbar button')];
const button = (host: HTMLElement, label: string): HTMLButtonElement => {
    const found = buttons(host).find((b) => b.getAttribute('aria-label') === label);
    if (!found) throw new Error(`no button "${label}" in: ${buttons(host).map((b) => b.getAttribute('aria-label')).join(', ')}`);
    return found;
};
const para = (value: string): Doc => ({ v: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] });

describe('TaoEditor', () => {
    it('shows the document it is given, as an editable text box with the TaoUI typography class', async () => {
        const m = mount({ label: 'Comment' }, para('hello'));
        await nextTick();
        const box = m.host.querySelector<HTMLElement>('.tao-editor')!;
        expect(box.getAttribute('contenteditable')).toBe('true');
        expect(box.getAttribute('aria-label')).toBe('Comment');
        expect(box.classList.contains('tao-prose')).toBe(true);
        expect(box.textContent).toBe('hello');
    });

    it('typing updates v-model and emits change, with a valid document', async () => {
        const m = mount();
        await nextTick();
        type(m.engine(), 'say **hi**');
        await nextTick();
        expect(m.model.value).not.toBeNull();
        expect(runs(m.engine())).toEqual([['say ', ''], ['hi', 'bold']]);
        expect(m.events.filter((e) => e.name === 'change').length).toBeGreaterThan(0);
        expect(m.engine().issues()).toEqual([]);
    });

    it('a new modelValue from the parent replaces the document, its own echo does not (the caret is kept)', async () => {
        const m = mount({}, para('one'));
        await nextTick();
        const before = m.engine().view.state.selection.from;
        type(m.engine(), 'x');
        await nextTick();
        expect(m.engine().view.state.selection.from).toBe(before + 1); // the echo did not reset it
        m.model.value = para('from outside');
        await nextTick();
        expect(toPlainText(m.engine().getDoc())).toBe('from outside');
        m.model.value = null;
        await nextTick();
        expect(m.engine().getDoc()).toEqual(emptyDoc());
    });

    it('toolbar: a toggle button follows the state and formats the selection', async () => {
        const m = mount({}, para('abc'));
        await nextTick();
        const bold = button(m.host, 'Bold');
        expect(bold.getAttribute('aria-pressed')).toBe('false');
        const e = m.engine();
        e.view.dispatch(e.view.state.tr.setSelection(selectAllOf(e)));
        bold.click();
        await nextTick();
        expect(runs(e)).toEqual([['abc', 'bold']]);
        expect(button(m.host, 'Bold').getAttribute('aria-pressed')).toBe('true');
        button(m.host, 'Bold').click();
        await nextTick();
        expect(runs(e)).toEqual([['abc', '']]);
    });

    it('toolbar: undo and redo are disabled until there is something to undo', async () => {
        const m = mount();
        await nextTick();
        expect(button(m.host, 'Undo').disabled).toBe(true);
        type(m.engine(), 'a');
        await nextTick();
        expect(button(m.host, 'Undo').disabled).toBe(false);
        button(m.host, 'Undo').click();
        await nextTick();
        expect(toPlainText(m.engine().getDoc())).toBe('');
        expect(button(m.host, 'Redo').disabled).toBe(false);
    });

    it('a button press does not take the focus from the editor (mousedown is cancelled)', async () => {
        const m = mount({}, para('abc'));
        await nextTick();
        const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        button(m.host, 'Bold').dispatchEvent(down);
        expect(down.defaultPrevented).toBe(true);
    });

    it('link: the row opens, a javascript: URL is refused with a message, a good one is applied', async () => {
        const m = mount({}, para('site'));
        await nextTick();
        const e = m.engine();
        e.view.dispatch(e.view.state.tr.setSelection(selectAllOf(e)));
        button(m.host, 'Link').click();
        await nextTick();
        const input = m.host.querySelector<HTMLInputElement>('.tao-editor-link input')!;
        input.value = 'javascript:alert(1)';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await nextTick();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-link-error')?.textContent).toContain('http');
        expect(runs(e)).toEqual([['site', '']]);

        input.value = 'https://666.io';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await nextTick();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await nextTick();
        expect(runs(e)).toEqual([['site', 'link']]);
        expect(m.host.querySelector('.tao-editor-link')).toBeNull();
    });

    it('send: Enter in submit="enter" emits send with the document', async () => {
        const m = mount({ submit: 'enter', profile: 'chat' });
        await nextTick();
        type(m.engine(), 'hello');
        press(m.engine(), 'Enter');
        const sent = m.events.find((x) => x.name === 'send');
        expect(sent && toPlainText(sent.doc!)).toBe('hello');
    });

    it('readonly and disabled make the text box not editable and lock the buttons', async () => {
        for (const props of [{ readonly: true }, { disabled: true }]) {
            const m = mount(props, para('x'));
            await nextTick();
            expect(m.host.querySelector('.tao-editor')!.getAttribute('contenteditable')).toBe('false');
            expect(button(m.host, 'Bold').disabled).toBe(true);
        }
    });

    it('toolbar: false shows no toolbar; the profile decides which buttons exist; labels can be translated', async () => {
        expect(buttons(mount({ toolbar: false }).host)).toHaveLength(0);
        const m = mount({ labels: { bold: 'Жирный', toolbar: 'Форматирование' } });
        await nextTick();
        expect(button(m.host, 'Жирный')).toBeTruthy();
        expect(m.host.querySelector('[role="toolbar"]')!.getAttribute('aria-label')).toBe('Форматирование');
    });

    it('changing the profile keeps the document and applies the new allowlist', async () => {
        const doc: Doc = { v: 1, content: [{ type: 'heading', content: [{ type: 'text', text: 'Title' }] }] };
        const profile = ref('article');
        const host = document.createElement('div');
        document.body.append(host);
        const comp = ref<{ engine: () => EditorHandle } | null>(null);
        const app = createApp({ render: () => h(TaoEditor, { ref: comp, modelValue: doc, profile: profile.value as 'article' }) });
        app.mount(host);
        apps.push(app);
        await nextTick();
        expect(comp.value!.engine().getDoc().content[0].type).toBe('heading');
        profile.value = 'chat';
        await nextTick();
        expect(comp.value!.engine().getDoc().content[0].type).toBe('paragraph');
        expect(toPlainText(comp.value!.engine().getDoc())).toBe('Title');
    });

    it('unmounting destroys the engine without errors', async () => {
        const m = mount({}, para('x'));
        await nextTick();
        m.app.unmount();
        apps.pop();
        expect(m.host.querySelector('.tao-editor')).toBeNull();
    });
});

import { TextSelection } from 'prosemirror-state';
function selectAllOf(e: EditorHandle): TextSelection {
    const { doc } = e.view.state;
    return TextSelection.create(doc, 1, doc.content.size - 1);
}
