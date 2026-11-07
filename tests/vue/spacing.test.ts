// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { TaoEditorView } from '../../src/vue';
import { TaoEditor } from '../../src/vue/taoui';
import '../editor/helpers';

const apps: App[] = [];
afterEach(() => {
    while (apps.length) apps.pop()!.unmount();
    document.body.replaceChildren();
});

function show(component: unknown, props: Record<string, unknown>): HTMLElement {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ render: () => h(component as never, props) });
    app.mount(host);
    apps.push(app);
    return host;
}

describe('the space between paragraphs (the same document, a different look)', () => {
    it('the viewer: a gap for an article, none for a chat or a comment', () => {
        expect(show(TaoEditorView, {}).querySelector('.tao-content')!.classList.contains('tao-compact')).toBe(false); // default: article
        expect(show(TaoEditorView, { profile: 'article' }).querySelector('.tao-content')!.classList.contains('tao-compact')).toBe(false);
        expect(show(TaoEditorView, { profile: 'chat' }).querySelector('.tao-content')!.classList.contains('tao-compact')).toBe(true);
        expect(show(TaoEditorView, { profile: 'comment' }).querySelector('.tao-content')!.classList.contains('tao-compact')).toBe(true);
    });

    it('the viewer: `spaced` decides over the profile, both ways', () => {
        expect(show(TaoEditorView, { profile: 'chat', spaced: true }).querySelector('.tao-content')!.classList.contains('tao-compact')).toBe(false);
        expect(show(TaoEditorView, { profile: 'article', spaced: false }).querySelector('.tao-content')!.classList.contains('tao-compact')).toBe(true);
    });

    it('the editor: the same rule, and the TaoUI typography class stays', async () => {
        const cls = async (props: Record<string, unknown>): Promise<DOMTokenList> => {
            const host = show(TaoEditor, props);
            await nextTick();
            return host.querySelector('.tao-editor')!.classList;
        };
        expect((await cls({ profile: 'comment' })).contains('tao-compact')).toBe(true);
        expect((await cls({ profile: 'chat' })).contains('tao-compact')).toBe(true);
        expect((await cls({ profile: 'article' })).contains('tao-compact')).toBe(false);
        expect((await cls({ profile: 'comment', spaced: true })).contains('tao-compact')).toBe(false);
        expect((await cls({ profile: 'article', spaced: false })).contains('tao-compact')).toBe(true);
        expect((await cls({ profile: 'comment' })).contains('tao-prose')).toBe(true);
    });
});
