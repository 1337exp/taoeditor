import { baseKeymap, chainCommands, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { sinkListItem, splitListItem } from 'prosemirror-schema-list';
import type { Schema } from 'prosemirror-model';
import { Plugin, TextSelection, type Command } from 'prosemirror-state';
import { GapCursor, gapCursor } from 'prosemirror-gapcursor';
import { goToNextCell, tableEditing } from 'prosemirror-tables';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { setBlockStyle, tabOut, toggleList, toggleQuote } from './blocks';
import { exitCodeBlock } from './code';
import { mentionPlugin, type MentionHooks } from './mentions';

export type SubmitMode = 'enter' | 'mod-enter' | 'none';

/** An empty document shows the placeholder through a node decoration. / Подсказка в пустом документе. */
function placeholder(text: string | undefined): Plugin {
    return new Plugin({
        props: {
            decorations(state) {
                const { doc } = state;
                const first = doc.firstChild;
                if (!text || doc.childCount !== 1 || !first || !first.isTextblock || first.content.size !== 0) return null;
                return DecorationSet.create(doc, [Decoration.node(0, first.nodeSize, { class: 'tao-empty', 'data-placeholder': text })]);
            },
        },
    });
}

/**
 * Enter sends, or Mod-Enter sends, or nothing sends. Never while an IME composition is going on:
 * the Enter that confirms a candidate must not send the message.
 * Enter отправляет, или Mod-Enter, или ничего. Никогда во время композиции IME: Enter, который
 * подтверждает вариант, не должен отправлять сообщение.
 */
function sendKeys(submit: SubmitMode, send: () => void): Plugin {
    return new Plugin({
        props: {
            handleKeyDown(view, event) {
                if (submit === 'none' || event.key !== 'Enter') return false;
                if (event.isComposing || event.keyCode === 229 || view.composing) return false;
                const mod = event.ctrlKey || event.metaKey;
                const hit = !event.shiftKey && !event.altKey && (submit === 'enter' ? !mod : mod);
                if (!hit) return false;
                send();
                return true;
            },
        },
    });
}

/**
 * Typing at the gap cursor. Before a block the browser puts the text where the engine expects it, after a table at the end it
 * puts it into the last cell (checked in Chromium), so we do it ourselves: a paragraph with the typed text, the caret after it.
 * Composition (IME) is left to prosemirror-gapcursor.
 * Набор на «пустой» каретке. Перед блоком браузер кладёт текст куда надо, после таблицы в конце документа кладёт в её
 * последнюю ячейку (проверено в Chromium), поэтому делаем сами: абзац с набранным текстом, каретка после него.
 */
function typeAtGap(): Plugin {
    return new Plugin({
        props: {
            handleDOMEvents: {
                beforeinput(view, event) {
                    const input = event as InputEvent;
                    const sel = view.state.selection;
                    if (input.inputType !== 'insertText' || !input.data || !(sel instanceof GapCursor)) return false;
                    const paragraph = view.state.schema.nodes.paragraph;
                    if (!sel.$from.parent.canReplaceWith(sel.$from.index(), sel.$from.index(), paragraph)) return false;
                    const tr = view.state.tr.insert(sel.from, paragraph.create(null, view.state.schema.text(input.data)));
                    tr.setSelection(TextSelection.create(tr.doc, sel.from + 1 + input.data.length));
                    view.dispatch(tr.scrollIntoView());
                    input.preventDefault();
                    return true;
                },
            },
        },
    });
}

/**
 * Without tables a pasted table would run together ("a" and "b" become "ab"): a space after each cell keeps them apart.
 * Без таблиц вставленная таблица слиплась бы («a» и «b» стали бы «ab»): пробел после каждой ячейки их разделяет.
 */
function cellsApart(): Plugin {
    return new Plugin({ props: { transformPastedHTML: (html) => html.replace(/<[/]t[dh]>/gi, (tag) => `${tag} `) } });
}

export interface PluginOptions {
    mentions?: MentionHooks;
    submit: SubmitMode;
    send: () => void;
    placeholder?: string;
}

export function createPlugins(schema: Schema, options: PluginOptions): Plugin[] {
    const m = schema.marks;
    const markKey = (name: string): Command => (m[name] ? toggleMark(m[name]) : () => false);
    const lineBreak: Command = (state, dispatch) => {
        if (dispatch) {
            const tr = state.selection.$from.parent.type.spec.code
                ? state.tr.insertText('\n')
                : state.tr.replaceSelectionWith(schema.nodes.hardBreak.create());
            dispatch(tr.scrollIntoView());
        }
        return true;
    };

    const hasTables = !!schema.nodes.table;
    const item = schema.nodes.listItem;
    // Tab: one level in inside a list, else the next cell; Shift-Tab: out of a nested item, else the previous cell.
    // Where none of them applies the key falls through, so the keyboard is never trapped.
    const tab = chainCommands(...(item ? [sinkListItem(item)] : []), ...(hasTables ? [goToNextCell(1)] : []));
    const shiftTab = chainCommands(...(item ? [tabOut(schema)] : []), ...(hasTables ? [goToNextCell(-1)] : []));

    return [
        // before the send keys: Enter chooses from the list while it is open
        ...(options.mentions && schema.nodes.mention ? [mentionPlugin(options.mentions)] : []),
        sendKeys(options.submit, options.send),
        // a caret between blocks that have no text to hold it (before a table or a code block at the start, after one at the end)
        ...(hasTables || schema.nodes.codeBlock ? [typeAtGap(), gapCursor()] : []),
        ...(hasTables ? [tableEditing()] : [cellsApart()]),
        keymap({
            'Mod-b': markKey('bold'),
            'Mod-i': markKey('italic'),
            'Mod-u': markKey('underline'),
            'Mod-e': markKey('code'),
            'Mod-Shift-x': markKey('strike'),
            // like Docs: superscript, subscript
            'Mod-.': markKey('superscript'),
            'Mod-,': markKey('subscript'),
            'Mod-Shift-p': markKey('spoiler'),
            // like Gmail: numbered, bulleted, quote
            'Mod-Shift-7': toggleList(schema, 'orderedList'),
            'Mod-Shift-8': toggleList(schema, 'bulletList'),
            'Mod-Shift-9': toggleQuote(schema),
            // like Docs: normal text and headings
            'Mod-Alt-0': setBlockStyle(schema, 'paragraph'),
            'Mod-Alt-1': setBlockStyle(schema, 1),
            'Mod-Alt-2': setBlockStyle(schema, 2),
            'Mod-Alt-3': setBlockStyle(schema, 3),
            // in a list: a new item, one level in, one level out; outside a list these do nothing and the browser's Tab moves on
            // Enter on an empty last line leaves a code block; in a list it starts a new item
            Enter: chainCommands(exitCodeBlock(schema), ...(item ? [splitListItem(item)] : [])),
            ...(item || hasTables ? { Tab: tab, 'Shift-Tab': shiftTab } : {}),
            'Mod-z': undo,
            'Mod-y': redo,
            'Mod-Shift-z': redo,
            'Shift-Enter': chainCommands(exitCodeBlock(schema), lineBreak),
        }),
        keymap(baseKeymap),
        history(),
        placeholder(options.placeholder),
    ];
}
