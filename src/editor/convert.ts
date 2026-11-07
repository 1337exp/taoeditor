import type { Node as PMNode, Schema } from 'prosemirror-model';
import { DOC_VERSION, normalizeDoc, type Doc, type Normalized, type Profile } from '../core';

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

export type { Doc };
