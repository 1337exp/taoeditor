> Second opinion from Grok (`grok-4.7-high`, read-only, 2026-11-07), asked before the first line of code. A recommendation of another model, not a verified fact: it says itself what it could not verify (last section). See [architecture.ru.md](../architecture.ru.md) for what we took from it.

Own a versioned block tree, written by your binary codec, as the only stored document.
Use pinned or vendored ProseMirror as the editing engine. Markdown is import, export, and a separate source mode.
Chat, comments, notes, and articles are profiles on that schema: allowed nodes, marks, and a keymap.
Ship semantic marks and a source toggle first. Caret ghost-markers are a time-boxed decoration, dropped if the caret drifts.
Prove IME, paste, and undo on a throwaway page before building the toolbar or article blocks.

## 1. Document model

Use a tree you define: block nodes, text, nested non-overlapping marks, and inline atoms (mention, custom emoji). Persist that tree through your codec. ProseMirror’s JSON is a memory projection you can rebuild. A flat entity list is a second projection for chat clients that only paint spans.

Markdown as the source of truth breaks on dialect and on the caret.

- Spoilers, mentions, custom emoji, and embeds have no single syntax, so each client grows a dialect.
- Round-trip through edge cases (`**a *b** c*`, autolinks, escaped table pipes) changes the document with no error.
- A live view whose markers are not characters disagrees with the buffer those markers were parsed from. Shortcut offsets and codec offsets diverge.
- An IME commit that lands between two `*` characters corrupts the mark.
- Every renderer must ship the same parser and the same sanitizer. Parser drift becomes an XSS bug and a layout bug.

Storing a library document unchanged gives up the ownership you want.

- Persisting the whole editor state writes the caret and the caret’s stored marks into the file. Persisting the library’s doc JSON still freezes its text-node-plus-marks shape, which every native client then imitates.
- Mark inclusivity at a boundary is an engine rule. Another implementation splits the same span differently and the document moves.
- A schema change becomes an engine upgrade.

Flat text plus range entities breaks as soon as the article profile is real.

- Nested lists, tables, and embeds are not ranges. Sentinel characters or a second document type split the core.
- Overlapping ranges make “which marks are active” ambiguous. Nested marks have one answer.
- UTF-16 offsets split emoji and some CJK characters. A mention that ends on a surrogate shifts by one on every non-JS client. Store Unicode scalar values or UTF-8, and convert at the JS boundary.
- A selection from a paragraph into a list item has no address, so the bubble toolbar cannot describe it.
- A Quill-style delta is a log of ops. Without a snapshot and a rebase rule, undo and the server render diverge.

Schema rules that keep the output safe: no raw HTML node; a link is a mark whose URL is parsed and limited to `https`, `http`, and your mention scheme; image and embed sources use that same allowlist. The server and non-web clients render the tree. They never receive a stored HTML string.

## 2. Editing engine

1. ProseMirror, pinned or vendored.
2. CodeMirror 6, as the Markdown source surface.
3. Lexical, if you accept a Vue binding you will own.
4. A hand-rolled `contenteditable`, as a one-paragraph spike with a deadline.
5. Quill 2.
6. Editor.js.

Tiptap, BlockNote, Plate, and Slate add a second API on top of these engines. Tiptap is the Vue-shaped one. Taking it couples you to its extension set and its release train. Write the thin Vue host yourself.

ProseMirror already separates model, transaction, and view. You write the schema. Input rules implement `**bold**`, `# `, `- `, `> `, and fenced code. Decorations are there when you try ghosts. The history module is the undo stack. Vue mounts one `EditorView` and destroys it on unmount.

Failure modes you still own:

