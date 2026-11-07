import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { InputRule, inputRules, textblockTypeInputRule, undoInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { MarkType, Schema } from 'prosemirror-model';
import { Plugin, type Command } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export type SubmitMode = 'enter' | 'mod-enter' | 'none';

/**
 * `**bold**`, `*italic*`, `_italic_`, `~~strike~~`, `` `code` ``, `||spoiler||`.
 * Lookbehind keeps `snake_case_` and `2*3*4` from turning into marks. The mark rule fires on the
 * closing character, replaces the markers with marked text and turns the mark off for what comes next.
 *
 * Лукбихайнд спасает `snake_case_` и `2*3*4` от превращения в марки. Правило срабатывает на закрывающем
 * символе, заменяет маркеры размеченным текстом и выключает марку для следующего ввода.
 */
function markRule(re: RegExp, type: MarkType, noCode: MarkType | undefined): InputRule {
    return new InputRule(re, (state, match, start, end) => {
        const $start = state.doc.resolve(start);
        if ($start.parent.type.spec.code || !$start.parent.type.allowsMarkType(type)) return null;
        if (noCode && state.doc.rangeHasMark(start, end, noCode)) return null;
        const marks = type.create().addToSet($start.marks());
        const tr = state.tr.replaceWith(start, end, state.schema.text(match[1], marks));
        return tr.removeStoredMark(type);
    });
}

function inputRulesFor(schema: Schema) {
    const m = schema.marks;
    const n = schema.nodes;
    const code = m.code;
    const rules: InputRule[] = [];
    const mark = (re: RegExp, name: string): void => {
        if (m[name]) rules.push(markRule(re, m[name], name === 'code' ? undefined : code));
    };
    mark(new RegExp(String.raw`(?<![*\\])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$`), 'bold');
    mark(new RegExp(String.raw`(?<![_\w\\])__([^_\s](?:[^_]*[^_\s])?)__$`), 'bold');
    mark(new RegExp(String.raw`(?<![*\w\\])\*([^*\s](?:[^*]*[^*\s])?)\*$`), 'italic');
    mark(new RegExp(String.raw`(?<![_\w\\])_([^_\s](?:[^_]*[^_\s])?)_$`), 'italic');
    mark(new RegExp(String.raw`(?<![~\\])~~([^~\s](?:[^~]*[^~\s])?)~~$`), 'strike');
    mark(new RegExp('(?<![`\\\\])`([^`\\s](?:[^`]*[^`\\s])?)`$'), 'code');
    mark(new RegExp(String.raw`(?<![|\\])\|\|([^|\s](?:[^|]*[^|\s])?)\|\|$`), 'spoiler');

    if (n.blockquote) rules.push(wrappingInputRule(/^\s*>\s$/, n.blockquote));
    if (n.codeBlock) rules.push(textblockTypeInputRule(/^```$/, n.codeBlock));
    if (n.heading) rules.push(textblockTypeInputRule(/^(#{1,3})\s$/, n.heading, (match) => ({ level: match[1].length })));
    if (n.bulletList) rules.push(wrappingInputRule(/^\s*[-+*]\s$/, n.bulletList));
    if (n.orderedList) {
        rules.push(
            wrappingInputRule(
                /^(\d{1,9})\.\s$/,
                n.orderedList,
                (match) => ({ start: Number(match[1]) }),
                (match, node) => node.childCount + node.attrs.start === Number(match[1]),
            ),
        );
    }
    return inputRules({ rules });
}

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
        sendKeys(options.submit, options.send),
        inputRulesFor(schema),
        keymap({
            'Mod-b': markKey('bold'),
            'Mod-i': markKey('italic'),
            'Mod-e': markKey('code'),
            'Mod-Shift-x': markKey('strike'),
            'Mod-Shift-p': markKey('spoiler'),
            'Mod-z': undo,
            'Mod-y': redo,
            'Mod-Shift-z': redo,
            // First Backspace after a shortcut brings the typed markers back; otherwise the default Backspace.
            Backspace: undoInputRule,
            'Shift-Enter': lineBreak,
        }),
        keymap(baseKeymap),
        history(),
        placeholder(options.placeholder),
    ];
}
