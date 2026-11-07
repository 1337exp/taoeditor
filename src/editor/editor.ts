import { toggleMark } from 'prosemirror-commands';
import { redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import type { MarkType, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PROFILES, emptyDoc, isEmptyDoc, normalizeDoc, parseColor, safeUrl, type Doc, type Issue, type Profile, type ProfileName } from '../core';
import { docToNode, nodeToDoc } from './convert';
import type { MentionHooks, MentionTrigger } from './mentions';
import { clearFormatting, indent, isBlockActive, outdent, toggleList, toggleQuote } from './blocks';
import { createPlugins, type SubmitMode } from './plugins';
import { createSchema } from './schema';

export interface EditorOptions {
    /** Which allowlist applies. Default `comment`. / Какой белый список. По умолчанию `comment`. */
    profile?: ProfileName | Profile;
    /** The initial document. It goes through the normalizer. / Начальный документ (через нормализатор). */
    doc?: Doc;
    /** What sends: `enter` (chat), `mod-enter` (comment), `none`. / Что отправляет. */
    submit?: SubmitMode;
    /**
     * Tell the host when the caret is inside `@query` (the host shows the list, see `insertMention`).
     * Сообщать хосту, когда каретка внутри `@запрос` (список показывает хост, см. `insertMention`).
     */
    mentions?: MentionHooks;
    placeholder?: string;
    /** Extra classes for the editable element, e.g. `tao-prose` under TaoUI. / Доп. классы, например `tao-prose`. */
    class?: string;
    /** Accessible name of the text box. / Доступное имя поля. */
    label?: string;
    readOnly?: boolean;
    /** The document changed (not just the selection). / Документ изменился. */
    onChange?: (doc: Doc) => void;
    /** Enter pressed with a non-empty document. The host decides what to do, e.g. `clear()`. */
    onSend?: (doc: Doc) => void;
    /** Anything changed, selection included: refresh toolbar state here. / Изменилось что угодно. */
    onUpdate?: (editor: EditorHandle) => void;
}

export interface EditorHandle {
    /** The engine view. For the lab and for diagnostics; consumers should not depend on it. */
    readonly view: EditorView;
    readonly schema: Schema;
    readonly profile: Profile;
    getDoc(): Doc;
    /** Replaces the document and resets undo history. / Заменяет документ и сбрасывает историю. */
    setDoc(doc: Doc): void;
    clear(): void;
    isEmpty(): boolean;
    /** Differences between the engine's tree and the core's rules. Must stay empty. */
    issues(): Issue[];
    toggleMark(name: string): boolean;
    isMarkActive(name: string): boolean;
    /** Replaces the `@query` of a trigger with a mention and a space. False when the mention is not valid. */
    insertMention(trigger: MentionTrigger, item: { id: string; label: string }): boolean;
    /** Types text at the selection (an emoji from a picker). / Вставляет текст на место выделения. */
    insertText(text: string): boolean;
    /** Makes the paragraphs a list, takes them out of one, or changes its kind. False when the profile has no lists. */
    toggleList(name: 'bulletList' | 'orderedList'): boolean;
    toggleQuote(): boolean;
    /** One level in / out for a list item. */
    indent(): boolean;
    outdent(): boolean;
    canIndent(): boolean;
    canOutdent(): boolean;
    /** Is the caret in a list or a quote (`bulletList`, `orderedList`, `blockquote`)? */
    isBlockActive(name: string): boolean;
    /** Removes every mark from the selection except the link. */
    clearFormatting(): boolean;
    /** Sets the colour of the selection (or of what is typed next); `null` takes it off. False for a bad colour. */
    setColor(kind: 'color' | 'background', value: string | null): boolean;
    /** The colour at the selection (`#rrggbb`) or null. */
    colorOf(kind: 'color' | 'background'): string | null;
    /** Sets a link on the selection; `null` removes it. Unsafe URLs are refused (returns false). */
    setLink(href: string | null): boolean;
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    focus(): void;
    destroy(): void;
}

function markActive(state: EditorState, type: MarkType): boolean {
    const { from, to, empty, $from } = state.selection;
    if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
    return state.doc.rangeHasMark(from, to, type);
}

export function createEditor(parent: HTMLElement, options: EditorOptions = {}): EditorHandle {
    const profile: Profile = typeof options.profile === 'object' ? options.profile : PROFILES[options.profile ?? 'comment'];
    const schema = createSchema(profile);
    const getDoc = (): Doc => nodeToDoc(view.state.doc, profile).doc;

    const send = (): void => {
        const doc = getDoc();
        if (!isEmptyDoc(doc)) options.onSend?.(doc);
    };

    const state = EditorState.create({
        schema,
        doc: docToNode(schema, options.doc ?? emptyDoc(), profile),
        plugins: createPlugins(schema, { mentions: options.mentions, submit: options.submit ?? 'none', send, placeholder: options.placeholder }),
    });

    const handle: EditorHandle = {
        get view() {
            return view;
        },
        schema,
        profile,
        getDoc,
        setDoc(doc) {
            view.updateState(EditorState.create({ schema, doc: docToNode(schema, doc, profile), plugins: view.state.plugins }));
            options.onUpdate?.(handle);
        },
        clear() {
            handle.setDoc(emptyDoc());
        },
        isEmpty: () => isEmptyDoc(getDoc()),
        issues: () => nodeToDoc(view.state.doc, profile).issues,
        toggleMark(name) {
            const type = schema.marks[name];
            return type ? toggleMark(type)(view.state, view.dispatch, view) : false;
        },
        isMarkActive(name) {
            const type = schema.marks[name];
            return type ? markActive(view.state, type) : false;
        },
        setLink(href) {
            const type = schema.marks.link;
            const { from, to, empty } = view.state.selection;
            if (!type || empty) return false;
            if (href === null) {
                view.dispatch(view.state.tr.removeMark(from, to, type));
                return true;
            }
            const safe = safeUrl(href);
            if (!safe) return false;
            view.dispatch(view.state.tr.addMark(from, to, type.create({ href: safe })));
            return true;
        },
        insertMention(trigger, item) {
            const type = schema.nodes.mention;
            const clean = normalizeDoc({ v: 1, content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: item }] }] }, profile).doc;
            const attrs = clean.content[0].content?.[0]?.attrs;
            if (!type || !attrs) return false;
            const tr = view.state.tr.replaceWith(trigger.from, trigger.to, [type.create(attrs), schema.text(' ')]);
            view.dispatch(tr.scrollIntoView());
            return true;
        },
        insertText(text) {
            if (text === '') return false;
            const { from, to } = view.state.selection;
            view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView());
            return true;
        },
        toggleList: (name) => toggleList(schema, name)(view.state, view.dispatch, view),
        toggleQuote: () => toggleQuote(schema)(view.state, view.dispatch, view),
        indent: () => indent(schema)(view.state, view.dispatch, view),
        outdent: () => outdent(schema)(view.state, view.dispatch, view),
        canIndent: () => indent(schema)(view.state),
        canOutdent: () => outdent(schema)(view.state),
        isBlockActive: (name) => isBlockActive(view.state, name),
        clearFormatting: () => clearFormatting(schema)(view.state, view.dispatch, view),
        setColor(kind, value) {
            const type = schema.marks[kind];
            const hex = value === null ? null : (parseColor(value) ?? null);
            if (!type || (value !== null && hex === null)) return false;
            const { from, to, empty } = view.state.selection;
            let tr = view.state.tr;
            if (empty) tr = hex ? tr.addStoredMark(type.create({ value: hex })) : tr.removeStoredMark(type);
            else {
                tr = tr.removeMark(from, to, type);
                if (hex) tr = tr.addMark(from, to, type.create({ value: hex }));
            }
            view.dispatch(tr);
            return true;
        },
        colorOf(kind) {
            const type = schema.marks[kind];
            if (!type) return null;
            const { from, to, empty, $from } = view.state.selection;
            if (empty) return (type.isInSet(view.state.storedMarks ?? $from.marks())?.attrs.value as string | undefined) ?? null;
            let found: string | null = null;
            view.state.doc.nodesBetween(from, to, (node) => {
                const mark = found === null ? type.isInSet(node.marks) : undefined;
                if (mark) found = mark.attrs.value as string;
            });
            return found;
        },
        undo: () => undo(view.state, view.dispatch, view),
        redo: () => redo(view.state, view.dispatch, view),
        canUndo: () => undoDepth(view.state) > 0,
        canRedo: () => redoDepth(view.state) > 0,
        focus: () => view.focus(),
        destroy: () => view.destroy(),
    };

    const view: EditorView = new EditorView(parent, {
        state,
        editable: () => !options.readOnly,
        attributes: {
            class: options.class ? `tao-editor ${options.class}` : 'tao-editor',
            role: 'textbox',
            'aria-multiline': 'true',
            ...(options.label ? { 'aria-label': options.label } : {}),
        },
        dispatchTransaction(tr) {
            view.updateState(view.state.apply(tr));
            if (tr.docChanged) options.onChange?.(getDoc());
            options.onUpdate?.(handle);
        },
    });
    return handle;
}
