// @vitest-environment jsdom
import { DOMParser as PMParser, type ResolvedPos } from 'prosemirror-model';
import { GapCursor } from 'prosemirror-gapcursor';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { PROFILES, toPlainText, withoutFeatures, type Profile } from '../../src/core';
import { createSchema, nodeToDoc, type EditorHandle } from '../../src/editor';
import { mount, press, type } from './helpers';

const NL = String.fromCharCode(10);
/** `GapCursor.valid` is in the module but not in its type declarations. */
const validGap = (pos: ResolvedPos): boolean => (GapCursor as unknown as { valid(p: ResolvedPos): boolean }).valid(pos);

/** The cells of the first table as rows of text. */
const grid = (ed: EditorHandle): string[][] => {
    const table = ed.getDoc().content.find((n) => n.type === 'table');
    return (table?.content ?? []).map((r) => (r.content ?? []).map((c) => toPlainText({ v: 1, content: c.content ?? [] })));
};

const pasteInto = (profile: Profile, html: string) => {
    const dom = new window.DOMParser().parseFromString(html, 'text/html').body;
    const { doc, issues } = nodeToDoc(PMParser.fromSchema(createSchema(profile)).parse(dom), profile);
    expect(issues).toEqual([]);
    return doc;
};

/** The caret in the first text block inside the n-th cell (in document order). */
const intoCell = (ed: EditorHandle, n: number): void => {
    let seen = -1;
    let at = -1;
    ed.view.state.doc.descendants((node, pos) => {
        if (at >= 0) return false;
        if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
            if (++seen === n) at = pos + 2;
        }
        return true;
    });
    ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, at)));
};

describe('inserting a table', () => {
    it('replaces an empty paragraph and puts the caret in the first cell', () => {
        const ed = mount({ profile: 'comment' });
        expect(ed.insertTable(2, 3)).toBe(true);
        expect(grid(ed)).toEqual([['', '', ''], ['', '', '']]);
        expect(ed.getDoc().content.map((n) => n.type)).toEqual(['table']);
        expect(ed.inTable()).toBe(true);
        type(ed, 'x');
        expect(grid(ed)[0][0]).toBe('x');
        expect(ed.issues()).toEqual([]);
    });

    it('goes after the block the caret is in, even from inside a list or a quote', () => {
        const ed = mount({ profile: 'comment' });
        type(ed, 'text');
        ed.toggleQuote();
        ed.insertTable(1, 1);
        expect(ed.getDoc().content.map((n) => n.type)).toEqual(['blockquote', 'table']); // the guard paragraph after it is not stored
    });

    it('is cut to the limits, and refuses a nonsense size and a place inside a table', () => {
        const ed = mount({ profile: 'comment' });
        expect(ed.insertTable(1000, 1000)).toBe(true);
        expect(grid(ed)).toHaveLength(50);
        expect(grid(ed)[0]).toHaveLength(20);
        expect(ed.insertTable(2, 2)).toBe(false); // already in a table
        const other = mount({ profile: 'comment' });
        expect(other.insertTable(Number.NaN, 2)).toBe(false);
        expect(other.insertTable(0, 0)).toBe(true);
        expect(grid(other)).toEqual([['']]);
    });

    it('does nothing in a profile without tables', () => {
        const ed = mount({ profile: 'chat' });
        expect(ed.schema.nodes.table).toBeUndefined();
        expect(ed.insertTable(2, 2)).toBe(false);
        const noTables = mount({ profile: withoutFeatures('comment', { nodes: ['table'] }) });
        expect(noTables.insertTable(2, 2)).toBe(false);
    });
});

