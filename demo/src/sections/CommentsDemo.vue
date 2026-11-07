<script setup lang="ts">
import { TaoButton, confirm, toast } from '@1337exp/taoui';
import { isEmptyDoc, type Doc } from '@1337exp/taoeditor/core';
import { TaoEditorView } from '@1337exp/taoeditor/vue';
import { TaoEditor } from '@1337exp/taoeditor/vue/taoui';
import { computed, ref } from 'vue';
import { useDraft } from '../draft';
import { locale, t } from '../i18n';
import { editorLabelsRu } from '../locales/editorLabels.ru';
import { searchPeople } from '../people';
import { SEED_COMMENTS } from '../samples';

const draft = useDraft('taoeditor-demo.comment-draft');
const comments = ref(SEED_COMMENTS.map((c) => ({ ...c })));
let nextId = 100;

const labels = computed(() => (locale.value === 'ru' ? editorLabelsRu : undefined));
const canSend = computed(() => draft.doc.value !== null && !isEmptyDoc(draft.doc.value));

function send(doc: Doc | null): void {
    if (!doc || isEmptyDoc(doc)) return;
    comments.value.push({ id: nextId++, author: t('common.you'), doc: JSON.parse(JSON.stringify(doc)) as Doc });
    draft.clear();
}

async function remove(id: number): Promise<void> {
    const ok = await confirm(t('comments.deleteTitle'), { message: t('comments.deleteMessage'), ok: t('comments.delete'), danger: true });
    if (ok) comments.value = comments.value.filter((c) => c.id !== id);
}

function mentioned(id: string): void {
    toast().info().message(t('common.mention', [id]));
}
</script>

<template>
    <section class="section">
        <h2>{{ t('comments.title') }}</h2>
        <p class="hint">{{ t('comments.hint') }}</p>

        <TaoEditor
            v-model="draft.doc.value"
            profile="comment"
            submit="mod-enter"
            :min-rows="3"
            :max-rows="10"
            :mentions="searchPeople"
            :labels="labels"
            :placeholder="t('comments.placeholder')"
            :label="t('comments.title')"
            @send="send"
        />
        <div class="row end">
            <span class="status">
                <template v-if="draft.state.value === 'saved'">{{ t('comments.draftSaved') }}</template>
                <template v-else-if="draft.state.value === 'other'">{{ t('comments.draftOther') }}</template>
            </span>
            <TaoButton :disabled="!canSend" @click="send(draft.doc.value)">{{ t('comments.send') }}</TaoButton>
        </div>

        <div class="list">
            <div v-if="comments.length === 0" class="empty">{{ t('comments.empty') }}</div>
            <article v-for="comment in comments" :key="comment.id" class="card">
                <div class="card-head">
                    <strong>{{ comment.author }}</strong>
                    <TaoButton variant="text" tone="neutral" size="small" @click="remove(comment.id)">{{ t('comments.delete') }}</TaoButton>
                </div>
                <TaoEditorView :doc="comment.doc" profile="comment" class="tao-prose" :max-rows="4" :more-label="t('common.showMore')" :less-label="t('common.showLess')" @mention="mentioned" />
            </article>
        </div>
    </section>
</template>
