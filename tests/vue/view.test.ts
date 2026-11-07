// @vitest-environment jsdom
import { createApp, createSSRApp, h, nextTick, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { PROFILES, toHtml, type Doc } from '../../src/core';
import { TaoEditorView } from '../../src/vue';
import { FIXTURES } from '../fixtures';

const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const SECRET: Doc = { v: 1, content: [para(text('a '), text('secret', [{ type: 'spoiler' }]))] } as Doc;

describe('TaoEditorView', () => {
    it('renders the same markup as toHtml() for every fixture (server render; the only extra is aria-expanded)', async () => {
        for (const fx of FIXTURES) {
            const profile = PROFILES[fx.profile];
            const ssr = await renderToString(createSSRApp({ render: () => h(TaoEditorView, { doc: fx.doc, profile: fx.profile }) }));
            expect(ssr.replaceAll(' aria-expanded="false"', ''), fx.id).toBe(`<div class="tao-content">${toHtml(fx.doc, profile)}</div>`);
        }
    });

    it('hostile input stays inert: no tags, no handlers, no javascript: link', async () => {
        const evil = {
            v: 1,
            content: [
                { type: 'script', content: [text('x')] },
                para(text('<img src=x onerror=alert(1)>', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
            ],
        };
        const out = await renderToString(createSSRApp({ render: () => h(TaoEditorView, { doc: evil as unknown as Doc }) }));
        expect(out).not.toMatch(/<img|<script|javascript:/);
        expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('a missing or broken document is one empty paragraph', async () => {
        for (const doc of [undefined, null, 42 as never]) {
            const out = await renderToString(createSSRApp({ render: () => h(TaoEditorView, { doc }) }));
            expect(out).toBe('<div class="tao-content"><p><br></p></div>');
        }
    });

    it('a spoiler opens on click and on Enter or Space, closes again, and a new document starts closed', async () => {
        const doc = ref<Doc>(SECRET);
        const host = document.createElement('div');
        document.body.append(host);
        createApp({ render: () => h(TaoEditorView, { doc: doc.value }) }).mount(host);
        const spoiler = (): HTMLElement => host.querySelector('.tao-spoiler')!;

        expect(spoiler().getAttribute('aria-expanded')).toBe('false');
        expect(spoiler().classList.contains('tao-spoiler--open')).toBe(false);

        spoiler().click();
        await nextTick();
        expect(spoiler().classList.contains('tao-spoiler--open')).toBe(true);
        expect(spoiler().getAttribute('aria-expanded')).toBe('true');

        spoiler().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await nextTick();
        expect(spoiler().classList.contains('tao-spoiler--open')).toBe(false);

        spoiler().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        await nextTick();
        expect(spoiler().classList.contains('tao-spoiler--open')).toBe(true);

        doc.value = JSON.parse(JSON.stringify(SECRET)) as Doc; // another document object: closed again
        await nextTick();
        expect(spoiler().classList.contains('tao-spoiler--open')).toBe(false);
    });

    it('only the spoiler that was clicked opens', async () => {
        const doc: Doc = { v: 1, content: [para(text('one', [{ type: 'spoiler' }]), text(' '), text('two', [{ type: 'spoiler' }]))] } as Doc;
        const host = document.createElement('div');
        document.body.append(host);
        createApp({ render: () => h(TaoEditorView, { doc }) }).mount(host);
        const [one, two] = [...host.querySelectorAll<HTMLElement>('.tao-spoiler')];
        two.click();
        await nextTick();
        expect(one.classList.contains('tao-spoiler--open')).toBe(false);
        expect(two.classList.contains('tao-spoiler--open')).toBe(true);
    });
});
