# Changelog

## 0.1.0

The first release.

- **A document of our own.** A versioned JSON tree (`{ v: 1, content: [...] }`) is the only thing that is stored. A normalizer is the gate for everything that comes in or goes out: it never throws, strips what the profile does not allow, and keeps the text of what it unwraps. Links go through one allowlist (`https`, `http`, no credentials).
- **Profiles.** Ready `chat`, `comment`, `article`; `withoutFeatures(...)` and `defineProfile(...)` make your own. What a profile leaves out is gone everywhere at once: the toolbar button, the hotkey, pasted formatting (it comes in as plain text) and a stored document shown with that profile. A typo in a name throws.
- **The marks and blocks.** Bold, italic, underline, strikethrough, code, spoiler, link, text size (small, large, huge), text colour and background colour (stored as `#rrggbb`); paragraphs, headings 1 to 3, quote, code block, bulleted and numbered lists; indent (0 to 8) and alignment as attributes of a line; hard break; mentions (`@name`, an `id` and a label).
- **Nothing is converted behind your back.** There is no Markdown input: what is typed or pasted stays what it was. Pasted HTML is read only through the schema's rules (Google Docs, Word and Gmail runs included, minus the black ink and white paper they put on everything); scripts, handlers, images and unsafe links cannot get in.
- **`TaoEditor`** (`@1337exp/taoeditor/vue/taoui`), built from TaoUI components: `v-model`, `change`, `send`; a toolbar in the order of a mail client (fixed, or `floating` over the selection) that shows only what the profile has; popups for colours, alignment, size and paragraph style; a link form that refuses unsafe URLs; mentions through a `mentions` function of the app (with a list that works with keys, mouse and screen readers); an emoji button (plain Unicode text); `spaced` (a gap between paragraphs or none); `readonly`, `disabled`, translatable `labels`.
- **`TaoEditorView`** (`@1337exp/taoeditor/vue`): a viewer that never loads the editing engine; spoilers open on click, mentions are buttons when the app listens. `toHtml` / `toRenderTree` render the same document on a server (no DOM, safe by construction).
- **The editing engine** (`@1337exp/taoeditor/editor`): `createEditor()` on seven small ProseMirror packages, exact versions; the keys of Gmail and Docs; Enter or Ctrl+Enter sends and an IME composition never does.
- **Made for TaoUI, usable without it.** The look comes from `--te-*` variables with neutral defaults; `taoui.css` points them at the TaoUI tokens, `class="tao-prose"` hands the typography to TaoUI. Only `src/vue/taoui/` imports TaoUI, and `taoui.css` is the only file that names its tokens (tests guard both, and check that every token exists in the installed TaoUI).

Not checked yet: IME on Android and iOS and Japanese or Korean composition, touch devices, Firefox and Safari. Imports are by subpath (there is no root entry); `vue` and `@1337exp/taoui` are optional peer dependencies.
