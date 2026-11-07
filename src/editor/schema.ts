/**
 * ProseMirror schema built from the core specs of a profile. Everything about *what* is allowed comes
 * from `core`; this file only adds *how it looks in the DOM* and how pasted HTML is read.
 * Pasted HTML goes through these parse rules, so anything not described here simply cannot appear.
 *
 * Схема ProseMirror, собранная из описаний ядра для профиля. Что разрешено — решает `core`;
 * здесь только как это выглядит в DOM и как читается вставленный HTML. Вставка идёт через эти
 * правила, поэтому всё, чего здесь нет, в документ попасть не может.
 */
import { Schema, type MarkSpec, type NodeSpec } from 'prosemirror-model';
import { MARKS, MARK_ORDER, NODES, childrenOf, isPageInk, parseColor, safeUrl, type Profile } from '../core';
import { alignOf, indentOf } from './indent';

const expr = (names: readonly string[], required?: boolean): string | undefined => {
    if (names.length === 0) return undefined;
    return (names.length === 1 ? names[0] : `(${names.join(' | ')})`) + (required ? '+' : '*');
};

const langOf = (dom: HTMLElement): { lang: string | null } => {
    const raw = dom.getAttribute('data-lang') ?? /(?:^|\s)language-([\w+#.-]+)/.exec(dom.querySelector('code')?.className ?? '')?.[1];
    const lang = raw ? NODES.codeBlock.attrs!.lang.check(raw) : undefined;
    return { lang: typeof lang === 'string' ? lang : null };
};

/** A colour from pasted HTML: a real colour that is not the page's own black ink or white paper. */
const pastedColor = (value: string): { value: string } | false => {
    const hex = parseColor(value);
    return hex && !isPageInk(hex) ? { value: hex } : false;
};

const blockClass = (attrs: Record<string, unknown>): string =>
    [typeof attrs.indent === 'number' && attrs.indent > 0 ? `tao-indent-${attrs.indent}` : '', typeof attrs.align === 'string' && attrs.align !== 'left' ? `tao-align-${attrs.align}` : '']
        .filter(Boolean)
        .join(' ');

const CELL_ATTRS = { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null } };

const NODE_DOM: Readonly<Record<string, NodeSpec>> = {
    paragraph: {
        attrs: { indent: { default: 0 }, align: { default: 'left' } },
        parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ indent: indentOf(dom), align: alignOf(dom) }) }],
        toDOM: (node) => {
            const cls = blockClass(node.attrs);
            return cls ? ['p', { class: cls }, 0] : ['p', 0];
        },
    },
    heading: {
        attrs: { level: { default: 1 }, indent: { default: 0 }, align: { default: 'left' } },
        defining: true,
        parseDOM: [
            { tag: 'h1', getAttrs: (dom) => ({ level: 1, indent: indentOf(dom), align: alignOf(dom) }) },
            { tag: 'h2', getAttrs: (dom) => ({ level: 2, indent: indentOf(dom), align: alignOf(dom) }) },
            { tag: 'h3,h4,h5,h6', getAttrs: (dom) => ({ level: 3, indent: indentOf(dom), align: alignOf(dom) }) },
        ],
        toDOM: (node) => {
            const cls = blockClass(node.attrs);
            return [`h${node.attrs.level}`, cls ? { class: cls } : {}, 0];
        },
    },
    blockquote: { defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: () => ['blockquote', 0] },
    codeBlock: {
        attrs: { lang: { default: null } },
        marks: '',
        code: true,
        defining: true,
        parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: (dom) => langOf(dom) }],
        toDOM: (node) => ['pre', node.attrs.lang ? { 'data-lang': node.attrs.lang } : {}, ['code', 0]],
    },
    bulletList: { parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', 0] },
    orderedList: {
        attrs: { start: { default: 1 } },
        parseDOM: [
            {
                tag: 'ol',
                getAttrs: (dom) => {
                    const start = Number(dom.getAttribute('start'));
                    return { start: Number.isInteger(start) && start >= 1 ? start : 1 };
                },
            },
        ],
        toDOM: (node) => (node.attrs.start === 1 ? ['ol', 0] : ['ol', { start: node.attrs.start }, 0]),
    },
    listItem: { defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    // Tables follow prosemirror-tables: its commands look for these roles and for the colspan, rowspan and colwidth attributes.
    // Merged cells and widths are not in our model: what a pasted table says about them is not read (the defaults stay).
    table: { tableRole: 'table', isolating: true, parseDOM: [{ tag: 'table' }], toDOM: () => ['table', ['tbody', 0]] },
    tableRow: { tableRole: 'row', parseDOM: [{ tag: 'tr' }], toDOM: () => ['tr', 0] },
    tableCell: { tableRole: 'cell', isolating: true, attrs: CELL_ATTRS, parseDOM: [{ tag: 'td' }], toDOM: () => ['td', 0] },
    tableHeader: { tableRole: 'header_cell', isolating: true, attrs: CELL_ATTRS, parseDOM: [{ tag: 'th' }], toDOM: () => ['th', 0] },
    hardBreak: { inline: true, selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    // A mention is one unit: it is selected, deleted and moved over as a whole. Pasted markup only counts if its id and
    // label pass the same checks as the stored document; the app must still verify that the person exists.
    mention: {
        inline: true,
        atom: true,
        selectable: true,
        attrs: { id: { default: '' }, label: { default: '' } },
        leafText: (node) => `@${node.attrs.label}`,
        parseDOM: [
            {
                tag: 'span[data-mention]',
                getAttrs: (dom) => {
                    const id = NODES.mention.attrs!.id.check(dom.getAttribute('data-mention'));
                    const label = NODES.mention.attrs!.label.check((dom.textContent ?? '').replace(/^@/, ''));
                    return id !== undefined && label !== undefined ? { id, label } : false;
                },
            },
        ],
        toDOM: (node) => ['span', { class: 'tao-mention', 'data-mention': node.attrs.id }, `@${node.attrs.label}`],
    },
};

// Word and Google Docs write bold as `<b style="font-weight:normal">` wrappers and `font-weight:700` spans:
// the rules below follow the same trick as prosemirror-schema-basic.
const MARK_DOM: Readonly<Record<string, MarkSpec>> = {
    link: {
        attrs: { href: {} },
        inclusive: false,
        parseDOM: [
            {
                tag: 'a[href]',
                getAttrs: (dom) => {
                    const href = safeUrl(dom.getAttribute('href'));
                    return href ? { href } : false;
                },
            },
        ],
        toDOM: (mark) => ['a', { href: mark.attrs.href, rel: 'noopener noreferrer nofollow ugc', target: '_blank' }, 0],
    },
    bold: {
        parseDOM: [
            { tag: 'strong' },
            { tag: 'b', getAttrs: (dom) => dom.style.fontWeight !== 'normal' && null },
            { style: 'font-weight=400', clearMark: (mark) => mark.type.name === 'bold' },
            { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
        ],
        toDOM: () => ['strong', 0],
    },
    italic: {
        parseDOM: [
            { tag: 'em' },
            { tag: 'i', getAttrs: (dom) => dom.style.fontStyle !== 'normal' && null },
            { style: 'font-style=normal', clearMark: (mark) => mark.type.name === 'italic' },
            { style: 'font-style=italic' },
        ],
        toDOM: () => ['em', 0],
    },
    underline: {
        parseDOM: [
            { tag: 'u' },
            { style: 'text-decoration', getAttrs: (value) => value.includes('underline') && null },
            { style: 'text-decoration-line', getAttrs: (value) => value.includes('underline') && null },
        ],
        toDOM: () => ['u', 0],
    },
    size: {
        attrs: { value: {} },
        parseDOM: [
            { tag: 'span.tao-text-small', attrs: { value: 'small' } },
            { tag: 'span.tao-text-large', attrs: { value: 'large' } },
            { tag: 'span.tao-text-huge', attrs: { value: 'huge' } },
            { tag: 'small', attrs: { value: 'small' } },
            { tag: 'big', attrs: { value: 'large' } },
        ],
        toDOM: (mark) => ['span', { class: `tao-text-${mark.attrs.value}` }, 0],
    },
    color: {
        attrs: { value: {} },
        parseDOM: [{ style: 'color', getAttrs: (value) => pastedColor(value) }],
        toDOM: (mark) => ['span', { style: `color:${mark.attrs.value}` }, 0],
    },
    background: {
        attrs: { value: {} },
        parseDOM: [{ style: 'background-color', getAttrs: (value) => pastedColor(value) }],
        toDOM: (mark) => ['span', { style: `background-color:${mark.attrs.value}` }, 0],
    },
    strike: {
        parseDOM: [
            { tag: 's' },
            { tag: 'del' },
            { tag: 'strike' },
            { style: 'text-decoration', getAttrs: (value) => value.includes('line-through') && null },
            { style: 'text-decoration-line', getAttrs: (value) => value.includes('line-through') && null },
        ],
        toDOM: () => ['s', 0],
    },
    // Docs and Word write them as `vertical-align` on a span; the tags are the plain way
    superscript: {
        parseDOM: [{ tag: 'sup' }, { style: 'vertical-align', getAttrs: (value) => value === 'super' && null }],
        toDOM: () => ['sup', 0],
    },
    subscript: {
        parseDOM: [{ tag: 'sub' }, { style: 'vertical-align', getAttrs: (value) => value === 'sub' && null }],
        toDOM: () => ['sub', 0],
    },
    spoiler: {
        parseDOM: [{ tag: 'span.tao-spoiler' }, { tag: 'tg-spoiler' }],
        toDOM: () => ['span', { class: 'tao-spoiler' }, 0],
    },
    code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
};

export function createSchema(profile: Profile): Schema {
    const nodes: Record<string, NodeSpec> = {
        doc: { content: expr(childrenOf('doc', profile), true) },
    };
    // Order matters: the first block node (the paragraph) is what the engine creates by default.
    for (const name of profile.nodes) {
        if (name === 'text') continue;
        if (!Object.hasOwn(NODE_DOM, name)) throw new Error(`taoeditor: no DOM mapping for node "${name}"`);
        const core = NODES[name];
        // an attribute of a feature this profile does not have is not in the schema at all
        const base = NODE_DOM[name];
        const attrs = base.attrs
            ? Object.fromEntries(Object.entries(base.attrs).filter(([key]) => !core.attrs?.[key]?.feature || profile.features?.includes(core.attrs[key].feature!)))
            : undefined;
        nodes[name] = { ...base, attrs: attrs && Object.keys(attrs).length > 0 ? attrs : undefined, content: expr(childrenOf(name, profile), core.required) };
    }
    nodes.text = {};

    const marks: Record<string, MarkSpec> = {};
    for (const name of MARK_ORDER) {
        if (!profile.marks.includes(name)) continue;
        // only marks that this profile has: the engine throws on a name it does not know. An empty list is not written:
        // it would mean "excludes nothing, not even itself", the default is what we want.
        const excludes = MARKS[name].excludes?.filter((other) => profile.marks.includes(other));
        marks[name] = excludes && excludes.length > 0 ? { ...MARK_DOM[name], excludes: excludes.join(' ') } : MARK_DOM[name];
    }
    return new Schema({ nodes, marks });
}
