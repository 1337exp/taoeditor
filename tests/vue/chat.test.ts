// @vitest-environment jsdom
import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toPlainText, type Doc } from '../../src/core';
import type { EditorHandle } from '../../src/editor';
import { TaoEditorView } from '../../src/vue';
import { TaoEditor, type MentionItem } from '../../src/vue/taoui';
import { press, type } from '../editor/helpers';

const apps: App[] = [];
afterEach(() => {
    while (apps.length) apps.pop()!.unmount();
    document.body.replaceChildren();
});

const flush = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        await nextTick();
    }
};

const PEOPLE: MentionItem[] = [
    { id: 'u1', label: 'Ann', hint: 'ann' },
    { id: 'u2', label: 'Andy' },
    { id: 'u3', label: 'Bob' },
];

function mount(props: Record<string, unknown> = {}) {
    const model = ref<Doc | null>(null);
    const events: { name: string; doc?: Doc }[] = [];
    const comp = ref<{ engine: () => EditorHandle } | null>(null);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
        render: () =>
            h(TaoEditor, {
                ref: comp,
                modelValue: model.value,
                'onUpdate:modelValue': (doc: Doc) => (model.value = doc),
                onSend: (doc: Doc) => events.push({ name: 'send', doc }),
                profile: 'chat',
                ...props,
            }),
    });
    app.mount(host);
    apps.push(app);
    return { host, model, events, engine: () => comp.value!.engine() };
}

const options = (host: HTMLElement): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.tao-editor-suggest [role="option"]')];
const labels = (host: HTMLElement): string[] => options(host).map((o) => o.querySelector('.tao-editor-suggest-label')!.textContent!);

describe('mentions in TaoEditor', () => {
    it('@ asks the app for people and shows them under the field; the typed text is untouched until one is chosen', async () => {
        const search = vi.fn((q: string) => PEOPLE.filter((p) => p.label.toLowerCase().startsWith(q.toLowerCase())));
        const m = mount({ mentions: search });
        await nextTick();
        type(m.engine(), 'hi @a');
        await flush();
        expect(search).toHaveBeenLastCalledWith('a');
        expect(labels(m.host)).toEqual(['Ann', 'Andy']);
        expect(m.host.querySelector('.tao-editor-suggest')!.getAttribute('role')).toBe('listbox');
        expect(toPlainText(m.engine().getDoc())).toBe('hi @a');
    });

    it('ArrowDown moves, Enter chooses: a mention and a space replace @query, the list closes, v-model has it', async () => {
        const m = mount({ mentions: (q: string) => PEOPLE.filter((p) => p.label.toLowerCase().startsWith(q)), submit: 'enter' });
        await nextTick();
        type(m.engine(), 'hi @a');
        await flush();
        expect(options(m.host)[0].getAttribute('aria-selected')).toBe('true');
        press(m.engine(), 'ArrowDown');
        await flush();
        expect(options(m.host)[1].getAttribute('aria-selected')).toBe('true');
        press(m.engine(), 'Enter');
        await flush();
        expect(m.host.querySelector('.tao-editor-suggest')).toBeNull();
        expect(m.events).toEqual([]); // Enter chose, it did not send
        expect(m.model.value!.content[0].content).toEqual([
            { type: 'text', text: 'hi ' },
            { type: 'mention', attrs: { id: 'u2', label: 'Andy' } },
            { type: 'text', text: ' ' },
        ]);
    });

    it('a click on a person chooses it; a press on the list does not take the focus', async () => {
        const m = mount({ mentions: () => PEOPLE });
        await nextTick();
        type(m.engine(), '@');
        await flush();
        const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        m.host.querySelector('.tao-editor-suggest')!.dispatchEvent(down);
        expect(down.defaultPrevented).toBe(true);
        options(m.host)[2].click();
        await flush();
        expect(toPlainText(m.engine().getDoc())).toBe('@Bob ');
    });

    it('an answer that comes late for an old query is ignored', async () => {
        const waiting: Record<string, (list: MentionItem[]) => void> = {};
        const search = (q: string) => new Promise<MentionItem[]>((resolve) => (waiting[q] = resolve));
        const m = mount({ mentions: search });
        await nextTick();
        type(m.engine(), '@a');
        type(m.engine(), 'n');
        waiting.an([PEOPLE[0]]);
        await flush();
        waiting.a(PEOPLE); // the slow answer to the old query
        await flush();
        expect(labels(m.host)).toEqual(['Ann']);
    });

    it('Escape closes the list; with no one found Enter works as always (it sends)', async () => {
        const m = mount({ mentions: (q: string) => PEOPLE.filter((p) => p.label.toLowerCase().startsWith(q)), submit: 'enter' });
        await nextTick();
        type(m.engine(), '@a');
        await flush();
        press(m.engine(), 'Escape');
        await flush();
        expect(m.host.querySelector('.tao-editor-suggest')).toBeNull();

        const n = mount({ mentions: () => [], submit: 'enter' });
        await nextTick();
        type(n.engine(), 'hey @zzz');
        await flush();
        press(n.engine(), 'Enter');
        expect(n.events.map((e) => e.name)).toEqual(['send']);
    });

    it('the text box says a list can open, and which item is current', async () => {
        const m = mount({ mentions: () => PEOPLE });
        await nextTick();
        const box = m.host.querySelector('.tao-editor')!;
        expect(box.getAttribute('aria-haspopup')).toBe('listbox');
        type(m.engine(), '@');
        await flush();
        const list = m.host.querySelector('.tao-editor-suggest')!;
        expect(box.getAttribute('aria-controls')).toBe(list.id);
        expect(box.getAttribute('aria-activedescendant')).toBe(options(m.host)[0].id);
        press(m.engine(), 'Escape');
        await flush();
        expect(box.hasAttribute('aria-controls')).toBe(false);
    });

    it('without the mentions prop @ is just a character: no list, no attributes', async () => {
        const m = mount();
        await nextTick();
        type(m.engine(), 'a @b');
        await flush();
        expect(m.host.querySelector('.tao-editor-suggest')).toBeNull();
        expect(m.host.querySelector('.tao-editor')!.hasAttribute('aria-haspopup')).toBe(false);
    });

    it('a search that fails shows nothing and breaks nothing', async () => {
        const m = mount({ mentions: () => Promise.reject(new Error('offline')) });
        await nextTick();
        type(m.engine(), '@a');
        await flush();
        expect(m.host.querySelector('.tao-editor-suggest')).toBeNull();
        expect(toPlainText(m.engine().getDoc())).toBe('@a');
    });
});

