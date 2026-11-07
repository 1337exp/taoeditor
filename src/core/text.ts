import type { Doc, DocNode } from './model';
import { NODES } from './schema';

/**
 * Plain text of a document: for previews, search, push notifications. Blocks are separated by a
 * newline, a hard break is a newline, marks and structure markers are left out.
 *
 * Простой текст документа: для превью, поиска, пушей. Блоки разделены переводом строки,
 * жёсткий перенос — перевод строки, марки и маркеры структуры опущены.
 */
export function toPlainText(doc: Doc): string {
    return blocksText(doc.content);
}

/** True when there is nothing to send: no text but whitespace. / Пусто: нет ничего, кроме пробелов. */
export function isEmptyDoc(doc: Doc): boolean {
    return toPlainText(doc).trim() === '';
}

const blocksText = (nodes: readonly DocNode[]): string => nodes.map(nodeText).join('\n');

function nodeText(node: DocNode): string {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'mention') return `@${node.attrs?.label ?? ''}`;
    const kids = node.content ?? [];
    const first = kids[0];
    const blockChildren = first !== undefined && Object.hasOwn(NODES, first.type) && NODES[first.type].kind === 'block';
    return blockChildren ? blocksText(kids) : kids.map(nodeText).join('');
}
