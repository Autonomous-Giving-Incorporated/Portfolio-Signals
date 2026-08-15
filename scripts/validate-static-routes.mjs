import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const pages = [
  'index.html',
  'sponsors.html',
  'grants.html',
  'members.html',
  'workspace.html',
  'allocation.html',
  'allocation-login.html',
  'allocation-setup.html',
];
const failures = [];

for (const page of pages) {
  if (!existsSync(page)) {
    failures.push(`${page}: missing route`);
    continue;
  }
  const html = readFileSync(page, 'utf8');
  if (!/<main\b[^>]*id=["']main["']/.test(html) && page !== 'workspace.html') {
    failures.push(`${page}: missing main landmark`);
  }
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#|data:)/.test(target)) continue;
    const path = target.split(/[?#]/)[0];
    if (path === 'runtime-config.js') continue;
    if (!path || !existsSync(resolve(dirname(page), path))) {
      failures.push(`${page}: broken local reference ${target}`);
    }
  }
}

const routeRequirements = {
  'sponsors.html': ['<select', 'data-tooltip'],
  'grants.html': ['<select', 'data-tooltip'],
  'members.html': ['type="range"', 'data-tooltip']
};
for (const [page, required] of Object.entries(routeRequirements)) {
  const html = readFileSync(page, 'utf8');
  for (const token of required) {
    if (!html.includes(token)) failures.push(`${basename(page)}: missing ${token}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated ${pages.length} static routes and reusable control contracts.`);