describe('editing a table', () => {
    const make = (): EditorHandle => {
        const ed = mount({ profile: 'comment' });
        ed.insertTable(2, 2);
        return ed;
    };

    it('adds and deletes rows and columns around the caret', () => {
        const ed = make();
        intoCell(ed, 0);
        expect(ed.tableCommand('addRowAfter')).toBe(true);
        expect(ed.tableCommand('addColumnBefore')).toBe(true);
        expect(grid(ed)).toEqual([['', '', ''], ['', '', ''], ['', '', '']]);
        expect(ed.tableCommand('deleteRow')).toBe(true);
        expect(ed.tableCommand('deleteColumn')).toBe(true);
        expect(grid(ed)).toEqual([['', ''], ['', '']]);
        expect(ed.issues()).toEqual([]);
    });

    it('makes the first row a header and back', () => {
        const ed = make();
        intoCell(ed, 0);
        ed.tableCommand('toggleHeaderRow');
        expect(ed.getDoc().content[0].content![0].content!.map((c) => c.type)).toEqual(['tableHeader', 'tableHeader']);
        expect(ed.getDoc().content[0].content![1].content!.map((c) => c.type)).toEqual(['tableCell', 'tableCell']);
        ed.tableCommand('toggleHeaderRow');
        expect(ed.getDoc().content[0].content![0].content!.map((c) => c.type)).toEqual(['tableCell', 'tableCell']);
    });

    it('deletes the table and leaves a paragraph', () => {
        const ed = make();
        intoCell(ed, 1);
        expect(ed.tableCommand('deleteTable')).toBe(true);
        expect(ed.getDoc().content.map((n) => n.type)).toEqual(['paragraph']);
        expect(ed.inTable()).toBe(false);
    });

    it('the commands do nothing outside a table, and an unknown name does nothing at all', () => {
        const ed = mount({ profile: 'comment' });
        expect(ed.tableCommand('addRowAfter')).toBe(false);
        expect(ed.canTableCommand('deleteTable')).toBe(false);
        expect(ed.tableCommand('constructor' as never)).toBe(false);
        expect(ed.tableCommand('__proto__' as never)).toBe(false);
    });
});

describe('the caret before and after a table (the gap cursor)', () => {
    const TABLE = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }] };

    it('can stand before a first table and after a last one, and a click or arrows get there', () => {
        const ed = mount({ profile: 'comment' });
        ed.setDoc({ v: 1, content: [TABLE] });
        const doc = ed.view.state.doc;
        expect(validGap(doc.resolve(0))).toBe(true);
        expect(validGap(doc.resolve(doc.content.size))).toBe(true);
        ed.view.dispatch(ed.view.state.tr.setSelection(new GapCursor(doc.resolve(0))));
        expect(ed.view.state.selection instanceof GapCursor).toBe(true);
        expect(ed.inTable()).toBe(false);
    });

    it('Enter at the gap cursor makes a line there (typing is the browser and the engine: checked by hand)', () => {
        const ed = mount({ profile: 'comment' });
        ed.setDoc({ v: 1, content: [TABLE] });
        ed.view.dispatch(ed.view.state.tr.setSelection(new GapCursor(ed.view.state.doc.resolve(0))));
        expect(press(ed, 'Enter')).toBe(true);
        expect(ed.getDoc().content.map((n) => n.type)).toEqual(['paragraph', 'table']);
        type(ed, 'x');
        expect(ed.getDoc().content[0].content![0].text).toBe('x');
        expect(ed.issues()).toEqual([]);
    });
    it('typing at the gap cursor after a table makes a paragraph there (the browser would put the text into the last cell)', () => {
        const ed = mount({ profile: 'comment' });
        ed.setDoc({ v: 1, content: [TABLE] });
        const doc = ed.view.state.doc;
        ed.view.dispatch(ed.view.state.tr.setSelection(new GapCursor(doc.resolve(doc.content.size))));
        const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'end', cancelable: true, bubbles: true });
        expect(ed.view.dom.dispatchEvent(event)).toBe(false); // taken over: the browser does not insert it itself
        expect(ed.getDoc().content.map((n) => n.type)).toEqual(['table', 'paragraph']);
        expect(ed.getDoc().content[1].content![0].text).toBe('end');
        type(ed, '!');
        expect(ed.getDoc().content[1].content![0].text).toBe('end!'); // the caret is after the text
        expect(ed.issues()).toEqual([]);
    });

    it('works for a code block at the start or the end as well', () => {
        const ed = mount({ profile: 'comment' });
        ed.setDoc({ v: 1, content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'a' }] }] });
        const doc = ed.view.state.doc;
        expect(validGap(doc.resolve(0))).toBe(true);
        expect(validGap(doc.resolve(doc.content.size))).toBe(true);
    });
});

