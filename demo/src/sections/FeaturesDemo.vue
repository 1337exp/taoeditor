<script setup lang="ts">
import { TaoButton, TaoSegmented, TaoSegmentedOption, TaoSwitch } from '@1337exp/taoui';
import { MARK_ORDER, PROFILES, defineProfile, type Doc, type Profile, type ProfileName } from '@1337exp/taoeditor/core';
import type { EditorHandle } from '@1337exp/taoeditor/editor';
import { TaoEditorView } from '@1337exp/taoeditor/vue';
import { TaoEditor } from '@1337exp/taoeditor/vue/taoui';
import { computed, reactive, ref, watch } from 'vue';
import { locale, t } from '../i18n';
import { editorLabelsRu } from '../locales/editorLabels.ru';
import { searchPeople } from '../people';
import { PASTE_SAMPLES } from '../samples';

const BLOCKS = ['blockquote', 'codeBlock', 'bulletList', 'orderedList', 'heading', 'table'] as const;
const INLINE = ['mention'] as const;
const ATTRIBUTES = ['indent', 'align'] as const;

const base = ref<ProfileName>('comment');
const on = reactive<Record<string, boolean>>({});

/** Switches follow the ready profile that was chosen. */
function reset(name: ProfileName): void {
    const profile: Profile = PROFILES[name];
    for (const mark of MARK_ORDER) on[mark] = profile.marks.includes(mark);
    for (const node of [...BLOCKS, ...INLINE]) on[node] = profile.nodes.includes(node);
    for (const feature of ATTRIBUTES) on[feature] = (profile.features ?? []).includes(feature);
}
reset(base.value);
watch(base, reset);

const profile = computed(() =>
    defineProfile({
        name: `${base.value}*`,
        marks: MARK_ORDER.filter((m) => on[m]),
        nodes: [...BLOCKS, ...INLINE].filter((n) => on[n]),
        features: ATTRIBUTES.filter((f) => on[f]),
        spaced: (PROFILES[base.value] as Profile).spaced,
    }),
);

const options = reactive({ floating: false, emoji: false, mentions: true, readonly: false, disabled: false });
const spacing = ref<'auto' | 'gap' | 'none'>('auto');
const spaced = computed(() => (spacing.value === 'auto' ? undefined : spacing.value === 'gap'));

const doc = ref<Doc | null>(null);
const editor = ref<{ engine: () => EditorHandle | null } | null>(null);
const labels = computed(() => (locale.value === 'ru' ? editorLabelsRu : undefined));

const names = computed(() => (key: string) => t(`features.names.${key}` as never));

function paste(html: string): void {
    const engine = editor.value?.engine();
    if (!engine) return;
    engine.focus();
    engine.view.pasteHTML(html);
}

function setBase(value: string | number | boolean | undefined): void {
    if (value === 'chat' || value === 'comment' || value === 'article') base.value = value;
}
function setSpacing(value: string | number | boolean | undefined): void {
    if (value === 'auto' || value === 'gap' || value === 'none') spacing.value = value;
}
</script>

<template>
    <section class="section">
        <h2>{{ t('features.title') }}</h2>
        <p class="hint">{{ t('features.hint') }}</p>

        <div class="cols">
            <div class="switches">
                <div class="switch-group">
                    <h3>{{ t('features.base') }}</h3>
                    <TaoSegmented :model-value="base" aria-label="base" @update:model-value="setBase">
                        <TaoSegmentedOption value="chat" label="chat" />
                        <TaoSegmentedOption value="comment" label="comment" />
                        <TaoSegmentedOption value="article" label="article" />
                    </TaoSegmented>
                </div>
                <div class="switch-group">
                    <h3>{{ t('features.marks') }}</h3>
                    <div class="switch-grid">
                        <TaoSwitch v-for="m in MARK_ORDER" :key="m" v-model="on[m]" :label="names(m)" />
                    </div>
                </div>
                <div class="switch-group">
                    <h3>{{ t('features.blocks') }}</h3>
                    <div class="switch-grid">
                        <TaoSwitch v-for="n in BLOCKS" :key="n" v-model="on[n]" :label="names(n)" />
                    </div>
                </div>
                <div class="switch-group">
                    <h3>{{ t('features.attributes') }} / {{ t('features.inline') }}</h3>
                    <div class="switch-grid">
                        <TaoSwitch v-for="f in ATTRIBUTES" :key="f" v-model="on[f]" :label="names(f)" />
                        <TaoSwitch v-for="n in INLINE" :key="n" v-model="on[n]" :label="names(n)" />
                    </div>
                </div>
                <div class="switch-group">
                    <h3>{{ t('features.options') }}</h3>
                    <div class="switch-grid">
                        <TaoSwitch v-model="options.floating" :label="t('features.floating')" />
                        <TaoSwitch v-model="options.emoji" :label="t('features.emoji')" />
                        <TaoSwitch v-model="options.mentions" :label="t('features.mentions')" />
                        <TaoSwitch v-model="options.readonly" :label="t('features.readonly')" />
                        <TaoSwitch v-model="options.disabled" :label="t('features.disabled')" />
                    </div>
                    <h3>{{ t('features.spacing') }}</h3>
                    <TaoSegmented :model-value="spacing" aria-label="spacing" @update:model-value="setSpacing">
                        <TaoSegmentedOption value="auto" :label="t('features.spacingAuto')" />
                        <TaoSegmentedOption value="gap" :label="t('features.spacingGap')" />
                        <TaoSegmentedOption value="none" :label="t('features.spacingNone')" />
                    </TaoSegmented>
                </div>
            </div>

            <div class="switches">
                <TaoEditor
                    ref="editor"
                    v-model="doc"
                    :profile="profile"
                    :floating="options.floating"
                    :emoji="options.emoji"
                    :mentions="options.mentions ? searchPeople : undefined"
                    :readonly="options.readonly"
                    :disabled="options.disabled"
                    :spaced="spaced"
                    :labels="labels"
                    :label="t('features.title')"
                />
                <div class="switch-group">
                    <h3>{{ t('features.samples') }}</h3>
                    <div class="row">
                        <TaoButton variant="secondary" size="small" @click="paste(PASTE_SAMPLES.docs)">{{ t('features.sampleDocs') }}</TaoButton>
                        <TaoButton variant="secondary" size="small" @click="paste(PASTE_SAMPLES.page)">{{ t('features.samplePage') }}</TaoButton>
                        <TaoButton variant="secondary" size="small" @click="paste(PASTE_SAMPLES.table)">{{ t('features.sampleTable') }}</TaoButton>
                        <TaoButton variant="secondary" size="small" @click="paste(PASTE_SAMPLES.markdown)">{{ t('features.sampleMarkdown') }}</TaoButton>
                        <TaoButton variant="secondary" size="small" @click="paste(PASTE_SAMPLES.hostile)">{{ t('features.sampleHostile') }}</TaoButton>
                    </div>
                    <p class="hint">{{ t('features.sampleHint') }}</p>
                </div>
                <div class="switch-group">
                    <h3>{{ t('features.reader') }}</h3>
                    <div class="reader">
                        <TaoEditorView :doc="doc" :profile="profile" :spaced="spaced" class="tao-prose" />
                    </div>
                </div>
                <div class="switch-group">
                    <h3>{{ t('features.json') }}</h3>
                    <pre class="json">{{ JSON.stringify(doc, null, 1) }}</pre>
                </div>
            </div>
        </div>
    </section>
</template>
