/**
 * The stored document: our own versioned tree. It is the only thing that is persisted and sent
 * around; the editing engine (ProseMirror) only holds a projection of it in memory.
 * The shape is deliberately plain JSON: no HTML, no engine types.
 *
 * Сохраняемый документ: наше версионное дерево. Хранится и передаётся только оно;
 * движок (ProseMirror) держит лишь его проекцию в памяти. Только JSON: ни HTML, ни типов движка.
 */

/** Current document version. A reader refuses versions it does not know. / Текущая версия. */
export const DOC_VERSION = 1;

export type AttrValue = string | number | boolean | null;
export type Attrs = Record<string, AttrValue>;

export interface DocMark {
    type: string;
    attrs?: Attrs;
}

export interface DocNode {
    type: string;
    attrs?: Attrs;
    /** Child nodes. Absent for leaves and empty containers. / Дети; нет у листьев и пустых контейнеров. */
    content?: DocNode[];
    /** Only for `text` nodes. / Только у узлов `text`. */
    text?: string;
    /** Only for `text` nodes, in canonical order. / Только у `text`, в каноническом порядке. */
    marks?: DocMark[];
}

export interface Doc {
    v: typeof DOC_VERSION;
    content: DocNode[];
}

/** A document with one empty paragraph. / Документ из одного пустого абзаца. */
export function emptyDoc(): Doc {
    return { v: DOC_VERSION, content: [{ type: 'paragraph' }] };
}
