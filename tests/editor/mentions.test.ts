// @vitest-environment jsdom
import { DOMParser as PMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { PROFILES, toPlainText } from '../../src/core';
import { createSchema, nodeToDoc, type MentionTrigger } from '../../src/editor';
import { mount, press, runs, type } from './helpers';

function setup(options: Record<string, unknown> = {}, onKey: (e: KeyboardEvent) => boolean = () => false) {
    const triggers: (MentionTrigger | null)[] = [];
    const onKeySpy = vi.fn(onKey);
    const ed = mount({ profile: 'chat', mentions: { onTrigger: (t: MentionTrigger | null) => triggers.push(t), onKey: onKeySpy }, ...options });
    const last = (): MentionTrigger | null => triggers[triggers.length - 1] ?? null;
    return { ed, triggers, last, onKeySpy };
}

describe('the @ trigger', () => {
    it('reports the query while the caret is inside @query, with its place', () => {
        const { ed, last } = setup();
        type(ed, 'hi ');
        expect(last()).toBeNull();
        type(ed, '@');
        expect(last()).toEqual({ query: '', from: 4, to: 5 });
        type(ed, 'al');
        expect(last()).toEqual({ query: 'al', from: 4, to: 7 });
    });

    it('a space ends it; the typed text stays text (nothing is converted)', () => {
        const { ed, last } = setup();
        type(ed, 'hi @al ');
        expect(last()).toBeNull();
        expect(runs(ed)).toEqual([['hi @al ', '']]);
    });

    it('an @ at the start or after a bracket triggers; an e-mail address does not', () => {
        const a = setup();
        type(a.ed, '@x');
        expect(a.last()?.query).toBe('x');
        const b = setup();
        type(b.ed, '(@y');
        expect(b.last()?.query).toBe('y');
        const c = setup();
        type(c.ed, 'mail me: a@b');
        expect(c.last()).toBeNull();
    });

    it('does not trigger in a code block or under the code mark', () => {
        const a = setup();
        type(a.ed, '```');
        expect(a.last()).toBeNull();
        const b = setup();
        b.ed.toggleMark('code');
        type(b.ed, '@x');
        expect(b.last()).toBeNull();
    });

    it('Escape dismisses it for that @; the next @ triggers again', () => {
        const { ed, last } = setup();
        type(ed, 'a @b');
        expect(last()?.query).toBe('b');
        expect(press(ed, 'Escape')).toBe(true);
        expect(last()).toBeNull();
        type(ed, 'c');
        expect(last()).toBeNull(); // still the same @
        type(ed, ' @d');
        expect(last()?.query).toBe('d');
    });

    it('with no hooks there is no trigger and no error', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, '@x');
        expect(runs(ed)).toEqual([['@x', '']]);
    });

    it('a profile without the mention node never triggers, even with hooks', () => {
        const triggers: unknown[] = [];
        const noMentions = { name: 'no-mentions', nodes: PROFILES.chat.nodes.filter((n) => n !== 'mention'), marks: PROFILES.chat.marks };
        const ed = mount({ profile: noMentions, mentions: { onTrigger: (t: unknown) => triggers.push(t), onKey: () => false } });
        type(ed, 'hi @x');
        expect(ed.schema.nodes.mention).toBeUndefined();
        expect(triggers).toEqual([]);
    });
});

