import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
function sourceFiles(dir) {
  return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist'
      )
        return [];
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory()
        ? sourceFiles(path)
        : entry.isFile()
          ? [path]
          : [];
    }
  );
}
const sources = ['apps', 'packages/ai/src'].flatMap(sourceFiles);
const routes = sources.filter(
  (p) =>
    p.endsWith('/route.ts') &&
    !p.includes('node_modules') &&
    !p.includes('/.next/')
);
const provider =
  /\b(?:generateText|generateObject|streamText|streamObject|GoogleGenAI|GoogleGenerativeAI)\s*\(|generativelanguage\.googleapis/;
for (const path of routes) {
  const source = readFileSync(resolve(root, path), 'utf8');
  const sdkImport =
    /from ['"](?:@ai-sdk\/[^'"]+|@google\/genai(?:\/web)?|openai|@anthropic-ai\/sdk|supermemory)['"]/;
  const directRest =
    /api\.openai\.com|api\.anthropic\.com|openrouter\.ai|api\.supermemory\.ai|\b(?:AI|ai)\.run\(/;
  if (
    !provider.test(source) &&
    !sdkImport.test(source) &&
    !directRest.test(source)
  )
    continue;
  test(`AI boundary is registered: ${path}`, () => {
    assert.match(
      source,
      /const\s+(\w+)\s*=\s*await workspaceAiPolicyResponse\([\s\S]*?\);\s*if\s*\(\1\)\s*return\s+\1;/,
      'new AI route requires a workspace policy check before credit and provider work'
    );
  });
}
