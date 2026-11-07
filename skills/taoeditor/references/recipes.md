# TaoEditor: recipes

## A comment box

```vue
<TaoEditor
  v-model="draft"
  profile="comment"
  submit="mod-enter"
  :min-rows="3"
  :max-rows="10"
  :mentions="findPeople"
  :labels="labelsRu"
  placeholder="Write a comment…"
  @send="post"
/>
```

`@send` gives a non-empty document: send it to the server, then `clear()` through a ref. On the server: `normalizeDoc(body, PROFILES.comment)`
before you save, and check every mention `id` (it exists, the author may mention it). Show it with
`<TaoEditorView :doc="comment.doc" profile="comment" class="tao-prose" :max-rows="4" @mention="openProfile" />`.

## A chat input

```vue
<TaoEditor v-model="draft" profile="chat" submit="enter" :min-rows="1" :max-rows="6" :mentions="findPeople" @send="sendMessage" />
```

Enter sends, Shift+Enter breaks the line, an IME composition never sends. Add `emoji` for an emoji button.

## An article or a note

```vue
<TaoEditor v-model="doc" profile="article" sticky emoji />
```

`sticky` keeps the toolbar on the screen while the page scrolls; `--te-sticky-top: 56px` when the page has a fixed header.

## A project's own profile

```ts
import { withoutFeatures, defineProfile } from '@1337exp/taoeditor/core';

const noTables = withoutFeatures('article', { nodes: ['table'] });
const small = defineProfile({ name: 'notes', nodes: ['blockquote', 'bulletList', 'orderedList'], marks: ['bold', 'italic', 'link'] });
```

Use the same profile object in the editor, the viewer and on the server.

## A server (previews, e-mails, search, push)

```ts
import { normalizeDoc, toHtml, toPlainText, PROFILES } from '@1337exp/taoeditor/core';

const { doc } = normalizeDoc(JSON.parse(body), PROFILES.comment);
const preview = toPlainText(doc).slice(0, 140);
const html = toHtml(doc, PROFILES.comment); // safe: text escaped, links checked, no script
```

A spoiler is a plain `span.tao-spoiler` in `toHtml`: hidden by CSS without a script; where readers must open it use `TaoEditorView`.

## Your language

```ts
const labelsRu = { bold: 'Жирный', italic: 'Курсив', table: 'Таблица', more: 'Ещё' /* any subset of TaoEditorLabels */ };
```

## Without TaoUI

Use `createEditor` from `/editor` with your own toolbar and `/content.css`, `/editor.css`, `prosemirror-view/style/prosemirror.css`.
Set `--te-*` variables for the look. The viewer `TaoEditorView` needs no TaoUI either.

## Mistakes that look fine and are not

- Saving `editor.getDoc()` without `normalizeDoc` on the server: the client is not trusted.
- A different profile in the viewer than the author had: the viewer hides what its profile does not allow (a wider `article` default is used for showing).
- Trusting a mention `id` from the document.
- Putting the stored JSON or its text through `v-html`: render with the viewer or `toHtml`.
- Expecting Markdown to turn into formatting: it never does.
- Wrapping the editor in an element with `overflow: hidden` and using `sticky`: sticky needs a scrolling ancestor that is the page or the container you mean.
