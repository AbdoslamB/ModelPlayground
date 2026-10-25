// Fails the build if any internal link or asset in the built site misses the
// /ModelPlayground/ base path (GitHub Pages serves the site under it).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = '/ModelPlayground/';
const root = 'dist';
const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.html')) check(path);
  }
}

function check(file) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
    const link = match[1];
    if (!link.startsWith('//') && !link.startsWith(base)) {
      problems.push(`${file}: ${link}`);
    }
  }
}

walk(root);
if (problems.length > 0) {
  console.error(`Links without the ${base} base path:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`Link check: every internal link starts with ${base}`);
