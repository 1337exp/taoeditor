import type { Doc, DocMark, DocNode } from '@1337exp/taoeditor/core';

const t = (text: string, ...marks: DocMark[]): DocNode => (marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text });
const p = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const bold: DocMark = { type: 'bold' };
const italic: DocMark = { type: 'italic' };
const code: DocMark = { type: 'code' };
const color = (value: string): DocMark => ({ type: 'color', attrs: { value } });
const background = (value: string): DocMark => ({ type: 'background', attrs: { value } });
const size = (value: string): DocMark => ({ type: 'size', attrs: { value } });
const mention = (id: string, label: string): DocNode => ({ type: 'mention', attrs: { id, label } });
const doc = (...content: DocNode[]): Doc => ({ v: 1, content });

/** Two comments to start the list with. */
export const SEED_COMMENTS: { id: number; author: string; doc: Doc }[] = [
    { id: 1, author: 'Ann Lee', doc: doc(p(t('Looks great! The '), t('spoiler', { type: 'spoiler' }), t(' mark is hidden until you click it, and '), mention('u3', 'Bob Stone'), t(' can read it all the same.'))) },
    { id: 2, author: 'Andy Park', doc: doc(p(t('Try '), t('bold', bold), t(', '), t('colour', color('#e06666')), t(' and '), t('a highlight', background('#fff2cc'), color('#7f6000')), t(' with the toolbar.'))) },
];

/** A page of an article: headings, a list, a quote, code, an indent, alignment, sizes, colours. */
export const SAMPLE_ARTICLE: Doc = doc(
    { type: 'heading', attrs: { level: 1 }, content: [t('A short article')] },
    { type: 'paragraph', attrs: { align: 'justify' }, content: [t('This is a '), t('real document', bold), t(': a tree that is stored as JSON, shown by a viewer that needs no editing engine, and safe by construction. Text can be '), t('coloured', color('#cc4125')), t(', '), t('highlighted', background('#fff2cc')), t(', '), t('big', size('large')), t(' or '), t('small', size('small')), t('.')] },
    { type: 'heading', attrs: { level: 2 }, content: [t('Lists and quotes')] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('A bulleted list'))] }, { type: 'listItem', content: [p(t('with a nested one')), { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('Tab nests an item'))] }, { type: 'listItem', content: [p(t('Shift+Tab brings it back'))] }] }] }] },
    { type: 'blockquote', content: [p(t('A quote keeps '), t('its marks', italic), t('.'))] },
    { type: 'heading', attrs: { level: 2 }, content: [t('Tables')] },
    {
        type: 'table',
        content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Part'))] }, { type: 'tableHeader', content: [p(t('Keys'))] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('Next cell'))] }, { type: 'tableCell', content: [p(t('Tab'))] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('Previous cell'))] }, { type: 'tableCell', content: [p(t('Shift+Tab'))] }] },
        ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [t('Alignment and indents')] },
    { type: 'paragraph', attrs: { align: 'center' }, content: [t('Centered')] },
    { type: 'paragraph', attrs: { align: 'right' }, content: [t('Right')] },
    { type: 'paragraph', attrs: { indent: 2 }, content: [t('Indented two levels, like the toolbar buttons do it.')] },
    { type: 'codeBlock', attrs: { lang: 'ts' }, content: [t('const doc = editor.getDoc(); // our own tree, not HTML')] },
    p(t('Inline '), t('code', code), t(' and a mention of '), mention('u1', 'Ann Lee'), t('.')),
);

/** What a pasted page looks like, to try what the profile keeps. */
export const PASTE_SAMPLES = {
    docs: '<meta charset="utf-8"><b style="font-weight:normal"><p><span style="font-weight:700">Bold</span> <span style="color:#cc0000">red</span> <span style="background-color:#ffff00">yellow</span> <span style="color:#000000;background-color:#ffffff">black on white is paper, not a choice</span> <i>italic</i></p></b>',
    page: '<h2>A page</h2><p style="text-align:center;margin-left:80px">Centered and indented <u>underlined</u> <small>small</small> <big>big</big></p><ul><li>one</li><li>two</li></ul><blockquote>quoted</blockquote>',
    table: '<table><thead><tr><th>Name</th><th>Score</th><th>Note</th></tr></thead><tbody><tr><td><b>Ann</b></td><td>10</td><td style="color:#cc0000">best</td></tr><tr><td colspan="2">merged cells come in as single ones</td></tr></tbody></table>',
    markdown: '<p>**not bold**, _not italic_, `not code`, ~~not struck~~</p><p>- not a list</p><p># not a heading</p>',
    hostile: '<p onclick="alert(1)">a<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe> <a href="javascript:alert(1)">js link</a> <a href="https://666.io">good link</a> <span style="color:red;background:url(javascript:alert(1))">x</span></p>',
};
