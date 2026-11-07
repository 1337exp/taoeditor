// @vitest-environment jsdom
import { DOMParser as PMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { PROFILES } from '../../src/core';
import { createSchema, nodeToDoc, type EditorHandle } from '../../src/editor';
import { mount, type } from './helpers';

const select = (ed: EditorHandle, from: number, to: number): void => {
    ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, from, to)));
};
const marks = (ed: EditorHandle) => ed.getDoc().content[0].content?.map((n) => [n.text, (n.marks ?? []).map((m) => `${m.type}:${m.attrs?.value}`).join(' ')]);

describe('setColor and colorOf', () => {
    it('colours the selection, replaces a colour, takes it off, and keeps the text', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'abcd');
        select(ed, 2, 4);
        expect(ed.setColor('color', '#ff0000')).toBe(true);
        expect(marks(ed)).toEqual([['a', ''], ['bc', 'color:#ff0000'], ['d', '']]);
        expect(ed.colorOf('color')).toBe('#ff0000');
        ed.setColor('color', '#00f');
        expect(marks(ed)).toEqual([['a', ''], ['bc', 'color:#0000ff'], ['d', '']]);
        ed.setColor('color', null);
        expect(marks(ed)).toEqual([['abcd', '']]);
        expect(ed.colorOf('color')).toBeNull();
        expect(ed.issues()).toEqual([]);
    });

    it('text colour and background are independent', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'ab');
        select(ed, 1, 3);
        ed.setColor('color', '#ff0000');
        ed.setColor('background', '#ffff00');
        expect(marks(ed)).toEqual([['ab', 'color:#ff0000 background:#ffff00']]);
        ed.setColor('background', null);
        expect(marks(ed)).toEqual([['ab', 'color:#ff0000']]);
    });

    it('refuses a colour that is not one', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'ab');
        select(ed, 1, 3);
        expect(ed.setColor('color', 'red')).toBe(false);
        expect(ed.setColor('color', '#f00;x:y')).toBe(false);
        expect(marks(ed)).toEqual([['ab', '']]);
    });

    it('with a caret it colours what is typed next, and only that', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'a');
        ed.setColor('color', '#ff0000');
        expect(ed.colorOf('color')).toBe('#ff0000');
        type(ed, 'b');
        ed.setColor('color', null);
        type(ed, 'c');
        expect(marks(ed)).toEqual([['a', ''], ['b', 'color:#ff0000'], ['c', '']]);
    });

    it('colorOf reads the first coloured run of a selection', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'abc');
        select(ed, 2, 3);
        ed.setColor('background', '#00ff00');
        select(ed, 1, 4);
        expect(ed.colorOf('background')).toBe('#00ff00');
        expect(ed.colorOf('color')).toBeNull();
    });

    it('code stays free of colours', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'x');
        select(ed, 1, 2);
        ed.setColor('color', '#ff0000');
        ed.toggleMark('code');
        expect(marks(ed)).toEqual([['x', 'code:undefined']]);
    });
});

describe('pasted colours', () => {
    const parse = (html: string) => {
        const schema = createSchema(PROFILES.article);
        const dom = new window.DOMParser().parseFromString(html, 'text/html').body;
        const { doc, issues } = nodeToDoc(PMParser.fromSchema(schema).parse(dom), PROFILES.article);
        expect(issues).toEqual([]);
        return doc.content[0].content?.map((n) => [n.text, (n.marks ?? []).map((m) => `${m.type}:${m.attrs?.value}`).join(' ')]);
    };

    it('real colours come in as #rrggbb, in either form', () => {
        expect(parse('<p><span style="color:rgb(255, 0, 0)">a</span><span style="background-color:#ff0">b</span></p>')).toEqual([
            ['a', 'color:#ff0000'],
            ['b', 'background:#ffff00'],
        ]);
    });

    it('the page ink does not: black text and white paper from Docs and Word are not a choice', () => {
        expect(parse('<p><span style="color:#000000;background-color:#ffffff">a</span><span style="color:rgb(0,0,0)">b</span></p>')).toEqual([['ab', '']]);
    });

    it('names, see-through and hostile values are dropped, the text stays', () => {
        expect(
            parse('<p><span style="color:red">a</span><span style="color:rgba(1,2,3,0.4)">b</span><span style="background-color:url(javascript:alert(1))">c</span></p>'),
        ).toEqual([['abc', '']]);
    });
});
