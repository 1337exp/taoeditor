import { describe, expect, it } from 'vitest';
import { MAX_DEPTH, PROFILES, emptyDoc, isEmptyDoc, normalizeDoc, toPlainText, type Doc, type Profile } from '../../src/core';
import { FIXTURES } from '../fixtures';

const chat = PROFILES.chat;
const norm = (input: unknown, profile: Profile = chat) => normalizeDoc(input, profile);
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const wrap = (...content: unknown[]) => ({ v: 1, content });

describe('canonical fixtures', () => {
    for (const fx of FIXTURES) {
        it(`${fx.id}: stays unchanged, no issues, JSON round trip, plain text`, () => {
            const profile = PROFILES[fx.profile];
            const { doc, issues } = norm(fx.doc, profile);
            expect(issues).toEqual([]);
            expect(doc).toEqual(fx.doc);
            expect(JSON.parse(JSON.stringify(fx.doc))).toEqual(fx.doc);
            expect(toPlainText(fx.doc)).toBe(fx.text);
        });
    }
});

describe('shape of the input', () => {
    it.each([null, undefined, 42, 'str', [], true])('%s becomes an empty document with an issue', (input) => {
        const { doc, issues } = norm(input);
        expect(doc).toEqual(emptyDoc());
        expect(issues.map((i) => i.code)).toEqual(['bad-doc']);
    });

    it('refuses a version it does not know', () => {
        const { doc, issues } = norm({ v: 2, content: [para(text('x'))] });
        expect(doc).toEqual(emptyDoc());
        expect(issues.map((i) => i.code)).toEqual(['bad-version']);
    });

    it('an empty content gives one empty paragraph', () => {
        expect(norm({ v: 1, content: [] }).doc).toEqual(emptyDoc());
    });
});

describe('hostile and foreign nodes', () => {
    it('unknown node (script, image, html) is unwrapped, its text survives, nothing else does', () => {
        const input = wrap(
            { type: 'script', content: [text('alert(1)')] },
            { type: 'html', html: '<img src=x onerror=alert(1)>' },
            { type: 'image', attrs: { src: 'https://x/y.png' } },
        );
        const { doc, issues } = norm(input);
        expect(JSON.stringify(doc)).not.toContain('onerror');
        expect(JSON.stringify(doc)).not.toContain('image');
        expect(toPlainText(doc)).toBe('alert(1)');
        expect(issues.map((i) => i.code)).toEqual(['unknown-node', 'unknown-node', 'unknown-node']);
    });

    it('prototype names are not nodes or marks', () => {
        const input = wrap(para({ type: 'constructor' }, text('a', [{ type: '__proto__' }, { type: 'toString' }])));
        const { doc, issues } = norm(input);
        expect(doc).toEqual(wrap(para(text('a'))));
        // "unknown", not "forbidden by the profile": the name must not resolve through Object.prototype
        expect(issues.find((i) => i.path === '/content/0/content/0')?.code).toBe('unknown-node');
    });

    it('a node that the profile forbids is unwrapped (heading in chat becomes a paragraph)', () => {
        const input = wrap({ type: 'heading', content: [text('Title')] }, para(text('x')));
        const { doc, issues } = norm(input);
        expect(doc).toEqual(wrap(para(text('Title')), para(text('x'))));
        expect(issues[0]).toEqual({ code: 'disallowed-node', path: '/content/0' });
    });

    it('the same heading stays in the article profile', () => {
        const input = wrap({ type: 'heading', attrs: { level: 2 }, content: [text('T')] });
        expect(norm(input, PROFILES.article).doc).toEqual(input);
    });

    it('lists are forbidden in chat but keep their text', () => {
        const input = wrap({ type: 'bulletList', content: [{ type: 'listItem', content: [para(text('a'))] }] });
        expect(norm(input).doc).toEqual(wrap(para(text('a'))));
    });

    it('bare text and breaks at the top level are wrapped in a paragraph', () => {
        const { doc } = norm(wrap(text('loose'), { type: 'hardBreak' }, text('more')));
        expect(doc).toEqual(wrap(para(text('loose'), { type: 'hardBreak' }, text('more'))));
    });

    it('a depth bomb is cut and reported, not recursed into', () => {
        let node: unknown = para(text('deep'));
        for (let i = 0; i < 200; i++) node = { type: 'blockquote', content: [node] };
        const { doc, issues } = norm(wrap(node));
        expect(issues.some((i) => i.code === 'too-deep')).toBe(true);
        let depth = 0;
        let cur = doc.content[0];
        while (cur?.content?.[0]) {
            depth++;
            cur = cur.content[0];
        }
        expect(depth).toBeLessThanOrEqual(MAX_DEPTH);
    });
});

