/**
 * The one link allowlist for the whole editor: links, and later images and embeds.
 * Returns the normalized absolute URL, or `null` when the value is not allowed.
 *
 * Единый список разрешённых ссылок: ссылки, позже картинки и вставки.
 * Возвращает нормализованный абсолютный URL или `null`, если значение запрещено.
 */
export function safeUrl(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const value = input.trim();
    if (value.length === 0 || value.length > 2048) return null;
    // Any whitespace or control character inside is a smuggling attempt, not a link.
    if (/[\x00-\x20\x7F-\x9F]/.test(value)) return null;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.hostname === '') return null;
    // https://trusted.com@evil.com looks like one site and leads to another.
    if (url.username !== '' || url.password !== '') return null;
    return url.href;
}
