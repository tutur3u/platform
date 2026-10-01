import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  cleanupInterruptedProject,
  readLifecycleMetadata,
  runIsolatedLifecycle,
  stageDisposableProject,
  writeMetadata,
} from '../../scripts/run-supabase-isolated.js';
import { runOwnedProcess } from './process-group.mjs';
import { typegenOutputForRepository } from './proposal.mjs';

const helperUrl = pathToFileURL(
  path.resolve('apps/database/scripts/run-supabase-isolated.js')
).href;
async function fixture() {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'typegen-metadata-contract-')
  );
  try {
    await mkdir(path.join(repositoryRoot, 'packages/types/src'), {
      recursive: true,
    });
    await mkdir(path.join(repositoryRoot, 'apps/database/supabase'), {
      recursive: true,
    });
    await copyFile(
      'apps/database/supabase/config.toml',
      path.join(repositoryRoot, 'apps/database/supabase/config.toml')
    );
    const metadata = await stageDisposableProject({
      repositoryRoot,
      headSha: 'a'.repeat(40),
      projectId: 'tt-metadata-contract',
      basePort: 27000,
      typegenOutput: typegenOutputForRepository(repositoryRoot),
      trackedFiles: ['apps/database/supabase/config.toml'],
    });
    return { metadata, repositoryRoot };
  } catch (error) {
    await rm(repositoryRoot, { recursive: true, force: true });
    throw error;
  }
}
async function dispose({ metadata, repositoryRoot }) {
  await rm(metadata.disposableRoot, { recursive: true, force: true });
  await rm(repositoryRoot, { recursive: true, force: true });
}
test('actual metadata writer preserves old recovery record and removes failed partial temporary', async () => {
  const owned = await fixture();
  try {
    await assert.rejects(
      writeMetadata(
        owned.metadata.disposableRoot,
        {
          ...owned.metadata,
          status: 'starting',
        },
        {
          write: async (file, data, options) => {
            await writeFile(file, data.slice(0, 17), options);
            throw new Error('synthetic interrupted write');
          },
        }
      ),
      /synthetic interrupted write/
    );
    assert.deepEqual(
      await readLifecycleMetadata(owned.metadata.disposableRoot),
      owned.metadata
    );
    const files = await readdir(owned.metadata.disposableRoot);
    assert.deepEqual(
      files.filter((file) => file.endsWith('.tmp')),
      []
    );
  } finally {
    await dispose(owned);
  }
});
test('actual lifecycle commits every complete recovery transition with mocked CLI work', async () => {
  const owned = await fixture();
  const statuses = [];
  try {
    const code = await runIsolatedLifecycle({
      binaryPath: 'synthetic-not-executed',
      metadata: owned.metadata,
      runner: async () => {
        statuses.push(
          (await readLifecycleMetadata(owned.metadata.disposableRoot)).status
        );
        return { code: 0 };
      },
      typegen: async () => {
        statuses.push(
          (await readLifecycleMetadata(owned.metadata.disposableRoot)).status
        );
      },
      removeRoot: async () => {},
    });
    assert.equal(code, 0);
    assert.deepEqual(statuses, [
      'starting',
      'resetting',
      'testing',
      'typegen',
      'typegen',
    ]);
  } finally {
    await dispose(owned);
  }
});
for (const [phase, previous] of [
  ['starting', 'staged'],
  ['resetting', 'starting'],
  ['testing', 'resetting'],
  ['typegen', 'testing'],
]) {
  test(`SIGKILL during actual ${phase} metadata write preserves scoped recovery`, async () => {
    const owned = await fixture();
    const marker = path.join(owned.repositoryRoot, 'partial-write.json');
    const childFile = path.join(
      owned.repositoryRoot,
      'interrupted-lifecycle.mjs'
    );
    try {
      await writeFile(
        childFile,
        `
        import { writeFile } from 'node:fs/promises';
        import { writeFileSync } from 'node:fs';
        import { runIsolatedLifecycle, writeMetadata } from ${JSON.stringify(helperUrl)};
        const metadata = JSON.parse(process.argv[2]);
        const phase = process.argv[3];
        await runIsolatedLifecycle({
          binaryPath:'synthetic-not-executed', metadata,
          runner:async()=>({code:0}), typegen:async()=>{},
          updateMetadata:async(root,next)=>writeMetadata(root,next,{
            write:async(file,data,options)=>{
              if(next.status!==phase) return writeFile(file,data,options);
              await writeFile(file,data.slice(0,17),options);
              writeFileSync(process.argv[4],JSON.stringify({file,pid:process.pid}));
              setInterval(()=>{},1000);
              await new Promise(()=>{});
            }
          })
        });
      `
      );
      await assert.rejects(
        runOwnedProcess(
          process.execPath,
          [childFile, JSON.stringify(owned.metadata), phase, marker],
          {
            timeoutMs: 3000,
            intervalMs: 10,
            onTick: () => {
              if (existsSync(marker))
                throw new Error('synthetic interrupted actual metadata write');
            },
          }
        ),
        /synthetic interrupted actual metadata write/
      );
      const interrupted = JSON.parse(readFileSync(marker, 'utf8'));
      assert.notEqual(
        interrupted.file,
        path.join(
          owned.metadata.disposableRoot,
          '.tuturuuu-isolated-supabase.json'
        )
      );
      assert.equal(readFileSync(interrupted.file, 'utf8').length, 17);
      const recovered = await readLifecycleMetadata(
        owned.metadata.disposableRoot
      );
      assert.equal(recovered.status, previous);
      assert.equal(recovered.projectId, owned.metadata.projectId);
      assert.equal(recovered.repositoryRoot, owned.repositoryRoot);
      const stops = [];
      const code = await cleanupInterruptedProject({
        binaryPath: 'synthetic-not-executed',
        metadata: recovered,
        runner: async (binary, args, cwd) => {
          stops.push({ binary, args, cwd });
          return { code: 0 };
        },
      });
      assert.equal(code, 0);
      assert.deepEqual(stops, [
        {
          binary: 'synthetic-not-executed',
          cwd: recovered.disposableRoot,
          args: [
            '--workdir',
            recovered.disposableRoot,
            'stop',
            '--project-id',
            recovered.projectId,
            '--no-backup',
          ],
        },
      ]);
      assert.equal(existsSync(recovered.disposableRoot), false);
    } finally {
      await dispose(owned);
    }
  });
}
