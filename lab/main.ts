import 'prosemirror-view/style/prosemirror.css';
import './lab.css';
import { createEditor, toPlainText, type EditorHandle, type ProfileName, type SubmitMode } from '../src';
import { FIXTURES } from '../tests/fixtures';

/**
 * The lab: one page to look at the engine, not a product. It uses the same code as the app and the
 * same fixtures as the tests. Hostile paste samples go through the real clipboard path (`pasteHTML`).
 * Лаборатория: страница, чтобы разглядывать движок. Тот же код, что в приложении, те же фикстуры, что в тестах.
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const CORPUS: Record<string, string> = {
    'Google Docs bold': '<meta charset="utf-8"><b style="font-weight:normal"><span style="font-weight:700">bold</span> plain <span style="font-style:italic">it</span></b>',
    'Word-ish paragraphs': '<p class="MsoNormal">One<o:p></o:p></p><p class="MsoNormal"><b>Two</b> <i>three</i></p>',
    'Hostile: script, onerror, iframe': '<p onclick="alert(1)">a<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe>b</p>',
    'Links: good, javascript:, data:': '<a href="https://666.io">good</a> <a href="javascript:alert(1)">js</a> <a href="data:text/html,x">data</a>',
    'Structure: h1, list, quote, code': '<h1>Title</h1><ul><li>one</li><li>two</li></ul><blockquote>q</blockquote><pre><code class="language-ts">a\nb</code></pre>',
    'Markdown text (not parsed)': '**not bold** and `not code`',
};

const MARK_BUTTONS: [name: string, label: string, title: string][] = [
    ['bold', 'B', 'Bold (Ctrl+B)'],
    ['italic', 'I', 'Italic (Ctrl+I)'],
    ['strike', 'S', 'Strike (Ctrl+Shift+X)'],
    ['code', '</>', 'Code (Ctrl+E)'],
    ['spoiler', '◐', 'Spoiler (Ctrl+Shift+P)'],
];

let editor: EditorHandle;
const lines: string[] = [];
const clock = (): string => new Date().toISOString().slice(11, 23);

function log(kind: string, detail = ''): void {
    lines.unshift(`${clock()} ${kind.padEnd(17)} ${detail}`);
    lines.length = Math.min(lines.length, 100);
    $('log').textContent = lines.join('\n');
}

function refresh(): void {
    const doc = editor.getDoc();
    $('json').textContent = JSON.stringify(doc, null, 1);
    $('plain').textContent = JSON.stringify(toPlainText(doc));
    const issues = editor.issues();
    const status = $('status');
    status.textContent = issues.length === 0 ? 'engine ⇄ core: in agreement' : `engine ⇄ core: ${issues.length} issue(s) ${JSON.stringify(issues)}`;
    status.classList.toggle('bad', issues.length > 0);
    document.querySelectorAll<HTMLButtonElement>('#toolbar [data-mark]').forEach((b) => {
        b.setAttribute('aria-pressed', String(editor.isMarkActive(b.dataset.mark!)));
    });
}

function buildToolbar(): void {
    const bar = $('toolbar');
    bar.replaceChildren();
    const add = (label: string, title: string, run: () => void, mark?: string): void => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = title;
        b.setAttribute('aria-label', title);
        if (mark) {
            b.dataset.mark = mark;
            b.setAttribute('aria-pressed', 'false');
        }
        // mousedown would steal the focus and the selection from the editor
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => {
            run();
            editor.focus();
        });
        bar.append(b);
    };
    for (const [name, label, title] of MARK_BUTTONS) add(label, title, () => editor.toggleMark(name), name);
    add('🔗', 'Link on the selection', () => {
        const href = window.prompt('URL (https://…), empty removes the link');
        if (href === null) return;
        if (href.trim() === '') editor.setLink(null);
        else if (!editor.setLink(href)) log('link refused', href);
    });
    bar.append(Object.assign(document.createElement('span'), { className: 'sep' }));
    add('↶', 'Undo (Ctrl+Z)', () => editor.undo());
    add('↷', 'Redo (Ctrl+Y)', () => editor.redo());
    add('Clear', 'Clear the document', () => editor.clear());
}

function watch(dom: HTMLElement): void {
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend'] as const) {
        dom.addEventListener(type, (e) => log(type, JSON.stringify((e as CompositionEvent).data)));
    }
    dom.addEventListener('beforeinput', (e) => {
        const ev = e as InputEvent;
        log('beforeinput', `${ev.inputType} ${JSON.stringify(ev.data)} composing=${ev.isComposing}`);
    });
    dom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Process' || e.keyCode === 229) {
            log('keydown', `${e.key} code=${e.keyCode} composing=${e.isComposing} shift=${e.shiftKey}`);
        }
    });
    dom.addEventListener('paste', (e) => log('paste', (e as ClipboardEvent).clipboardData?.types.join(', ') ?? ''));
}

function mount(): void {
    const keep = editor ? editor.getDoc() : undefined;
    editor?.destroy();
    const host = $('editor');
    host.replaceChildren();
    editor = createEditor(host, {
        profile: $<HTMLSelectElement>('profile').value as ProfileName,
        submit: $<HTMLSelectElement>('submit').value as SubmitMode,
        doc: keep,
        placeholder: 'Type here. Try **bold**, *italic*, `code`, > quote, - list',
        label: 'Editor under test',
        onSend: (doc) => {
            log('SEND', JSON.stringify(toPlainText(doc)));
            editor.clear();
        },
        onUpdate: refresh,
    });
    watch(editor.view.dom);
    refresh();
    editor.focus();
}

function init(): void {
    const fixture = $<HTMLSelectElement>('fixture');
    for (const fx of FIXTURES) fixture.append(new Option(`${fx.title} (${fx.profile})`, fx.id));
    fixture.addEventListener('change', () => {
        const fx = FIXTURES.find((f) => f.id === fixture.value);
        if (!fx) return;
        $<HTMLSelectElement>('profile').value = fx.profile;
        mount();
        editor.setDoc(fx.doc);
        fixture.value = '';
    });

    const corpus = $<HTMLSelectElement>('corpus');
    for (const name of Object.keys(CORPUS)) corpus.append(new Option(name, name));
    corpus.addEventListener('change', () => {
        const html = CORPUS[corpus.value];
        if (html === undefined) return;
        editor.view.focus();
        editor.view.pasteHTML(html);
        log('pasteHTML', corpus.value);
        corpus.value = '';
    });

    $('profile').addEventListener('change', mount);
    $('submit').addEventListener('change', mount);
    buildToolbar();
    mount();
}

init();
