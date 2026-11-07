// @vitest-environment jsdom
import { DOMParser as PMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { PROFILES } from '../../src/core';
import { createSchema, nodeToDoc, type EditorHandle } from '../../src/editor';
import { mount, press, type } from './helpers';

const levels = (ed: EditorHandle): (number | undefined)[] => ed.getDoc().content.map((b) => b.attrs?.indent as number | undefined);
const selectAll = (ed: EditorHandle): void => {
    const { doc } = ed.view.state;
    ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(doc, 1, doc.content.size - 1)));
};

describe('indent of ordinary paragraphs', () => {
    it('indent and outdent change the level of the paragraph, 0 to 8', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'a');
        expect(ed.canOutdent()).toBe(false);
        expect(ed.indent()).toBe(true);
        expect(levels(ed)).toEqual([1]);
        for (let i = 0; i < 10; i++) ed.indent();
        expect(levels(ed)).toEqual([8]);
        expect(ed.canIndent()).toBe(false); // the top
        ed.outdent();
        expect(levels(ed)).toEqual([7]);
        for (let i = 0; i < 10; i++) ed.outdent();
        expect(levels(ed)).toEqual([undefined]); // 0 is not written
        expect(ed.outdent()).toBe(false);
        expect(ed.issues()).toEqual([]);
    });

    it('every selected line moves together, each from its own level', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'one');
        press(ed, 'Enter');
        type(ed, 'two');
        press(ed, 'Enter');
        type(ed, 'three');
        const { doc } = ed.view.state;
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(doc, 7, 8))); // inside "two"
        ed.indent();
        expect(levels(ed)).toEqual([undefined, 1, undefined]);
        selectAll(ed);
        ed.indent();
        expect(levels(ed)).toEqual([1, 2, 1]);
        ed.outdent();
        expect(levels(ed)).toEqual([undefined, 1, undefined]);
    });

    it('a heading is indented too, and the toolbar shows the level only by the document', () => {
        const ed = mount({ profile: 'article' });
        type(ed, 'Title');
        ed.view.dispatch(ed.view.state.tr.setBlockType(1, 1, ed.schema.nodes.heading, { level: 2, indent: 0 }));
        ed.indent();
        expect(ed.getDoc().content[0]).toMatchObject({ type: 'heading', attrs: { level: 2, indent: 1 } });
    });

    it('inside a list the same buttons nest the item instead', () => {
        const ed = mount({ profile: 'article' });
        ed.toggleList('bulletList');
        type(ed, 'one');
        press(ed, 'Enter');
        type(ed, 'two');
        ed.indent();
        expect(JSON.stringify(ed.getDoc())).toContain('"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"two"}]}]}]');
        expect(JSON.stringify(ed.getDoc())).not.toContain('"indent"');
    });
});

describe('pasted indents', () => {
    const parse = (html: string) => {
        const schema = createSchema(PROFILES.article);
        const dom = new window.DOMParser().parseFromString(html, 'text/html').body;
        const { doc, issues } = nodeToDoc(PMParser.fromSchema(schema).parse(dom), PROFILES.article);
        expect(issues).toEqual([]);
        return doc.content.map((b) => (b.attrs?.indent as number | undefined) ?? 0);
    };

    it('our own class, and the left margins of Gmail, Docs and Word, become levels', () => {
        expect(parse('<p class="tao-indent-3">a</p>')).toEqual([3]);
        expect(parse('<p style="margin-left:80px">a</p>')).toEqual([2]); // Gmail: 40px a level
        expect(parse('<p style="margin-left:36pt">a</p>')).toEqual([1]); // Word and Docs: 36pt a level
        expect(parse('<p style="margin-left:2em">a</p>')).toEqual([1]);
    });

    it('nonsense stays 0 or is cut at 8', () => {
        expect(parse('<p style="margin-left:-40px">a</p>')).toEqual([0]);
        expect(parse('<p style="margin-left:99999px">a</p>')).toEqual([8]);
        expect(parse('<p style="margin-left:calc(1px + 2px)">a</p>')).toEqual([0]);
        expect(parse('<p class="tao-indent-9 evil">a</p>')).toEqual([0]);
    });
});
