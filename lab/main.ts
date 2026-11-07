import 'prosemirror-view/style/prosemirror.css';
import taouiStyles from '@1337exp/taoui/styles.css?inline';
import { createApp, h, shallowRef } from 'vue';
import '../src/styles/content.css';
import '../src/styles/editor.css';
import taouiBridge from '../src/styles/taoui.css?inline';
import './lab.css';
import { PROFILES, normalizeDoc, toHtml, toPlainText, type Doc, type Profile, type ProfileName } from '../src/core';
import { createEditor, type EditorHandle, type SubmitMode } from '../src/editor';
import { TaoEditorView } from '../src/vue';
import { TaoEditor } from '../src/vue/taoui';
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

// The viewer is a Vue component fed with the editor's current document.
const shown = shallowRef<Doc | undefined>(undefined);
const viewProfile = shallowRef<ProfileName>('article');
const taouiOn = (): boolean => $<HTMLSelectElement>('look').value.startsWith('taoui');

/** "Look": neutral rules that follow the system, or the TaoUI theme through the bridge and `tao-prose`. */
function applyLook(): void {
    const look = $<HTMLSelectElement>('look').value;
    let style = document.getElementById('taoui-theme');
    if (look === 'neutral') {
        style?.remove();
        document.documentElement.removeAttribute('data-tao-mode');
        return;
    }
    if (!style) {
        style = document.createElement('style');
        style.id = 'taoui-theme';
        style.textContent = `${taouiStyles}\n${taouiBridge}`;
        document.head.append(style);
    }
    document.documentElement.setAttribute('data-tao-mode', look === 'taoui-light' ? 'light' : 'dark');
}

function refresh(): void {
    const doc = editor.getDoc();
    shown.value = doc;
    $('json').textContent = JSON.stringify(doc, null, 1);
    $('plain').textContent = JSON.stringify(toPlainText(doc));
    $('html').textContent = toHtml(doc, PROFILES[viewProfile.value]);
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

const OPTIONAL_NODES: [type: string, label: string][] = [
    ['blockquote', 'quote'],
    ['codeBlock', 'code block'],
    ['bulletList', 'bulleted list'],
    ['orderedList', 'numbered list'],
    ['heading', 'headings'],
];

/** Says in words what the chosen profile allows: the profile is an allowlist, not a mode of the editor. */
function describeProfile(name: ProfileName): string {
    const profile: Profile = PROFILES[name];
    const has = OPTIONAL_NODES.filter(([type]) => profile.nodes.includes(type)).map(([, label]) => label);
    const lacks = OPTIONAL_NODES.filter(([type]) => !profile.nodes.includes(type)).map(([, label]) => label);
    return (
        `Profile "${name}" is the list of what a document may contain. Always: paragraphs, line breaks, ${profile.marks.join(', ')}. ` +
        `Also: ${has.join(', ') || 'nothing'}. ` +
        (lacks.length > 0
            ? `Not allowed: ${lacks.join(', ')}. They are turned into plain paragraphs (the text stays), also when pasted, loaded from a fixture, or typed as a shortcut ("- ", "# "). `
            : 'Everything is allowed. ') +
        'Switching the profile re-checks the current document against the new list.'
    );
}

function mount(): void {
    const keep = editor ? editor.getDoc() : undefined;
    editor?.destroy();
    const host = $('editor');
    host.replaceChildren();
    const profileName = $<HTMLSelectElement>('profile').value as ProfileName;
    $('profile-info').textContent = describeProfile(profileName);
    if (keep) {
        const { issues } = normalizeDoc(keep, PROFILES[profileName]);
        if (issues.length > 0) log('profile changed', `${issues.length} change(s): ${issues.map((i) => i.code).join(', ')}`);
    }
    editor = createEditor(host, {
        profile: profileName,
        class: taouiOn() ? 'tao-prose' : undefined,
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

// The component under test: the same controls drive it (profile, send key), its document is shown by the viewer.
const componentDoc = shallowRef<Doc | null>(null);
const componentProfile = shallowRef<ProfileName>('comment');
const componentSubmit = shallowRef<SubmitMode>('none');

function mountComponent(): void {
    createApp({
        render: () =>
            h(TaoEditor, {
                modelValue: componentDoc.value,
                'onUpdate:modelValue': (doc: Doc) => (componentDoc.value = doc),
                profile: componentProfile.value,
                submit: componentSubmit.value,
                placeholder: 'TaoEditor: type here',
                label: 'TaoEditor component',
                onSend: (doc: Doc) => {
                    log('component SEND', JSON.stringify(toPlainText(doc)));
                    componentDoc.value = null;
                },
            }),
    }).mount($('component'));
    createApp({
        render: () => h(TaoEditorView, { doc: componentDoc.value, profile: componentProfile.value, class: taouiOn() ? 'tao-prose' : undefined }),
    }).mount($('component-view'));
}

function init(): void {
    applyLook();
    mountComponent();
    createApp({
        render: () => h(TaoEditorView, { doc: shown.value, profile: viewProfile.value, class: taouiOn() ? 'tao-prose' : undefined }),
    }).mount($('view'));
    $('look').addEventListener('change', () => {
        applyLook();
        mount();
        shown.value = editor.getDoc(); // the viewer redraws with or without tao-prose
    });

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

    $('profile').addEventListener('change', () => {
        componentProfile.value = $<HTMLSelectElement>('profile').value as ProfileName;
        mount();
    });
    $('submit').addEventListener('change', () => {
        componentSubmit.value = $<HTMLSelectElement>('submit').value as SubmitMode;
        mount();
    });
    buildToolbar();
    mount();
}

init();
