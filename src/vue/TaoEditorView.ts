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
import { computed, defineComponent, getCurrentInstance, h, shallowRef, type PropType, type VNode } from 'vue';
import { PROFILES, VOID_TAGS, toRenderTree, type Doc, type Profile, type ProfileName, type RenderNode } from '../core';

export const TaoEditorView = defineComponent({
    name: 'TaoEditorView',
    props: {
        /** The stored document. Anything else renders as an empty paragraph. / Сохранённый документ. */
        doc: { type: null as unknown as PropType<Doc | null | undefined>, default: undefined },
        /** What to allow when showing. Default `article`, the widest. / Что разрешено при показе. */
        profile: { type: [String, Object] as PropType<ProfileName | Profile>, default: 'article' },
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
            const profile = typeof props.profile === 'string' ? PROFILES[props.profile] : props.profile;
            return toRenderTree(props.doc, profile);
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

        return () => h('div', { class: 'tao-content' }, tree.value.map(node));
    },
});
