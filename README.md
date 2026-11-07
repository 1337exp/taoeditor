# TaoEditor

**English** · [Русский](README.ru.md)

An embeddable rich-text editor for our ecosystem: comments, chat messages, notes, articles. One document model and one set of rules for all of them, with a profile per place (`chat`, `comment`, `article`). The editing engine underneath is [ProseMirror](https://prosemirror.net), pinned by exact version; the document, the allowlists, the link policy and the Markdown are ours, so the engine can be replaced later without touching what is stored.

> Early stage: the core and the engine layer work and are tested, the Vue component and the Markdown I/O are not written yet. See [Not yet](#not-yet).

## Stack

TypeScript 6, ESM only, Vite 8, Vitest. Runtime dependencies: eight small MIT packages of ProseMirror (`model`, `state`, `view`, `transform`, `commands`, `keymap`, `history`, `inputrules`), exact versions. UI will be Vue 3 + [TaoUI](https://www.npmjs.com/package/@1337exp/taoui).

## Commands

```bash
npm run dev        # the lab at http://localhost:5173/lab/ (add -- --host to try it on a phone)
npm test           # core and engine tests (jsdom)
npm run typecheck  # core without DOM, then everything with DOM
npm run build      # library build + declarations
npm run mutate     # break the code on a copy, one thing at a time, and check the tests notice
```

## What it does

- **Own stored document**: a versioned JSON tree (`{ v: 1, content: [...] }`). No HTML is ever stored; the engine's own JSON is never the format.
- **Profiles are allowlists** over one schema: nodes (paragraph, hard break, quote, code block, lists, headings) and marks (bold, italic, strike, code, spoiler, link).
- **A normalizer is the gate**: untrusted JSON in, canonical valid document out, never throws. Unknown or forbidden nodes are unwrapped (the text survives), links go through one allowlist (`https`/`http`, no credentials), control characters are stripped, nesting is capped.
- **Markdown shortcuts while typing** (`**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `||spoiler||`, `# `, `> `, `- `, `1. `, ```` ``` ````), the first Backspace brings the typed characters back.
- **Safe paste**: pasted HTML is read only through the schema's parse rules (Google Docs and Word bold/italic included); scripts, handlers, images, unsafe links cannot get in.
- **Chat mode**: Enter sends, Shift+Enter breaks the line, an IME composition never sends.
- **A lab** (`lab/`): the same editor on a page with the document JSON, the plain text, an engine⇄core agreement check, a log of composition, `beforeinput` and key events, and a corpus of pastes.

## How it is built

```
src/core     no DOM, runs on a server too: model, schema + profiles, normalizer, link allowlist, plain text
src/editor   ProseMirror layer: schema from core, input rules, keys, history, createEditor()
lab/         the page to look at the engine; not part of the build
tests/       core (node) and engine (jsdom); fixtures are shared with the lab
```

Decisions, what is proven and what is not: [docs/architecture.ru.md](docs/architecture.ru.md) (Russian). An independent second opinion that shaped the plan: [docs/notes](docs/notes/grok-architecture-2026-11-07.md).

## Not yet

- Vue component, bubble toolbar on TaoUI, mentions, emoji, slash menu.
- Markdown import/export and the "source" mode.
- Binary form of the document (the 2pack codec has finite schemas, so a recursive tree needs a flat representation first).
- Images, tables, embeds.
- Checked only in Chromium by hand and in jsdom by tests: **IME on Android and iOS, Firefox, Safari are not checked yet**.

## License

MIT, see [LICENSE](LICENSE). ProseMirror is MIT, © Marijn Haverbeke and contributors.

## Us

Homepage: [666.io](https://666.io). If you want to help, suggest an idea or just talk, come by.
