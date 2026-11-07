import { describe, expect, it } from 'vitest';
import { PROFILES, serializeTree, toHtml, toRenderTree } from '../../src/core';
import { FIXTURES } from '../fixtures';

const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const wrap = (...content: unknown[]) => ({ v: 1, content });

const html = (...content: unknown[]) => toHtml(wrap(...content));
const LINK = 'rel="noopener noreferrer nofollow ugc" target="_blank"';

describe('structure', () => {
    it('renders every canonical fixture (nothing throws, nothing is empty, the text is all there)', () => {
        for (const fx of FIXTURES) {
            const out = toHtml(fx.doc, PROFILES[fx.profile]);
            expect(out, fx.id).toBeTypeOf('string');
            for (const word of fx.text.split(/\s+/).filter((w) => /^[a-z]+$/i.test(w))) expect(out, `${fx.id}: ${word}`).toContain(word);
        }
    });

    it('blocks: paragraph, heading, quote, code block with language, lists with a start number', () => {
        expect(
            html(
                { type: 'heading', attrs: { level: 2 }, content: [text('T')] },
                { type: 'blockquote', content: [para(text('q'))] },
                { type: 'codeBlock', attrs: { lang: 'ts' }, content: [text('a < b\nc')] },
                { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [para(text('x'))] }] },
                { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('y'))] }] },
            ),
        ).toBe(
            '<h2>T</h2><blockquote><p>q</p></blockquote><pre data-lang="ts"><code>a &lt; b\nc</code></pre>' +
                '<ol start="3"><li><p>x</p></li></ol><ul><li><p>y</p></li></ul>',
        );
    });

    it('an empty paragraph keeps its height with a <br>, a hard break is a <br>', () => {
        expect(html({ type: 'paragraph' }, para(text('a'), { type: 'hardBreak' }, text('b')))).toBe('<p><br></p><p>a<br>b</p>');
    });

    it('marks nest in canonical order: the link is outermost, code innermost', () => {
        expect(html(para(text('x', [{ type: 'italic' }, { type: 'bold' }, { type: 'link', attrs: { href: 'https://a.com' } }])))).toBe(
            `<p><a href="https://a.com/" ${LINK}><strong><em>x</em></strong></a></p>`,
        );
        expect(html(para(text('c', [{ type: 'code' }, { type: 'bold' }])))).toBe('<p><code>c</code></p>');
        expect(html(para(text('s', [{ type: 'strike' }])))).toBe('<p><s>s</s></p>');
    });

    it('a spoiler is a focusable button-like span that carries its place in the document', () => {
        const tree = toRenderTree(wrap({ type: 'paragraph' }, para(text('a'), text('secret', [{ type: 'spoiler' }]))));
        const span = (tree[1].children[1] as { spoiler?: string; attrs?: Record<string, string> });
        expect(span.spoiler).toBe('1.1.0');
        expect(span.attrs).toEqual({ class: 'tao-spoiler', role: 'button', tabindex: '0' });
        expect(html(para(text('secret', [{ type: 'spoiler' }])))).toBe('<p><span class="tao-spoiler" role="button" tabindex="0">secret</span></p>');
    });
});

describe('mentions', () => {
    it('a mention is a span with its id, the label is escaped, marks wrap it', () => {
        const m = { type: 'mention', attrs: { id: 'u1', label: '<b>Ann</b> & co' }, marks: [{ type: 'bold' }] };
        expect(html(para(text('hi '), m))).toBe('<p>hi <strong><span class="tao-mention" data-mention="u1">@&lt;b&gt;Ann&lt;/b&gt; &amp; co</span></strong></p>');
    });

    it('a forged mention (a bad id) renders nothing', () => {
        expect(html(para(text('a'), { type: 'mention', attrs: { id: 'x"><script>', label: 'Ann' } }))).toBe('<p>a</p>');
    });
});

describe('the output is safe whatever the input is', () => {
    it('escapes text and quotes: no tag, no attribute can be injected', () => {
        const evil = `<img src=x onerror=alert(1)> & "q" 'a'`;
        const out = html(para(text(evil)));
        expect(out).toBe('<p>&lt;img src=x onerror=alert(1)&gt; &amp; "q" \'a\'</p>');
        expect(out).not.toContain('<img');
    });

    it('a hostile document cannot add tags, attributes or links', () => {
        const input = wrap(
            { type: 'script', content: [text('alert(1)')] },
            { type: 'html', html: '<b onclick=x>' },
            { type: 'paragraph', attrs: { onclick: 'x()', style: 'y' }, content: [text('a', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])] },
            { type: 'paragraph', content: [text('b', [{ type: 'link', attrs: { href: 'https://a.com/"><script>x</script>' } }])] },
        );
        const out = toHtml(input);
        expect(out).not.toMatch(/<script|onclick|javascript:|style=|<b /);
        expect(out).not.toContain('"><');
        // the URL parser has already percent-encoded the quote and the angle brackets
        expect(out).toContain('%22%3E%3Cscript%3E');
    });

    it('the serializer escapes attribute values on its own (a second line of defence)', () => {
        const tree = [{ tag: 'a', attrs: { href: `x"><script>'&` }, children: ['<b>'] }];
        expect(serializeTree(tree)).toBe('<a href="x&quot;&gt;&lt;script&gt;&#39;&amp;">&lt;b&gt;</a>');
    });

    it('a link that is not allowed loses the <a> but the text stays', () => {
        expect(html(para(text('click', [{ type: 'link', attrs: { href: 'data:text/html,x' } }])))).toBe('<p>click</p>');
    });

    it('the profile applies: a heading is a paragraph when rendered as chat', () => {
        const input = wrap({ type: 'heading', content: [text('T')] });
        expect(toHtml(input, PROFILES.chat)).toBe('<p>T</p>');
        expect(toHtml(input)).toBe('<h1>T</h1>');
    });

    it.each([null, undefined, 42, 'str', [], { v: 9 }])('garbage %j renders as one empty paragraph and never throws', (input) => {
        expect(toHtml(input)).toBe('<p><br></p>');
    });
});
