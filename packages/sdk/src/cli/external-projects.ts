import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ExternalProjectSyncManifest } from '@tuturuuu/internal-api/external-projects';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';

const APPLY_CONFIRMATION = 'APPLY_EXTERNAL_PROJECT_SYNC';

const READ_ACTIONS = new Set([
  'collections',
  'delivery',
  'entries',
  'snapshot',
  'studio',
  'summary',
]);

const SYNC_ACTIONS = new Set(['apply', 'diff', 'setup']);

type ExternalProjectsCommandOptions = {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
};

function getAction(positionals: string[]) {
  return positionals[0] || 'summary';
}

async function readJsonFile(path: string) {
  const resolvedPath = resolve(path);
  const input = await readFile(resolvedPath, 'utf8');

  try {
    return JSON.parse(input) as ExternalProjectSyncManifest;
  } catch (error) {
    throw new Error(
      `Failed to parse manifest JSON at ${resolvedPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function readManifest(flags: Record<string, FlagValue>) {
  const manifestPath = getFlag(flags, 'manifest');
  if (!manifestPath) {
    throw new Error('Missing --manifest <path>.');
  }

  return readJsonFile(manifestPath);
}

async function writeJsonFile(path: string, payload: unknown) {
  const resolvedPath = resolve(path);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`);
  return resolvedPath;
}

async function emitResult(
  payload: unknown,
  flags: Record<string, FlagValue>,
  json: boolean
) {
  const outputPath = getFlag(flags, 'out');

  if (outputPath) {
    const resolvedPath = await writeJsonFile(outputPath, payload);

    if (!json) {
      process.stdout.write(`Wrote ${resolvedPath}\n`);
      return;
    }
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function assertKnownAction(action: string) {
  if (READ_ACTIONS.has(action) || SYNC_ACTIONS.has(action)) return;

  throw new Error(
    `Unknown external projects command "${action}". Expected one of: summary, studio, delivery, snapshot, collections, entries, setup, diff, apply.`
  );
}

export async function runExternalProjectsCommand({
  client,
  flags,
  json,
  positionals,
  workspaceId,
}: ExternalProjectsCommandOptions) {
  const action = getAction(positionals);
  assertKnownAction(action);

  if (action === 'summary') {
    await emitResult(
      await client.external.projects.summary(workspaceId),
      flags,
      json
    );
    return;
  }

  if (action === 'studio') {
    await emitResult(
      await client.external.projects.studio(workspaceId),
      flags,
      json
    );
    return;
  }

  if (action === 'delivery') {
    await emitResult(
      await client.external.projects.delivery(workspaceId, {
        preview: flags.preview === true,
      }),
      flags,
      json
    );
    return;
  }

  if (action === 'snapshot') {
    await emitResult(
      await client.external.projects.snapshot(workspaceId),
      flags,
      json
    );
    return;
  }

  if (action === 'collections') {
    await emitResult(
      await client.external.projects.collections(workspaceId),
      flags,
      json
    );
    return;
  }

  if (action === 'entries') {
    await emitResult(
      await client.external.projects.entries(workspaceId, {
        collectionId:
          getFlag(flags, 'collection') || getFlag(flags, 'collection-id'),
      }),
      flags,
      json
    );
    return;
  }

  const manifest = await readManifest(flags);

  if (action === 'setup') {
    await emitResult(
      await client.external.projects.setup(workspaceId, manifest),
      flags,
      json
    );
    return;
  }

  if (action === 'diff') {
    await emitResult(
      await client.external.projects.diff(workspaceId, manifest),
      flags,
      json
    );
    return;
  }

  const confirmation = getFlag(flags, 'confirm');
  if (confirmation !== APPLY_CONFIRMATION) {
    throw new Error(
      `Refusing to apply external-project sync without --confirm ${APPLY_CONFIRMATION}.`
    );
  }

  await emitResult(
    await client.external.projects.apply(workspaceId, {
      force: flags.force === true,
      manifest,
    }),
    flags,
    json
  );
}
