import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const root = resolve(import.meta.dirname, '..');
export const digest = (source) =>
  createHash('sha256').update(source).digest('hex');
const provider =
  /['"](?:@ai-sdk\/[^'"]+|@google\/(?:genai|generative-ai)(?:\/web)?|openai|@anthropic-ai\/sdk|supermemory)['"]|\b(?:generateText|generateObject|streamText|streamObject|embed|embedMany|generateImage|generateSpeech|transcribe|experimental_generateSpeech|experimental_transcribe|GoogleGenAI|GoogleGenerativeAI)\s*\(|(?:api\.openai\.com|api\.anthropic\.com|openrouter\.ai|(?:api\.supermemory\.ai|supermemory:8787)|generativelanguage\.googleapis\.com|ai\.tuturuuu\.com)|\b(?:AI|ai)\.run\s*\(/;
export function readSources(directory = root) {
  const sources = {};
  function walk(dir) {
    for (const entry of readdirSync(resolve(directory, dir), {
      withFileTypes: true,
    })) {
      if (
        entry.name.startsWith('.') ||
        [
          'node_modules',
          'dist',
          'coverage',
          'generated',
          'fixtures',
          '__fixtures__',
        ].includes(entry.name)
      )
        continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (
        entry.isFile() &&
        /\.(?:[cm]?js|tsx?)$/.test(path) &&
        !/\.(?:test|spec|runtime)\./.test(path)
      )
        sources[path] = readFileSync(resolve(directory, path), 'utf8');
    }
  }
  for (const dir of ['apps', 'packages']) walk(dir);
  return sources;
}
export function discoverProviderSites(sources) {
  return Object.keys(sources)
    .filter((path) => provider.test(sources[path]))
    .sort();
}
export function checkProviderInventory(sources, inventory) {
  const errors = [];
  const sites = discoverProviderSites(sources);
  if (new Set(inventory.map((entry) => entry.path)).size !== inventory.length)
    errors.push('duplicate inventory path');
  for (const path of sites) {
    const entry = inventory.find((entry) => entry.path === path);
    if (!entry) {
      errors.push(`${path}: unreviewed provider entry point`);
      continue;
    }
    if (digest(sources[path]) !== entry.sha256)
      errors.push(`${path}: changed provider site requires review`);
    if (!entry.workspace || !entry.boundaries.length)
      errors.push(`${path}: missing workspace resolution or boundary`);
    for (const { path: boundary, sha256: sha } of entry.boundaries) {
      if (!sources[boundary] || digest(sources[boundary]) !== sha)
        errors.push(`${path}: changed or missing boundary ${boundary}`);
      else if (
        !/await workspaceAiAllowed|await workspaceAiPolicyResponse|evaluateWorkspaceAiPolicy\(/.test(
          sources[boundary]
        )
      )
        errors.push(`${path}: boundary has no workspace AI gate: ${boundary}`);
    }
  }
  for (const { path } of inventory)
    if (!sites.includes(path)) errors.push(`${path}: stale inventory entry`);
  return errors;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const inventory = JSON.parse(
    readFileSync(
      new URL('./workspace-ai-provider-inventory.json', import.meta.url),
      'utf8'
    )
  );
  const errors = checkProviderInventory(readSources(), inventory);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      `Workspace AI gate: ${inventory.length} reviewed provider files.`
    );
}
