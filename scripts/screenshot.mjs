#!/usr/bin/env node
/**
 * Screenshots of the demo for the README (both languages share the same files).
 *
 *   npm run screenshot                                         starts the demo on a spare port
 *   SCREENSHOT_URL=http://localhost:5197 npm run screenshot    use a demo that is already running
 *
 * Needs Chrome or Edge installed (driven through playwright-core, nothing is downloaded).
 * Output: docs/media/*.png. The pictures are of the real editor on TaoUI and TaoUX (the demo page), not of the lab.
 * Every run gives the same pictures: clean storage, a fixed language and theme, a draft that is written in advance.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const PORT = 5198;
const VIEWPORT = { width: 1000, height: 720 };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'media');
mkdirSync(OUT, { recursive: true });

async function waitFor(url, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try {
            if ((await fetch(url)).ok) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`The demo did not come up at ${url}`);
}

async function startServer() {
    if (process.env.SCREENSHOT_URL) return { url: process.env.SCREENSHOT_URL, stop() {} };
    const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const child = spawn(process.execPath, [vite, '--config', 'demo/vite.config.ts', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    const url = `http://localhost:${PORT}`;
    await waitFor(url);
    return { url, stop: () => child.kill() };
}

async function launch() {
    for (const channel of ['chrome', 'msedge']) {
        try {
            return await chromium.launch({ channel });
        } catch {
            // try the next one
        }
    }
    throw new Error('Neither Chrome nor Edge could be launched');
}

const t = (text, ...marks) => (marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text });
/** The draft that waits in the composer: a mention, a bold word, an italic one and a superscript. */
const DRAFT = {
    v: 1,
    content: [
        {
            type: 'paragraph',
            content: [
                t('Thanks '),
                { type: 'mention', attrs: { id: 'u1', label: 'Ann Lee' } },
                t(', that works. '),
                t('Bold', { type: 'bold' }),
                t(', '),
                t('italic', { type: 'italic' }),
                t(' and x'),
                t('2', { type: 'superscript' }),
                t(' text, and a line that is just '),
                t('typed', { type: 'underline' }),
                t('.'),
            ],
        },
    ],
};

const server = await startServer();
const browser = await launch();
try {
    const shot = async (page, name, clip) => {
        await page.screenshot({ path: join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
        console.log(`docs/media/${name}.png`);
    };

    /** A fresh page: clean storage, English, the chosen theme, and (for the comments) the draft written in advance. */
    const open = async (theme, withDraft) => {
        const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: theme, locale: 'en-US' });
        const page = await context.newPage();
        await page.addInitScript(
            ({ theme, draft }) => {
                localStorage.clear();
                localStorage.setItem('taoeditor-demo.lang', 'en');
                localStorage.setItem('taoeditor-demo.theme', theme);
                if (draft) localStorage.setItem('taoeditor-demo.comment-draft', JSON.stringify(draft));
            },
            { theme, draft: withDraft ? DRAFT : null },
        );
        await page.goto(server.url);
        await page.waitForSelector('.tao-editor');
        await page.waitForTimeout(500);
        return page;
    };

    // 1. Comments: the composer with its toolbar and a draft, the mention list open, the comments below.
    {
        const page = await open('dark', true);
        const editor = page.locator('.tao-editor').first();
        await editor.click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' cc @an', { delay: 30 });
        await page.waitForSelector('.tao-editor-suggest');
        await page.waitForTimeout(400);
        await shot(page, 'comments');
        await page.context().close();
    }

    // 2. Features: the project switches Bold off; a Google Docs run is pasted; the toolbar has no Bold and the pasted
    // bold is plain text, while its colours stay.
    {
        const page = await open('light', false);
        await page.getByRole('tab', { name: 'Features' }).click();
        // the article profile has the colours (a comment does not): the pasted run keeps them there
        await page.getByText('article', { exact: true }).click();
        await page.locator('label', { hasText: /^Bold$/ }).click();
        await page.getByRole('button', { name: 'Bold and colours from Google Docs' }).click();
        await page.waitForTimeout(500);
        await shot(page, 'features');
        await page.context().close();
    }
} finally {
    await browser.close();
    server.stop();
}
