/**
 * What a document may contain. This is data, not engine code: the editor builds its schema from it,
 * the normalizer enforces it, a server can read it. Profiles (chat, comment, article) are allowlists
 * over the same specs.
 *
 * Что может содержать документ. Это данные, а не код движка: из них редактор строит схему,
 * нормализатор следит за ними, сервер может их читать. Профили (chat, comment, article) —
 * белые списки поверх тех же описаний.
 */
import type { AttrValue } from './model';
import { parseColor } from './color';
import { safeUrl } from './url';

export interface AttrSpec {
    default: AttrValue;
    /** The attribute exists only in profiles that list this feature (`indent`, `align`). / Атрибут есть только в профилях с этой возможностью. */
    feature?: string;
    /** Without a valid value the node or mark is dropped. / Без верного значения узел или марка отбрасываются. */
    required?: boolean;
    /** Returns the cleaned value, or `undefined` when the value is not valid. */
    check(value: unknown): AttrValue | undefined;
}

export interface NodeSpec {
    kind: 'block' | 'inline' | 'text';
    /** Allowed child types, the first one is the default. Empty for leaves. */
    children: readonly string[];
    /** A container with no children is dropped. / Контейнер без детей отбрасывается. */
    required?: boolean;
    /** At most this many children; the rest is cut. / Не больше стольких детей, остальное обрезается. */
    limit?: number;
    /** Text inside carries marks. / Текст внутри несёт марки. */
    marks?: boolean;
    /** Text inside is code: newlines stay newlines. / Текст — код: переводы строк остаются. */
    code?: boolean;
    attrs?: Readonly<Record<string, AttrSpec>>;
}

export interface MarkSpec {
    attrs?: Readonly<Record<string, AttrSpec>>;
    /** Marks that cannot coexist with this one; this one wins. / Марки, несовместимые с этой; она побеждает. */
    excludes?: readonly string[];
}

const intIn =
    (min: number, max: number) =>
    (value: unknown): number | undefined =>
        typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;

/** `@name`: the id is what is stored and checked by the app, the label is what was shown at the time. */
const cleanLabel = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    // control characters (by code, not by a regex of them) become spaces, runs of white space become one
    const spaced = [...value].map((c) => (c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) < 160) ? ' ' : c)).join('');
    const label = spaced.replace(/\s+/g, ' ').trim();
    return label.length >= 1 && label.length <= 80 ? label : undefined;
};

const INLINE = ['text', 'hardBreak', 'mention'] as const;
const oneOf =
    (...allowed: string[]) =>
    (value: unknown): string | undefined =>
        typeof value === 'string' && allowed.includes(value) ? value : undefined;

/** `left` is the default (the start of the line, so it follows the text direction) and is not written. */
export const ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export const SIZES = ['small', 'large', 'huge'] as const;

const BLOCK_ATTRS = {
    indent: { default: 0, check: intIn(0, 8), feature: 'indent' },
    align: { default: 'left', check: oneOf(...ALIGNS), feature: 'align' },
} as const;

const BLOCKS_INSIDE = ['paragraph', 'codeBlock', 'bulletList', 'orderedList', 'blockquote'] as const;

/** A table: rows of cells, each cell holds paragraphs and lists (no table inside a table, no merged cells). */
export const TABLE_PARTS = ['tableRow', 'tableCell', 'tableHeader'] as const;
export const TABLE_MAX_ROWS = 50;
export const TABLE_MAX_COLUMNS = 20;
const CELL_BLOCKS = ['paragraph', 'bulletList', 'orderedList'] as const;

