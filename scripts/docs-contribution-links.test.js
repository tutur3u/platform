const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'apps/docs');
const DOCS_CONFIG = path.join(DOCS_ROOT, 'docs.json');
const CONTRIBUTION_GUIDES = [
  path.join(DOCS_ROOT, 'README.md'),
  path.join(DOCS_ROOT, 'build/development-tools/documenting.mdx'),
];

function collectPageEntries(value, pages = new Set(), insidePages = false) {
  if (typeof value === 'string') {
    if (insidePages) pages.add(value);
    return pages;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPageEntries(entry, pages, insidePages);
    }
    return pages;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      collectPageEntries(entry, pages, key === 'pages');
    }
  }

  return pages;
}

function findPageFile(page) {
  for (const extension of ['.mdx', '.md']) {
    const candidate = path.join(DOCS_ROOT, `${page}${extension}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function extractInternalLinks(source) {
  const links = [];
  const markdownLink = /(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g;

  for (const match of source.matchAll(markdownLink)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (
      target.startsWith('#') ||
      target.startsWith('mailto:') ||
      /^[a-z][a-z\d+.-]*:\/\//i.test(target)
    ) {
      continue;
    }

    const cleanTarget = target.split(/[?#]/, 1)[0];
    if (!cleanTarget) continue;
    const extension = path.extname(cleanTarget);
    if (extension && extension !== '.md' && extension !== '.mdx') continue;
    links.push({ cleanTarget, target });
  }

  return links;
}

function resolvePageLink(sourceFile, target) {
  const withoutLeadingSlash = target.replace(/^\//, '');
  const absoluteTarget = target.startsWith('/')
    ? path.join(DOCS_ROOT, withoutLeadingSlash)
    : path.resolve(path.dirname(sourceFile), target);
  const relativeTarget = path.relative(DOCS_ROOT, absoluteTarget);

  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    return null;
  }

  return relativeTarget
    .replace(/\.(?:md|mdx)$/i, '')
    .split(path.sep)
    .join('/');
}

const docsConfig = JSON.parse(fs.readFileSync(DOCS_CONFIG, 'utf8'));
const registeredPages = collectPageEntries(docsConfig.navigation);

test('every docs navigation page resolves to a Markdown or MDX file', () => {
  const missingPages = [...registeredPages].filter(
    (page) => !findPageFile(page)
  );
  assert.deepEqual(missingPages, []);
});

test('contribution guides link only to registered documentation pages', () => {
  const brokenLinks = [];

  for (const sourceFile of CONTRIBUTION_GUIDES) {
    const source = fs.readFileSync(sourceFile, 'utf8');
    for (const { cleanTarget, target } of extractInternalLinks(source)) {
      const page = resolvePageLink(sourceFile, cleanTarget);
      if (!page || !registeredPages.has(page) || !findPageFile(page)) {
        brokenLinks.push(
          `${path.relative(REPO_ROOT, sourceFile).split(path.sep).join('/')}: ${target}`
        );
      }
    }
  }

  assert.deepEqual(brokenLinks, []);
});
