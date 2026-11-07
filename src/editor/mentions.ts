/**
 * The "@" trigger. The engine only notices that the caret is inside `@query` and tells the host (a list of people
 * is the host's UI, the people are the host's data). Nothing is converted: if the person ignores the list, what
 * they typed stays text. A mention is created only when the host calls `insertMention`.
 *
 * Триггер «@». Движок лишь замечает, что каретка внутри `@запрос`, и сообщает хосту (список людей это интерфейс
 * хоста, люди это его данные). Ничего не превращается: если список проигнорировать, набранное остаётся текстом.
 * Упоминание создаётся только когда хост вызывает `insertMention`.
 */
import type { EditorState } from 'prosemirror-state';
import { Plugin, PluginKey } from 'prosemirror-state';

/** The text being typed after `@`, and where it is (document positions, `@` included). */
export interface MentionTrigger {
    query: string;
    from: number;
    to: number;
}

export interface MentionHooks {
    /** The caret entered `@query` (or the query changed), or left it (`null`). / Каретка вошла в `@запрос` или вышла. */
    onTrigger(trigger: MentionTrigger | null): void;
    /**
     * ArrowUp, ArrowDown, Enter, Tab while a trigger is active. Return true when the key was used (the list moved or
     * chose), false to let the editor handle it (no list, nothing to choose).
     * Стрелки, Enter, Tab при активном триггере. true, если клавиша использована, false — пусть обработает редактор.
     */
    onKey(event: KeyboardEvent): boolean;
}

/** `@` at the start of a block or after a space or a bracket: an e-mail (`a@b`) is not a trigger. */
const TRIGGER = /(?:^|[\s(])@([\p{L}\p{N}_.-]{0,32})$/u;
const OBJECT = String.fromCharCode(0xfffc);

const key = new PluginKey<number | null>('taoeditor-mention');

function find(state: EditorState): MentionTrigger | null {
    const { selection, schema } = state;
    const mention = schema.nodes.mention;
    if (!mention || !selection.empty) return null;
    const $head = selection.$head;
    if (!$head.parent.isTextblock || !$head.parent.canReplaceWith($head.index(), $head.index(), mention)) return null;
    if ($head.marks().some((m) => m.type.name === 'code')) return null;
    const before = $head.parent.textBetween(0, $head.parentOffset, undefined, OBJECT);
    const match = TRIGGER.exec(before);
    if (!match) return null;
    const query = match[1];
    return { query, from: $head.pos - query.length - 1, to: $head.pos };
}

export function mentionPlugin(hooks: MentionHooks): Plugin {
    let active: string | null = null; // what the host was last told, to tell it only changes

    return new Plugin<number | null>({
        key,
        // The place of an `@` the person dismissed with Escape: no list for it until the caret leaves that `@`.
        state: {
            init: () => null,
            apply(tr, dismissed, _old, next) {
                const meta = tr.getMeta(key) as { dismiss: number } | undefined;
                if (meta) return meta.dismiss;
                const trigger = find(next);
                return trigger && dismissed !== null && trigger.from === tr.mapping.map(dismissed) ? trigger.from : null;
            },
        },
        view() {
            return {
                update(view) {
                    const dismissed = key.getState(view.state);
                    let trigger = view.composing ? null : find(view.state);
                    if (trigger && dismissed === trigger.from) trigger = null;
                    const id = trigger ? `${trigger.from}:${trigger.to}:${trigger.query}` : null;
                    if (id === active) return;
                    active = id;
                    hooks.onTrigger(trigger);
                },
            };
        },
        props: {
            handleKeyDown(view, event) {
                if (active === null || event.isComposing) return false;
                if (event.key === 'Escape') {
                    const trigger = find(view.state);
                    if (!trigger) return false;
                    view.dispatch(view.state.tr.setMeta(key, { dismiss: trigger.from }));
                    return true;
                }
                if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key)) return hooks.onKey(event);
                return false;
            },
        },
    });
}
