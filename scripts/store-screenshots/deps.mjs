// Loads Playwright and sharp for the store image scripts. The workspace uses
// Bun's isolated linker, so each resolves from a workspace that depends on it
// when the repository root cannot see it.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const WORKSPACES = [
  'package.json',
  'apps/web/package.json',
  'apps/admin/package.json',
  'apps/contacts/package.json',
];

function resolveFrom(name) {
  for (const workspace of WORKSPACES) {
    try {
      return createRequire(
        pathToFileURL(path.join(REPO_ROOT, workspace)).href
      ).resolve(name);
    } catch {
      // Try the next workspace.
    }
  }
  return null;
}

export async function loadChromium() {
  for (const name of ['playwright', '@playwright/test']) {
    const resolved = resolveFrom(name);
    if (!resolved) continue;
    const mod = await import(pathToFileURL(resolved).href);
    const chromium = mod.chromium ?? mod.default?.chromium;
    if (chromium) return chromium;
  }
  throw new Error(
    'Playwright is not installed. Run `bun install`, then `bunx playwright install chromium`.'
  );
}

export async function loadSharp() {
  const resolved = resolveFrom('sharp');
  if (!resolved) throw new Error('sharp is not installed. Run `bun install`.');
  const mod = await import(pathToFileURL(resolved).href);
  return mod.default ?? mod;
}