describe('emoji in TaoEditor', () => {
    const corner = (host: HTMLElement): HTMLButtonElement | null => host.querySelector('.tao-editor-emoji-button');

    it('there is no emoji button unless asked, and none when readonly', async () => {
        expect(corner(mount().host)).toBeNull();
        expect(corner(mount({ emoji: true, readonly: true }).host)).toBeNull();
    });

    it('the button opens a list; a pick is typed at the caret as plain text; Escape closes', async () => {
        const m = mount({ emoji: true, emojiList: ['😀', '🎉'] });
        await nextTick();
        type(m.engine(), 'a');
        expect(m.host.querySelector('.tao-editor-emoji')).toBeNull();
        corner(m.host)!.click();
        await nextTick();
        const panel = m.host.querySelector<HTMLElement>('.tao-editor-emoji')!;
        expect([...panel.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['😀', '🎉']);
        panel.querySelectorAll('button')[1].click();
        await nextTick();
        expect(toPlainText(m.engine().getDoc())).toBe('a🎉');
        expect(m.model.value!.content[0].content).toEqual([{ type: 'text', text: 'a🎉' }]);
        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await nextTick();
        expect(m.host.querySelector('.tao-editor-emoji')).toBeNull();
    });

    it('the default list is there and the editor DOM stays in its host while the list opens', async () => {
        const m = mount({ emoji: true });
        await nextTick();
        const field = m.host.querySelector('.tao-editor')!;
        corner(m.host)!.click();
        await nextTick();
        expect(m.host.querySelectorAll('.tao-editor-emoji button').length).toBeGreaterThan(40);
        expect(m.host.querySelector('.tao-editor')).toBe(field);
        expect(field.parentElement!.classList.contains('tao-editor-host')).toBe(true);
    });
});

describe('TaoEditorView and mentions', () => {
    const doc: Doc = {
        v: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi ' }, { type: 'mention', attrs: { id: 'u1', label: 'Ann' } }] }],
    };

    it('a mention is plain text unless the app listens: no role, no tab stop', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const app = createApp({ render: () => h(TaoEditorView, { doc }) });
        app.mount(host);
        apps.push(app);
        const chip = host.querySelector('.tao-mention')!;
        expect(chip.textContent).toBe('@Ann');
        expect(chip.getAttribute('data-mention')).toBe('u1');
        expect(chip.hasAttribute('role')).toBe(false);
        expect(chip.hasAttribute('tabindex')).toBe(false);
    });

    it('with a listener a mention is a button: click, Enter and Space give its id', () => {
        const heard: string[] = [];
        const host = document.createElement('div');
        document.body.append(host);
        const app = createApp({ render: () => h(TaoEditorView, { doc, onMention: (id: string) => heard.push(id) }) });
        app.mount(host);
        apps.push(app);
        const chip = host.querySelector<HTMLElement>('.tao-mention')!;
        expect(chip.getAttribute('role')).toBe('button');
        expect(chip.getAttribute('tabindex')).toBe('0');
        chip.click();
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
        expect(heard).toEqual(['u1', 'u1', 'u1']);
    });
});
