<script setup lang="ts">
import { toast } from '@1337exp/taoui';
import { isEmptyDoc, type Doc } from '@1337exp/taoeditor/core';
import { TaoEditorView } from '@1337exp/taoeditor/vue';
import { TaoEditor } from '@1337exp/taoeditor/vue/taoui';
import { computed, nextTick, ref } from 'vue';
import { locale, t } from '../i18n';
import { editorLabelsRu } from '../locales/editorLabels.ru';
import { searchPeople } from '../people';

interface Message {
    id: number;
    mine: boolean;
    author: string;
    doc: Doc;
}

const messages = ref<Message[]>([]);
const draft = ref<Doc | null>(null);
const list = ref<HTMLElement | null>(null);
let nextId = 1;

const labels = computed(() => (locale.value === 'ru' ? editorLabelsRu : undefined));

async function add(message: Omit<Message, 'id'>): Promise<void> {
    messages.value.push({ ...message, id: nextId++ });
    await nextTick();
    if (list.value) list.value.scrollTop = list.value.scrollHeight;
}

function send(doc: Doc): void {
    if (isEmptyDoc(doc)) return;
    void add({ mine: true, author: t('common.you'), doc: JSON.parse(JSON.stringify(doc)) as Doc });
    draft.value = null; // the app clears the field: v-model null is an empty document
    // a small bot, to make the list move
    setTimeout(() => {
        const [before, after] = t('chat.reply', ['@@']).split('@@');
        void add({
            mine: false,
            author: t('chat.bot'),
            doc: {
                v: 1,
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: before }, { type: 'mention', attrs: { id: 'me', label: t('common.you') } }, { type: 'text', text: after ?? '' }],
                    },
                ],
            },
        });
    }, 700);
}

function mentioned(id: string): void {
    toast().info().message(t('common.mention', [id]));
}
</script>

<template>
    <section class="section">
        <h2>{{ t('chat.title') }}</h2>
        <p class="hint">{{ t('chat.hint') }}</p>

        <div ref="list" class="chat-list">
            <div v-for="message in messages" :key="message.id" class="bubble" :class="{ mine: message.mine }">
                <small>{{ message.author }}</small>
                <TaoEditorView :doc="message.doc" profile="chat" class="tao-prose" @mention="mentioned" />
            </div>
        </div>

        <TaoEditor
            v-model="draft"
            profile="chat"
            submit="enter"
            emoji
            :mentions="searchPeople"
            :labels="labels"
            :placeholder="t('chat.placeholder')"
            :label="t('chat.title')"
            @send="send"
        />
    </section>
</template>
