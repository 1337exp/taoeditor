/**
 * TaoEditor: the editable field for our ecosystem, built from TaoUI components (toolbar, toggle buttons, input),
 * with `v-model` and `change` like the other TaoUI fields. The document in and out is our stored tree.
 * This is the only place that imports TaoUI; the engine and the viewer know nothing about it.
 *
 *   <TaoEditor v-model="doc" profile="comment" submit="mod-enter" @send="post" />
 *
 * Import the styles once: TaoUI's own, then `content.css`, `editor.css`, `taoui.css` of this package, and the
 * engine's `prosemirror-view/style/prosemirror.css`.
 *
 * TaoEditor — редактируемое поле нашей экосистемы из компонентов TaoUI (панель, кнопки-переключатели, поле), с
 * `v-model` и `change`, как у других полей TaoUI. Документ на входе и выходе — наше хранимое дерево.
 * Единственное место, которое импортирует TaoUI; движок и показ о нём не знают.
 */
import {
    TaoButton,
    TaoInput,
    TaoToolbar,
    TaoToolbarGroup,
    TaoToolbarSeparator,
    registerTaoIcons,
    type TaoSize,
} from '@1337exp/taoui';
import { defineComponent, h, onBeforeUnmount, onMounted, onUpdated, ref, shallowRef, watch, type PropType, type VNode } from 'vue';
import { PROFILES, emptyDoc, type Doc, type ProfileName } from '../../core';
import { createEditor, type EditorHandle, type SubmitMode } from '../../editor';

