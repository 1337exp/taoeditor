/**
 * The normalizer is the gate: everything that enters or leaves the editor, and everything a server
 * receives, goes through it. Input is untrusted JSON; output is always a canonical, valid document
 * for the given profile. It never throws and never keeps what it does not know:
 * unknown or forbidden nodes are unwrapped (their text survives), bad links lose the mark,
 * control characters are stripped, attributes equal to the default are omitted.
 *
 * Нормализатор — ворота: всё, что входит в редактор и выходит из него, и всё, что принимает сервер,
 * проходит через него. Вход — недоверенный JSON; выход — всегда канонический верный документ
 * для профиля. Не бросает исключений и не оставляет неизвестного: неизвестные и запрещённые узлы
 * разворачиваются (текст сохраняется), плохие ссылки теряют марку, управляющие символы удаляются,
 * атрибуты со значением по умолчанию не пишутся.
 */
import { DOC_VERSION, emptyDoc, type Attrs, type Doc, type DocMark, type DocNode } from './model';
import { childrenOf, MARK_ORDER, MARKS, NODES, type AttrSpec, type NodeSpec, type Profile } from './schema';

export type IssueCode = 'bad-doc' | 'bad-version' | 'unknown-node' | 'disallowed-node' | 'bad-attr' | 'bad-mark' | 'too-deep';

export interface Issue {
    code: IssueCode;
    /** JSON-pointer-like path to the offending value. / Путь к проблемному значению. */
    path: string;
}

export interface Normalized {
    doc: Doc;
    issues: Issue[];
}

/** Deeper nesting is dropped: protects every recursive reader. / Глубже отбрасывается: защита рекурсивных читателей. */
export const MAX_DEPTH = 12;

interface Ctx {
    profile: Profile;
    issues: Issue[];
}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const isObj = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const nodeSpec = (type: string): NodeSpec | undefined =>
    type !== 'doc' && Object.hasOwn(NODES, type) ? NODES[type] : undefined;

export function normalizeDoc(input: unknown, profile: Profile): Normalized {
    const ctx: Ctx = { profile, issues: [] };
    if (!isObj(input)) {
        ctx.issues.push({ code: 'bad-doc', path: '' });
        return { doc: emptyDoc(), issues: ctx.issues };
    }
    if (input.v !== DOC_VERSION) {
        ctx.issues.push({ code: 'bad-version', path: '/v' });
        return { doc: emptyDoc(), issues: ctx.issues };
    }
    const content = normalizeChildren(input.content, 'doc', '/content', 0, ctx);
    return {
        doc: { v: DOC_VERSION, content: content.length > 0 ? content : [{ type: 'paragraph' }] },
        issues: ctx.issues,
    };
}

function cleanAttrs(
    raw: unknown,
    specs: Readonly<Record<string, AttrSpec>> | undefined,
    path: string,
    ctx: Ctx,
): Attrs | undefined | null {
    if (!specs) return undefined;
    const source = isObj(raw) ? raw : {};
    const out: Attrs = {};
    for (const [name, spec] of Object.entries(specs)) {
        const value = spec.check(source[name]);
        if (value === undefined) {
            if (spec.required) {
                ctx.issues.push({ code: 'bad-attr', path: `${path}/attrs/${name}` });
                return null;
            }
            if (source[name] !== undefined && source[name] !== spec.default) {
                ctx.issues.push({ code: 'bad-attr', path: `${path}/attrs/${name}` });
            }
            continue;
        }
        if (value !== spec.default) out[name] = value;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function cleanMarks(raw: unknown, path: string, ctx: Ctx): DocMark[] | undefined {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw)) {
        ctx.issues.push({ code: 'bad-mark', path });
        return undefined;
    }
    const found = new Map<string, DocMark>();
    raw.forEach((item, i) => {
        const at = `${path}/${i}`;
        if (
            !isObj(item) ||
            typeof item.type !== 'string' ||
            !Object.hasOwn(MARKS, item.type) ||
            !ctx.profile.marks.includes(item.type)
        ) {
            ctx.issues.push({ code: 'bad-mark', path: at });
            return;
        }
        const attrs = cleanAttrs(item.attrs, MARKS[item.type].attrs, at, ctx);
        if (attrs === null) return;
        if (!found.has(item.type)) found.set(item.type, attrs ? { type: item.type, attrs } : { type: item.type });
    });
    const excluded = new Set<string>();
    for (const mark of found.values()) for (const other of MARKS[mark.type].excludes ?? []) excluded.add(other);
    const list = MARK_ORDER.filter((type) => found.has(type) && !excluded.has(type)).map((type) => found.get(type)!);
    return list.length > 0 ? list : undefined;
}

