/**
 * Canonical documents shared by the core tests, the engine tests and the lab page.
 * Each one is already normalized: the normalizer must return it unchanged.
 * Канонические документы для тестов ядра, тестов движка и лаборатории: нормализатор не должен их менять.
 */
import type { Doc, DocMark, DocNode } from '../src/core';

export interface Fixture {
    id: string;
    title: string;
    profile: 'chat' | 'comment' | 'article';
    doc: Doc;
    /** Expected plain text. / Ожидаемый простой текст. */
    text: string;
}

const t = (text: string, ...marks: DocMark[]): DocNode => (marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text });
const p = (...content: DocNode[]): DocNode => (content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' });
const doc = (...content: DocNode[]): Doc => ({ v: 1, content });
const bold: DocMark = { type: 'bold' };
const italic: DocMark = { type: 'italic' };
const strike: DocMark = { type: 'strike' };
const code: DocMark = { type: 'code' };
const spoiler: DocMark = { type: 'spoiler' };
const link = (href: string): DocMark => ({ type: 'link', attrs: { href } });

export const FIXTURES: readonly Fixture[] = [
    { id: 'empty', title: 'Empty', profile: 'chat', doc: doc(p()), text: '' },
    { id: 'plain', title: 'Plain text', profile: 'chat', doc: doc(p(t('Hello, world'))), text: 'Hello, world' },
    {
        id: 'marks',
        title: 'Marks and nesting',
        profile: 'chat',
        doc: doc(p(t('a '), t('bold', bold), t(' '), t('both', bold, italic), t(' '), t('it', italic), t(' '), t('gone', strike), t(' '), t('secret', spoiler))),
        text: 'a bold both it gone secret',
    },
    {
        id: 'code-link',
        title: 'Code and link',
        profile: 'chat',
        doc: doc(p(t('run '), t('npm i', code), t(' or '), t('open', link('https://666.io/')), t(' and '), t('x', link('https://666.io/'), bold))),
        text: 'run npm i or open and x',
    },
    {
        id: 'mention',
        title: 'Mentions',
        profile: 'chat',
        doc: doc(p(t('hi '), { type: 'mention', attrs: { id: 'u1', label: 'Ann' } }, t(', and '), { type: 'mention', attrs: { id: 'u2', label: 'Bob Lee' }, marks: [bold] }, t('!'))),
        text: 'hi @Ann, and @Bob Lee!',
    },
    {
        id: 'break',
        title: 'Hard break',
        profile: 'chat',
        doc: doc(p(t('one'), { type: 'hardBreak' }, t('two'))),
        text: 'one\ntwo',
    },
    {
        id: 'quote-code',
        title: 'Quote and code block',
        profile: 'chat',
        doc: doc(
            { type: 'blockquote', content: [p(t('quoted'))] },
            { type: 'codeBlock', attrs: { lang: 'ts' }, content: [t('const a = 1;\nconst b = 2;')] },
            p(t('after')),
        ),
        text: 'quoted\nconst a = 1;\nconst b = 2;\nafter',
    },
    {
        id: 'unicode',
        title: 'Emoji, flags, combining marks',
        profile: 'chat',
        doc: doc(p(t('👩‍👩‍👧 🇷🇺 é é 日本語', bold))),
        text: '👩‍👩‍👧 🇷🇺 é é 日本語',
    },
    {
        id: 'lists',
        title: 'Nested lists',
        profile: 'comment',
        doc: doc(
            {
                type: 'bulletList',
                content: [
                    { type: 'listItem', content: [p(t('one'))] },
                    {
                        type: 'listItem',
                        content: [p(t('two')), { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('three'))] }] }],
                    },
                ],
            },
        ),
        text: 'one\ntwo\nthree',
    },
    {
        id: 'table',
        title: 'A table with a header row',
        profile: 'comment',
        doc: doc(
            {
                type: 'table',
                content: [
                    { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Name'))] }, { type: 'tableHeader', content: [p(t('Score'))] }] },
                    { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('Ann', bold))] }, { type: 'tableCell', content: [p(t('10'))] }] },
                ],
            },
            p(t('after')),
        ),
        text: ['Name', 'Score', 'Ann', '10', 'after'].join(String.fromCharCode(10)),
    },
    {
        id: 'article',
        title: 'Headings',
        profile: 'article',
        doc: doc(
            { type: 'heading', content: [t('Title')] },
            p(t('Intro with '), t('emphasis', italic)),
            { type: 'heading', attrs: { level: 2 }, content: [t('Part')] },
            p(t('Body')),
        ),
        text: 'Title\nIntro with emphasis\nPart\nBody',
    },
];
