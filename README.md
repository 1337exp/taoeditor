# TaoEditor

**English** · [Русский](README.ru.md)

An embeddable rich-text editor for our ecosystem: comments, chat messages, notes, articles. One document model and one set of rules for all of them, with a profile per place (`chat`, `comment`, `article`). The editing engine underneath is [ProseMirror](https://prosemirror.net), pinned by exact version; the document, the allowlists, the link policy and the Markdown are ours, so the engine can be replaced later without touching what is stored.

> Early stage: the core and the engine layer work and are tested, mentions, emoji and the rest of the plan are not written yet. See [Not yet](#not-yet).

## Stack

TypeScript 6, ESM only, Vite 8, Vitest. Runtime dependencies: seven small MIT packages of ProseMirror (`model`, `state`, `view`, `transform`, `commands`, `keymap`, `history`), exact versions. UI will be Vue 3 + [TaoUI](https://www.npmjs.com/package/@1337exp/taoui).

## Commands

```bash
npm run dev        # the lab at http://localhost:5173/lab/
npm run dev:lan    # the same, open to the local network: use the Network address it prints (try it on a phone)
npm test           # core and engine tests (jsdom)
npm run typecheck  # core without DOM, then everything with DOM
npm run build      # library build + declarations
npm run mutate     # break the code on a copy, one thing at a time, and check the tests notice
```

## What it does

- **Own stored document**: a versioned JSON tree (`{ v: 1, content: [...] }`). No HTML is ever stored; the engine's own JSON is never the format.
- **Profiles are allowlists** over one schema: nodes (paragraph, hard break, quote, code block, lists, headings) and marks (bold, italic, strike, code, spoiler, link).
- **A normalizer is the gate**: untrusted JSON in, canonical valid document out, never throws. Unknown or forbidden nodes are unwrapped (the text survives), links go through one allowlist (`https`/`http`, no credentials), control characters are stripped, nesting is capped.
- **Nothing is converted behind your back**: what is typed or pasted stays what it was. Text that looks like Markdown stays plain text; formatting exists only when it was applied explicitly (the toolbar, the hotkeys) or came as real formatting in the pasted HTML. There is no Markdown input at all.
- **Safe paste**: pasted HTML is read only through the schema's parse rules (Google Docs and Word bold/italic included); scripts, handlers, images, unsafe links cannot get in.
- **Chat mode**: Enter sends, Shift+Enter breaks the line, an IME composition never sends.
- **`TaoEditor`** (`@1337exp/taoeditor/vue/taoui`): the field built from TaoUI components with `v-model`, `change`, `send`; a toolbar (fixed, or `floating` over the selection) of toggle buttons (bold, italic, strike, code, spoiler, link, undo, redo) that follow the selection, a link form that refuses unsafe URLs, `size`, `readonly`, `disabled`, translatable `labels`.
- **Showing a document**: `toHtml` / `toRenderTree` in the core (no DOM, safe by construction, runs on a server) and a Vue viewer `TaoEditorView` that never loads the editing engine; a spoiler opens on click, Enter or Space.
- **Made for TaoUI, usable without it**: looks come from `--te-*` variables with neutral defaults; `taoui.css` points them at the TaoUI tokens, `class="tao-prose"` hands the text typography to TaoUI. Only files in `src/vue/taoui/` may import TaoUI (a test guards the layers).
- **A lab** (`lab/`): the same editor on a page with the document JSON, the plain text, an engine⇄core agreement check, a log of composition, `beforeinput` and key events, and a corpus of pastes.

```vue
<TaoEditor v-model="doc" profile="comment" submit="mod-enter" @send="post" />
<TaoEditorView :doc="saved" class="tao-prose" />
```

## How it is built

```
src/core     no DOM, runs on a server too: model, schema + profiles, normalizer, link allowlist, plain text, render (tree and HTML)
src/editor   ProseMirror layer: schema from core, input rules, keys, history, createEditor()
src/vue      Vue: TaoEditorView (the viewer, no TaoUI, no engine)
src/vue/taoui  TaoEditor: the only place that imports TaoUI
src/styles   content.css, editor.css, taoui.css (the bridge)
lab/         the page to look at the engine; not part of the build
tests/       core (node), engine and viewer (jsdom), layers; fixtures are shared with the lab
```

Imports are by subpath, there is no root entry: `@1337exp/taoeditor/core`, `/editor`, `/vue`, `/vue/taoui`, `/content.css`, `/editor.css`, `/taoui.css`.

Decisions, what is proven and what is not: [docs/architecture.ru.md](docs/architecture.ru.md) (Russian). An independent second opinion that shaped the plan: [docs/notes](docs/notes/grok-architecture-2026-11-07.md).

## Not yet

- Export to Markdown (`.md`) for taking notes out, when it is needed. Mentions, emoji, slash menu. The floating toolbar is checked in Chromium only (touch devices not yet).
- Images, tables, embeds.
- Checked only in Chromium by hand and in jsdom by tests: **IME on Android and iOS, Firefox, Safari are not checked yet**.

## License

MIT, see [LICENSE](LICENSE). ProseMirror is MIT, © Marijn Haverbeke and contributors.

## Us

Homepage: [666.io](https://666.io). If you want to help, suggest an idea or just talk, come by.
