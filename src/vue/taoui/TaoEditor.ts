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
    TaoColorInput,
    TaoInput,
    TaoToolbar,
    TaoToolbarGroup,
    TaoToolbarSeparator,
    registerTaoIcons,
    type TaoSize,
} from '@1337exp/taoui';
import { defineComponent, h, onBeforeUnmount, onMounted, onUpdated, ref, shallowRef, watch, type PropType, type VNode } from 'vue';
import { SIZES, emptyDoc, resolveProfile, type Doc, type Profile, type ProfileName } from '../../core';
import { createEditor, type EditorHandle, type MentionTrigger, type SubmitMode, type TableCommand } from '../../editor';
import { DEFAULT_EMOJI } from './emoji';
import { PALETTE } from './palette';

// Icons in TaoUI's own style (24 grid, strokes). Names must not start with `tao-`.
registerTaoIcons({
    'te-bold': { body: '<path d="M7.5 5h5a3.2 3.2 0 010 6.5h-5zM7.5 11.5h5.8a3.3 3.3 0 010 7H7.5z"/>' },
    'te-italic': { body: '<path d="M10 5h7M7 19h7M14.5 5l-5 14"/>' },
    'te-superscript': { body: '<path d="M4 9l7 8M11 9l-7 8"/><path d="M15 6.5c0-1 .8-1.7 1.9-1.7S19 5.5 19 6.5c0 1.8-4 2.6-4 4.5h4"/>' },
    'te-subscript': { body: '<path d="M4 6l7 8M11 6l-7 8"/><path d="M15 16.5c0-1 .8-1.7 1.9-1.7S19 15.5 19 16.5c0 1.8-4 2.6-4 4.5h4"/>' },
    'te-strike': {
        body: '<path d="M4.5 12h15"/><path d="M16.5 7.5C16 6.4 14.5 5.5 12 5.5c-2.6 0-4.3 1.1-4.3 2.9 0 1.2.9 2 2.6 2.6M8 16.5c.6 1.2 2 2 4.2 2 2.7 0 4.3-1.1 4.3-2.9 0-.6-.2-1.1-.7-1.6"/>',
    },
    'te-emoji': { body: '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 14.2c.8 1.3 2 2 3.4 2s2.6-.7 3.4-2"/><path d="M9.4 9.8h.01M14.6 9.8h.01"/>' },
    'te-underline': { body: '<path d="M7 5v6a5 5 0 0010 0V5"/><path d="M5 20h14"/>' },
    'te-list-ordered': { body: '<path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="M4.5 5.6l1.2-.7v4M4.2 14.6c.3-.9 2.5-1 2.5.4 0 .8-2.6 1.5-2.6 2.9h2.8"/>' },
    'te-list-bullet': { body: '<path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>' },
    'te-indent': { body: '<path d="M4 6.5h16M12 12h8M4 17.5h16"/><path d="M4 9.5l3 2.5-3 2.5"/>' },
    'te-outdent': { body: '<path d="M4 6.5h16M12 12h8M4 17.5h16"/><path d="M7 9.5L4 12l3 2.5"/>' },
    'te-quote': { body: '<path d="M9.5 8.5C7 9 5.5 10.7 5.5 13v3.5H10V13H7.5M18.5 8.5c-2.5.5-4 2.2-4 4.5v3.5H19V13h-2.5"/>' },
    'te-clear': { body: '<path d="M5 5.5h10M10 5.5l-2 13M8 18.5h3"/><path d="M14.5 14l5.5 5.5M20 14l-5.5 5.5"/>' },
    'te-heading': { body: '<path d="M5 6v12M13 6v12M5 12h8"/><path d="M16.5 10l2-1v9"/>' },
    'te-size': { body: '<path d="M3 8V6h10v2M8 6v11M6 17h4M14 11v-1.5h7V11M17.5 9.5V17M16 17h3"/>' },
    'te-align-justify': { body: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>', grid: true },
    'te-color': { body: '<path d="M6.5 15.5L12 4.5l5.5 11M8.4 11.5h7.2"/><path d="M5 20h14"/>' },
    'te-code': { body: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>' },
    'te-code-block': { body: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M10 9.5L7.5 12l2.5 2.5M14 9.5l2.5 2.5-2.5 2.5"/>' },
    'te-table': { body: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 10h16M4 14.5h16M10 5v14"/>' },
    'te-dots': { body: '<path stroke-width="3.6" d="M5.5 12h.01M12 12h.01M18.5 12h.01"/>' },
    'te-trash': { body: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>' },
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
    superscript: string;
    subscript: string;
    code: string;
    spoiler: string;
    link: string;
    undo: string;
    redo: string;
    linkPlaceholder: string;
    linkApply: string;
    linkRemove: string;
    linkInvalid: string;
    underline: string;
    numbered: string;
    bulleted: string;
    indent: string;
    outdent: string;
    quote: string;
    codeBlock: string;
    clear: string;
    blockStyle: string;
    styleNormal: string;
    styleHeading1: string;
    styleHeading2: string;
    styleHeading3: string;
    size: string;
    sizeSmall: string;
    sizeNormal: string;
    sizeLarge: string;
    sizeHuge: string;
    align: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    alignJustify: string;
    colors: string;
    colorText: string;
    colorBackground: string;
    colorReset: string;
    colorCustom: string;
    emoji: string;
    emojiList: string;
    mentionList: string;
    more: string;
    table: string;
    tableGrid: string;
    tableRowAbove: string;
    tableRowBelow: string;
    tableRowDelete: string;
    tableColumnBefore: string;
    tableColumnAfter: string;
    tableColumnDelete: string;
    tableHeaderRow: string;
    tableDelete: string;
}

/** One person in the list shown after `@`. `id` is what is stored, `label` what the text shows. */
export interface MentionItem {
    id: string;
    label: string;
    /** A second line: a login, a role. */
    hint?: string;
}

let listCounter = 0;

export const DEFAULT_LABELS: Readonly<TaoEditorLabels> = {
    toolbar: 'Formatting',
    bold: 'Bold',
    italic: 'Italic',
    strike: 'Strikethrough',
    superscript: 'Superscript',
    subscript: 'Subscript',
    code: 'Code',
    spoiler: 'Spoiler',
    link: 'Link',
    undo: 'Undo',
    redo: 'Redo',
    linkPlaceholder: 'https://…',
    linkApply: 'Apply',
    linkRemove: 'Remove link',
    linkInvalid: 'Only http and https links are allowed',
    underline: 'Underline',
    numbered: 'Numbered list',
    bulleted: 'Bulleted list',
    indent: 'Increase indent',
    outdent: 'Decrease indent',
    quote: 'Quote',
    codeBlock: 'Code block',
    clear: 'Clear formatting',
    blockStyle: 'Paragraph style',
    styleNormal: 'Normal text',
    styleHeading1: 'Heading 1',
    styleHeading2: 'Heading 2',
    styleHeading3: 'Heading 3',
    size: 'Text size',
    sizeSmall: 'Small',
    sizeNormal: 'Normal',
    sizeLarge: 'Large',
    sizeHuge: 'Huge',
    align: 'Align',
    alignLeft: 'Align left',
    alignCenter: 'Align center',
    alignRight: 'Align right',
    alignJustify: 'Justify',
    colors: 'Text and background color',
    colorText: 'Text color',
    colorBackground: 'Background color',
    colorReset: 'Default',
    colorCustom: 'Custom color',
    emoji: 'Emoji',
    emojiList: 'Emoji',
    mentionList: 'People',
    more: 'More',
    table: 'Table',
    tableGrid: 'Table size',
    tableRowAbove: 'Insert row above',
    tableRowBelow: 'Insert row below',
    tableRowDelete: 'Delete row',
    tableColumnBefore: 'Insert column before',
    tableColumnAfter: 'Insert column after',
    tableColumnDelete: 'Delete column',
    tableHeaderRow: 'Header row',
    tableDelete: 'Delete table',
};

/** The size picker for a new table: this many columns and rows to point at. */
const GRID_COLUMNS = 8;
const GRID_ROWS = 6;

/** The table menu: what runs, what it is called, and its icon. A gap between the groups. */
const TABLE_MENU: readonly (readonly [TableCommand, keyof TaoEditorLabels, string | undefined])[] = [
    ['addRowBefore', 'tableRowAbove', 'tao-plus'],
    ['addRowAfter', 'tableRowBelow', 'tao-plus'],
    ['deleteRow', 'tableRowDelete', 'te-trash'],
    ['addColumnBefore', 'tableColumnBefore', 'tao-plus'],
    ['addColumnAfter', 'tableColumnAfter', 'tao-plus'],
    ['deleteColumn', 'tableColumnDelete', 'te-trash'],
    ['toggleHeaderRow', 'tableHeaderRow', undefined],
    ['deleteTable', 'tableDelete', 'te-trash'],
];

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const key = (letter: string, shift = false, alt = false): string =>
    mac ? `${shift ? '⇧' : ''}${alt ? '⌥' : ''}⌘${letter}` : `${'Ctrl+'}${alt ? 'Alt+' : ''}${shift ? 'Shift+' : ''}${letter}`;

const MARK_BUTTONS: readonly { mark: keyof TaoEditorLabels & string; icon: string; shortcut?: string }[] = [
    { mark: 'bold', icon: 'te-bold', shortcut: key('B') },
    { mark: 'italic', icon: 'te-italic', shortcut: key('I') },
    { mark: 'underline', icon: 'te-underline', shortcut: key('U') },
    { mark: 'strike', icon: 'te-strike', shortcut: key('X', true) },
    { mark: 'superscript', icon: 'te-superscript', shortcut: key('.') },
    { mark: 'subscript', icon: 'te-subscript', shortcut: key(',') },
    { mark: 'code', icon: 'te-code', shortcut: key('E') },
    { mark: 'spoiler', icon: 'te-spoiler', shortcut: key('P', true) },
];

export const TaoEditor = defineComponent({
    name: 'TaoEditor',
    props: {
        /** The document (`v-model`). `null` is an empty one. / Документ (`v-model`). */
        modelValue: { type: Object as PropType<Doc | null>, default: null },
        /** What the document may contain. / Что может содержать документ. */
        /** A ready profile (`chat`, `comment`, `article`) or your own (`withoutFeatures`, `defineProfile`): what the project uses. */
        profile: { type: [String, Object] as PropType<ProfileName | Profile>, default: 'comment' },
        /** What sends: `enter` (chat), `mod-enter` (comment), `none`. / Что отправляет. */
        submit: { type: String as PropType<SubmitMode>, default: 'none' },
        placeholder: { type: String, default: '' },
        /** Accessible name of the text box. / Доступное имя поля. */
        label: { type: String, default: undefined },
        /** Size of the toolbar, the emoji list and the link row: `small` / `medium` / `large`. Without it the size of the ancestors (medium). */
        size: { type: String as PropType<TaoSize>, default: undefined },
        /** A gap between paragraphs (an article) or none (a mail client, a chat). Without it: by profile, `article` only. */
        spaced: { type: Boolean, default: undefined },
        /** Show the formatting toolbar. / Показывать панель форматирования. */
        toolbar: { type: Boolean, default: true },
        /**
         * The toolbar stays at the top of the screen while the page scrolls past a long text (an article), as long as the editor is in view.
         * `--te-sticky-top` is the distance from the top (for a page with its own fixed header). Not for `floating`.
         * Панель остаётся наверху экрана, пока страница прокручивается мимо длинного текста (статья), пока редактор виден.
         * `--te-sticky-top` расстояние от верха (если у страницы своя фиксированная шапка). Не для `floating`.
         */
        sticky: { type: Boolean, default: false },
        /**
         * The text area grows up to this height and then scrolls inside (a number is px, a string is any CSS length). Without it the field
         * grows with the text and the page scrolls. The same as setting `--te-max-height` on the component.
         * Поле растёт до этой высоты, дальше текст прокручивается внутри (число в px, строка любая CSS-длина). Без неё поле
         * растёт вместе с текстом, а прокручивается страница. То же, что `--te-max-height` на компоненте.
         */
        maxHeight: { type: [Number, String] as PropType<number | string>, default: undefined },
        /** The toolbar floats over the selection instead of standing above the field. / Панель висит над выделением. */
        floating: { type: Boolean, default: false },
        /**
         * Looks people up for `@`: gets what was typed after it, returns people (now or as a promise). Without it `@` is
         * just a character. The app decides who may be mentioned and must check the ids it receives.
         * Ищет людей для `@`: получает набранное после неё, возвращает людей (сразу или промисом). Без неё `@` — обычный
         * символ. Кого можно упомянуть, решает приложение; полученные id оно обязано проверять.
         */
        mentions: { type: Function as PropType<(query: string) => MentionItem[] | Promise<MentionItem[]>>, default: undefined },
        /** A button in the corner of the field with a list of emoji (plain text). / Кнопка эмодзи в углу поля. */
        emoji: { type: Boolean, default: false },
        /** Own emoji for the picker. / Свои эмодзи для выбора. */
        emojiList: { type: Array as PropType<readonly string[]>, default: undefined },
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

        // Mentions: the engine says where the caret is in `@query`, the list and its data are ours.
        const listId = `tao-editor-people-${++listCounter}`;
        const trigger = shallowRef<MentionTrigger | null>(null);
        const people = shallowRef<readonly MentionItem[]>([]);
        const chosen = ref(0);
        const suggestAt = ref({ x: 0, y: 0 });
        let lookup = 0; // only the latest answer counts
        const emojiOpen = ref(false);
        const colorsOpen = ref(false);
        const colorsPos = ref<{ left: number; top: number } | null>(null); // where the popup is, measured after it is drawn
        const alignOpen = ref(false);
        const alignPos = ref<{ left: number; top: number } | null>(null);
        const sizeOpen = ref(false);
        const sizePos = ref<{ left: number; top: number } | null>(null);
        const styleOpen = ref(false);
        const stylePos = ref<{ left: number; top: number } | null>(null);
        const tableOpen = ref(false);
        const tablePos = ref<{ left: number; top: number } | null>(null);
        // The table menu opens from the toolbar button or from a small button at the corner of the cell with the caret
        // (a long table may be far from the toolbar). The popup is placed under whichever opened it.
        const tableFrom = ref<'toolbar' | 'cell'>('toolbar');
        const cellAnchor = ref<{ left: number; top: number } | null>(null);
        const anchors = new Map<string, HTMLElement>(); // the toolbar button that opened each popup, by its class
        const gridAt = ref({ row: 0, column: 0 }); // the corner of the size picker that is pointed at
        // One popup at a time: opening one closes the others.
        const closeMenus = (): void => {
            emojiOpen.value = false;
            colorsOpen.value = false;
            alignOpen.value = false;
            sizeOpen.value = false;
            styleOpen.value = false;
            tableOpen.value = false;
        };
        const toggleMenu = (which: 'colors' | 'align' | 'size' | 'style' | 'table'): void => {
            const open = { colors: colorsOpen, align: alignOpen, size: sizeOpen, style: styleOpen, table: tableOpen }[which];
            const was = open.value;
            closeMenus();
            open.value = !was;
            gridAt.value = { row: 0, column: 0 };
            const pos = { colors: colorsPos, align: alignPos, size: sizePos, style: stylePos, table: tablePos }[which];
            pos.value = null; // measured again after it is drawn
        };

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

        const placeCell = (): void => {
            const handle = editor.value;
            const box = root.value;
            if (!handle || !box || !handle.inTable()) {
                cellAnchor.value = null;
                return;
            }
            try {
                const at = handle.view.domAtPos(handle.view.state.selection.from).node;
                const cell = (at instanceof Element ? at : at.parentElement)?.closest('td, th');
                if (!cell) {
                    cellAnchor.value = null;
                    return;
                }
                const c = cell.getBoundingClientRect();
                const r = box.getBoundingClientRect();
                const next = { left: c.right - r.left - 30, top: c.top - r.top + 2 };
                const now = cellAnchor.value;
                // only when it moved: the same place again would draw again for ever
                if (!now || Math.abs(now.left - next.left) > 0.5 || Math.abs(now.top - next.top) > 0.5) cellAnchor.value = next;
            } catch {
                cellAnchor.value = null; // no layout (a test): no button
            }
        };

        const choose = (item: MentionItem): void => {
            const at = trigger.value;
            if (!at || !editor.value?.insertMention(at, { id: item.id, label: item.label })) return;
            trigger.value = null;
            people.value = [];
            editor.value.focus();
        };

        const onTrigger = (at: MentionTrigger | null): void => {
            trigger.value = at;
            const my = ++lookup;
            if (!at) {
                people.value = [];
                return;
            }
            const handle = editor.value;
            const box = root.value;
            if (handle && box) {
                try {
                    const c = handle.view.coordsAtPos(at.from);
                    const r = box.getBoundingClientRect();
                    suggestAt.value = { x: c.left - r.left, y: c.bottom - r.top };
                } catch {
                    // no layout: the list stays where it was
                }
            }
            Promise.resolve(props.mentions?.(at.query) ?? [])
                .then((list) => {
                    if (my !== lookup) return;
                    people.value = list.slice(0, 8);
                    chosen.value = 0;
                })
                .catch(() => {
                    if (my === lookup) people.value = [];
                });
        };

        const onMentionKey = (event: KeyboardEvent): boolean => {
            const list = people.value;
            if (!trigger.value || list.length === 0) return false;
            if (event.key === 'ArrowDown') chosen.value = (chosen.value + 1) % list.length;
            else if (event.key === 'ArrowUp') chosen.value = (chosen.value + list.length - 1) % list.length;
            else choose(list[chosen.value]); // Enter, Tab
            return true;
        };

        const build = (doc: Doc | null | undefined): void => {
            editor.value?.destroy();
            trigger.value = null;
            people.value = [];
            const handle = createEditor(host.value!, {
                profile: props.profile,
                doc: doc ?? undefined,
                submit: props.submit,
                mentions: props.mentions ? { onTrigger, onKey: onMentionKey } : undefined,
                placeholder: props.placeholder,
                label: props.label,
                class: (props.spaced ?? resolveProfile(props.profile).spaced ?? false) ? 'tao-prose' : 'tao-prose tao-compact',
                readOnly: props.readonly || props.disabled,
                onChange: (next) => {
                    emit('update:modelValue', next);
                    emit('change', next);
                },
                onSend: (next) => emit('send', next),
                onUpdate: () => {
                    place();
                    placeCell();
                    tick.value++;
                },
            });
            handle.view.dom.addEventListener('focus', () => emit('focus'));
            handle.view.dom.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') closeMenus();
            });
            handle.view.dom.addEventListener('blur', () => emit('blur'));
            editor.value = handle;
            tick.value++;
        };

        onMounted(() => build(props.modelValue));
        // The popups (colours, alignment, size) are overlays: each is placed under its button, or above it when there is no room
        // below, and kept inside the component. Measured after drawing; shown only once measured.
        const menus = [
            { open: () => colorsOpen.value, button: '.tao-editor-colors-button', popup: '.tao-editor-colors', pos: colorsPos },
            { open: () => alignOpen.value, button: '.tao-editor-align-button', popup: '.tao-editor-align', pos: alignPos },
            { open: () => sizeOpen.value, button: '.tao-editor-size-button', popup: '.tao-editor-size', pos: sizePos },
            { open: () => styleOpen.value, button: '.tao-editor-style-button', popup: '.tao-editor-style', pos: stylePos },
            { open: () => tableOpen.value, button: '.tao-editor-table-button', popup: '.tao-editor-table', pos: tablePos },
        ];
        onUpdated(() => {
            const box = root.value;
            if (!box) return;
            for (const menu of menus) {
                if (!menu.open()) continue;
                const selector = menu.pos === tablePos && tableFrom.value === 'cell' ? '.tao-editor-cell-button' : menu.button;
                const pressed = anchors.get(selector.slice(1));
                const button = pressed?.isConnected ? pressed : box.querySelector<HTMLElement>(selector);
                const popup = box.querySelector<HTMLElement>(menu.popup);
                if (!button || !popup) continue;
                const area = box.getBoundingClientRect();
                const at = button.getBoundingClientRect();
                // a button in the overflow panel of the toolbar: the popup goes below the whole panel, not under the button (the panel is above it)
                const around = button.closest('.tao-toolbar__menu')?.getBoundingClientRect() ?? at;
                const roomBelow = window.innerHeight - around.bottom;
                const above = roomBelow < popup.offsetHeight + 8 && around.top > roomBelow;
                const left = Math.max(0, Math.min(at.left - area.left, area.width - popup.offsetWidth));
                const top = above ? around.top - area.top - popup.offsetHeight - 4 : around.bottom - area.top + 4;
                const now = menu.pos.value;
                // only when it moved: setting the same place again would draw again for ever
                if (!now || Math.abs(now.left - left) > 0.5 || Math.abs(now.top - top) > 0.5) menu.pos.value = { left, top };
            }
        });
        onUpdated(() => {
            const el = floatEl.value;
            if (el && (el.offsetWidth !== panelSize.value.w || el.offsetHeight !== panelSize.value.h)) {
                panelSize.value = { w: el.offsetWidth, h: el.offsetHeight };
            }
        });
        // A press anywhere except the list and its button closes it, the text field included: pressing into the text
        // means "back to typing", and it does not change the focus (it is in the editor already), so the focus cannot tell.
        const closeOnOutside = (event: PointerEvent): void => {
            const target = event.target as Element | null;
            if (!target?.closest?.('.tao-editor-emoji, .tao-editor-emoji-button')) emojiOpen.value = false;
            // the custom colour field opens its own popup in <body>: a press in it is not outside
            if (!target?.closest?.('.tao-editor-colors, .tao-editor-colors-button, .tao-popover__panel')) colorsOpen.value = false;
            if (!target?.closest?.('.tao-editor-align, .tao-editor-align-button')) alignOpen.value = false;
            if (!target?.closest?.('.tao-editor-size, .tao-editor-size-button')) sizeOpen.value = false;
            if (!target?.closest?.('.tao-editor-style, .tao-editor-style-button')) styleOpen.value = false;
            if (!target?.closest?.('.tao-editor-table, .tao-editor-table-button, .tao-editor-cell-button')) tableOpen.value = false;
        };
        watch(() => emojiOpen.value || colorsOpen.value || alignOpen.value || sizeOpen.value || styleOpen.value || tableOpen.value, (open) => {
            if (open) document.addEventListener('pointerdown', closeOnOutside, true);
            else document.removeEventListener('pointerdown', closeOnOutside, true);
        });
        onBeforeUnmount(() => {
            document.removeEventListener('pointerdown', closeOnOutside, true);
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
            () => [props.profile, props.spaced, props.submit, !!props.mentions, props.placeholder, props.label, props.readonly, props.disabled],
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

        // The text box tells assistive technology that a list can open under it and which item is current.
        watch(
            [() => trigger.value !== null && people.value.length > 0, chosen, editor],
            ([open, index, handle]) => {
                const dom = handle?.view.dom;
                if (!dom || !props.mentions) return;
                dom.setAttribute('aria-haspopup', 'listbox');
                dom.setAttribute('aria-autocomplete', 'list');
                if (open) {
                    dom.setAttribute('aria-controls', listId);
                    dom.setAttribute('aria-activedescendant', `${listId}-${index}`);
                } else {
                    dom.removeAttribute('aria-controls');
                    dom.removeAttribute('aria-activedescendant');
                }
            },
            { flush: 'post' },
        );

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
            const profile = resolveProfile(props.profile);
            const marks = profile.marks as readonly string[];
            const features = (profile.features ?? []) as readonly string[];
            const locked = props.disabled || props.readonly;
            // Normal size by default (our decision, against the guide's small for tool panels: this field and its emoji are
            // the thing people use, not a side tool). The app can still choose through `size`.
            const toolSize: TaoSize | undefined = props.size;
            // A click must not take the focus (and with it the selection) from the editor.
            const keepFocus = (event: MouseEvent): void => event.preventDefault();

            // One kind of tool button: an icon, a name, maybe a key and a pressed state, and what it does.
            const tool = (label: string, icon: string, run: () => void, opts: { shortcut?: string; pressed?: boolean; off?: boolean; class?: string } = {}): VNode => {
                const act = (): void => {
                    run();
                    handle?.focus();
                };
                return h(TaoButton, {
                    icon,
                    variant: 'ghost',
                    // a tool is not the main action: neutral keeps the accent for what is on (TaoUI Guide, the accent budget)
                    tone: 'neutral',
                    size: toolSize,
                    shortcut: opts.shortcut, // TaoButton (5.30+) puts it into the tooltip, "Bold (Ctrl+B)", and aria-keyshortcuts
                    disabled: locked || !!opts.off,
                    'aria-label': label,
                    // not even `title: undefined`: an own key would override the tooltip TaoButton builds from the shortcut
                    ...(opts.shortcut ? {} : { title: label }),
                    ...(opts.class ? { class: opts.class } : {}),
                    onMousedown: (event: MouseEvent) => {
                        keepFocus(event);
                        // the popup is placed under the button that was pressed: it may be in the row or in the panel of the toolbar's overflow
                        if (opts.class) anchors.set(opts.class, event.currentTarget as HTMLElement);
                    },
                    ...(opts.pressed === undefined ? { onClick: act } : { pressed: opts.pressed, 'onUpdate:pressed': act }),
                });
            };

            const nodes = profile.nodes as readonly string[];
            // The order of Gmail's bar: undo and redo, the marks, the blocks, clear formatting.
            const history = !features.includes('history') ? [] : [
                tool(text.undo, 'tao-undo', () => handle?.undo(), { off: !(handle?.canUndo() ?? false) }),
                tool(text.redo, 'tao-redo', () => handle?.redo(), { off: !(handle?.canRedo() ?? false) }),
            ];
            // like Gmail's groups: the style and the size, then the marks and colours, then the blocks
            const styleTools = [
                ...(nodes.includes('heading')
                    ? [tool(text.blockStyle, 'te-heading', () => toggleMenu('style'), { pressed: styleOpen.value, class: 'tao-editor-style-button' })]
                    : []),
                ...(marks.includes('size')
                    ? [tool(text.size, 'te-size', () => toggleMenu('size'), { pressed: sizeOpen.value, class: 'tao-editor-size-button' })]
                    : []),
            ];
            const markTools = [
                // the code block stands next to the inline code: the two are one idea
                ...MARK_BUTTONS.filter((b) => marks.includes(b.mark)).flatMap((b) => [
                    tool(text[b.mark], b.icon, () => handle?.toggleMark(b.mark), { shortcut: b.shortcut, pressed: handle?.isMarkActive(b.mark) ?? false }),
                    ...(b.mark === 'code' && nodes.includes('codeBlock')
                        ? [tool(text.codeBlock, 'te-code-block', () => handle?.toggleCodeBlock(), { pressed: handle?.isBlockActive('codeBlock') ?? false })]
                        : []),
                ]),
                ...(marks.includes('link')
                    ? [
                          tool(text.link, 'te-link', () => {
                              linkOpen.value = !linkOpen.value;
                              linkError.value = false;
                          }, { pressed: linkOpen.value || (handle?.isMarkActive('link') ?? false) }),
                      ]
                    : []),
                ...(marks.includes('color') || marks.includes('background')
                    ? [
                          tool(text.colors, 'te-color', () => {
                              toggleMenu('colors');
                          }, { pressed: colorsOpen.value, class: 'tao-editor-colors-button' }),
                      ]
                    : []),
            ];
            const alignIcon = { left: 'tao-align-left', center: 'tao-align-center', right: 'tao-align-right', justify: 'te-align-justify' }[handle?.alignOf() ?? 'left'];
            const blockTools = [
                ...(features.includes('align')
                    ? [tool(text.align, alignIcon, () => toggleMenu('align'), { pressed: alignOpen.value, class: 'tao-editor-align-button' })]
                    : []),
                ...(nodes.includes('orderedList') ? [tool(text.numbered, 'te-list-ordered', () => handle?.toggleList('orderedList'), { shortcut: key('7', true), pressed: handle?.isBlockActive('orderedList') ?? false })] : []),
                ...(nodes.includes('bulletList') ? [tool(text.bulleted, 'te-list-bullet', () => handle?.toggleList('bulletList'), { shortcut: key('8', true), pressed: handle?.isBlockActive('bulletList') ?? false })] : []),
                ...(features.includes('indent')
                    ? [
                          tool(text.outdent, 'te-outdent', () => handle?.outdent(), { off: !(handle?.canOutdent() ?? false) }),
                          tool(text.indent, 'te-indent', () => handle?.indent(), { off: !(handle?.canIndent() ?? false) }),
                      ]
                    : []),
                ...(nodes.includes('blockquote') ? [tool(text.quote, 'te-quote', () => handle?.toggleQuote(), { shortcut: key('9', true), pressed: handle?.isBlockActive('blockquote') ?? false })] : []),
                ...(nodes.includes('table') ? [tool(text.table, 'te-table', () => {
                    tableFrom.value = 'toolbar';
                    toggleMenu('table');
                }, { pressed: (tableOpen.value && tableFrom.value === 'toolbar') || (handle?.inTable() ?? false), class: 'tao-editor-table-button' })] : []),
            ];
            const clearTools = marks.some((m) => m !== 'link') ? [tool(text.clear, 'te-clear', () => handle?.clearFormatting())] : [];

            const panel: VNode[] = [];
            if (props.toolbar) {
                const groups = [history, styleTools, markTools, blockTools, clearTools].filter((g) => g.length > 0);
                panel.push(
                    h(TaoToolbar, { key: 'toolbar', label: text.toolbar, size: toolSize, variant: 'plain', class: 'tao-editor-toolbar', ...(props.floating ? {} : { overflow: true, overflowLabel: text.more }) }, () =>
                        groups.flatMap((group, i) => [...(i > 0 ? [h(TaoToolbarSeparator, { key: `sep-${i}` })] : []), h(TaoToolbarGroup, { key: `group-${i}`, pinned: i === 0 }, () => group)]),
                    ),
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
            const overlays: VNode[] = [];
            if (props.toolbar && colorsOpen.value && marks.includes('color')) {
                // Arrow keys walk the swatches of a section; only one swatch is a Tab stop, the rest is reached by arrows.
                const swatchKeys = (event: KeyboardEvent): void => {
                    const all = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.tao-editor-swatch')];
                    const at = all.indexOf(event.target as HTMLElement);
                    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 10, ArrowUp: -10 };
                    if (at < 0 || step[event.key] === undefined) return;
                    event.preventDefault();
                    const next = all[Math.max(0, Math.min(all.length - 1, at + step[event.key]))];
                    all.forEach((el) => (el.tabIndex = -1));
                    next.tabIndex = 0;
                    next.focus();
                };
                const section = (kind: 'color' | 'background', title: string): VNode => {
                    const current = handle?.colorOf(kind) ?? null;
                    return h('div', { class: 'tao-editor-colors-section' }, [
                        h('div', { class: 'tao-editor-colors-head' }, [
                            h('span', { class: 'tao-editor-colors-title' }, title),
                            h(
                                TaoButton,
                                {
                                    variant: 'text',
                                    tone: 'neutral',
                                    size: toolSize,
                                    disabled: current === null,
                                    onMousedown: keepFocus,
                                    onClick: () => {
                                        handle?.setColor(kind, null);
                                        handle?.focus();
                                    },
                                },
                                () => text.colorReset,
                            ),
                        ]),
                        h(
                            'div',
                            { class: 'tao-editor-swatches', role: 'group', 'aria-label': title, onKeydown: swatchKeys },
                            PALETTE.map((hex, i) =>
                                h('button', {
                                    key: hex,
                                    type: 'button',
                                    class: ['tao-editor-swatch', { 'tao-editor-swatch--on': hex === current }],
                                    style: { backgroundColor: hex },
                                    title: hex,
                                    'aria-label': `${title} ${hex}`,
                                    'aria-pressed': String(hex === current),
                                    tabindex: i === 0 ? 0 : -1,
                                    onMousedown: keepFocus,
                                    onClick: () => {
                                        handle?.setColor(kind, hex);
                                        handle?.focus();
                                    },
                                }),
                            ),
                        ),
                        h(TaoColorInput, {
                            modelValue: current ?? '',
                            size: toolSize,
                            placeholder: text.colorCustom,
                            chooseLabel: text.colorCustom,
                            'onUpdate:modelValue': (hex: string) => {
                                if (hex) handle?.setColor(kind, hex);
                            },
                        }),
                    ]);
                };
                overlays.push(
                    h(
                        'div',
                        {
                            key: 'colors',
                            class: 'tao-editor-colors',
                            'data-tao-keep-open': '',
                            // not drawn until its place is measured, so it never flashes in the corner
                            style: colorsPos.value ? { left: `${colorsPos.value.left}px`, top: `${colorsPos.value.top}px` } : { left: '0px', top: '0px', visibility: 'hidden' },
                            role: 'group',
                            'aria-label': text.colors,
                            onKeydown: (event: KeyboardEvent) => {
                                if (event.key !== 'Escape') return;
                                colorsOpen.value = false;
                                handle?.focus();
                            },
                        },
                        [...(marks.includes('color') ? [section('color', text.colorText)] : []), ...(marks.includes('background') ? [section('background', text.colorBackground)] : [])],
                    ),
                );
            }
            const hasSelection = handle ? !handle.view.state.selection.empty : false;
            const showFloating = props.floating && props.toolbar && !locked && ((hasSelection && focused.value) || linkOpen.value || colorsOpen.value || alignOpen.value || sizeOpen.value || styleOpen.value || tableOpen.value);
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
            const placed = (at: { left: number; top: number } | null): Record<string, string> =>
                at ? { left: `${at.left}px`, top: `${at.top}px` } : { left: '0px', top: '0px', visibility: 'hidden' };
            if (props.toolbar && alignOpen.value && features.includes('align')) {
                const choices: [Parameters<NonNullable<typeof handle>['setAlign']>[0], keyof TaoEditorLabels, string][] = [
                    ['left', 'alignLeft', 'tao-align-left'],
                    ['center', 'alignCenter', 'tao-align-center'],
                    ['right', 'alignRight', 'tao-align-right'],
                    ['justify', 'alignJustify', 'te-align-justify'],
                ];
                overlays.push(
                    h(
                        'div',
                        {
                            key: 'align',
                            class: 'tao-editor-menu tao-editor-align',
                            'data-tao-keep-open': '',
                            role: 'group',
                            'aria-label': text.align,
                            style: placed(alignPos.value),
                        },
                        choices.map(([value, label, icon]) =>
                            h(TaoButton, {
                                key: value,
                                icon,
                                variant: 'ghost',
                                tone: 'neutral',
                                size: toolSize,
                                pressed: handle?.alignOf() === value,
                                'aria-label': text[label],
                                title: text[label],
                                onMousedown: keepFocus,
                                'onUpdate:pressed': () => {
                                    handle?.setAlign(value);
                                    alignOpen.value = false;
                                    handle?.focus();
                                },
                            }),
                        ),
                    ),
                );
            }
            if (props.toolbar && sizeOpen.value && marks.includes('size')) {
                const choices: [(typeof SIZES)[number] | null, keyof TaoEditorLabels, string][] = [
                    ['small', 'sizeSmall', '0.8em'],
                    [null, 'sizeNormal', '1em'],
                    ['large', 'sizeLarge', '1.4em'],
                    ['huge', 'sizeHuge', '2em'],
                ];
                overlays.push(
                    h(
                        'div',
                        {
                            key: 'size',
                            class: 'tao-editor-menu tao-editor-size',
                            'data-tao-keep-open': '',
                            role: 'group',
                            'aria-label': text.size,
                            style: placed(sizePos.value),
                        },
                        choices.map(([value, label, fontSize]) =>
                            h(
                                TaoButton,
                                {
                                    key: label,
                                    variant: 'ghost',
                                    tone: 'neutral',
                                    size: toolSize,
                                    pressed: (handle?.sizeOf() ?? null) === value,
                                    style: { fontSize, justifyContent: 'flex-start' },
                                    onMousedown: keepFocus,
                                    'onUpdate:pressed': () => {
                                        handle?.setSize(value);
                                        sizeOpen.value = false;
                                        handle?.focus();
                                    },
                                },
                                () => text[label],
                            ),
                        ),
                    ),
                );
            }
            if (props.toolbar && styleOpen.value && nodes.includes('heading')) {
                const choices: [Parameters<NonNullable<typeof handle>['setBlockStyle']>[0], keyof TaoEditorLabels, Record<string, string>, string | undefined][] = [
                    ['paragraph', 'styleNormal', { fontSize: '1em' }, key('0', false, true)],
                    [1, 'styleHeading1', { fontSize: '1.6em', fontWeight: '700' }, key('1', false, true)],
                    [2, 'styleHeading2', { fontSize: '1.3em', fontWeight: '700' }, key('2', false, true)],
                    [3, 'styleHeading3', { fontSize: '1.1em', fontWeight: '700' }, key('3', false, true)],
                ];
                overlays.push(
                    h(
                        'div',
                        {
                            key: 'style',
                            class: 'tao-editor-menu tao-editor-style',
                            'data-tao-keep-open': '',
                            role: 'group',
                            'aria-label': text.blockStyle,
                            style: placed(stylePos.value),
                        },
                        choices.map(([value, label, look, shortcut]) =>
                            h(
                                TaoButton,
                                {
                                    key: label,
                                    variant: 'ghost',
                                    tone: 'neutral',
                                    size: toolSize,
                                    pressed: handle?.blockStyleAt() === value,
                                    shortcut,
                                    style: { ...look, justifyContent: 'flex-start' },
                                    'onUpdate:pressed': () => {
                                        handle?.setBlockStyle(value);
                                        styleOpen.value = false;
                                        handle?.focus();
                                    },
                                    onMousedown: keepFocus,
                                },
                                () => text[label],
                            ),
                        ),
                    ),
                );
            }
            if (tableOpen.value && nodes.includes('table') && (props.toolbar || tableFrom.value === 'cell') && (tableFrom.value === 'toolbar' || (handle?.inTable() ?? false))) {
                const finish = (): void => {
                    tableOpen.value = false;
                    handle?.focus();
                };
                let body: VNode[];
                if (handle?.inTable()) {
                    // in a table: what can be done to it
                    body = TABLE_MENU.flatMap(([name, label, icon], i) => [
                        ...(i > 0 && (i === 3 || i === 6) ? [h('div', { key: `sep-${i}`, class: 'tao-editor-menu-sep', role: 'separator' })] : []),
                        h(
                            TaoButton,
                            {
                                key: name,
                                ...(icon ? { icon } : {}),
                                variant: 'ghost',
                                tone: 'neutral',
                                size: toolSize,
                                disabled: !handle.canTableCommand(name),
                                style: { justifyContent: 'flex-start' },
                                onMousedown: keepFocus,
                                onClick: () => {
                                    handle.tableCommand(name);
                                    finish();
                                },
                            },
                            () => text[label],
                        ),
                    ]);
                } else {
                    // outside: point at the size of a new table
                    const cells: VNode[] = [];
                    for (let row = 0; row < GRID_ROWS; row++) {
                        for (let column = 0; column < GRID_COLUMNS; column++) {
                            const at = { row, column };
                            cells.push(
                                h('button', {
                                    key: `${row}-${column}`,
                                    type: 'button',
                                    class: ['tao-editor-grid-cell', { 'tao-editor-grid-cell--on': row <= gridAt.value.row && column <= gridAt.value.column }],
                                    'aria-label': `${column + 1} × ${row + 1}`,
                                    tabindex: row === 0 && column === 0 ? 0 : -1,
                                    onMousedown: keepFocus,
                                    onMouseenter: () => (gridAt.value = at),
                                    onFocus: () => (gridAt.value = at),
                                    onClick: () => {
                                        handle?.insertTable(row + 1, column + 1);
                                        finish();
                                    },
                                }),
                            );
                        }
                    }
                    // arrows walk the grid; only one cell is a Tab stop
                    const gridKeys = (event: KeyboardEvent): void => {
                        const all = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.tao-editor-grid-cell')];
                        const index = all.indexOf(event.target as HTMLElement);
                        const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: GRID_COLUMNS, ArrowUp: -GRID_COLUMNS };
                        if (index < 0 || step[event.key] === undefined) return;
                        event.preventDefault();
                        const next = all[Math.max(0, Math.min(all.length - 1, index + step[event.key]))];
                        all.forEach((el) => (el.tabIndex = -1));
                        next.tabIndex = 0;
                        next.focus();
                    };
                    body = [
                        h('div', { key: 'grid', class: 'tao-editor-grid', role: 'group', 'aria-label': text.tableGrid, onKeydown: gridKeys }, cells),
                        h('div', { key: 'size', class: 'tao-editor-grid-label', 'aria-live': 'polite' }, `${gridAt.value.column + 1} × ${gridAt.value.row + 1}`),
                    ];
                }
                overlays.push(
                    h(
                        'div',
                        {
                            key: 'table',
                            class: 'tao-editor-menu tao-editor-table',
                            'data-tao-keep-open': '',
                            role: 'group',
                            'aria-label': text.table,
                            style: placed(tablePos.value),
                            onKeydown: (event: KeyboardEvent) => {
                                if (event.key === 'Escape') finish();
                            },
                        },
                        body,
                    ),
                );
            }
            children.push(...overlays);
            if (nodes.includes('table') && !locked && cellAnchor.value && (handle?.inTable() ?? false)) {
                children.push(
                    h(TaoButton, {
                        key: 'cell-button',
                        class: 'tao-editor-cell-button',
                        // small on purpose: it sits on the cell, over the text. Inline: TaoButton sets its own `position`.
                        style: { position: 'absolute', left: `${cellAnchor.value.left}px`, top: `${cellAnchor.value.top}px`, zIndex: 1 },
                        icon: 'te-dots',
                        variant: 'ghost',
                        tone: 'neutral',
                        size: 'small',
                        pressed: tableOpen.value && tableFrom.value === 'cell',
                        'aria-label': text.table,
                        title: text.table,
                        onMousedown: keepFocus,
                        'onUpdate:pressed': () => {
                            tableFrom.value = 'cell';
                            toggleMenu('table');
                            handle?.focus();
                        },
                    }),
                );
            }
            if (trigger.value && people.value.length > 0) {
                const left = Math.max(0, Math.min(suggestAt.value.x, (root.value?.clientWidth ?? 0) - 220));
                children.push(
                    h(
                        'div',
                        {
                            key: 'people',
                            id: listId,
                            class: 'tao-editor-suggest',
                            role: 'listbox',
                            'aria-label': text.mentionList,
                            style: { left: `${left}px`, top: `${suggestAt.value.y + 4}px` },
                            onMousedown: keepFocus,
                        },
                        people.value.map((item, i) =>
                            h(
                                'div',
                                {
                                    key: item.id,
                                    id: `${listId}-${i}`,
                                    role: 'option',
                                    'aria-selected': String(i === chosen.value),
                                    class: ['tao-editor-suggest-item', { 'tao-editor-suggest-item--active': i === chosen.value }],
                                    onMouseenter: () => (chosen.value = i),
                                    onClick: () => choose(item),
                                },
                                [h('span', { class: 'tao-editor-suggest-label' }, item.label), item.hint ? h('span', { class: 'tao-editor-suggest-hint' }, item.hint) : null],
                            ),
                        ),
                    ),
                );
            }
            if (props.emoji && !locked) {
                if (emojiOpen.value) {
                    children.push(
                        h(
                            'div',
                            {
                                key: 'emoji-panel',
                                class: 'tao-editor-emoji',
                                role: 'group',
                                'aria-label': text.emojiList,
                                onKeydown: (event: KeyboardEvent) => {
                                    if (event.key === 'Escape') emojiOpen.value = false;
                                },
                            },
                            (props.emojiList ?? DEFAULT_EMOJI).map((symbol) =>
                                h(
                                    TaoButton,
                                    {
                                        key: symbol,
                                        variant: 'ghost',
                                        tone: 'neutral',
                                        size: toolSize,
                                        // the emoji itself is the picture: bigger than the label text of a button
                                        // a cell of the grid, not a button with side padding; the grid gives it its width
                                        style: { fontSize: '1.4em', padding: '0', minWidth: '0', width: 'auto' },
                                        'aria-label': symbol,
                                        onMousedown: keepFocus,
                                        onClick: () => handle?.insertText(symbol),
                                    },
                                    () => symbol,
                                ),
                            ),
                        ),
                    );
                }
                children.push(
                    h(TaoButton, {
                        key: 'emoji-button',
                        class: 'tao-editor-emoji-button',
                        // inline: TaoButton sets its own `position` and is loaded after our stylesheet, so a class would lose
                        style: { position: 'absolute', right: '0.25em', bottom: '0.25em', zIndex: 1 },
                        icon: 'te-emoji',
                        variant: 'ghost',
                        tone: 'neutral',
                        size: toolSize,
                        pressed: emojiOpen.value,
                        'aria-label': text.emoji,
                        title: text.emoji,
                        onMousedown: keepFocus,
                        'onUpdate:pressed': () => {
                            const was = emojiOpen.value;
                            closeMenus();
                            emojiOpen.value = !was;
                            handle?.focus();
                        },
                    }),
                );
            }
            children.push(h('div', { key: 'host', class: 'tao-editor-host', ref: host }));
            return h(
                'div',
                {
                    ref: root,
                    class: ['tao-editor-root', { 'tao-editor-root--disabled': props.disabled, 'tao-editor-root--sticky': props.sticky && !props.floating }],
                    // a number is px; the string is a CSS length (not checked: it only goes into a custom property)
                    style: props.maxHeight === undefined ? undefined : { '--te-max-height': typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight },
                    onFocusin: () => (focused.value = true),
                    onFocusout: (event: FocusEvent) => {
                        if (!root.value?.contains(event.relatedTarget as Node | null)) {
                            focused.value = false;
                            emojiOpen.value = false;
                        }
                    },
                },
                children,
            );
        };
    },
});
