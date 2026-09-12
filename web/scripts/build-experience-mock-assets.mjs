import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'prototypes/experience/assets');
await mkdir(target, { recursive: true });
const names = ['Search', 'History', 'BookOpen', 'Library', 'Smartphone', 'ArrowUpRight', 'ArrowRight', 'ArrowLeft', 'Plus', 'Check', 'Cat', 'Menu', 'X', 'FolderClosed', 'LockKeyhole', 'ListMinus', 'Save', 'Copy', 'Undo2', 'RotateCcw', 'ArrowUp', 'ArrowDown', 'Trash2', 'Pencil', 'ChevronDown', 'CalendarDays'];
const rendered = Object.fromEntries(names.map((name) => [name, renderToStaticMarkup(createElement(icons[name], { 'aria-hidden': true, focusable: false }))]));
await writeFile(resolve(target, 'icons.js'), `// Generated from lucide-react.\nwindow.cueIcons = ${JSON.stringify(rendered)};\n`);

// Reuse already downloaded Zen Kaku Gothic New subsets; no runtime font request.
const cssDir = resolve(root, '.next/static/chunks');
const sources = await readdir(cssDir);
let css = '';
for (const name of sources.filter((name) => name.endsWith('.css'))) {
  const source = await readFile(resolve(cssDir, name), 'utf8');
  const faces = source.match(/@font-face\{[^}]*font-family:Zen Kaku Gothic New;[^}]*\}/g);
  if (faces?.length) { css = faces.join('\n'); break; }
}
if (!css) throw new Error('Existing Zen Kaku Gothic New font faces not found');
const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]))];
await mkdir(resolve(target, 'fonts'), { recursive: true });
for (const url of urls) await copyFile(resolve(cssDir, url), resolve(target, 'fonts', basename(url)));
css = css.replace(/url\(([^)]+)\)/g, (_, url) => `url(fonts/${basename(url)})`);
await writeFile(resolve(target, 'fonts.css'), `/* Generated from the existing Web font assets. */\n${css}\n`);
console.log(`Prepared ${names.length} Lucide icons and ${urls.length} local font subsets.`);