describe('marks', () => {
    it('keeps only allowed links; javascript:, data: and credentials lose the mark but keep the text', () => {
        const bad = ['javascript:alert(1)', 'data:text/html,<script>', '//evil.com', 'https://a.com@evil.com', 'https://x y.com', ''];
        for (const href of bad) {
            const { doc } = norm(wrap(para(text('click', [{ type: 'link', attrs: { href } }]))));
            expect(doc, href).toEqual(wrap(para(text('click'))));
        }
    });

    it('normalizes the link url', () => {
        const { doc } = norm(wrap(para(text('x', [{ type: 'link', attrs: { href: ' HTTPS://Example.com ' } }]))));
        expect(doc.content[0].content?.[0].marks).toEqual([{ type: 'link', attrs: { href: 'https://example.com/' } }]);
    });

    it('orders marks canonically and removes duplicates', () => {
        const { doc } = norm(wrap(para(text('x', [{ type: 'italic' }, { type: 'bold' }, { type: 'italic' }]))));
        expect(doc.content[0].content?.[0].marks).toEqual([{ type: 'bold' }, { type: 'italic' }]);
    });

    it('code wins over bold, italic, strike, spoiler but keeps the link', () => {
        const href = 'https://a.com/';
        const { doc } = norm(wrap(para(text('x', [{ type: 'bold' }, { type: 'code' }, { type: 'link', attrs: { href } }, { type: 'spoiler' }]))));
        expect(doc.content[0].content?.[0].marks).toEqual([{ type: 'link', attrs: { href } }, { type: 'code' }]);
    });

    it('merges neighbours with equal marks and drops empty text', () => {
        const { doc } = norm(wrap(para(text('a', [{ type: 'bold' }]), text('', [{ type: 'italic' }]), text('b', [{ type: 'bold' }]), text('c'))));
        expect(doc).toEqual(wrap(para(text('ab', [{ type: 'bold' }]), text('c'))));
    });

    it('a profile may allow fewer marks: the others are dropped and reported', () => {
        const boldOnly: Profile = { name: 'bold-only', nodes: PROFILES.chat.nodes, marks: ['bold'] };
        const { doc, issues } = norm(wrap(para(text('x', [{ type: 'italic' }, { type: 'bold' }, { type: 'link', attrs: { href: 'https://a.com' } }]))), boldOnly);
        expect(doc).toEqual(wrap(para(text('x', [{ type: 'bold' }]))));
        expect(issues.map((i) => i.code)).toEqual(['bad-mark', 'bad-mark']);
    });

    it('marks are not allowed in a code block', () => {
        const { doc } = norm(wrap({ type: 'codeBlock', content: [text('x', [{ type: 'bold' }])] }));
        expect(doc).toEqual(wrap({ type: 'codeBlock', content: [text('x')] }));
    });
});

describe('mentions', () => {
    const mention = (attrs: unknown, marks?: unknown) => ({ type: 'mention', attrs, ...(marks ? { marks } : {}) });

    it('a valid mention stays, with its marks in canonical order', () => {
        const input = wrap(para(text('a '), mention({ id: 'u:1', label: 'Ann' }, [{ type: 'italic' }, { type: 'bold' }])));
        const { doc, issues } = norm(input);
        expect(issues).toEqual([]);
        expect(doc).toEqual(wrap(para(text('a '), mention({ id: 'u:1', label: 'Ann' }, [{ type: 'bold' }, { type: 'italic' }]))));
    });

    it.each([
        ['no id', { label: 'Ann' }],
        ['an id with a space', { id: 'u 1', label: 'Ann' }],
        ['an id that is a script', { id: '<script>', label: 'Ann' }],
        ['a long id', { id: 'x'.repeat(65), label: 'Ann' }],
        ['no label', { id: 'u1' }],
        ['an empty label', { id: 'u1', label: '   ' }],
        ['a long label', { id: 'u1', label: 'x'.repeat(81) }],
        ['a number id', { id: 7, label: 'Ann' }],
    ])('%s: the mention is dropped, the text around stays', (_name, attrs) => {
        const { doc, issues } = norm(wrap(para(text('a'), mention(attrs), text('b'))));
        expect(doc).toEqual(wrap(para(text('ab'))));
        expect(issues.map((i) => i.code)).toContain('bad-attr');
    });

    it('the label is cleaned: control characters and runs of white space become one space', () => {
        const LF = String.fromCharCode(10);
        const NUL = String.fromCharCode(0);
        const { doc } = norm(wrap(para(mention({ id: 'u1', label: ` Ann${LF}${NUL}  Lee ` }))));
        expect(doc).toEqual(wrap(para(mention({ id: 'u1', label: 'Ann Lee' }))));
    });

    it('a mention is not allowed in a heading or a code block, and loose ones get a paragraph', () => {
        const m = mention({ id: 'u1', label: 'Ann' });
        expect(norm(wrap({ type: 'heading', content: [text('T'), m] }), PROFILES.article).doc).toEqual(wrap({ type: 'heading', content: [text('T')] }));
        expect(norm(wrap({ type: 'codeBlock', content: [text('x'), m] })).doc).toEqual(wrap({ type: 'codeBlock', content: [text('x')] }));
        expect(norm(wrap(m)).doc).toEqual(wrap(para(m)));
    });

    it('other keys on a mention are dropped', () => {
        const { doc } = norm(wrap(para({ type: 'mention', attrs: { id: 'u1', label: 'Ann', href: 'javascript:x', onclick: '1' }, content: [text('x')] })));
        expect(JSON.stringify(doc)).not.toMatch(/href|onclick|javascript/);
        expect(doc.content[0].content).toEqual([mention({ id: 'u1', label: 'Ann' })]);
    });
});

