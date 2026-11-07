/**
 * The indent level of a pasted paragraph. Our own markup says it with a class (`tao-indent-2`); Google Docs, Word and
 * Gmail say it with a left margin (about 36pt or 40px a level), which is turned into the nearest level, at most 8.
 * Уровень отступа вставленного абзаца. Наша разметка говорит классом (`tao-indent-2`); Google Docs, Word и Gmail —
 * левым полем (около 36pt или 40px на уровень), оно переводится в ближайший уровень, не больше 8.
 */
export const MAX_INDENT = 8;

export function indentOf(dom: HTMLElement): number {
    const byClass = /(?:^|\s)tao-indent-([1-8])(?:\s|$)/.exec(dom.getAttribute('class') ?? '');
    if (byClass) return Number(byClass[1]);
    const margin = (dom.style.marginLeft || dom.style.paddingLeft || dom.style.marginInlineStart || '').trim();
    const parts = /^(-?[0-9.]+)(px|pt|em|rem)$/.exec(margin);
    if (!parts) return 0;
    const unit = parts[2];
    const px = Number(parts[1]) * (unit === 'pt' ? 4 / 3 : unit === 'px' ? 1 : 16);
    return Math.max(0, Math.min(MAX_INDENT, Math.round(px / 40)));
}
