/**
 * Block-level commands for the toolbar and the keys: lists, quote, indent, clear formatting. They are plain
 * ProseMirror commands built for a schema; a profile that has no such node simply gets a command that does nothing.
 *
 * Команды уровня блоков для панели и клавиш: списки, цитата, отступы, очистка форматирования. Это обычные команды
 * ProseMirror для схемы; профиль без такого узла получает команду, которая ничего не делает.
 */
import { lift, wrapIn } from 'prosemirror-commands';
import type { Node as PMNode, NodeType, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import type { Command, EditorState } from 'prosemirror-state';

/** The nearest ancestor of the caret that satisfies `test`, with its position. */
export function findAncestor(state: EditorState, test: (node: PMNode) => boolean): { node: PMNode; pos: number } | null {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (test(node)) return { node, pos: $from.before(depth) };
    }
    return null;
}

const listTypes = (schema: Schema): NodeType[] => [schema.nodes.bulletList, schema.nodes.orderedList].filter(Boolean);

/** Is the caret inside a node of this type (`bulletList`, `orderedList`, `blockquote`)? */
export function isBlockActive(state: EditorState, name: string): boolean {
    const type = state.schema.nodes[name];
    return !!type && findAncestor(state, (n) => n.type === type) !== null;
}

/** Makes the paragraphs a list of this type; inside a list of the same type takes them out; of another type changes it. */
export function toggleList(schema: Schema, name: 'bulletList' | 'orderedList'): Command {
    const type = schema.nodes[name];
    const item = schema.nodes.listItem;
    if (!type || !item) return () => false;
    return (state, dispatch) => {
        const inList = findAncestor(state, (n) => listTypes(schema).includes(n.type));
        if (inList && inList.node.type === type) return liftListItem(item)(state, dispatch);
        if (inList) {
            if (dispatch) dispatch(state.tr.setNodeMarkup(inList.pos, type));
            return true;
        }
        return wrapInList(type)(state, dispatch);
    };
}

export function toggleQuote(schema: Schema): Command {
    const quote = schema.nodes.blockquote;
    if (!quote) return () => false;
    return (state, dispatch) => (findAncestor(state, (n) => n.type === quote) ? lift(state, dispatch) : wrapIn(quote)(state, dispatch));
}

/** Nest the list item one level deeper (needs an item before it) / on one level out. */
export const indent = (schema: Schema): Command => (schema.nodes.listItem ? sinkListItem(schema.nodes.listItem) : () => false);
export const outdent = (schema: Schema): Command => (schema.nodes.listItem ? liftListItem(schema.nodes.listItem) : () => false);

/** Removes every mark from the selection except the link; with a caret it clears what the next typing would carry. */
export function clearFormatting(schema: Schema): Command {
    return (state, dispatch) => {
        const { from, to, empty } = state.selection;
        if (dispatch) {
            let tr = state.tr;
            if (empty) tr = tr.setStoredMarks([]);
            else for (const type of Object.values(schema.marks)) if (type.name !== 'link') tr = tr.removeMark(from, to, type);
            dispatch(tr);
        }
        return true;
    };
}
