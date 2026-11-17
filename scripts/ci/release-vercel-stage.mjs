import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CALENDAR_VERCEL } from './release-vercel-config.mjs';
import { CALENDAR_RELEASE_IDENTITY } from './release-vercel-identity.mjs';
import {
  assertSafeOutputTree,
  listOutput,
  sealTree,
  assertLegacyBuildCommand,
  assertLegacyOutput,
  stageCommand,
} from './calendar-exact-sha-publisher.mjs';
import { QueueStop } from './release-vercel-queue.mjs';
import { ReleaseStop } from './release-vercel-errors.mjs';
import { stop } from './calendar-exact-sha-stop.mjs';

export function stageDependencies({
  transport,
  workspaceRoot,
  context,
  source,
}) {
  const app = path.join(workspaceRoot, CALENDAR_VERCEL.appDirectory);
  const output = path.join(app, '.vercel', 'output');
  const deps = {
    projectId: CALENDAR_RELEASE_IDENTITY.project,
    aliasPreimage: context.payload.rollback.deploymentId,
    verifySource: () => source(context.payload.sourceSha),
    verifyLegacyBuild: () =>
      assertLegacyBuildCommand(
        JSON.parse(readFileSync(path.join(app, 'vercel.json'), 'utf8'))
      ),
    inspectAlias: () => transport.inspectAlias(CALENDAR_RELEASE_IDENTITY),
    recordPreimage: async () => {},
    pull: () => transport.pull(),
    build: () => transport.build(),
    assertSensitiveOutput: () => assertSafeOutputTree(output),
    seal() {
      const files = listOutput(output);
      const config = JSON.parse(
        readFileSync(path.join(output, 'config.json'), 'utf8')
      );
      assertLegacyOutput({ config, paths: files.map((file) => file.path) });
      return sealTree(files);
    },
    stage: (seal) =>
      context.effect('stage-upload', () =>
        transport.deploy(stageCommand({ sha: context.payload.sourceSha, seal }))
      ),
    readSupabaseUrl() {
      const text = readFileSync(
        path.join(app, '.vercel', '.env.production.local'),
        'utf8'
      );
      const line = text
        .split('\n')
        .find((value) => value.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
      if (!line) throw stop('SUPABASE_HOST_REJECTED', 'Supabase host rejected');
      return line
        .slice('NEXT_PUBLIC_SUPABASE_URL='.length)
        .replace(/^"|"$/gu, '');
    },
    record: async () => {},
  };
  // Preserve typed queue failures across the publisher's StageStop normalizer.
  return Object.fromEntries(
    Object.entries(deps).map(([name, value]) => [
      name,
      typeof value !== 'function'
        ? value
        : async (...args) => {
            try {
              return await value(...args);
            } catch (error) {
              if (error instanceof QueueStop || error instanceof ReleaseStop) {
                const wrapped = stop(
                  'UNEXPECTED_FAILURE',
                  'Stage boundary refused'
                );
                wrapped.cause = error;
                throw wrapped;
              }
              throw error;
            }
          },
    ])
  );
}
