/**
 * Showing a stored document: the tree becomes a small render tree (tag, allowlisted attributes, children),
 * which is turned into HTML text here or into Vue nodes in `src/vue`. No DOM, so it runs on a server too
 * (previews, e-mails, SSR). The input is untrusted: it goes through the normalizer first, so the output
 * contains only what the profile allows. Text is always escaped; there is no way to put raw HTML in.
 *
 * Показ сохранённого документа: дерево становится маленьким деревом вывода (тег, разрешённые атрибуты, дети),
 * которое здесь превращается в HTML-текст, а в `src/vue` — в узлы Vue. Без DOM, поэтому работает и на сервере
 * (превью, письма, SSR). Вход недоверенный: сначала нормализатор, так что в выводе только то, что разрешает
 * профиль. Текст всегда экранируется; вставить сырой HTML нельзя.
 */
import type { DocMark, DocNode } from './model';
import { normalizeDoc } from './normalize';
import { PROFILES, type Profile } from './schema';

export interface RenderElement {
    tag: string;
    attrs?: Record<string, string>;
    children: RenderNode[];
    /**
     * Set on a spoiler: a stable id (its place in the document). A viewer uses it to remember which spoilers
     * the reader has opened. Absent on everything else.
     * Есть у спойлера: устойчивый id (место в документе), по нему показ помнит, какие спойлеры открыл читатель.
     */
    spoiler?: string;
}

export type RenderNode = RenderElement | string;

/** Tags without children and without a closing tag. / Теги без детей и без закрывающего. */
export const VOID_TAGS: ReadonlySet<string> = new Set(['br']);

/** `rel` of every link we render. / `rel` каждой выводимой ссылки. */
export const LINK_REL = 'noopener noreferrer nofollow ugc';

/** An indented paragraph or heading says its level with a class (`tao-indent-2`), never with an inline style. */
const indentClass = (node: DocNode): Record<string, string> | undefined =>
    typeof node.attrs?.indent === 'number' && node.attrs.indent > 0 ? { class: `tao-indent-${node.attrs.indent}` } : undefined;

const el = (tag: string, children: RenderNode[], attrs?: Record<string, string>): RenderElement =>
    attrs ? { tag, attrs, children } : { tag, children };

function wrapMark(mark: DocMark, child: RenderNode, path: string): RenderElement {
    switch (mark.type) {
        case 'link':
            return el('a', [child], { href: String(mark.attrs?.href ?? ''), rel: LINK_REL, target: '_blank' });
        case 'bold':
            return el('strong', [child]);
        case 'italic':
            return el('em', [child]);
        case 'underline':
            return el('u', [child]);
        case 'strike':
            return el('s', [child]);
        case 'code':
            return el('code', [child]);
        default: {
            // 'spoiler': the normalizer let nothing else through
            const node = el('span', [child], { class: 'tao-spoiler', role: 'button', tabindex: '0' });
            node.spoiler = path;
            return node;
        }
    }
}

function inline(nodes: readonly DocNode[] | undefined, path: string): RenderNode[] {
    const out: RenderNode[] = [];
    (nodes ?? []).forEach((node, i) => {
        if (node.type === 'hardBreak') {
            out.push(el('br', []));
            return;
        }
        let rendered: RenderNode =
            node.type === 'mention'
                ? el('span', [`@${node.attrs?.label ?? ''}`], { class: 'tao-mention', 'data-mention': String(node.attrs?.id ?? '') })
                : (node.text ?? '');
        // marks are in canonical order, the first is the outermost: wrap from the last one
        const marks = node.marks ?? [];
        for (let m = marks.length - 1; m >= 0; m--) rendered = wrapMark(marks[m], rendered, `${path}.${i}.${m}`);
        out.push(rendered);
    });
    return out;
}

function block(node: DocNode, path: string): RenderElement {
    const kids = (): RenderNode[] => (node.content ?? []).map((child, i) => block(child, `${path}.${i}`));
    switch (node.type) {
        case 'heading':
            return el(`h${node.attrs?.level ?? 1}`, inline(node.content, path), indentClass(node));
        case 'blockquote':
            return el('blockquote', kids());
        case 'codeBlock': {
            const code = el('code', [(node.content ?? []).map((t) => t.text ?? '').join('')]);
            return el('pre', [code], node.attrs?.lang ? { 'data-lang': String(node.attrs.lang) } : undefined);
        }
        case 'bulletList':
            return el('ul', kids());
        case 'orderedList':
            return el('ol', kids(), node.attrs?.start && node.attrs.start !== 1 ? { start: String(node.attrs.start) } : undefined);
        case 'listItem':
            return el('li', kids());
        default: {
            // 'paragraph'. An empty one keeps its height, like the engine's trailing break.
            const children = inline(node.content, path);
            return el('p', children.length > 0 ? children : [el('br', [])], indentClass(node));
        }
    }
}

/**
 * The render tree of a document. `input` is anything: it is normalized for `profile` first
 * (default `article`, the widest: the viewer should not hide what a wider profile saved).
 * Дерево вывода документа. `input` — что угодно: сначала нормализуется под `profile`
 * (по умолчанию `article`, самый широкий: показ не должен прятать то, что сохранил более широкий профиль).
 */
export function toRenderTree(input: unknown, profile: Profile = PROFILES.article): RenderElement[] {
    const { doc } = normalizeDoc(input, profile);
    return doc.content.map((node, i) => block(node, String(i)));
}

const escapeText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value: string): string => escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * A render tree as HTML text. Text and attribute values are escaped; tags and attribute names are taken as they are,
 * so pass only trees made by `toRenderTree`.
 * Дерево вывода как HTML-текст. Текст и значения атрибутов экранируются; теги и имена атрибутов берутся как есть,
 * поэтому передавайте только деревья из `toRenderTree`.
 */
export function serializeTree(nodes: readonly RenderNode[]): string {
    return nodes.map(serializeNode).join('');
}

function serializeNode(node: RenderNode): string {
    if (typeof node === 'string') return escapeText(node);
    const attrs = Object.entries(node.attrs ?? {})
        .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
        .join('');
    if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrs}>`;
    return `<${node.tag}${attrs}>${node.children.map(serializeNode).join('')}</${node.tag}>`;
}

/**
 * Safe HTML for a document (for e-mails, SSR, previews where Vue is not at hand). Attribute names and tags
 * come from this file, values and text are escaped. A spoiler is a plain `span.tao-spoiler`: without
 * script it stays hidden by CSS, so use the Vue view when readers must be able to open it.
 * Безопасный HTML документа (для писем, SSR, превью без Vue). Имена атрибутов и теги из этого файла,
 * значения и текст экранируются. Спойлер — обычный `span.tao-spoiler`: без скрипта он остаётся скрыт CSS,
 * поэтому там, где читатель должен его открыть, берите Vue-показ.
 */
export function toHtml(input: unknown, profile: Profile = PROFILES.article): string {
    return serializeTree(toRenderTree(input, profile));
}