- IME. A composition that starts inside a mark and ends outside it, or that crosses a widget, drops or duplicates characters on some Android keyboards. The mitigation is the view’s composition handling plus a device matrix: Chrome Android, Gboard, a Samsung keyboard, Japanese and Korean. Another plugin does not fix this.
- `beforeinput` types differ by engine. Drive insert and delete through the editor input pipeline. Leave `execCommand` unused.
- A selection that moves into a custom atom (mention chip, embed) selects the whole atom or collapses. Each profile needs an explicit atom-selection policy.
- Undo grain. In a typical ProseMirror setup the first Backspace after a shortcut runs `undoInputRule` and restores the raw `**foo**`; a merged history event instead jumps to `**fo`. Choose one, and test it before the toolbar exists.
- Paste. Docs and Word emit HTML. Parse it with a strict schema parser and drop unmatched nodes. Scripts, event-handler attributes, and `javascript:` URLs never become nodes. Images become upload placeholders, not `data:` URLs in the document.
- Tables on phones. Cell selection and resize are their own product. Ship them last, article profile only, as a rectangle with no row or column spans.

CodeMirror 6 is the source-mode editor. Composition and undo are stronger there because the buffer is a string. Its live-preview decorations hide characters that are really in the document: that is the Obsidian design, and it is a Markdown-buffer design. Use CodeMirror for the toggle. It becomes the primary engine only if you later make Markdown the source of truth and drop structure that subset cannot say.

Lexical can represent this schema, and its IME work is serious. The maintained application path is React. On Vue, the binding you write is where composition bugs will hide. A pin is mandatory, and the vendor tree is larger than ProseMirror’s.

A from-scratch `contenteditable` fails in known places. Android composition replaces the wrong DOM range. After a mark boundary, Safari often puts the caret in the previous text node. Cross-block selection is a browser range you must reconcile on every `selectionchange`. There is no undo stack once `execCommand` is out. Paste injects HTML you did not model. A two-week one-paragraph spike is worth running as education. It is not a plan for lists, tables, or a stable bubble toolbar.

Quill 2’s document is a sequence of inserts with attributes. The chat profile fits that sequence. Nested lists, tables, and embeds are modules grafted onto a linear delta, which is the fight you would be signing up for.

Editor.js stores safe per-block JSON and keeps IME inside one block. A selection that starts in one block and ends in another is outside its design, so the bubble toolbar, a partial quote, and cross-block marks cannot exist.

## 3. Ghost markers

A ghost marker is sound as a view decoration and unsound as stored text. Render the mark with semantic elements (`strong`, `em`, `code`, `a`, your spoiler element). When the caret or selection touches that span, paint a zero-width widget or an absolutely positioned label (`**`, `~~`). The widget is `aria-hidden`, `contenteditable="false"`, and `pointer-events: none`. Copy serializes the model and your Markdown export, never `innerText`.

Pitfalls:

- Two model positions share one visual point at a mark boundary. Stored marks say whether the next character joins the mark. They are editor state, not document state. Drawing the ghost from `window.getSelection().anchorOffset` paints it on the wrong word. Resolve the position in the editor.
- A widget with width becomes a caret stop, and clicks select the widget. Absolute positioning avoids the stop and then misplaces the label when the line wraps. Recompute on layout, or show the label only on the caret’s line.
- Browsers will not place a caret inside a widget. Some put an object-replacement character into a selection that crosses one, and Copy emits junk. Write `text/plain` and the structured slice yourself. Test Firefox and Safari, not only Chromium.
- Pasting that plain text back into the rich view re-parses `**` and doubles the mark. The rich surface should take a structured payload first: HTML you emitted under the schema, or a custom MIME type carrying codec bytes. Plain text is the fallback for foreign apps.
- A screen reader that announces CSS `content` will speak “asterisk asterisk.” One that announces nothing, aimed at a span that is not `strong`, hides the bold. Semantics carry the meaning. Ghosts stay silent.
- The IME composition range has to contain no widgets. Rebuild decorations after `compositionend`.
- UTF-16 arithmetic draws a marker inside a flag emoji or another multi-unit cluster. Walk editor positions. In RTL, an inline widget can flip the caret, so include a bidi fixture.
- `::before` cannot attach to a text node. Wrapping every marked range in an element changes double-click word selection and spellcheck underlines. An overlay measured from the caret avoids those wrappers and adds a positioning bug. Prefer the overlay.

v1 is the semantic view plus the source toggle. Ghosts ship only if the device script in the build plan still passes with decorations on.

