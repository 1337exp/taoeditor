// @vitest-environment jsdom
import { DOMParser as PMParser } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { PROFILES, toPlainText, type Doc } from '../../src/core';
import { createSchema, docToNode, nodeToDoc } from '../../src/editor';
import { FIXTURES } from '../fixtures';
import './helpers';

/** Parses pasted HTML exactly like the engine does: through the schema's rules only. */
function paste(html: string, profile: 'chat' | 'comment' | 'article' = 'comment'): Doc {
    const schema = createSchema(PROFILES[profile]);
    const dom = new window.DOMParser().parseFromString(html, 'text/html').body;
    const node = PMParser.fromSchema(schema).parse(dom);
    node.check();
    const { doc, issues } = nodeToDoc(node, PROFILES[profile]);
    expect(issues, 'the engine produced something the core rejects').toEqual([]);
    return doc;
}

describe('pasted HTML cannot bring anything outside the schema', () => {
    it('drops scripts, styles, event handlers, images, iframes; keeps the visible text', () => {
        const doc = paste(
            '<p onclick="x()">a<script>alert(1)</script><style>p{}</style><img src=x onerror=alert(1)><iframe src="https://evil"></iframe>b</p>',
        );
        const json = JSON.stringify(doc);
        for (const bad of ['alert', 'onerror', 'onclick', 'iframe', 'img', 'style', 'script']) expect(json).not.toContain(bad);
        expect(toPlainText(doc)).toBe('ab');
    });

    it('keeps a good link and strips javascript:, data: and credentials links to text', () => {
        const doc = paste(
            '<p><a href="https://666.io">ok</a> <a href="javascript:alert(1)">js</a> <a href="data:text/html,x">data</a> <a href="https://a.com@evil.com">cred</a></p>',
        );
        expect(doc.content[0].content).toEqual([
            { type: 'text', text: 'ok', marks: [{ type: 'link', attrs: { href: 'https://666.io/' } }] },
            { type: 'text', text: ' js data cred' },
        ]);
    });

    it('reads Google Docs bold: a "normal" wrapper does not bold everything, the inner span does', () => {
        const doc = paste('<b style="font-weight:normal"><span style="font-weight:700">bold</span> plain</b>');
        expect(doc.content[0].content).toEqual([
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' plain' },
        ]);
    });

    it('reads Word and browser spans: italic, line-through, <b>, <i>, <del>', () => {
        const doc = paste(
            '<p><span style="font-style:italic">i</span><span style="text-decoration:line-through">s</span><b>b</b><i>j</i><del>d</del></p>',
        );
        expect(doc.content[0].content?.map((n) => [n.text, n.marks?.map((m) => m.type)])).toEqual([
            ['i', ['italic']],
            ['s', ['strike']],
            ['b', ['bold']],
            ['j', ['italic']],
            ['d', ['strike']],
        ]);
    });

    it('divs become paragraphs, line breaks become hard breaks', () => {
        const doc = paste('<div>a</div><div>b<br>c</div>');
        expect(toPlainText(doc)).toBe('a\nb\nc');
        expect(doc.content).toHaveLength(2);
    });

    it('forbidden structure collapses to text: headings and lists in chat', () => {
        const doc = paste('<h1>Title</h1><ul><li>one</li><li>two</li></ul>', 'chat');
        expect(doc.content.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
        expect(toPlainText(doc)).toBe('Title\none\ntwo');
    });

    it('allowed structure survives: headings and lists in article', () => {
        const doc = paste('<h2>Part</h2><ol start="3"><li>x</li></ol><blockquote><p>q</p></blockquote><pre><code class="language-ts">a\nb</code></pre>', 'article');
        expect(doc.content).toEqual([
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Part' }] },
            { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }] },
            { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'q' }] }] },
            { type: 'codeBlock', attrs: { lang: 'ts' }, content: [{ type: 'text', text: 'a\nb' }] },
        ]);
    });

    it('text that looks like Markdown stays text: pasting never turns it into formatting', () => {
        const doc = paste('<p>**not bold** and `not code`, _x_ ~~y~~ ||z||</p><p>- not a list</p><p># not a heading</p>', 'article');
        expect(doc.content.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
        expect(JSON.stringify(doc)).not.toContain('marks');
        expect(toPlainText(doc)).toBe('**not bold** and `not code`, _x_ ~~y~~ ||z||\n- not a list\n# not a heading');
    });

    it('a hostile code language is dropped', () => {
        const doc = paste('<pre data-lang="a b&quot;><script>">x</pre>', 'chat');
        expect(doc.content).toEqual([{ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }]);
    });
});

describe('document ⇄ engine round trip', () => {
    for (const fx of FIXTURES) {
        it(`${fx.id}: our doc to the engine and back is the same document`, () => {
            const profile = PROFILES[fx.profile];
            const schema = createSchema(profile);
            const { doc, issues } = nodeToDoc(docToNode(schema, fx.doc, profile), profile);
            expect(issues).toEqual([]);
            expect(doc).toEqual(fx.doc);
        });
    }
});
