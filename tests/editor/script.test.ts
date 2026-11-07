// @vitest-environment jsdom
import { DOMParser as PMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { PROFILES, normalizeDoc, toHtml, withoutFeatures } from '../../src/core';
import { createSchema, nodeToDoc } from '../../src/editor';
import { mount, press, runs, type } from './helpers';

const para = (...content: unknown[]) => ({ type: 'paragraph', content });

describe('superscript and subscript', () => {
    it('render as sup and sub', () => {
        const html = toHtml({ v: 1, content: [para({ type: 'text', text: 'x', marks: [{ type: 'superscript' }] }, { type: 'text', text: 'y', marks: [{ type: 'subscript' }] })] });
        expect(html).toBe('<p><sup>x</sup><sub>y</sub></p>');
    });

    it('cannot be both: the normalizer keeps superscript, and code excludes both', () => {
        const both = [{ type: 'subscript' }, { type: 'superscript' }];
        const doc = normalizeDoc({ v: 1, content: [para({ type: 'text', text: 'x', marks: both })] }, PROFILES.comment).doc;
        expect(doc.content[0].content![0].marks).toEqual([{ type: 'superscript' }]);
        const withCode = normalizeDoc({ v: 1, content: [para({ type: 'text', text: 'x', marks: [{ type: 'subscript' }, { type: 'code' }] })] }, PROFILES.comment).doc;
        expect(withCode.content[0].content![0].marks).toEqual([{ type: 'code' }]);
    });

    it('the keys toggle them, and one replaces the other', () => {
        const ed = mount({ profile: 'comment' });
        type(ed, 'abc');
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, 1, 4)));
        press(ed, '.', { ctrlKey: true });
        expect(runs(ed)).toEqual([['abc', 'superscript']]);
        press(ed, ',', { ctrlKey: true });
        expect(runs(ed)).toEqual([['abc', 'subscript']]);
        press(ed, ',', { ctrlKey: true });
        expect(runs(ed)).toEqual([['abc', '']]);
        expect(ed.issues()).toEqual([]);
    });

    it('are read from pasted sup, sub and the vertical-align of Docs', () => {
        const dom = new window.DOMParser().parseFromString('<p>x<sup>2</sup> H<span style="vertical-align:sub">2</span>O <span style="vertical-align:super">s</span></p>', 'text/html').body;
        const { doc, issues } = nodeToDoc(PMParser.fromSchema(createSchema(PROFILES.comment)).parse(dom), PROFILES.comment);
        expect(issues).toEqual([]);
        const marks = (doc.content[0].content ?? []).map((n) => (n.marks ?? []).map((m) => m.type).join('+'));
        expect(marks).toEqual(['', 'superscript', '', 'subscript', '', 'superscript']);
    });

    it('a profile without them has no mark, no key and pastes them as text', () => {
        const p = withoutFeatures('comment', { marks: ['superscript', 'subscript'] });
        const ed = mount({ profile: p });
        expect(ed.schema.marks.superscript).toBeUndefined();
        type(ed, 'abc');
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, 1, 4)));
        press(ed, '.', { ctrlKey: true });
        expect(runs(ed)).toEqual([['abc', '']]);
    });
});