## 4. Architecture and build order

DOM-free:

- `doc-model` — schema, value, transactions, selections. Profiles are allowlists. Invariants live here.
- `doc-codec` — versioned binary form, fixture vectors, and a flattener that emits scalar-offset chat entities.
- `doc-markdown` — import and export, plus an explicit list of article constructs the export cannot represent.
- `doc-render` — document to a safe render tree (tag, allowlisted attributes, text) for the server, SSR, and non-web clients.

DOM and UI:

- `editor-engine` — ProseMirror schema mapped from `doc-model`, commands, input rules, paste filter, decorations, undo. No Vue.
- `editor-vue` — the `EditorView` host, the bubble toolbar from your UI library, mention and emoji UI, a profile prop. The chat keymap sends on Enter only when no composition is active. Other profiles split the block.

Order:

1. Codec fixtures with no DOM: spoiler, mention next to an emoji, nested list, rectangular table. Flatten the chat fixture to entities and restore it with the same offsets.
2. Throwaway Vite page. One paragraph, bold, italic, code. Run desktop Chromium and Firefox, Safari if you have a Mac, Chrome Android with Gboard and a Samsung keyboard, and a Japanese or Korean composition that starts mid-word and crosses a bold boundary, including Enter during composition. Write down every failure. The page is disposable.
3. Input rules and undo on that page. Confirm the Backspace and undo grain from section 2 on `**foo**`, `# `, `- `, `> `, and a fence.
4. Paste corpus: Docs, Word, HTML with a script and an `onerror` handler, a foreign chat snippet. The document that comes out contains only schema nodes and allowlisted URLs.
5. Bubble toolbar. Active state reads stored marks at the caret and marks covering a range. Toggle bold. Then select from a heading into the following paragraph.
6. Chat profile: Enter sends codec bytes, a configured chord inserts a newline, mention atom, custom-emoji atom, quote block storing a message id. Enter mid-composition must not send.
7. Article profile, in this order: headings, lists, image atom, table grid, embed atom.
8. Render those fixtures through `doc-render` on the server and diff the plain text against the editor.
9. Five-day ghost-marker spike. Re-run the step 2 script. Any caret, copy, or composition failure ends the spike. The source toggle stays.
10. Source mode: export Markdown into CodeMirror 6, edit, import on the way back. When the article used a construct the export dropped, show the loss list from `doc-markdown`. A textarea is enough if you would rather not take CodeMirror until this step is real.

## 5. Argument against this

Chat and comments are the documents people actually edit, and they are flat. A string plus ranges renders on the non-web clients you already have, and a much smaller input surface can carry bold, italic, spoiler, mention, and emoji. This plan runs every one of those keystrokes through resolved positions, schema transactions, and a contenteditable engine whose worst bugs you still do not control. The Obsidian interaction is natural when the markers are real characters in CodeMirror, and awkward when they are decorations on a mark tree, so the plan postpones the distinctive feature and is ready to cancel it. Vendoring ProseMirror freezes a dependency. It does not make Android IME your bug to fix faster than upstream. Two editors that share `doc-render` and the URL allowlist — an entity composer for chat and comments, CodeMirror Markdown for notes and articles — would ship sooner and fail in smaller pieces. One core is a product goal. The input stack does not share it.

## What I could not verify

- Current releases, license headers, and transitive dependency sizes for ProseMirror, CodeMirror 6, Lexical, Quill 2, Editor.js, Tiptap, and Slate. License and “small graph” remarks are prior knowledge, not a lockfile read today.
- How complete Lexical’s current Vue story is, and which Android keyboards its current release has actually fixed.
- Today’s `beforeinput` and composition behavior on Safari, Chrome Android, Gboard, and Samsung keyboards. That matrix moves by version.
- Obsidian’s current Live Preview details beyond CodeMirror 6 decorations over a Markdown buffer.
- Any measurement of ProseMirror transaction cost against a plain field on short chat messages.
- How far Quill 2’s current table support has moved past a linear delta.
- Your existing codec and UI packages. This workspace had no source files, so the package split is a proposal, not a fit check against code you already have.
