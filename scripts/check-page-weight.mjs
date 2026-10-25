// Checks the JavaScript and CSS each built page actually loads, against the
// plan's budgets (gzip): model pages ≤ 40 KB JS at first load, other pages
// ≤ 6 KB JS, and every page ≤ 25 KB CSS. It follows each page's scripts,
// island components and their imports, so adding models never adds up.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = 'dist';
const base = '/ModelPlayground/';
const budgets = { modelJs: 40, otherJs: 6, css: 25 };

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function fileFor(url) {
  return join(root, url.slice(base.length));
}

/** A module and every chunk it imports, without repeats. */
function withImports(file, seen) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  for (const match of code.matchAll(
    /(?:from|import)\s*["'](\.\/[^"']+\.js)["']/g,
  )) {
    withImports(join(dirname(file), match[1]), seen);
  }
}

const gz = (file) => gzipSync(readFileSync(file)).length;
const kb = (bytes) => (bytes / 1024).toFixed(1);
const problems = [];

for (const page of pages(root)) {
  const html = readFileSync(page, 'utf8');
  const name = '/' + relative(root, page).replaceAll('\\', '/');
  const js = new Set();
  const urls = [
    ...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g),
    ...html.matchAll(/(?:component|renderer)-url="([^"]+\.js)"/g),
  ].map((m) => m[1]);
  for (const url of urls) withImports(fileFor(url), js);
  // Small inline scripts (theme, island loader) count too.
  const inline = [
    ...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g),
  ]
    .map((m) => gzipSync(m[1]).length)
    .reduce((t, n) => t + n, 0);
  const jsBytes = [...js].reduce((t, f) => t + gz(f), 0) + inline;

  const css = [
    ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g),
  ]
    .map((m) => gz(fileFor(m[1])))
    .reduce((t, n) => t + n, 0);
  const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => gzipSync(m[1]).length)
    .reduce((t, n) => t + n, 0);
  const cssBytes = css + inlineCss;

  const isModel = html.includes('<astro-island');
  const jsLimit = isModel ? budgets.modelJs : budgets.otherJs;
  const line = `${name}: JS ${kb(jsBytes)} KB (≤ ${jsLimit}), CSS ${kb(cssBytes)} KB (≤ ${budgets.css})`;
  if (jsBytes > jsLimit * 1024 || cssBytes > budgets.css * 1024)
    problems.push(line);
  else if (isModel || name === '/index.html') console.log(line);
}

if (problems.length > 0) {
  console.error(`Over budget:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('Page weight: every page is within its JavaScript and CSS budget.');
