import { isEmptyDoc, type Doc } from '@1337exp/taoeditor/core';
import { createSavedStorage } from '@1337exp/taoux/storage';
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue';

/**
 * A draft that is saved as you type (TaoUX `storage`: it never throws, a broken copy is set aside) and follows you to
 * another tab of the same page. The editor is not involved: its document is plain JSON.
 * Черновик, который сохраняется на ходу (TaoUX `storage`: не бросает исключений, испорченная копия откладывается) и
 * идёт за вами в другую вкладку той же страницы. Редактор тут ни при чём: его документ это обычный JSON.
 */
export function useDraft(key: string) {
    const storage = createSavedStorage(key);
    const read = (): Doc | null => {
        const raw = storage.read();
        if (!raw) return null;
        try {
            return JSON.parse(raw) as Doc;
        } catch {
            storage.backupBroken(raw);
            return null;
        }
    };

    const doc = shallowRef<Doc | null>(read());
    const state = ref<'saved' | 'other' | null>(null);
    let timer: ReturnType<typeof setTimeout> | undefined;

    watch(doc, (next) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!next || isEmptyDoc(next)) {
                storage.remove();
                state.value = null;
            } else if (storage.write(JSON.stringify(next))) {
                state.value = 'saved';
            }
        }, 400);
    });

    const stop = storage.subscribe((text) => {
        if (text === null) {
            doc.value = null;
            return;
        }
        try {
            doc.value = JSON.parse(text) as Doc;
            state.value = 'other';
        } catch {
            // a half-written copy: wait for the next one
        }
    });
    onBeforeUnmount(() => {
        stop();
        clearTimeout(timer);
    });

    return {
        doc,
        state,
        clear(): void {
            doc.value = null;
            storage.remove();
            state.value = null;
        },
    };
}