describe('keys in a table', () => {
    it('Tab goes to the next cell, Shift-Tab to the previous one; in the last cell Tab is left to the browser', () => {
        const ed = mount({ profile: 'comment' });
        ed.insertTable(1, 2);
        type(ed, 'a');
        expect(press(ed, 'Tab')).toBe(true);
        type(ed, 'b');
        expect(grid(ed)).toEqual([['a', 'b']]);
        expect(press(ed, 'Tab')).toBe(false);
        expect(press(ed, 'Tab', { shiftKey: true })).toBe(true);
        type(ed, 'c');
        expect(grid(ed)).toEqual([['c', 'b']]); // Tab selects the cell's text, like a spreadsheet: typing replaces it
        expect(press(ed, 'Tab', { shiftKey: true })).toBe(false); // the first cell
    });

    it('in a list inside a cell Tab still sinks the item first', () => {
        const ed = mount({ profile: 'comment' });
        ed.insertTable(1, 2);
        ed.toggleList('bulletList');
        type(ed, 'one');
        press(ed, 'Enter');
        type(ed, 'two');
        expect(press(ed, 'Tab')).toBe(true);
        expect(grid(ed)[0][1]).toBe('');
        expect(ed.issues()).toEqual([]);
    });
});

describe('what is typed into a table', () => {
    it('marks, mentions-free text and line breaks work in a cell; Enter in a cell makes a paragraph inside it', () => {
        const ed = mount({ profile: 'comment' });
        ed.insertTable(1, 1);
        type(ed, 'ab');
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, 5, 7)));
        ed.toggleMark('bold');
        press(ed, 'Enter');
        expect(ed.issues()).toEqual([]);
        expect(ed.getDoc().content[0].content![0].content![0].content).toHaveLength(2);
    });

    it('a headings command does not break a cell (headings are not allowed in one)', () => {
        const ed = mount({ profile: 'article' });
        ed.insertTable(1, 1);
        type(ed, 'x');
        ed.setBlockStyle(1);
        expect(ed.issues()).toEqual([]);
        expect(grid(ed)).toEqual([['x']]);
    });

    it('the quote command does not break a cell either', () => {
        const ed = mount({ profile: 'comment' });
        ed.insertTable(1, 1);
        type(ed, 'x');
        ed.toggleQuote();
        expect(ed.issues()).toEqual([]);
        expect(grid(ed)).toEqual([['x']]);
    });
});

describe('pasting a table', () => {
    it('reads a table from HTML (Google Docs, a page): cells, header cells, text and marks', () => {
        const doc = pasteInto(
            PROFILES.comment,
            '<table><thead><tr><th>Name</th><th>Score</th></tr></thead><tbody><tr><td><strong>Ann</strong></td><td>10</td></tr></tbody></table>',
        );
        const table = doc.content[0];
        expect(table.type).toBe('table');
        expect(table.content![0].content!.map((c) => c.type)).toEqual(['tableHeader', 'tableHeader']);
        expect(toPlainText(doc)).toBe(['Name', 'Score', 'Ann', '10'].join(NL));
    });

    it('merged cells come in as single cells and a ragged table is made a rectangle', () => {
        const doc = pasteInto(PROFILES.comment, '<table><tr><td colspan="2">wide</td></tr><tr><td>a</td><td>b</td></tr></table>');
        const rows = doc.content[0].content!;
        expect(rows.map((r) => r.content!.length)).toEqual([2, 2]);
        expect(JSON.stringify(doc)).not.toMatch(/colspan|rowspan/);
    });

    it('scripts and handlers inside a cell do not come in', () => {
        const doc = pasteInto(PROFILES.comment, '<table><tr><td onclick="x()">a<script>alert(1)</script><img src=x onerror=alert(1)></td></tr></table>');
        const json = JSON.stringify(doc);
        for (const bad of ['alert', 'onclick', 'onerror', 'script', 'img']) expect(json).not.toContain(bad);
    });

    it('in a profile without tables the cells come in as text', () => {
        const ed = mount({ profile: 'chat' });
        const html = '<table><tr><td>a</td><td>b</td></tr></table>';
        const prepared = ed.view.someProp('transformPastedHTML', (f) => f(html, ed.view)) as string;
        const doc = pasteInto(PROFILES.chat, prepared);
        expect(JSON.stringify(doc)).not.toContain('table');
        expect(toPlainText(doc).trim()).toBe('a b');
    });
});
