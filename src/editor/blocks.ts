/**
 * Block-level commands for the toolbar and the keys: lists, quote, indent, clear formatting. They are plain
 * ProseMirror commands built for a schema; a profile that has no such node simply gets a command that does nothing.
 *
 * Индент: в пункте списка вкладывает его под предыдущий; в обычном абзаце или заголовке меняет уровень отступа
 * (атрибут `indent`, от 0 до 8), у нескольких выделенных строк сразу.
 *
 * Команды уровня блоков для панели и клавиш: списки, цитата, отступы, очистка форматирования. Это обычные команды
 * ProseMirror для схемы; профиль без такого узла получает команду, которая ничего не делает.
 */
import { lift, wrapIn } from 'prosemirror-commands';
import type { Node as PMNode, NodeType, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import type { Command, EditorState } from 'prosemirror-state';
import { MAX_INDENT } from './indent';

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

/** One level more or less for every paragraph and heading in the selection. False when nothing would change. */
function shiftIndent(delta: 1 | -1): Command {
    return (state, dispatch) => {
        const { from, to } = state.selection;
        const tr = state.tr;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isTextblock || node.type.spec.attrs?.indent === undefined) return;
            const level = Math.max(0, Math.min(MAX_INDENT, (node.attrs.indent as number) + delta));
            if (level !== node.attrs.indent) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: level });
                changed = true;
            }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
    };
}

const inListItem = (schema: Schema, state: EditorState): boolean => !!schema.nodes.listItem && findAncestor(state, (n) => n.type === schema.nodes.listItem) !== null;

/** In a list: one level deeper (under the item before it). Otherwise: a deeper indent of the lines. */
export const indent = (schema: Schema): Command => (state, dispatch, view) =>
    inListItem(schema, state) ? sinkListItem(schema.nodes.listItem)(state, dispatch) : shiftIndent(1)(state, dispatch, view);

/** In a list: one level out (the top level leaves the list). Otherwise: a smaller indent of the lines. */
export const outdent = (schema: Schema): Command => (state, dispatch, view) =>
    inListItem(schema, state) ? liftListItem(schema.nodes.listItem)(state, dispatch) : shiftIndent(-1)(state, dispatch, view);

/**
 * Shift+Tab: only inside a NESTED item, so that a keyboard user is never trapped: at the top level the key is left to the
 * browser (focus moves back). The toolbar button, `outdent`, can still take an item out of the list.
 * Shift+Tab: только внутри ВЛОЖЕННОГО пункта, чтобы пользователь клавиатуры не застревал: на верхнем уровне клавиша
 * остаётся браузеру. Кнопка панели, `outdent`, всё равно может вывести пункт из списка.
 */
export const tabOut = (schema: Schema): Command => (state, dispatch) => {
    const item = schema.nodes.listItem;
    if (!item) return false;
    const { $from } = state.selection;
    let items = 0;
    for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type === item) items++;
    return items >= 2 ? liftListItem(item)(state, dispatch) : false;
};

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

export type Align = 'left' | 'center' | 'right' | 'justify';

/** The alignment of every paragraph and heading in the selection. False when the profile has no `align` or nothing changes. */
export function setAlign(value: Align): Command {
    return (state, dispatch) => {
        const { from, to } = state.selection;
        const tr = state.tr;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isTextblock || node.type.spec.attrs?.align === undefined || node.attrs.align === value) return;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, align: value });
            changed = true;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
    };
}

/** The alignment where the selection starts (`left` when there is none or the profile has no `align`). */
export function alignAt(state: EditorState): Align {
    const { $from } = state.selection;
    const block = $from.parent;
    return block.isTextblock && block.type.spec.attrs?.align !== undefined ? (block.attrs.align as Align) : 'left';
}

export type BlockStyle = 'paragraph' | 1 | 2 | 3;

/**
 * Makes every paragraph and heading in the selection a paragraph or a heading of a level, keeping its indent and
 * alignment. A line is left alone when the result would not be valid there: a heading cannot sit in a list item and
 * holds only text, so a line with a line break or a mention in it stays a paragraph.
 * Делает каждый абзац и заголовок выделения абзацем или заголовком нужного уровня, сохраняя отступ и выравнивание.
 * Строка остаётся как есть, если результат там недопустим: заголовок не бывает в пункте списка и содержит только
 * текст, поэтому строка с переносом или упоминанием остаётся абзацем.
 */
export function setBlockStyle(schema: Schema, style: BlockStyle): Command {
    const paragraph = schema.nodes.paragraph;
    const heading = schema.nodes.heading;
    if (!heading) return () => false;
    return (state, dispatch) => {
        const { from, to } = state.selection;
        const tr = state.tr;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isTextblock || (node.type !== paragraph && node.type !== heading)) return;
            const target = style === 'paragraph' ? paragraph : heading;
            if (node.type === target && (target !== heading || node.attrs.level === style)) return;
            const $pos = state.doc.resolve(pos);
            if (!target.validContent(node.content) || !$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, target)) return;
            const attrs: Record<string, unknown> = {};
            for (const key of ['indent', 'align']) if (target.spec.attrs?.[key] !== undefined && node.attrs[key] !== undefined) attrs[key] = node.attrs[key];
            if (target === heading) attrs.level = style;
            tr.setNodeMarkup(pos, target, attrs);
            changed = true;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
    };
}

/** The style where the selection starts. */
export function blockStyleAt(state: EditorState): BlockStyle {
    const block = state.selection.$from.parent;
    return block.type === state.schema.nodes.heading ? (block.attrs.level as 1 | 2 | 3) : 'paragraph';
}
