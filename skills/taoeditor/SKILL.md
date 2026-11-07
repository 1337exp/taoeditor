---
name: taoeditor
description: Put a rich-text editor into a Vue 3 app with @1337exp/taoeditor (TaoEditor) — comments, chat messages, notes and articles with one document model, profiles that choose what a project uses, mentions, tables, a viewer and a server renderer. Use when code imports @1337exp/taoeditor/*, uses TaoEditor / TaoEditorView or --te-* variables, or the user asks for a comment box, a chat input or an article editor.
---

# TaoEditor

An embeddable rich-text editor with **its own stored document** (a versioned JSON tree) and ProseMirror only inside. The
document, the allowlists, the link policy and the viewer are ours. Props, events and the engine handle are in
[references/api.md](references/api.md); read it before you use a prop you have not used yet. Ready-made setups for a
comment box, a chat, an article and a feed are in [references/recipes.md](references/recipes.md).

## Setup

```bash
npm install @1337exp/taoeditor @1337exp/taoui vue
```

```ts
import '@1337exp/taoui/styles.css';
import 'prosemirror-view/style/prosemirror.css';
import '@1337exp/taoeditor/content.css';
import '@1337exp/taoeditor/editor.css';
import '@1337exp/taoeditor/taoui.css'; // the bridge: the editor follows the TaoUI theme (after TaoUI's own styles)
```

```vue
<script setup lang="ts">
import { TaoEditorView } from '@1337exp/taoeditor/vue';
import { TaoEditor } from '@1337exp/taoeditor/vue/taoui';
</script>
<template>
  <TaoEditor v-model="doc" profile="comment" submit="mod-enter" :mentions="findPeople" @send="post" />
  <TaoEditorView :doc="saved" profile="comment" class="tao-prose" @mention="openProfile" />
</template>
```

Imports are **by subpath**, there is no root entry: `/core` (no DOM, runs on a server), `/editor` (the engine, no TaoUI),
`/vue` (the viewer, no TaoUI and no engine), `/vue/taoui` (the editor component, the only place that imports TaoUI),
`/content.css`, `/editor.css`, `/taoui.css`. `vue` and `@1337exp/taoui` are optional peer dependencies. Without TaoUI use `/core` and
`/editor` with your own toolbar; the look comes from `--te-*` variables with neutral defaults.

## Rules that keep an app right

1. **Store the document, never HTML.** `v-model` is `{ v: 1, content: [...] }`. Keep it as JSON; render it with
   `TaoEditorView` or `toHtml` (`/core`). Never keep ProseMirror's own JSON, never `v-html` what you stored.
2. **Everything that comes in goes through `normalizeDoc(input, profile)`** (`/core`): untrusted JSON in, a valid document out,
   it never throws. On a server run it before you save or send, with the same profile the author had.
3. **The profile is the allowlist.** `chat`, `comment`, `article` are starting points; make your own with
   `withoutFeatures('comment', { marks: ['bold'], nodes: ['table'], features: ['align'] })` or `defineProfile({...})`. What a profile
   leaves out is gone everywhere at once: no button, the hotkey does nothing, pasted formatting comes in as plain text, a stored
   document shows without it. A typo in a name **throws**. Pass the **same profile** to the editor, the viewer and the server.
4. **Mentions: the `id` is a claim.** The editor only notices `@query`; the `mentions` function is yours (it returns people, now or as
   a promise). The app must check on the server that the id exists and that the author may mention it.
5. **Nothing is converted behind the user's back.** There is no Markdown input: `**x**` stays text. Do not add it.
6. **Links**: only `https` and `http`, no credentials; every rendered link has `rel="noopener noreferrer nofollow ugc"`.
7. **Do not name `--tao-*` tokens in app code for the editor's look.** Style it with `--te-*` variables; the bridge `taoui.css` maps them
   to TaoUI. A new themed `--te-*` variable needs a row in the bridge.
8. **Texts are the app's**: the editor ships English; pass `labels` (any subset) for your language. When you update the package check
   `TaoEditorLabels` for new keys.

## What each profile has (the ready ones)

- `article`: everything: all marks (colours, underline, subscript...), headings 1–3, lists, quote, code block, tables, indents,
  alignment, the Undo and Redo buttons. Paragraphs have a gap (`spaced`).
- `comment`: the bar of Reddit: bold, italic, strikethrough, superscript, size, link, spoiler, code, code block, lists, quote, table.
  No colours, underline, subscript, alignment, indents, Undo and Redo buttons (the keys Ctrl+Z / Ctrl+Y always work).
- `chat`: bold, italic, strikethrough, size, link, spoiler, code, quote, code block, mentions. No superscript, lists, tables, headings,
  alignment or indents. Use `submit="enter"` (Enter sends, Shift+Enter breaks the line).

## Long texts and heights

`minRows` / `maxRows` (lines of text, `lh` unit), `maxHeight` (px or a CSS length), `--te-max-height` (inherits: one rule for an area),
`sticky` (the toolbar stays on the screen while the page scrolls). `TaoEditorView` with `maxRows` cuts a long comment and adds a
button to open the rest. The right-click menu is the browser's on purpose (it has the spell check).

## Checking what you built

`npm test` in your app is yours; for the editor itself: the document that leaves it passes `normalizeDoc` unchanged, the viewer and
`toHtml` of the same document show the same thing, and a profile without a feature really has no button for it.
Not checked yet by the authors: IME on phones, Japanese and Korean composition, touch devices, Firefox and Safari.