export const NODES: Readonly<Record<string, NodeSpec>> = {
    doc: {
        kind: 'block',
        children: ['paragraph', 'heading', 'blockquote', 'codeBlock', 'bulletList', 'orderedList', 'table'],
        required: true,
    },
    paragraph: { kind: 'block', children: INLINE, marks: true, attrs: BLOCK_ATTRS },
    heading: {
        kind: 'block',
        children: ['text'],
        marks: true,
        attrs: { level: { default: 1, check: intIn(1, 3) }, ...BLOCK_ATTRS },
    },
    blockquote: { kind: 'block', children: BLOCKS_INSIDE, required: true },
    codeBlock: {
        kind: 'block',
        children: ['text'],
        code: true,
        attrs: {
            lang: {
                default: null,
                check: (value) => (typeof value === 'string' && /^[\w+#.-]{1,32}$/.test(value) ? value : undefined),
            },
        },
    },
    bulletList: { kind: 'block', children: ['listItem'], required: true },
    orderedList: {
        kind: 'block',
        children: ['listItem'],
        required: true,
        attrs: { start: { default: 1, check: intIn(1, 1_000_000_000) } },
    },
    listItem: { kind: 'block', children: BLOCKS_INSIDE, required: true },
    table: { kind: 'block', children: ['tableRow'], required: true, limit: TABLE_MAX_ROWS },
    tableRow: { kind: 'block', children: ['tableCell', 'tableHeader'], required: true, limit: TABLE_MAX_COLUMNS },
    tableCell: { kind: 'block', children: CELL_BLOCKS, required: true },
    tableHeader: { kind: 'block', children: CELL_BLOCKS, required: true },
    hardBreak: { kind: 'inline', children: [] },
    mention: {
        kind: 'inline',
        children: [],
        marks: true,
        attrs: {
            id: { default: '', required: true, check: (value) => (typeof value === 'string' && /^[\w.:-]{1,64}$/.test(value) ? value : undefined) },
            label: { default: '', required: true, check: cleanLabel },
        },
    },
    text: { kind: 'text', children: [] },
};

/** Marks in canonical order: the outermost first. / Марки в каноническом порядке: внешняя первой. */
export const MARKS: Readonly<Record<string, MarkSpec>> = {
    link: { attrs: { href: { default: '', required: true, check: (value) => safeUrl(value) ?? undefined } }, excludes: ['underline'] },
    bold: {},
    italic: {},
    underline: {},
    strike: {},
    superscript: { excludes: ['subscript'] },
    subscript: { excludes: ['superscript'] },
    size: { attrs: { value: { default: '', required: true, check: oneOf(...SIZES) } } },
    color: { attrs: { value: { default: '', required: true, check: parseColor } } },
    background: { attrs: { value: { default: '', required: true, check: parseColor } } },
    spoiler: {},
    code: { excludes: ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'color', 'background', 'spoiler'] },
};

export const MARK_ORDER: readonly string[] = Object.keys(MARKS);

export interface Profile {
    name: string;
    /** Allowed node types (`text` and `hardBreak` included). / Разрешённые узлы. */
    nodes: readonly string[];
    marks: readonly string[];
    /** Block attributes in use (`indent`, `align`) and the Undo and Redo buttons (`history`). Missing means none. */
    features?: readonly string[];
    /** A gap between paragraphs by default (an article), none otherwise (a chat, a mail). */
    spaced?: boolean;
}

const CHAT_NODES = ['paragraph', 'text', 'hardBreak', 'mention', 'blockquote', 'codeBlock'] as const;
const COMMENT_NODES = [...CHAT_NODES, 'bulletList', 'orderedList', 'listItem', 'table', ...TABLE_PARTS] as const;
const ARTICLE_NODES = [...COMMENT_NODES, 'heading'] as const;

// Ready profiles are a starting point (a project can take marks away or define its own). Colours, underline, subscript, alignment
// and indents are for articles; a comment keeps the superscript, a chat does not (decision of the user, 2026-11-07: the comment
// bar is the one of Reddit: bold, italic, strikethrough, superscript, size, link, lists, spoiler, quote, code, code block, table).
const COMMENT_MARKS = MARK_ORDER.filter((m) => m !== 'color' && m !== 'background' && m !== 'subscript' && m !== 'underline');
const CHAT_MARKS = COMMENT_MARKS.filter((m) => m !== 'superscript');

export const PROFILES = {
    chat: { name: 'chat', nodes: CHAT_NODES, marks: CHAT_MARKS, features: [] },
    comment: { name: 'comment', nodes: COMMENT_NODES, marks: COMMENT_MARKS, features: [] },
    article: { name: 'article', nodes: ARTICLE_NODES, marks: MARK_ORDER, features: ['indent', 'align', 'history'], spaced: true },
} as const satisfies Record<string, Profile>;

export type ProfileName = keyof typeof PROFILES;

/** Children of `parent` that the profile allows, in the spec's order. / Допустимые дети в порядке описания. */
export function childrenOf(parent: string, profile: Profile): string[] {
    const spec = Object.hasOwn(NODES, parent) ? NODES[parent] : undefined;
    return spec ? spec.children.filter((name) => profile.nodes.includes(name)) : [];
}