// Icons in TaoUI's own style (24 grid, strokes). Names must not start with `tao-`.
registerTaoIcons({
    'te-bold': { body: '<path d="M7.5 5h5a3.2 3.2 0 010 6.5h-5zM7.5 11.5h5.8a3.3 3.3 0 010 7H7.5z"/>' },
    'te-italic': { body: '<path d="M10 5h7M7 19h7M14.5 5l-5 14"/>' },
    'te-strike': {
        body: '<path d="M4.5 12h15"/><path d="M16.5 7.5C16 6.4 14.5 5.5 12 5.5c-2.6 0-4.3 1.1-4.3 2.9 0 1.2.9 2 2.6 2.6M8 16.5c.6 1.2 2 2 4.2 2 2.7 0 4.3-1.1 4.3-2.9 0-.6-.2-1.1-.7-1.6"/>',
    },
    'te-code': { body: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>' },
    'te-spoiler': {
        body: '<path d="M4 4l16 16"/><path d="M10.2 6.2A9 9 0 0112 6c4.5 0 7.5 3.6 8.5 6a12.5 12.5 0 01-2.6 3.5M6.5 8C4.9 9.2 3.8 10.8 3.5 12c1 2.4 4 6 8.5 6 1.3 0 2.5-.3 3.5-.8"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
    },
    'te-link': {
        body: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    },
});

/** Texts for screen readers and tooltips; the app passes its own language through `labels`. */
export interface TaoEditorLabels {
    toolbar: string;
    bold: string;
    italic: string;
    strike: string;
    code: string;
    spoiler: string;
    link: string;
    undo: string;
    redo: string;
    linkPlaceholder: string;
    linkApply: string;
    linkRemove: string;
    linkInvalid: string;
}

export const DEFAULT_LABELS: Readonly<TaoEditorLabels> = {
    toolbar: 'Formatting',
    bold: 'Bold',
    italic: 'Italic',
    strike: 'Strikethrough',
    code: 'Code',
    spoiler: 'Spoiler',
    link: 'Link',
    undo: 'Undo',
    redo: 'Redo',
    linkPlaceholder: 'https://…',
    linkApply: 'Apply',
    linkRemove: 'Remove link',
    linkInvalid: 'Only http and https links are allowed',
};

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const key = (letter: string, shift = false): string => (mac ? `${shift ? '⇧' : ''}⌘${letter}` : `${shift ? 'Ctrl+Shift+' : 'Ctrl+'}${letter}`);

const MARK_BUTTONS: readonly { mark: keyof TaoEditorLabels & string; icon: string; shortcut?: string }[] = [
    { mark: 'bold', icon: 'te-bold', shortcut: key('B') },
    { mark: 'italic', icon: 'te-italic', shortcut: key('I') },
    { mark: 'strike', icon: 'te-strike', shortcut: key('X', true) },
    { mark: 'code', icon: 'te-code', shortcut: key('E') },
    { mark: 'spoiler', icon: 'te-spoiler', shortcut: key('P', true) },
];

export const TaoEditor = defineComponent({
    name: 'TaoEditor',
    props: {
        /** The document (`v-model`). `null` is an empty one. / Документ (`v-model`). */
        modelValue: { type: Object as PropType<Doc | null>, default: null },
        /** What the document may contain. / Что может содержать документ. */
        profile: { type: String as PropType<ProfileName>, default: 'comment' },
        /** What sends: `enter` (chat), `mod-enter` (comment), `none`. / Что отправляет. */
        submit: { type: String as PropType<SubmitMode>, default: 'none' },
        placeholder: { type: String, default: '' },
        /** Accessible name of the text box. / Доступное имя поля. */
        label: { type: String, default: undefined },
        /** `small` / `medium` / `large`; without it the size of the ancestors, as for any TaoUI control. */
        size: { type: String as PropType<TaoSize>, default: undefined },
        /** Show the formatting toolbar. / Показывать панель форматирования. */
        toolbar: { type: Boolean, default: true },
        /** The toolbar floats over the selection instead of standing above the field. / Панель висит над выделением. */
        floating: { type: Boolean, default: false },
        readonly: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        /** Own texts (any subset). / Свои тексты (любая часть). */
        labels: { type: Object as PropType<Partial<TaoEditorLabels>>, default: undefined },
    },
    emits: {
        'update:modelValue': (_doc: Doc) => true,
        change: (_doc: Doc) => true,
        /** Enter (or Ctrl/Cmd+Enter, per `submit`) with a non-empty document. */
        send: (_doc: Doc) => true,
        focus: () => true,
        blur: () => true,
    },
    setup(props, { emit, expose }) {
        const host = ref<HTMLElement | null>(null);
        const tick = ref(0); // bumps on every editor update: the toolbar reads the state again
        const editor = shallowRef<EditorHandle | null>(null);
        const linkOpen = ref(false);
        const linkHref = ref('');
        const linkError = ref(false);

        // The floating panel: where the selection is (relative to this component), and how big the panel is.
        const root = ref<HTMLElement | null>(null);
        const floatEl = ref<HTMLElement | null>(null);
        const focused = ref(false);
        const anchor = ref({ x: 0, top: 0, bottom: 0 });
        const panelSize = ref({ w: 0, h: 0 });
        const place = (): void => {
            const handle = editor.value;
            const box = root.value;
            if (!handle || !box) return;
            const { from, to, empty } = handle.view.state.selection;
            if (empty) return;
            try {
                const a = handle.view.coordsAtPos(from);
                const b = handle.view.coordsAtPos(to);
                const r = box.getBoundingClientRect();
                const oneLine = Math.abs(a.top - b.top) < 2;
                anchor.value = { x: (oneLine ? (a.left + b.left) / 2 : a.left) - r.left, top: a.top - r.top, bottom: b.bottom - r.top };
            } catch {
                // no layout (a test, a hidden element): the panel stays where it was
            }
        };

        const build = (doc: Doc | null | undefined): void => {
            editor.value?.destroy();
            const handle = createEditor(host.value!, {
                profile: props.profile,
                doc: doc ?? undefined,
                submit: props.submit,
                placeholder: props.placeholder,
                label: props.label,
                class: 'tao-prose',
                readOnly: props.readonly || props.disabled,
                onChange: (next) => {
                    emit('update:modelValue', next);
                    emit('change', next);
                },
                onSend: (next) => emit('send', next),
                onUpdate: () => {
                    place();
                    tick.value++;
                },
            });
            handle.view.dom.addEventListener('focus', () => emit('focus'));
            handle.view.dom.addEventListener('blur', () => emit('blur'));
            editor.value = handle;
            tick.value++;
        };

        onMounted(() => build(props.modelValue));
        onUpdated(() => {
            const el = floatEl.value;
            if (el && (el.offsetWidth !== panelSize.value.w || el.offsetHeight !== panelSize.value.h)) {
                panelSize.value = { w: el.offsetWidth, h: el.offsetHeight };
            }
        });
        onBeforeUnmount(() => {
            editor.value?.destroy();
            editor.value = null;
        });

        // The parent changed the document: replace it, unless it is what the editor already holds (the echo of our own
        // update:modelValue), so typing never loses the caret or the undo history.
        watch(
            () => props.modelValue,
            (next) => {
                const handle = editor.value;
                if (!handle) return;
                if (JSON.stringify(next ?? emptyDoc()) === JSON.stringify(handle.getDoc())) return;
                handle.setDoc(next ?? emptyDoc());
            },
        );
        // These are fixed when the engine is built: rebuild, keeping the document.
        watch(
            () => [props.profile, props.submit, props.placeholder, props.label, props.readonly, props.disabled],
            () => {
                if (editor.value) build(editor.value.getDoc());
            },
        );

        expose({
            focus: () => editor.value?.focus(),
            clear: () => editor.value?.clear(),
            /** The engine handle, for tests and diagnostics. / Ручка движка для тестов и диагностики. */
            engine: () => editor.value,
        });

        const closeLink = (): void => {
            linkOpen.value = false;
            linkError.value = false;
            linkHref.value = '';
            editor.value?.focus();
        };
        const applyLink = (): void => {
            if (!editor.value?.setLink(linkHref.value)) {
                linkError.value = true;
                return;
            }
            closeLink();
        };

        return () => {
            void tick.value; // the dependency: re-render after every editor update
            const handle = editor.value;
            const text: TaoEditorLabels = { ...DEFAULT_LABELS, ...props.labels };
            const marks = PROFILES[props.profile].marks as readonly string[];
            const locked = props.disabled || props.readonly;
            // A click must not take the focus (and with it the selection) from the editor.
            const keepFocus = (event: MouseEvent): void => event.preventDefault();

            const toggle = (name: string, label: string, icon: string, shortcut: string | undefined, pressed: boolean): VNode =>
                h(TaoButton, {
                    icon,
                    variant: 'ghost',
                    size: props.size,
                    pressed,
                    disabled: locked,
                    'aria-label': label,
                    // TaoButton prints `shortcut` inside the button, too much for an icon: the key goes to the tooltip
                    title: shortcut ? `${label} (${shortcut})` : label,
                    'aria-keyshortcuts': shortcut,
                    onMousedown: keepFocus,
                    'onUpdate:pressed': () => {
                        if (name === 'link') {
                            linkOpen.value = !linkOpen.value;
                            linkError.value = false;
                            return;
                        }
                        handle?.toggleMark(name);
                        handle?.focus();
                    },
                });

            const plain = (label: string, icon: string, on: () => void, off: boolean): VNode =>
                h(TaoButton, {
                    icon,
                    variant: 'ghost',
                    size: props.size,
                    disabled: locked || off,
                    'aria-label': label,
                    title: label,
                    onMousedown: keepFocus,
                    onClick: () => {
                        on();
                        handle?.focus();
                    },
                });

            const panel: VNode[] = [];
            if (props.toolbar) {
                panel.push(
                    h(TaoToolbar, { key: 'toolbar', label: text.toolbar, size: props.size, variant: 'plain', class: 'tao-editor-toolbar' }, () => [
                        h(TaoToolbarGroup, null, () => [
                            ...MARK_BUTTONS.filter((b) => marks.includes(b.mark)).map((b) =>
                                toggle(b.mark, text[b.mark], b.icon, b.shortcut, handle?.isMarkActive(b.mark) ?? false),
                            ),
                            ...(marks.includes('link') ? [toggle('link', text.link, 'te-link', undefined, linkOpen.value || (handle?.isMarkActive('link') ?? false))] : []),
                        ]),
                        h(TaoToolbarSeparator),
                        h(TaoToolbarGroup, null, () => [
                            plain(text.undo, 'tao-undo', () => handle?.undo(), !(handle?.canUndo() ?? false)),
                            plain(text.redo, 'tao-redo', () => handle?.redo(), !(handle?.canRedo() ?? false)),
                        ]),
                    ]),
                );
            }
            if (props.toolbar && linkOpen.value) {
                panel.push(
                    h(
                        'div',
                        {
                            key: 'link',
                            class: 'tao-editor-link',
                            onKeydown: (event: KeyboardEvent) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    applyLink();
                                } else if (event.key === 'Escape') closeLink();
                            },
                        },
                        [
                            h(TaoInput, {
                                modelValue: linkHref.value,
                                'onUpdate:modelValue': (value: string | number) => {
                                    linkHref.value = String(value);
                                    linkError.value = false;
                                },
                                placeholder: text.linkPlaceholder,
                                size: props.size,
                                'aria-label': text.link,
                                'aria-invalid': linkError.value ? 'true' : undefined,
                                class: 'tao-editor-link-input',
                            }),
                            h(TaoButton, { size: props.size, onClick: applyLink }, () => text.linkApply),
                            h(
                                TaoButton,
                                {
                                    size: props.size,
                                    variant: 'secondary',
                                    disabled: !(handle?.isMarkActive('link') ?? false),
                                    onClick: () => {
                                        handle?.setLink(null);
                                        closeLink();
                                    },
                                },
                                () => text.linkRemove,
                            ),
                            linkError.value ? h('span', { class: 'tao-editor-link-error', role: 'alert' }, text.linkInvalid) : null,
                        ],
                    ),
                );
            }
            const hasSelection = handle ? !handle.view.state.selection.empty : false;
            const showFloating = props.floating && props.toolbar && !locked && ((hasSelection && focused.value) || linkOpen.value);
            const children: VNode[] = [];
            if (props.floating) {
                if (showFloating) {
                    const { w, h: height } = panelSize.value;
                    const at = anchor.value;
                    let top = at.top - height - 8; // above the selection, or below it when there is no room
                    if (top < 0) top = at.bottom + 8;
                    const left = Math.max(0, Math.min(at.x - w / 2, Math.max(0, (root.value?.clientWidth ?? 0) - w)));
                    children.push(h('div', { key: 'floating', class: 'tao-editor-floating', ref: floatEl, style: { left: `${left}px`, top: `${top}px` } }, panel));
                }
            } else {
                children.push(...panel);
            }
            // The keys matter: the host holds the engine's DOM, and without them Vue would reuse it for whatever is
            // inserted before it (the link row, the floating panel).
            children.push(h('div', { key: 'host', class: 'tao-editor-host', ref: host }));
            return h(
                'div',
                {
                    ref: root,
                    class: ['tao-editor-root', { 'tao-editor-root--disabled': props.disabled }],
                    onFocusin: () => (focused.value = true),
                    onFocusout: (event: FocusEvent) => {
                        if (!root.value?.contains(event.relatedTarget as Node | null)) focused.value = false;
                    },
                },
                children,
            );
        };
    },
});