describe('keys while the list is open', () => {
    it('ArrowUp, ArrowDown, Enter and Tab go to the host; used keys do not send or split', () => {
        const onSend = vi.fn();
        const { ed, onKeySpy } = setup({ submit: 'enter', onSend }, () => true);
        type(ed, 'hi @a');
        for (const key of ['ArrowDown', 'ArrowUp', 'Tab', 'Enter']) expect(press(ed, key), key).toBe(true);
        expect(onKeySpy).toHaveBeenCalledTimes(4);
        expect(onSend).not.toHaveBeenCalled();
        expect(ed.getDoc().content).toHaveLength(1);
    });

    it('when the host has nothing to choose, Enter works as always (it sends)', () => {
        const onSend = vi.fn();
        const { ed } = setup({ submit: 'enter', onSend }, () => false);
        type(ed, 'hi @a');
        press(ed, 'Enter');
        expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('with no trigger the host is not asked at all', () => {
        const { ed, onKeySpy } = setup({ submit: 'enter' }, () => true);
        type(ed, 'hi');
        press(ed, 'ArrowDown');
        expect(onKeySpy).not.toHaveBeenCalled();
    });
});

describe('insertMention', () => {
    it('replaces @query with the mention and a space; the document stays valid', () => {
        const { ed, last } = setup();
        type(ed, 'hi @an');
        expect(ed.insertMention(last()!, { id: 'u1', label: 'Ann' })).toBe(true);
        expect(ed.getDoc().content[0].content).toEqual([
            { type: 'text', text: 'hi ' },
            { type: 'mention', attrs: { id: 'u1', label: 'Ann' } },
            { type: 'text', text: ' ' },
        ]);
        expect(toPlainText(ed.getDoc())).toBe('hi @Ann ');
        expect(ed.issues()).toEqual([]);
        expect(last()).toBeNull();
    });

    it('refuses a mention that is not valid and leaves the text alone', () => {
        const { ed, last } = setup();
        type(ed, 'hi @an');
        const trigger = last()!;
        expect(ed.insertMention(trigger, { id: 'bad id', label: 'Ann' })).toBe(false);
        expect(ed.insertMention(trigger, { id: 'u1', label: '   ' })).toBe(false);
        expect(runs(ed)).toEqual([['hi @an', '']]);
    });

    it('is one unit for the engine (an atom) and can carry a mark', () => {
        const { ed, last } = setup();
        expect(ed.schema.nodes.mention.isAtom).toBe(true);
        type(ed, '@a');
        ed.insertMention(last()!, { id: 'u1', label: 'Ann' });
        const { doc } = ed.view.state;
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(doc, 1, doc.content.size - 1)));
        ed.toggleMark('bold');
        expect(ed.getDoc().content[0].content?.[0]).toEqual({ type: 'mention', attrs: { id: 'u1', label: 'Ann' }, marks: [{ type: 'bold' }] });
        expect(ed.issues()).toEqual([]);
    });
});

describe('insertText', () => {
    it('types at the caret and replaces the selection', () => {
        const ed = mount({ profile: 'chat' });
        type(ed, 'ab');
        ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.create(ed.view.state.doc, 2, 3)));
        expect(ed.insertText('😀')).toBe(true);
        expect(toPlainText(ed.getDoc())).toBe('a😀');
        expect(ed.insertText('')).toBe(false);
    });
});

describe('pasting mention markup', () => {
    const parse = (html: string) => {
        const schema = createSchema(PROFILES.chat);
        const dom = new window.DOMParser().parseFromString(html, 'text/html').body;
        const { doc, issues } = nodeToDoc(PMParser.fromSchema(schema).parse(dom), PROFILES.chat);
        expect(issues).toEqual([]);
        return doc;
    };

    it('a mention from our own markup is kept', () => {
        expect(parse('<p>hi <span class="tao-mention" data-mention="u1">@Ann</span></p>').content[0].content).toEqual([
            { type: 'text', text: 'hi ' },
            { type: 'mention', attrs: { id: 'u1', label: 'Ann' } },
        ]);
    });

    it('a forged one (a bad id or an empty label) becomes plain text', () => {
        const doc = parse('<p><span data-mention="x&quot;&gt;&lt;script&gt;">@Ann</span> <span data-mention="u1">@</span></p>');
        expect(JSON.stringify(doc)).not.toContain('mention');
        expect(toPlainText(doc)).toBe('@Ann @');
    });
});
