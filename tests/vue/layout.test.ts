// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { TaoEditor } from '../../src/vue/taoui';

const apps: App[] = [];
afterEach(() => {
    while (apps.length) apps.pop()!.unmount();
    document.body.replaceChildren();
});

function mount(props: Record<string, unknown>): HTMLElement {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ render: () => h(TaoEditor, props) });
    app.mount(host);
    apps.push(app);
    return host.querySelector<HTMLElement>('.tao-editor-root')!;
}

describe('a long text: maxHeight and sticky', () => {
    it('maxHeight sets --te-max-height on the component: a number is px, a string is a CSS length, nothing leaves it alone', async () => {
        const a = mount({ maxHeight: 240 });
        const b = mount({ maxHeight: '60vh' });
        const c = mount({});
        await nextTick();
        expect(a.style.getPropertyValue('--te-max-height')).toBe('240px');
        expect(b.style.getPropertyValue('--te-max-height')).toBe('60vh');
        expect(c.style.getPropertyValue('--te-max-height')).toBe('');
    });

    it('sticky marks the root for the toolbar rule; it is not for the floating toolbar, and off by default', async () => {
        const sticky = mount({ sticky: true });
        const floating = mount({ sticky: true, floating: true });
        const plain = mount({});
        await nextTick();
        expect(sticky.classList.contains('tao-editor-root--sticky')).toBe(true);
        expect(floating.classList.contains('tao-editor-root--sticky')).toBe(false);
        expect(plain.classList.contains('tao-editor-root--sticky')).toBe(false);
    });
});
