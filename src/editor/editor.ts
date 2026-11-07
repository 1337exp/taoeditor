import { toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import type { MarkType, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PROFILES, emptyDoc, isEmptyDoc, safeUrl, type Doc, type Issue, type Profile, type ProfileName } from '../core';
import { docToNode, nodeToDoc } from './convert';
import { createPlugins, type SubmitMode } from './plugins';
import { createSchema } from './schema';

export interface EditorOptions {
    /** Which allowlist applies. Default `comment`. / Какой белый список. По умолчанию `comment`. */
    profile?: ProfileName | Profile;
    /** The initial document. It goes through the normalizer. / Начальный документ (через нормализатор). */
    doc?: Doc;
    /** What sends: `enter` (chat), `mod-enter` (comment), `none`. / Что отправляет. */
    submit?: SubmitMode;
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
    /** Sets a link on the selection; `null` removes it. Unsafe URLs are refused (returns false). */
    setLink(href: string | null): boolean;
    undo(): boolean;
    redo(): boolean;
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
        plugins: createPlugins(schema, { submit: options.submit ?? 'none', send, placeholder: options.placeholder }),
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
        undo: () => undo(view.state, view.dispatch, view),
        redo: () => redo(view.state, view.dispatch, view),
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
