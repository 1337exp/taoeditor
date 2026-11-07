/**
 * Choosing what a project uses. A profile is the allowlist of what a document may contain; these two functions make
 * a profile for a project from the ready ones (`chat`, `comment`, `article`) or from nothing. Whatever the profile
 * leaves out is gone everywhere at once: its button is not in the toolbar, its hotkey does nothing, pasted text that
 * had it comes in as plain text, a stored document that has it is shown without it. Typos throw, they never pass quietly.
 *
 * Выбор того, что использует проект. Профиль — белый список того, что может содержать документ; эти две функции
 * делают профиль под проект из готовых (`chat`, `comment`, `article`) или с нуля. Чего профиль не содержит, нет
 * везде сразу: нет кнопки в панели, не работает горячая клавиша, вставленный текст с этим приходит простым, в
 * сохранённом документе показывается без этого. Опечатки бросают ошибку, молча не проходят.
 */
import { MARKS, NODES, PROFILES, TABLE_PARTS, type Profile, type ProfileName } from './schema';

/**
 * Features that are not a node or a mark: `indent` and `align` are attributes of a block; `history` is the Undo and Redo buttons of the
 * toolbar (the keys always work).
 * Возможности, которые не узел и не марка: `indent` и `align` атрибуты блока; `history` кнопки отмены и повтора в панели (клавиши работают всегда).
 */
export const FEATURES: readonly string[] = ['indent', 'align', 'history'];

export const resolveProfile = (profile: ProfileName | Profile): Profile => (typeof profile === 'string' ? PROFILES[profile] : profile);

export interface Removal {
    marks?: readonly string[];
    nodes?: readonly string[];
    features?: readonly string[];
}

function known(kind: string, names: readonly string[], test: (name: string) => boolean): void {
    for (const name of names) if (!test(name)) throw new Error(`taoeditor: unknown ${kind} "${name}"`);
}

const isNode = (name: string): boolean => Object.hasOwn(NODES, name) && name !== 'doc';
const isMark = (name: string): boolean => Object.hasOwn(MARKS, name);
const isFeature = (name: string): boolean => FEATURES.includes(name);

/** `table` and its parts go together: no table without rows and cells, no rows and cells without a table. */
function tableParts(nodes: readonly string[]): string[] {
    const whole = nodes.includes('table') && nodes.includes('tableRow') && (nodes.includes('tableCell') || nodes.includes('tableHeader'));
    return nodes.filter((n) => n !== 'table' && !TABLE_PARTS.includes(n as (typeof TABLE_PARTS)[number])).concat(whole ? nodes.filter((n) => n === 'table' || TABLE_PARTS.includes(n as (typeof TABLE_PARTS)[number])) : []);
}

/** A profile like `base` without the listed marks, nodes and features. Lists lose their items when no list is left. */
export function withoutFeatures(base: ProfileName | Profile, remove: Removal): Profile {
    const profile = resolveProfile(base);
    const marks = remove.marks ?? [];
    const nodes = remove.nodes ?? [];
    const features = remove.features ?? [];
    known('mark', marks, isMark);
    known('node', nodes, isNode);
    known('feature', features, isFeature);
    for (const name of nodes) if (name === 'paragraph' || name === 'text') throw new Error(`taoeditor: "${name}" cannot be removed`);
    // asking to remove `table` takes its parts with it
    const gone = nodes.includes('table') ? [...nodes, ...TABLE_PARTS] : nodes;
    let kept = tableParts(profile.nodes.filter((n) => !gone.includes(n)));
    if (!kept.includes('bulletList') && !kept.includes('orderedList')) kept = kept.filter((n) => n !== 'listItem');
    return {
        ...profile,
        name: `${profile.name}*`,
        nodes: kept,
        marks: profile.marks.filter((m) => !marks.includes(m)),
        features: (profile.features ?? []).filter((f) => !features.includes(f)),
    };
}

export interface ProfileSpec {
    name: string;
    nodes: readonly string[];
    marks: readonly string[];
    features?: readonly string[];
    /** A gap between paragraphs by default (an article). / Зазор между абзацами по умолчанию. */
    spaced?: boolean;
}

/** A profile from nothing. `paragraph` and `text` are always there; lists need `listItem`. */
export function defineProfile(spec: ProfileSpec): Profile {
    known('node', spec.nodes, isNode);
    known('mark', spec.marks, isMark);
    known('feature', spec.features ?? [], isFeature);
    const wanted = spec.nodes.includes('table') ? [...spec.nodes, ...TABLE_PARTS.filter((n) => !spec.nodes.includes(n))] : spec.nodes;
    const nodes = tableParts([...new Set(['paragraph', 'text', ...wanted])]);
    const hasList = nodes.includes('bulletList') || nodes.includes('orderedList');
    if (hasList && !nodes.includes('listItem')) nodes.push('listItem');
    if (!hasList && nodes.includes('listItem')) nodes.splice(nodes.indexOf('listItem'), 1);
    // `hardBreak` goes with `paragraph`: a paragraph without it could not hold a line break
    if (!nodes.includes('hardBreak')) nodes.push('hardBreak');
    return {
        name: spec.name,
        nodes,
        marks: [...spec.marks],
        features: [...(spec.features ?? [])],
        ...(spec.spaced === undefined ? {} : { spaced: spec.spaced }),
    };
}
