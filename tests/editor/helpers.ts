import { createEditor, type EditorHandle, type EditorOptions } from '../../src/editor';

// jsdom has no layout: the engine asks for rectangles when it scrolls the selection into view.
const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
Range.prototype.getBoundingClientRect ??= () => rect;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;

export function mount(options: EditorOptions = {}): EditorHandle {
    const host = document.createElement('div');
    document.body.append(host);
    return createEditor(host, options);
}

/** Types one character at a time through the same path as the browser: input rules first. */
export function type(editor: EditorHandle, text: string): void {
    const { view } = editor;
    for (const ch of text) {
        const { from, to } = view.state.selection;
        const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
        if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
}

export function press(editor: EditorHandle, key: string, init: KeyboardEventInit = {}): boolean {
    const { view } = editor;
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    return !!view.someProp('handleKeyDown', (f) => f(view, event));
}

/** The paragraph contents as `text|marks` pairs: the shortest way to assert a document. */
export function runs(editor: EditorHandle, block = 0): [string, string][] {
    const node = editor.getDoc().content[block];
    return (node.content ?? []).map((n) => [n.text ?? `<${n.type}>`, (n.marks ?? []).map((m) => m.type).join('+')]);
}
