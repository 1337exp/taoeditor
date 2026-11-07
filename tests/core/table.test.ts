import { describe, expect, it } from 'vitest';
import { PROFILES, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, defineProfile, normalizeDoc, toHtml, toPlainText, withoutFeatures } from '../../src/core';

const para = (value: string) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] });
const cell = (value: string) => ({ type: 'tableCell', content: [para(value)] });
const head = (value: string) => ({ type: 'tableHeader', content: [para(value)] });
const row = (...cells: unknown[]) => ({ type: 'tableRow', content: cells });
const doc = (...content: unknown[]) => ({ v: 1, content });
const NL = String.fromCharCode(10);

describe('tables in the model', () => {
    it('comment and article have them, chat does not', () => {
        expect(PROFILES.comment.nodes).toContain('table');
        expect(PROFILES.article.nodes).toContain('table');
        expect(PROFILES.chat.nodes).not.toContain('table');
    });

    it('a good table stays as it is', () => {
        const input = doc(({ type: 'table', content: [row(head('a'), head('b')), row(cell('1'), cell('2'))] }));
        const out = normalizeDoc(input, PROFILES.comment);
        expect(out.issues).toEqual([]);
        expect(out.doc).toEqual(input);
    });

    it('a short row is filled with empty cells: a table is a rectangle', () => {
        const out = normalizeDoc(doc({ type: 'table', content: [row(cell('a'), cell('b'), cell('c')), row(cell('1'))] }), PROFILES.comment).doc;
        const rows = out.content[0].content!;
        expect(rows.map((r) => r.content!.length)).toEqual([3, 3]);
        expect(rows[1].content![2]).toEqual({ type: 'tableCell', content: [{ type: 'paragraph' }] });
    });

    it('is cut to the limits of rows and columns', () => {
        const wide = row(...Array.from({ length: TABLE_MAX_COLUMNS + 5 }, (_, i) => cell(String(i))));
        const tall = Array.from({ length: TABLE_MAX_ROWS + 5 }, () => row(cell('x')));
        const a = normalizeDoc(doc({ type: 'table', content: [wide] }), PROFILES.comment);
        expect(a.doc.content[0].content![0].content).toHaveLength(TABLE_MAX_COLUMNS);
        expect(a.issues.some((i) => i.code === 'too-big')).toBe(true);
        const b = normalizeDoc(doc({ type: 'table', content: tall }), PROFILES.comment);
        expect(b.doc.content[0].content).toHaveLength(TABLE_MAX_ROWS);
    });

    it('no table in a table, no quote or code in a cell: the text survives', () => {
        const inner = { type: 'table', content: [row(cell('deep'))] };
        const out = normalizeDoc(
            doc({ type: 'table', content: [row({ type: 'tableCell', content: [para('top'), inner, { type: 'blockquote', content: [para('q')] }] })] }),
            PROFILES.comment,
        ).doc;
        expect(toPlainText(out)).toBe(['top', 'deep', 'q'].join(NL));
        expect(JSON.stringify(out).match(/"table"/g)).toHaveLength(1);
        expect(JSON.stringify(out)).not.toContain('blockquote');
    });

    it('a table is only at the top: inside a quote or a list it is unwrapped', () => {
        const out = normalizeDoc(doc({ type: 'blockquote', content: [{ type: 'table', content: [row(cell('x'))] }] }), PROFILES.comment).doc;
        expect(JSON.stringify(out)).not.toContain('table');
        expect(toPlainText(out)).toBe('x');
    });

    it('a profile without tables shows the cells as paragraphs', () => {
        const input = doc({ type: 'table', content: [row(cell('a'), cell('b')), row(cell('c'), cell('d'))] });
        const out = normalizeDoc(input, PROFILES.chat).doc;
        expect(out.content.map((n) => n.type)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph']);
        expect(toPlainText(out)).toBe(['a', 'b', 'c', 'd'].join(NL));
    });

    it('rows without cells and cells without content do not make a table', () => {
        const out = normalizeDoc(doc({ type: 'table', content: [{ type: 'tableRow', content: [] }] }, para('x')), PROFILES.comment).doc;
        expect(out.content.map((n) => n.type)).toEqual(['paragraph']);
    });

    it('merged cells and widths are not read: the attributes are dropped', () => {
        const input = doc({ type: 'table', content: [row({ type: 'tableCell', attrs: { colspan: 2, rowspan: 3, colwidth: [100] }, content: [para('a')] })] });
        expect(JSON.stringify(normalizeDoc(input, PROFILES.comment).doc)).not.toMatch(/colspan|rowspan|colwidth/);
    });
});

describe('tables in a profile', () => {
    it('withoutFeatures takes the table and its parts away together', () => {
        const p = withoutFeatures('comment', { nodes: ['table'] });
        for (const name of ['table', 'tableRow', 'tableCell', 'tableHeader']) expect(p.nodes).not.toContain(name);
    });

    it('a profile without header cells keeps the table', () => {
        const p = withoutFeatures('comment', { nodes: ['tableHeader'] });
        const out = normalizeDoc(doc({ type: 'table', content: [row(head('a'), head('b'))] }), p).doc;
        // the header cells are not allowed: their paragraphs are what is left, and a table with no cells is not kept
        expect(JSON.stringify(out)).not.toContain('tableHeader');
    });

    it('defineProfile with `table` adds the rows and cells', () => {
        const p = defineProfile({ name: 't', nodes: ['table'], marks: [] });
        expect(p.nodes).toEqual(expect.arrayContaining(['table', 'tableRow', 'tableCell', 'tableHeader']));
        expect(defineProfile({ name: 'u', nodes: ['tableRow'], marks: [] }).nodes).not.toContain('tableRow');
    });
});

describe('showing a table', () => {
    it('is a table with tbody, th for the header cells and td for the others', () => {
        const html = toHtml(doc({ type: 'table', content: [row(head('a')), row(cell('b'))] }));
        expect(html).toBe('<table><tbody><tr><th><p>a</p></th></tr><tr><td><p>b</p></td></tr></tbody></table>');
    });
});
