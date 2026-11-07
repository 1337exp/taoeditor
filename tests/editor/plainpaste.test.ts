// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from './helpers';

/** A paste event with the clipboard's two flavours, the way a browser sends it. */
function paste(dom: HTMLElement, html: string, text: string): void {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    const data: Record<string, string> = { 'text/html': html, 'text/plain': text };
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => data[type] ?? '', types: Object.keys(data), files: [], items: [] } });
    dom.dispatchEvent(event);
}

const HTML = '<p><strong>bold</strong> <span style="color:#cc0000">red</span> <a href="https://666.io">link</a></p>';

describe('paste without formatting (Ctrl+Shift+V)', () => {
    it('Ctrl+V keeps what the profile allows; Ctrl+Shift+V takes only the text', () => {
        const rich = mount({ profile: 'comment' });
        paste(rich.view.dom, HTML, 'bold red link');
        expect(JSON.stringify(rich.getDoc())).toContain('"bold"');
        expect(JSON.stringify(rich.getDoc())).toContain('#cc0000');

        const plain = mount({ profile: 'comment' });
        plain.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', keyCode: 86, ctrlKey: true, shiftKey: true, bubbles: true }));
        paste(plain.view.dom, HTML, 'bold red link');
        const json = JSON.stringify(plain.getDoc());
        expect(json).toContain('bold red link');
        for (const kept of ['"type":"bold"', 'color', '"type":"link"', 'href']) expect(json).not.toContain(kept);
    });

    it('the text of a pasted table keeps its lines and tabs, with no table in the document', () => {
        const ed = mount({ profile: 'comment' });
        ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', keyCode: 86, ctrlKey: true, shiftKey: true, bubbles: true }));
        paste(ed.view.dom, '<table><tr><td>a</td><td>b</td></tr></table>', 'a\tb\nc\td');
        expect(JSON.stringify(ed.getDoc())).not.toContain('table');
        expect(ed.issues()).toEqual([]);
    });
});
