<script setup lang="ts">
import { TaoSegmented, TaoSegmentedOption, TaoTabs, TaoThemeToggle } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import { i18n, locale, t } from './i18n';
import ArticleDemo from './sections/ArticleDemo.vue';
import ChatDemo from './sections/ChatDemo.vue';
import CommentsDemo from './sections/CommentsDemo.vue';
import FeaturesDemo from './sections/FeaturesDemo.vue';
import { mode, type Mode } from './theme';

const tab = ref('comments');
const tabs = computed(() => [
    { value: 'comments', label: t('tabs.comments') },
    { value: 'chat', label: t('tabs.chat') },
    { value: 'article', label: t('tabs.article') },
    { value: 'features', label: t('tabs.features') },
]);

function setMode(next: Mode): void {
    mode.value = next;
}
function setLanguage(code: string | number | boolean | undefined): void {
    if (typeof code === 'string' && (i18n.codes as readonly string[]).includes(code)) i18n.setLocale(code as (typeof i18n.codes)[number]);
}
</script>

<template>
    <main class="page">
        <header class="page-head">
            <div>
                <h1>{{ t('app.title') }}</h1>
                <p>{{ t('app.tagline') }}</p>
            </div>
            <div class="page-tools">
                <TaoSegmented :model-value="locale" :aria-label="t('app.language')" @update:model-value="setLanguage">
                    <TaoSegmentedOption v-for="code in i18n.codes" :key="code" :value="code" :label="code.toUpperCase()" />
                </TaoSegmented>
                <TaoThemeToggle :model-value="mode" :apply="false" @update:model-value="setMode" />
            </div>
        </header>

        <TaoTabs v-model="tab" :items="tabs" />

        <!-- every section stays mounted, so a draft or a document is still there when you come back -->
        <CommentsDemo v-show="tab === 'comments'" />
        <ChatDemo v-show="tab === 'chat'" />
        <ArticleDemo v-show="tab === 'article'" />
        <FeaturesDemo v-show="tab === 'features'" />
    </main>
</template>
