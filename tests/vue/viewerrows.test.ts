// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { afterEach, describe, expect, it } from 'vitest';
import type { Doc } from '../../src/core';
import { TaoEditorView } from '../../src/vue';

const apps: App[] = [];
afterEach(() => {
    while (apps.length) apps.pop()!.unmount();
    document.body.replaceChildren();
});

const DOC: Doc = { v: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a long comment' }] }] };

function mount(props: Record<string, unknown>): HTMLElement {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ render: () => h(TaoEditorView, { doc: DOC, ...props }) });
    app.mount(host);
    apps.push(app);
    return host;
}

/** jsdom has no layout: say that the text is taller than the box. */
function layout(scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight });
}
afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
});

describe('the viewer with maxRows', () => {
    it('without it nothing changes: the root is the text itself', () => {
        const host = mount({});
        expect(host.firstElementChild!.classList.contains('tao-content')).toBe(true);
        expect(host.querySelector('.tao-content-clamp')).toBeNull();
    });

    it('a short text is shown as it is: cut to the rows, no button', async () => {
        layout(40, 40);
        const host = mount({ maxRows: 3 });
        await nextTick();
        expect(host.querySelector('.tao-content-clamp > .tao-content--clamped')!.getAttribute('style')).toContain('--te-rows: 3');
        expect(host.querySelector('.tao-content-more')).toBeNull();
        expect(host.querySelector('.tao-content--faded')).toBeNull();
    });

    it('a long text is faded and has a button that opens it and closes it again', async () => {
        layout(200, 60);
        const host = mount({ maxRows: 3 });
        await nextTick();
        await nextTick();
        const button = host.querySelector<HTMLButtonElement>('.tao-content-more')!;
        expect(button.textContent).toBe('Show more');
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(host.querySelector('.tao-content--faded')).not.toBeNull();
        button.click();
        await nextTick();
        expect(host.querySelector('.tao-content--clamped')).toBeNull();
        expect(host.querySelector('.tao-content-more')!.textContent).toBe('Show less');
        host.querySelector<HTMLButtonElement>('.tao-content-more')!.click();
        await nextTick();
        expect(host.querySelector('.tao-content--clamped')).not.toBeNull();
    });

    it('the labels are the app\'s own, and nonsense for maxRows shows the text in full', async () => {
        layout(200, 60);
        const host = mount({ maxRows: 3, moreLabel: 'Ещё', lessLabel: 'Свернуть' });
        await nextTick();
        await nextTick();
        expect(host.querySelector('.tao-content-more')!.textContent).toBe('Ещё');
        const full = mount({ maxRows: 0 });
        expect(full.querySelector('.tao-content-clamp')).toBeNull();
    });

    it('on a server the text is whole: no cut without a script to open it, no button', async () => {
        const html = await renderToString(h(TaoEditorView, { doc: DOC, maxRows: 3 }));
        expect(html).toContain('a long comment');
        expect(html).not.toContain('tao-content-more');
        expect(html).not.toContain('tao-content--clamped');
    });
});
