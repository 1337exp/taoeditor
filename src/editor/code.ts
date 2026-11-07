/**
 * The code block (a block of plain, monospaced text, not the inline `code` mark): a toolbar toggle and the way out of it.
 * Turning lines into a block keeps their text only (marks go, a line break stays a line, a mention becomes its `@name`);
 * turning a block back makes a paragraph with its lines.
 *
 * Блок кода (блок простого моноширинного текста, не метка `code`): переключатель панели и выход из блока.
 * Строки в блок превращаются только текстом (марки уходят, перенос остаётся переносом, упоминание становится `@имя`);
 * блок обратно делается абзацем со строками.
 */
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { TextSelection, type Command } from 'prosemirror-state';
import { findAncestor } from './blocks';

const NEWLINE = String.fromCharCode(10);

/** The text of a line of text as code: marks off, a break is a newline, a mention is its name. */
function codeText(node: PMNode): string {
    let out = '';
    node.forEach((child) => {
        if (child.isText) out += child.text ?? '';
        else if (child.type.name === 'hardBreak') out += NEWLINE;
        else out += child.type.spec.leafText ? child.type.spec.leafText(child) : '';
    });
    return out;
}

/** Makes the selected lines one code block, or takes the block the caret is in back to a paragraph. */
export function toggleCodeBlock(schema: Schema): Command {
    const { codeBlock, paragraph, hardBreak } = schema.nodes;
    if (!codeBlock || !paragraph) return () => false;
    return (state, dispatch) => {
        const inside = findAncestor(state, (n) => n.type === codeBlock);
        if (inside) {
            if (dispatch) {
                const lines = inside.node.textContent.split(NEWLINE);
                const content = lines.flatMap((line, i) => [...(i > 0 && hardBreak ? [hardBreak.create()] : []), ...(line ? [schema.text(line)] : [])]);
                const tr = state.tr.replaceWith(inside.pos, inside.pos + inside.node.nodeSize, paragraph.create(null, content));
                tr.setSelection(TextSelection.near(tr.doc.resolve(inside.pos + tr.doc.nodeAt(inside.pos)!.nodeSize - 1), -1)); // the caret at the end of the lines
                dispatch(tr.scrollIntoView());
            }
            return true;
        }
        const { $from, $to } = state.selection;
        const range = $from.blockRange($to);
        if (!range) return false;
        const blocks: PMNode[] = [];
        for (let i = range.startIndex; i < range.endIndex; i++) blocks.push(range.parent.child(i));
        // only plain lines of text (paragraphs, headings): a list or a quote in the selection is not turned into code
        if (blocks.length === 0 || !blocks.every((b) => b.isTextblock) || !range.parent.canReplaceWith(range.startIndex, range.endIndex, codeBlock)) return false;
        if (dispatch) {
            const text = blocks.map(codeText).join(NEWLINE);
            const tr = state.tr.replaceWith(range.start, range.end, codeBlock.create(null, text ? schema.text(text) : undefined));
            tr.setSelection(TextSelection.near(tr.doc.resolve(range.start + tr.doc.nodeAt(range.start)!.nodeSize - 1), -1)); // the caret at the end of the code
            dispatch(tr.scrollIntoView());
        }
        return true;
    };
}

/**
 * Enter (or Shift+Enter) on an empty last line of a code block leaves it: the empty line goes and a paragraph comes after.
 * A block at the end of the document would otherwise have no way out.
 * Enter (или Shift+Enter) на пустой последней строке блока кода выходит из него: пустая строка уходит, после блока
 * появляется абзац. Блоку в конце документа иначе было бы не выйти.
 */
export function exitCodeBlock(schema: Schema): Command {
    const { codeBlock, paragraph } = schema.nodes;
    if (!codeBlock || !paragraph) return () => false;
    return (state, dispatch) => {
        const { $head, empty } = state.selection;
        const node = $head.parent;
        if (!empty || node.type !== codeBlock || $head.parentOffset !== node.content.size || !node.textContent.endsWith(NEWLINE)) return false;
        if (dispatch) {
            const end = $head.after();
            const tr = state.tr.delete($head.pos - 1, $head.pos);
            const after = tr.mapping.map(end);
            tr.insert(after, paragraph.create());
            tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
            dispatch(tr.scrollIntoView());
        }
        return true;
    };
}
