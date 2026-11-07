import type { Node as PMNode, Schema } from 'prosemirror-model';
import { DOC_VERSION, normalizeDoc, type Doc, type DocNode, type Normalized, type Profile } from '../core';

/** Our document to the engine's tree. Always passes through the normalizer first. / Через нормализатор. */
export function docToNode(schema: Schema, doc: unknown, profile: Profile): PMNode {
    const clean = normalizeDoc(doc, profile).doc;
    const node = schema.nodeFromJSON({ type: 'doc', content: clean.content });
    node.check();
    return node;
}

/** The engine's tree to our document. The issues are the drift between the engine and the core. */
export function nodeToDoc(node: PMNode, profile: Profile): Normalized {
    const raw = { v: DOC_VERSION, content: (node.toJSON() as { content?: unknown }).content ?? [] };
    return normalizeDoc(raw, profile);
}

/**
 * The contract of the guard paragraphs (a compromise, see docs/architecture.ru.md, "Tables"): while editing, a table that is
 * first or last in the document has an empty paragraph next to it, so the caret has a place before and after it (on a phone
 * it is hard to put it there otherwise). These paragraphs belong to the editor, not to the document: `getDoc` leaves out an
 * empty paragraph that stands before a first table or after a last one, one at each end. A paragraph with anything in it stays.
 * Known cost: an empty line the author kept there on purpose is not stored.
 * Контракт охранных абзацев (компромисс): пока идёт правка, у таблицы в начале или в конце документа рядом стоит пустой
 * абзац, чтобы каретке было куда встать. Он принадлежит редактору, а не документу: `getDoc` не отдаёт один пустой абзац
 * перед первой таблицей и один после последней. Абзац с содержимым остаётся. Цена: пустая строка, оставленная там
 * нарочно, не сохранится.
 */
export function withoutGuards(doc: Doc): Doc {
    const isTable = (node: DocNode | undefined): boolean => node?.type === 'table';
    const isEmptyParagraph = (node: DocNode | undefined): boolean => node?.type === 'paragraph' && (node.content?.length ?? 0) === 0;
    let content = doc.content;
    if (isEmptyParagraph(content[0]) && isTable(content[1])) content = content.slice(1);
    if (isEmptyParagraph(content[content.length - 1]) && isTable(content[content.length - 2])) content = content.slice(0, -1);
    return content === doc.content ? doc : { ...doc, content };
}

export type { Doc };
