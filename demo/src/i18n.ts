import { localeEn, localeRu, setTaoLocale } from '@1337exp/taoui';
import { createI18n } from '@1337exp/taoux/i18n';
import { watch } from 'vue';
import { en, type Dictionary } from './locales/en';
import { ru } from './locales/ru';

export const i18n = createI18n({
    locales: { en, ru } satisfies Record<string, Dictionary>,
    fallback: 'en',
    storageKey: 'taoeditor-demo.lang',
});

export const { t, locale } = i18n.useI18n();

/**
 * Picks the language (saved, else the browser's) and keeps the built-in texts of TaoUI in step with it.
 * Выбирает язык (сохранённый, иначе браузера) и держит встроенные тексты TaoUI в том же языке.
 */
export function initI18n(): void {
    i18n.initLocale();
    watch(i18n.current, (code) => setTaoLocale(code === 'ru' ? localeRu : localeEn), { immediate: true });
}