describe('text and attributes', () => {
    it('strips control characters and bidi-free zero bytes, keeps tab and newline rules', () => {
        const { doc } = norm(wrap(para(text('a\u0000b\u0007c\u009fd\te'))));
        expect(doc).toEqual(wrap(para(text('abcd\te'))));
    });

    it('a newline in a paragraph becomes a hard break, in a code block stays a newline', () => {
        expect(norm(wrap(para(text('a\r\nb')))).doc).toEqual(wrap(para(text('a'), { type: 'hardBreak' }, text('b'))));
        expect(norm(wrap({ type: 'codeBlock', content: [text('a\nb')] })).doc).toEqual(wrap({ type: 'codeBlock', content: [text('a\nb')] }));
    });

    it('invalid attributes fall back to the default and are reported', () => {
        const input = wrap({ type: 'heading', attrs: { level: 9 }, content: [text('x')] });
        const { doc, issues } = norm(input, PROFILES.article);
        expect(doc).toEqual(wrap({ type: 'heading', content: [text('x')] }));
        expect(issues.map((i) => i.code)).toEqual(['bad-attr']);
    });

    it('unknown attributes are dropped silently', () => {
        const { doc } = norm(wrap({ type: 'paragraph', attrs: { onclick: 'x', style: 'y' }, content: [text('a')] }));
        expect(doc).toEqual(wrap(para(text('a'))));
    });

    it('empty containers are dropped', () => {
        const input = wrap({ type: 'blockquote', content: [] }, para(text('a')));
        expect(norm(input).doc).toEqual(wrap(para(text('a'))));
    });
});

describe('plain text', () => {
    it('emptiness ignores whitespace', () => {
        expect(isEmptyDoc(emptyDoc())).toBe(true);
        expect(isEmptyDoc(norm(wrap(para(text('  \n '))) ).doc)).toBe(true);
        expect(isEmptyDoc(norm(wrap(para(text(' a '))) ).doc)).toBe(false);
    });
});

describe('fuzz: the normalizer is total and idempotent', () => {
    // mulberry32: a small seeded PRNG so a failure is reproducible.
    const rng = (seed: number) => () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const TYPES = ['mention', 'paragraph', 'heading', 'blockquote', 'codeBlock', 'bulletList', 'orderedList', 'listItem', 'hardBreak', 'text', 'script', 'constructor', 'doc', 42, null];
    const MARK_TYPES = ['bold', 'italic', 'strike', 'code', 'spoiler', 'link', 'x', '__proto__'];

    function gen(rand: () => number, depth: number): unknown {
        const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
        if (rand() < 0.1) return pick([null, 1, 'x', [], true]);
        const node: Record<string, unknown> = { type: pick(TYPES) };
        if (rand() < 0.6) node.text = pick(['a', 'b c', 'x\ny', '\u0000', '', '日本', 5]);
        if (rand() < 0.4) {
            node.marks = Array.from({ length: Math.floor(rand() * 4) }, () => ({
                type: pick(MARK_TYPES),
                attrs: rand() < 0.5 ? { href: pick(['https://a.com', 'javascript:1', 5, null]) } : undefined,
            }));
        }
        if (rand() < 0.3) node.attrs = { level: pick([1, 2, 9, 'x']), start: pick([1, 5, -1]), lang: pick(['ts', '', 'a b']), id: pick(['u1', 'bad id', 5, null]), label: pick(['Ann', '', 7, ' x ']) };
        if (depth < 16 && rand() < 0.7) node.content = Array.from({ length: Math.floor(rand() * 4) }, () => gen(rand, depth + 1));
        return node;
    }

    for (const profileName of ['chat', 'comment', 'article'] as const) {
        it(`${profileName}: 600 random documents`, () => {
            const rand = rng(1337);
            const profile = PROFILES[profileName];
            for (let i = 0; i < 600; i++) {
                const input = { v: 1, content: Array.from({ length: 1 + Math.floor(rand() * 4) }, () => gen(rand, 0)) };
                const once = normalizeDoc(input, profile);
                const twice = normalizeDoc(once.doc, profile);
                expect(twice.issues, `case ${i}`).toEqual([]);
                expect(twice.doc, `case ${i}`).toEqual(once.doc);
                const json = JSON.stringify(once.doc);
                expect(JSON.parse(json) as Doc).toEqual(once.doc);
            }
        });
    }
});
