import { createSavedStorage } from '@1337exp/taoux/storage';
import { ref, watch } from 'vue';

export type Mode = 'dark' | 'light';

const storage = createSavedStorage('taoeditor-demo.theme');

export const mode = ref<Mode>('dark');

/**
 * The saved mode, else the system one. TaoUI themes itself from `data-tao-mode` on <html>.
 * Сохранённый режим, иначе системный. TaoUI красится по `data-tao-mode` на <html>.
 */
export function initTheme(): void {
    const saved = storage.read();
    mode.value = saved === 'light' || saved === 'dark' ? saved : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    watch(
        mode,
        (value) => {
            document.documentElement.dataset.taoMode = value;
            storage.write(value);
        },
        { immediate: true },
    );
}
