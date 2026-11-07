/**
 * Tables: the commands of `prosemirror-tables` for the rows, columns and header, and a way to put a new table in.
 * No merged cells and no column widths: a table here is a plain rectangle (the normalizer keeps it one).
 *
 * Таблицы: команды `prosemirror-tables` для строк, столбцов и шапки и вставка новой таблицы. Без объединённых ячеек
 * и без ширины столбцов: таблица здесь простой прямоугольник (нормализатор следит, чтобы он им и оставался).
 */
import type { Schema } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, isInTable, toggleHeaderRow } from 'prosemirror-tables';
import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from '../core';

/** What the table menu can do; the names are the stable part, the commands behind them are the library's. */
const COMMANDS = { addRowBefore, addRowAfter, deleteRow, addColumnBefore, addColumnAfter, deleteColumn, toggleHeaderRow, deleteTable } as const satisfies Record<string, Command>;

export type TableCommand = keyof typeof COMMANDS;

export const TABLE_COMMANDS = Object.keys(COMMANDS) as readonly TableCommand[];

export const inTable = (state: EditorState): boolean => isInTable(state);

/** A command of the table menu by its name; a name that is not one does nothing (it never reaches the library). */
export function tableCommand(name: string): Command {
    return Object.hasOwn(COMMANDS, name) ? COMMANDS[name as TableCommand] : () => false;
}

/**
 * A new table of `rows` by `columns` empty cells (cut to the limits of the model) after the block the caret is in;
 * an empty paragraph is replaced by it. The caret goes into the first cell. Does nothing inside a table.
 */
export function insertTable(schema: Schema, rows: number, columns: number): Command {
    const { table, tableRow, tableCell } = schema.nodes;
    if (!table || !tableRow || !tableCell || !Number.isFinite(rows) || !Number.isFinite(columns)) return () => false;
    const r = Math.max(1, Math.min(TABLE_MAX_ROWS, Math.floor(rows)));
    const c = Math.max(1, Math.min(TABLE_MAX_COLUMNS, Math.floor(columns)));
    return (state, dispatch) => {
        if (isInTable(state)) return false;
        const { $from } = state.selection;
        const cell = tableCell.createAndFill();
        if (!cell) return false;
        const node = table.create(null, Array.from({ length: r }, () => tableRow.create(null, Array.from({ length: c }, () => cell))));
        const top = $from.depth >= 1 ? $from.node(1) : null;
        const replaces = top !== null && top.type.name === 'paragraph' && top.content.size === 0;
        const at = replaces ? $from.before(1) : $from.depth >= 1 ? $from.after(1) : $from.pos;
        if (dispatch) {
            const tr = replaces ? state.tr.replaceWith(at, $from.after(1), node) : state.tr.insert(at, node);
            tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1), 1));
            dispatch(tr.scrollIntoView());
        }
        return true;
    };
}
