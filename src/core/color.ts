/**
 * Colours of text and background. The document stores one form only, `#rrggbb` in lower case; this reads the forms
 * that come from pasted pages (`#fff`, `rgb(255, 0, 0)`) and refuses everything else (names, `url(...)`, anything with
 * a semicolon), so a colour can never carry more than a colour into a style attribute.
 *
 * Цвета текста и фона. В документе одна форма, `#rrggbb` в нижнем регистре; здесь читаются формы из вставленных
 * страниц (`#fff`, `rgb(255, 0, 0)`), остальное отвергается (имена, `url(...)`, всё с точкой с запятой), поэтому
 * цвет никогда не принесёт в атрибут style ничего, кроме цвета.
 */
const HEX3 = /^#([0-9a-f]{3})$/;
const HEX6 = /^#([0-9a-f]{6})$/;
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*(\d*\.?\d+%?)\s*)?\)$/;

export function parseColor(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length > 40) return undefined;
    const v = value.trim().toLowerCase();
    const short = HEX3.exec(v);
    if (short) return '#' + [...short[1]].map((c) => c + c).join('');
    const long = HEX6.exec(v);
    if (long) return '#' + long[1];
    const rgb = RGB.exec(v);
    if (!rgb) return undefined;
    if (rgb[4] !== undefined) {
        const alpha = rgb[4].endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
        if (alpha !== 1) return undefined; // a see-through colour is not a colour we store
    }
    const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (channels.some((c) => c > 255)) return undefined;
    return '#' + channels.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Pasted pages put `color:#000000` on every run and `background:#ffffff` behind it: that is the page's paper, not a
 * choice, and pasting it would turn the text black on a dark theme. These are not taken from pasted HTML (the picker
 * can still set them on purpose).
 * Вставленные страницы ставят `color:#000000` на каждый кусок и `background:#ffffff` под него: это бумага страницы,
 * а не выбор, и вставка сделала бы текст чёрным на тёмной теме. Из вставленного HTML они не берутся (выбрать их
 * намеренно можно в палитре).
 */
export const isPageInk = (hex: string): boolean => hex === '#000000' || hex === '#ffffff';
