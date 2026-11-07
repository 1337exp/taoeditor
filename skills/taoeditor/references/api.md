# TaoEditor: the API

## `TaoEditor` (`@1337exp/taoeditor/vue/taoui`)

The editable field with a TaoUI toolbar. `v-model` is the stored document.

| Prop | Type | Default | What |
| --- | --- | --- | --- |
| `modelValue` | `Doc \| null` | `null` | The document (`v-model`). `null` is an empty one. |
| `profile` | `'chat' \| 'comment' \| 'article' \| Profile` | `'comment'` | What the document may contain. |
| `submit` | `'enter' \| 'mod-enter' \| 'none'` | `'none'` | What sends: Enter (chat), Ctrl/Cmd+Enter (comment). An IME composition never sends. |
| `placeholder` | `string` | `''` | Shown on the empty first paragraph. |
| `label` | `string` | | Accessible name of the text box. |
| `size` | `'small' \| 'medium' \| 'large'` | ancestors (medium) | Size of the toolbar, the popups, the link row. |
| `spaced` | `boolean` | by profile (`article` only) | A gap between paragraphs. |
| `toolbar` | `boolean` | `true` | Show the toolbar. |
| `floating` | `boolean` | `false` | The toolbar floats over the selection. Not with `sticky`. |
| `sticky` | `boolean` | `false` | The toolbar stays at the top of the screen while the page scrolls (`--te-sticky-top` for a fixed header). |
| `maxHeight` | `number \| string` | | The field grows to this height and scrolls inside (px or a CSS length). |
| `minRows`, `maxRows` | `number` | | The same in lines of text (`lh` unit). `maxHeight` wins over `maxRows`. |
| `mentions` | `(query) => MentionItem[] \| Promise<...>` | | People for `@`. Without it `@` is a character. `MentionItem = { id, label, hint? }`. |
| `emoji` | `boolean` | `false` | An emoji button in the corner (plain Unicode text). |
| `emojiList` | `string[]` | built in | Your own emoji. |
| `readonly`, `disabled` | `boolean` | `false` | |
| `labels` | `Partial<TaoEditorLabels>` | English | Your texts. |

Events: `update:modelValue(doc)`, `change(doc)`, `send(doc)` (a non-empty document), `focus`, `blur`.
Exposed: `focus()`, `clear()`, `engine()` (the handle below, for tests and diagnostics).

Keys (a profile without the feature has no key): Ctrl+B / I / U, Ctrl+Shift+X strikethrough, Ctrl+E code, Ctrl+Shift+P spoiler,
Ctrl+. superscript, Ctrl+, subscript, Ctrl+Shift+7 / 8 / 9 numbered / bulleted / quote, Ctrl+Alt+0..3 normal text / headings,
Tab and Shift+Tab (lists, table cells; they fall through where the keyboard would be trapped), Ctrl+Shift+V paste without formatting,
Ctrl+Z and Ctrl+Y.

## `TaoEditorView` (`@1337exp/taoeditor/vue`)

Read-only view. No TaoUI, no editing engine. Add `class="tao-prose"` under TaoUI.

| Prop | Default | What |
| --- | --- | --- |
| `doc` | | The stored document. Anything else renders as an empty paragraph. |
| `profile` | `'article'` (the widest) | What to allow when showing. |
| `spaced` | by profile | A gap between paragraphs. |
| `maxRows` | | Cut a long text to that many lines with a button for the rest; whole on a server. |
| `moreLabel`, `lessLabel` | `Show more`, `Show less` | The texts of the button. |

Event `mention(id)`: a mention was clicked. Mentions are plain text unless something listens. Spoilers open on click.

## `@1337exp/taoeditor/core` (no DOM, runs on a server)

- `normalizeDoc(input, profile) → { doc, issues }` — the gate. Never throws.
- `toHtml(doc, profile?)`, `toRenderTree`, `serializeTree` — safe HTML / a render tree.
- `toPlainText(doc)`, `isEmptyDoc(doc)`, `emptyDoc()`.
- `PROFILES`, `resolveProfile`, `withoutFeatures(base, { marks, nodes, features })`, `defineProfile({ name, nodes, marks, features?, spaced? })`.
- Names: marks `link bold italic underline strike superscript subscript size color background spoiler code`; nodes `paragraph heading
  blockquote codeBlock bulletList orderedList listItem hardBreak mention table tableRow tableCell tableHeader` (taking `table` away takes its
  parts too); features `indent align history` (`history` = the Undo and Redo buttons).
- `safeUrl`, `parseColor` (`#rgb`, `#rrggbb`, `rgb()` → `#rrggbb`), `MAX_DEPTH`, `TABLE_MAX_ROWS` (50), `TABLE_MAX_COLUMNS` (20).

## `createEditor(parent, options)` (`@1337exp/taoeditor/editor`)

For your own toolbar or your own framework. Options: `profile`, `doc`, `submit`, `mentions`, `placeholder`, `class`, `label`, `readOnly`,
`onChange`, `onSend`, `onUpdate`. The handle: `getDoc`, `setDoc`, `clear`, `isEmpty`, `issues` (must stay empty), `toggleMark`,
`isMarkActive`, `setLink`, `setColor`/`colorOf`, `setSize`/`sizeOf`, `setAlign`/`alignOf`, `setBlockStyle`/`blockStyleAt`, `toggleList`,
`toggleQuote`, `toggleCodeBlock`, `indent`/`outdent`, `isBlockActive`, `clearFormatting`, `insertMention`, `insertText`, `insertTable`,
`inTable`, `tableCommand`/`canTableCommand`, `undo`/`redo`, `focus`, `destroy`. Commands return `false` when they do not apply.

## Limits (the model)

Nesting at most 12 deep. A table is a rectangle: at most 50 rows by 20 columns, no merged cells, no table inside a table or a cell's
quote, only at the top level. Cells hold paragraphs and lists. Mention `id`: `^[\w.:-]{1,64}$`, label up to 80 characters. Indent 0–8.
Colours are stored as `#rrggbb`. Black ink and white paper in pasted HTML are ignored.

## Styling variables (`--te-*`)

Read with built-in fallbacks, so the editor looks right without TaoUI. The bridge `taoui.css` maps the themed ones (colours, fonts, radii,
shadows) to TaoUI tokens. Sizes you set yourself: `--te-min-height`, `--te-max-height`, `--te-sticky-top`, `--te-block-gap`, `--te-z`.
