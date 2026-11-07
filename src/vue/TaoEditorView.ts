/**
 * Read-only view of a stored document, for comments, chat history, notes, articles. It is a Vue render function,
 * not a template and not `v-html`: every node comes from the core's render tree, which is already safe.
 * It does not load the editing engine, so a page that only shows text pays nothing for ProseMirror.
 * It takes no TaoUI import: under TaoUI add the class `tao-prose` to it (`<TaoEditorView class="tao-prose">`).
 *
 * Показ сохранённого документа без правки: комментарии, история чата, заметки, статьи. Это render-функция Vue,
 * не шаблон и не `v-html`: каждый узел берётся из дерева вывода ядра, оно уже безопасно. Движок редактирования не
 * грузится, поэтому страница, которая только показывает текст, ничего не платит за ProseMirror. Импорта TaoUI нет:
 * под TaoUI добавьте классу `tao-prose` (`<TaoEditorView class="tao-prose">`).
 */
import { computed, defineComponent, getCurrentInstance, h, onMounted, onUpdated, ref, shallowRef, type PropType, type VNode } from 'vue';
import { VOID_TAGS, resolveProfile, toRenderTree, type Doc, type Profile, type ProfileName, type RenderNode } from '../core';

export const TaoEditorView = defineComponent({
    name: 'TaoEditorView',
    props: {
        /** The stored document. Anything else renders as an empty paragraph. / Сохранённый документ. */
        doc: { type: null as unknown as PropType<Doc | null | undefined>, default: undefined },
        /** What to allow when showing. Default `article`, the widest. / Что разрешено при показе. */
        profile: { type: [String, Object] as PropType<ProfileName | Profile>, default: 'article' },
        /**
         * Space between paragraphs (a gap, as in an article) or none (Enter is a new line, as in a mail client or a chat).
         * Without it: a gap for `article`, none for the others. The stored document is the same either way.
         * Зазор между абзацами (как в статье) или без него (как в почте и чате). По умолчанию: зазор у `article`, у
         * остальных нет. Документ один и тот же.
         */
        spaced: { type: Boolean, default: undefined },
        /**
         * A long text is shown as this many lines with a button to open the rest (a comment in a feed). Counted with the line height of
         * the text (the `lh` unit: Chrome 109, Firefox 120, Safari 16.4). The button is there only when the text is longer; on a server the
         * text is shown in full, nothing is cut without a script to open it.
         * Длинный текст показывается столькими строками с кнопкой, которая открывает остальное (комментарий в ленте). Считается по высоте
         * строки текста. Кнопка есть только если текст длиннее; на сервере текст виден целиком: без скрипта, который его откроет, ничего не обрезается.
         */
        maxRows: { type: Number, default: undefined },
        /** Texts of the buttons (the viewer has no TaoUI: plain buttons). */
        moreLabel: { type: String, default: 'Show more' },
        lessLabel: { type: String, default: 'Show less' },
    },
    emits: {
        /** A mention was clicked (or Enter / Space on it): its id. Mentions are plain text unless something listens. */
        mention: (_id: string) => true,
    },
    setup(props, { emit }) {
        const instance = getCurrentInstance();
        // Spoilers the reader has opened, by their place in the document. The set belongs to one document object:
        // a different document starts closed, with no state to reset while rendering.
        const opened = shallowRef<{ doc: unknown; keys: ReadonlySet<string> }>({ doc: undefined, keys: new Set() });
        const isOpen = (key: string): boolean => opened.value.doc === props.doc && opened.value.keys.has(key);

        const tree = computed(() => {
            return toRenderTree(props.doc, resolveProfile(props.profile));
        });

        const toggle = (key: string): void => {
            const keys = new Set(opened.value.doc === props.doc ? opened.value.keys : []);
            if (!keys.delete(key)) keys.add(key);
            opened.value = { doc: props.doc, keys };
        };

        const node = (item: RenderNode): VNode | string => {
            if (typeof item === 'string') return item;
            const attrs: Record<string, unknown> = { ...item.attrs };
            const mentionId = item.attrs?.['data-mention'];
            // a mention is a button only when the app listens to it: a tab stop that does nothing is worse than none
            if (mentionId !== undefined && instance?.vnode.props && 'onMention' in instance.vnode.props) {
                attrs.role = 'button';
                attrs.tabindex = '0';
                attrs.onClick = () => emit('mention', mentionId);
                attrs.onKeydown = (event: KeyboardEvent) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    emit('mention', mentionId);
                };
            }
            if (item.spoiler !== undefined) {
                const key = item.spoiler;
                const shown = isOpen(key);
                if (shown) attrs.class = 'tao-spoiler tao-spoiler--open';
                attrs['aria-expanded'] = String(shown);
                attrs.onClick = () => toggle(key);
                attrs.onKeydown = (event: KeyboardEvent) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    toggle(key);
                };
            }
            return VOID_TAGS.has(item.tag) ? h(item.tag, attrs) : h(item.tag, attrs, item.children.map(node));
        };

        const compact = (): boolean => !(props.spaced ?? resolveProfile(props.profile).spaced ?? false);

        // `maxRows`: the text is cut to that many lines; after drawing we see whether it is longer, and only then there is a button
        const body = ref<HTMLElement | null>(null);
        const open = ref(false);
        const ready = ref(false); // after mounting: on a server (and before hydration) nothing is cut, there is no script to open it
        const longer = ref(false);
        const measure = (): void => {
            const el = body.value;
            if (!el || props.maxRows === undefined) return;
            // opened: the button stays (it closes again); cut: it is there if something is hidden
            if (!open.value) longer.value = el.scrollHeight > el.clientHeight + 1;
        };
        onMounted(() => {
            ready.value = true;
            measure();
        });
        onUpdated(measure);

        return () => {
            const rows = props.maxRows !== undefined && Number.isFinite(props.maxRows) && props.maxRows >= 1 ? Math.floor(props.maxRows) : undefined;
            const content = (extra?: Record<string, unknown>): VNode =>
                h('div', { class: compact() ? 'tao-content tao-compact' : 'tao-content', ...extra }, tree.value.map(node));
            if (rows === undefined) return content();
            // the class and the attributes of the host go to the outer box, the text and the button are inside it
            const cut = ready.value && !open.value;
            return h('div', { class: 'tao-content-clamp' }, [
                content({
                    ref: body,
                    class: [compact() ? 'tao-content tao-compact' : 'tao-content', { 'tao-content--clamped': cut, 'tao-content--faded': cut && longer.value }],
                    style: cut ? { '--te-rows': String(rows) } : undefined,
                }),
                longer.value
                    ? h('button', { type: 'button', class: 'tao-content-more', 'aria-expanded': String(open.value), onClick: () => (open.value = !open.value) }, open.value ? props.lessLabel : props.moreLabel)
                    : null,
            ]);
        };
    },
});
