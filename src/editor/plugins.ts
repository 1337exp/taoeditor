import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { sinkListItem, splitListItem } from 'prosemirror-schema-list';
import type { Schema } from 'prosemirror-model';
import { Plugin, type Command } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { setBlockStyle, tabOut, toggleList, toggleQuote } from './blocks';
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

    return [
        // before the send keys: Enter chooses from the list while it is open
        ...(options.mentions && schema.nodes.mention ? [mentionPlugin(options.mentions)] : []),
        sendKeys(options.submit, options.send),
        keymap({
            'Mod-b': markKey('bold'),
            'Mod-i': markKey('italic'),
            'Mod-u': markKey('underline'),
            'Mod-e': markKey('code'),
            'Mod-Shift-x': markKey('strike'),
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
            ...(schema.nodes.listItem
                ? { Enter: splitListItem(schema.nodes.listItem), Tab: sinkListItem(schema.nodes.listItem), 'Shift-Tab': tabOut(schema) }
                : {}),
            'Mod-z': undo,
            'Mod-y': redo,
            'Mod-Shift-z': redo,
            'Shift-Enter': lineBreak,
        }),
        keymap(baseKeymap),
        history(),
        placeholder(options.placeholder),
    ];
}