const sameMarks = (a: DocMark[] | undefined, b: DocMark[] | undefined): boolean =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function pushText(target: DocNode[], text: string, marks: DocMark[] | undefined): void {
    if (text === '') return;
    const last = target[target.length - 1];
    if (last && last.type === 'text' && sameMarks(last.marks, marks)) {
        last.text += text;
        return;
    }
    target.push(marks ? { type: 'text', text, marks } : { type: 'text', text });
}

/** How a newline inside text is stored. / Как хранится перевод строки внутри текста. */
function pushInline(target: DocNode[], text: string, marks: DocMark[] | undefined, mode: 'keep' | 'break' | 'space'): void {
    if (mode === 'keep') return pushText(target, text, marks);
    if (mode === 'space') return pushText(target, text.replace(/\n/g, ' '), marks);
    text.split('\n').forEach((part, i) => {
        if (i > 0) target.push({ type: 'hardBreak' });
        pushText(target, part, marks);
    });
}

function normalizeChildren(raw: unknown, parentType: string, path: string, depth: number, ctx: Ctx): DocNode[] {
    const parent = NODES[parentType];
    const allowed = new Set(childrenOf(parentType, ctx.profile));
    const out: DocNode[] = [];
    // Loose inline content inside a block container gets a paragraph around it.
    const wrap = allowed.has('paragraph') && !allowed.has('text');
    let run: DocNode[] = [];
    const flush = (): void => {
        if (run.length > 0) out.push({ type: 'paragraph', content: run });
        run = [];
    };

    const addText = (item: Record<string, unknown>, at: string): void => {
        const text = typeof item.text === 'string' ? item.text.replace(/\r\n?/g, '\n').replace(CONTROL, '') : '';
        if (text === '') return;
        if (allowed.has('text')) {
            const marks = parent.marks ? cleanMarks(item.marks, `${at}/marks`, ctx) : undefined;
            pushInline(out, text, marks, parent.code ? 'keep' : allowed.has('hardBreak') ? 'break' : 'space');
        } else if (wrap) {
            pushInline(run, text, cleanMarks(item.marks, `${at}/marks`, ctx), 'break');
        } else {
            ctx.issues.push({ code: 'disallowed-node', path: at });
        }
    };

    const walk = (list: unknown, at: string, d: number): void => {
        if (d > MAX_DEPTH) {
            ctx.issues.push({ code: 'too-deep', path: at });
            return;
        }
        if (!Array.isArray(list)) {
            if (list !== undefined) ctx.issues.push({ code: 'bad-doc', path: at });
            return;
        }
        list.forEach((item, i) => {
            const here = `${at}/${i}`;
            if (!isObj(item) || typeof item.type !== 'string') {
                ctx.issues.push({ code: 'bad-doc', path: here });
                return;
            }
            const type = item.type;
            if (type === 'text') return addText(item, here);
            const spec = nodeSpec(type);
            if (!spec || !ctx.profile.nodes.includes(type)) {
                ctx.issues.push({ code: spec ? 'disallowed-node' : 'unknown-node', path: here });
                walk(item.content, `${here}/content`, d + 1); // keep what is inside / оставляем содержимое
                return;
            }
            if (spec.kind === 'inline') {
                const atom = cleanNode(item, type, spec, here, d + 1, ctx);
                if (!atom) return;
                if (allowed.has(type)) out.push(atom);
                else if (wrap) run.push(atom);
                else ctx.issues.push({ code: 'disallowed-node', path: here });
                return;
            }
            if (!allowed.has(type)) {
                ctx.issues.push({ code: 'disallowed-node', path: here });
                walk(item.content, `${here}/content`, d + 1);
                return;
            }
            flush();
            const node = cleanNode(item, type, spec, here, d + 1, ctx);
            if (node) out.push(node);
        });
    };

    walk(raw, path, depth);
    flush();
    return out;
}

function cleanNode(
    raw: Record<string, unknown>,
    type: string,
    spec: NodeSpec,
    path: string,
    depth: number,
    ctx: Ctx,
): DocNode | null {
    const attrs = cleanAttrs(raw.attrs, spec.attrs, path, ctx);
    if (attrs === null) return null;
    const node: DocNode = { type };
    if (attrs) node.attrs = attrs;
    if (spec.children.length === 0) {
        // an inline atom (a mention) may carry marks, like text
        const marks = spec.marks ? cleanMarks(raw.marks, `${path}/marks`, ctx) : undefined;
        if (marks) node.marks = marks;
        return node;
    }
    const content = normalizeChildren(raw.content, type, `${path}/content`, depth, ctx);
    if (content.length === 0 && spec.required) return null;
    if (content.length > 0) node.content = content;
    return node;
}
