import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// AI Studio request storage is disabled at the project level, so a request can
// only be retained if it opts in with `store: true` (or `"store": true`).
// Production Gemini/GenAI source under `apps/**` and `packages/**` must never
// opt in to request storage.

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCAN_ROOTS = ['apps', 'packages'];
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.next',
  '.open-next',
  '.turbo',
  'coverage',
  'tmp',
  '__tests__',
  '__fixtures__',
  'fixtures',
  'tests',
  'e2e',
]);
const SOURCE_EXTENSION = /\.(?:ts|tsx|js|mjs)$/u;
const EXCLUDED_FILE =
  /(?:\.test\.|\.spec\.|\.d\.ts$|-fixture\.|\.fixture\.|\/(?:__tests__|__fixtures__|fixtures|tests|e2e)\/)/u;

const GENAI_SIGNAL =
  /(?:@google\/genai|@ai-sdk\/google(?:-vertex)?|\bGoogleGenAI\b|\bcreateGoogleGenerativeAI\b|generativelanguage\.googleapis\.com|\bGOOGLE_GENERATIVE_AI_API_KEY\b|\bGEMINI_API_KEY\b|\bgemini-[a-z0-9._-]+|['"`]google\/gemini-)/iu;

const STORE_OPT_IN = /(?:(?<![.\w$])\bstore\b|['"`]store['"`])\s*:\s*true\b/gu;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function isProductionSourceFile(repoRelativePath) {
  const normalized = toPosixPath(repoRelativePath);
  if (!SOURCE_EXTENSION.test(normalized)) return false;
  if (EXCLUDED_FILE.test(`/${normalized}`)) return false;
  const segments = normalized.split('/');
  if (!SCAN_ROOTS.includes(segments[0])) return false;
  return !segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment));
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, (match) => match.replace(/[^\n]/gu, ' '))
    .replace(/(?<!https?:)\/\/.*$/gmu, '');
}

export function findGenAiStoreOptIns(source, filePath = '<inline>') {
  const stripped = stripComments(source);
  if (!GENAI_SIGNAL.test(stripped)) return [];
  const findings = [];
  for (const match of stripped.matchAll(STORE_OPT_IN)) {
    const line = stripped.slice(0, match.index ?? 0).split('\n').length;
    findings.push(
      `${toPosixPath(filePath)}:${line}: forbidden Gemini/GenAI store: true opt-in (${match[0].trim()})`
    );
  }
  return findings;
}

export function collectProductionSourceFiles(
  repoRoot = REPO_ROOT,
  roots = SCAN_ROOTS
) {
  function walk(relativeDir) {
    const absoluteDir = path.join(repoRoot, relativeDir);
    return readdirSync(absoluteDir, { withFileTypes: true }).flatMap(
      (entry) => {
        const relativePath = `${relativeDir}/${entry.name}`;
        if (entry.isDirectory()) {
          return EXCLUDED_DIRECTORIES.has(entry.name) ? [] : walk(relativePath);
        }
        return entry.isFile() && isProductionSourceFile(relativePath)
          ? [relativePath]
          : [];
      }
    );
  }
  return roots.flatMap(walk).sort((a, b) => a.localeCompare(b));
}

export function scanGenAiStoreOptIns({
  repoRoot = REPO_ROOT,
  files = collectProductionSourceFiles(repoRoot),
  readFile = (relativePath) =>
    readFileSync(path.join(repoRoot, relativePath), 'utf8'),
} = {}) {
  return files.flatMap((file) => findGenAiStoreOptIns(readFile(file), file));
}

test('production source under apps/** and packages/** has no Gemini/GenAI store: true opt-in', () => {
  const files = collectProductionSourceFiles();
  assert.ok(
    files.length > 100,
    `expected production source inventory to be non-empty (found ${files.length})`
  );
  assert.deepEqual(
    scanGenAiStoreOptIns({ files }),
    [],
    'Gemini/GenAI requests must never opt in to AI Studio request storage via store: true'
  );
});

test('path filter includes production source and excludes tests, fixtures, node_modules, and dist', () => {
  for (const included of [
    'apps/ai/src/lib/speech-execution.ts',
    'apps/web/src/app/api/ai/chat/route.ts',
    'packages/ai/src/meetings/gemini.ts',
    'packages/meet-core/src/cloudflare/live/provider.ts',
    'apps/roadmap/scripts/generate-changelog.mjs',
  ]) {
    assert.equal(isProductionSourceFile(included), true, included);
  }

  for (const excluded of [
    'apps/web/src/lib/chatgpt/provider.test.ts',
    'apps/web/e2e/ai-credits.spec.ts',
    'packages/ai/src/__tests__/gemini.ts',
    'packages/ai/src/__fixtures__/sample.ts',
    'packages/ai/fixtures/request.js',
    'packages/meet-core/src/routes/api/meet-live/[meetingId]/phase-a-fixture.ts',
    'apps/web/node_modules/@google/genai/index.mjs',
    'packages/ai/dist/index.js',
    'packages/types/src/supabase.d.ts',
    'scripts/ci/no-genai-store-opt-in.test.mjs',
  ]) {
    assert.equal(isProductionSourceFile(excluded), false, excluded);
  }
});

test('self-test flags synthetic Gemini/GenAI store: true offenders and passes clean sources', () => {
  const offenders = [
    [
      'apps/learn/src/app/api/v1/vocabulary/speech/route.ts',
      `const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {\n  method: 'POST',\n  body: JSON.stringify({ model: 'gemini-3.1-flash-tts-preview', store: true }),\n});`,
    ],
    [
      'packages/ai/src/meetings/gemini.ts',
      `import { createGoogleGenerativeAI } from '@ai-sdk/google';\nconst payload = { "store": true, model: 'gemini-2.5-flash' };`,
    ],
    [
      'packages/meet-core/src/cloudflare/live/provider.ts',
      `import { GoogleGenAI } from '@google/genai/web';\nconst client = new GoogleGenAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });\nconst request = { 'store': true };`,
    ],
  ];

  for (const [file, source] of offenders) {
    const findings = scanGenAiStoreOptIns({
      files: [file],
      readFile: () => source,
    });
    assert.equal(findings.length, 1, file);
    assert.match(findings[0], /forbidden Gemini\/GenAI store: true opt-in/u);
  }

  const cleanSamples = [
    [
      'packages/ai/src/meetings/gemini.ts',
      `import { createGoogleGenerativeAI } from '@ai-sdk/google';\nconst payload = { store: false, model: 'gemini-2.5-flash' };`,
    ],
    [
      'apps/gateway/src/cache-rules.ts',
      `export function isStorable() { return { store: true }; }`,
    ],
    [
      'apps/ai/src/lib/speech-execution.ts',
      `// Never set store: true on generativelanguage.googleapis.com requests.\nconst url = 'https://generativelanguage.googleapis.com/v1beta/interactions';`,
    ],
  ];

  for (const [file, source] of cleanSamples) {
    assert.deepEqual(
      scanGenAiStoreOptIns({
        files: [file],
        readFile: () => source,
      }),
      [],
      file
    );
  }
});
