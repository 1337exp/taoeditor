// Copies the stylesheets next to the built JS: they are plain CSS files, not bundled through TypeScript.
// Копирует таблицы стилей рядом с собранным JS: это обычные CSS-файлы, через TypeScript они не идут.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const from = 'src/styles';
const to = 'dist';
mkdirSync(to, { recursive: true });
for (const file of readdirSync(from).filter((f) => f.endsWith('.css'))) copyFileSync(join(from, file), join(to, file));
