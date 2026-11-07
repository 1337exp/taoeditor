<script setup lang="ts">
import { TaoButton, TaoSegmented, TaoSegmentedOption } from '@1337exp/taoui';
import { PROFILES, toHtml, toPlainText, type Doc } from '@1337exp/taoeditor/core';
import { TaoEditorView } from '@1337exp/taoeditor/vue';
import { TaoEditor } from '@1337exp/taoeditor/vue/taoui';
import { computed, ref } from 'vue';
import { locale, t } from '../i18n';
import { editorLabelsRu } from '../locales/editorLabels.ru';
import { searchPeople } from '../people';
import { SAMPLE_ARTICLE } from '../samples';

const doc = ref<Doc | null>(JSON.parse(JSON.stringify(SAMPLE_ARTICLE)) as Doc);
const view = ref<'reader' | 'json' | 'html' | 'text'>('reader');

const labels = computed(() => (locale.value === 'ru' ? editorLabelsRu : undefined));

const output = computed(() => {
    if (view.value === 'json') return JSON.stringify(doc.value, null, 1);
    if (view.value === 'html') return doc.value ? toHtml(doc.value, PROFILES.article) : '';
    return doc.value ? toPlainText(doc.value) : '';
});

function load(): void {
    doc.value = JSON.parse(JSON.stringify(SAMPLE_ARTICLE)) as Doc;
}
function setView(value: string | number | boolean | undefined): void {
    if (value === 'reader' || value === 'json' || value === 'html' || value === 'text') view.value = value;
}
</script>

<template>
    <section class="section">
        <h2>{{ t('article.title') }}</h2>
        <p class="hint">{{ t('article.hint') }}</p>

        <TaoEditor v-model="doc" profile="article" emoji :mentions="searchPeople" :labels="labels" :label="t('article.title')" />
        <div class="row">
            <TaoButton variant="secondary" @click="load">{{ t('article.load') }}</TaoButton>
            <TaoButton variant="text" tone="neutral" @click="doc = null">{{ t('article.clear') }}</TaoButton>
            <TaoSegmented :model-value="view" aria-label="view" @update:model-value="setView">
                <TaoSegmentedOption value="reader" :label="t('article.reader')" />
                <TaoSegmentedOption value="json" label="JSON" />
                <TaoSegmentedOption value="html" label="HTML" />
                <TaoSegmentedOption value="text" :label="t('article.text')" />
            </TaoSegmented>
        </div>

        <div v-if="view === 'reader'" class="reader">
            <TaoEditorView :doc="doc" profile="article" class="tao-prose" />
        </div>
        <pre v-else class="json">{{ output }}</pre>
    </section>
</template>
