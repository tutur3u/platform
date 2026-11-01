#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const base = process.argv[2];
assert(base, 'Usage: node scripts/check-docs-revamp.js <base-ref>');
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const configFile = 'apps/docs/docs.json';
const before = git('show', `${base}:${configFile}`);
const after = fs.readFileSync(configFile, 'utf8');
const old = JSON.parse(before);
const next = JSON.parse(after);
function pages(value) {
  if (Array.isArray(value)) return value.flatMap(pages);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'pages'
      ? child.flatMap((page) =>
          typeof page === 'string' ? [page] : pages(page)
        )
      : pages(child)
  );
}
const oldPages = pages(old.navigation);
const nextPages = pages(next.navigation);
// P3a adds one public entrypoint and corrects one relative anchor URL.
const quickstart = 'agents/quickstart';
const isP3a = old.navigation.tabs?.some((tab) => tab.tab === 'For agents');
const expectedPages = isP3a ? [...oldPages, quickstart] : oldPages;
assert.equal(
  new Set(nextPages).size,
  nextPages.length,
  'Each page must occur once'
);
assert.deepEqual(
  [...nextPages].sort(),
  [...expectedPages].sort(),
  'Navigation page set changed'
);
const outsideNavigation = (source) =>
  source.replace(/ {2}"navigation": [\s\S]*?(?= {2}"logo":)/, '');
assert.equal(
  outsideNavigation(after),
  outsideNavigation(before),
  'Bytes outside navigation changed (including redirects)'
);
assert.deepEqual(
  next.navigation.tabs.map((tab) => tab.tab),
  ['Guides', 'Developers', 'Reference', 'For agents', 'Learn']
);
const audiences = [
  'users',
  'developers',
  'developers',
  'agents',
  'public-learn',
];
function split(source) {
  const match = /^(---\n)([\s\S]*?)(\n---[\s\S]*)$/.exec(source);
  assert(match, 'Missing frontmatter');
  return match;
}
for (const [index, tab] of next.navigation.tabs.entries()) {
  for (const slug of pages(tab)) {
    const file = `apps/docs/${slug}.mdx`;
    if (isP3a && slug === quickstart) {
      const source = fs.readFileSync(file, 'utf8');
      assert.match(source, /^audience: agents$/m);
      assert.match(source, /^updatedAt: "2026-11-01"$/m);
      continue;
    }
    const original = split(git('show', `${base}:${file}`));
    if (isP3a && slug === 'build/development-tools/without-docker') {
      original[3] = original[3].replace(
        '(documenting#mintlify-runtime-compatibility)',
        '(/build/development-tools/documenting#mintlify-runtime-compatibility)'
      );
    }
    const current = split(fs.readFileSync(file, 'utf8'));
    assert.equal(current[3], original[3], `${file}: body changed`);
    const added = current[2]
      .split('\n')
      .filter((line) => !original[2].split('\n').includes(line));
    assert(
      added.every((line) => /^(updatedAt|audience):/.test(line)),
      `${file}: unexpected metadata change`
    );
    assert.equal(
      current[2]
        .split('\n')
        .filter((line) => !added.includes(line))
        .join('\n'),
      original[2],
      `${file}: original metadata changed`
    );
    assert.match(
      current[2],
      new RegExp(`^audience: ${audiences[index]}$`, 'm'),
      `${file}: audience mismatch`
    );
    assert.match(
      current[2],
      /^updatedAt: ["']?\d{4}-\d{2}-\d{2}["']?$/m,
      `${file}: missing date`
    );
    if (added.some((line) => line.startsWith('updatedAt:'))) {
      const date = git('log', '-1', '--format=%cs', base, '--', file).trim();
      assert(
        added.includes(`updatedAt: "${date}"`),
        `${file}: date does not match history`
      );
    }
  }
  console.log(`${tab.tab}: ${pages(tab).length} pages`);
}
assert.deepEqual(
  next.navigation.tabs[4].groups[0],
  isP3a
    ? old.navigation.tabs[4].groups[0]
    : old.navigation.anchors[0].groups.find((group) => group.group === 'Learn'),
  'Learn hierarchy changed'
);
console.log(
  `PASS: ${nextPages.length} pages preserved exactly once; existing paths, bodies (except the P3a anchor fix), metadata, redirects and other configuration preserved`
);
