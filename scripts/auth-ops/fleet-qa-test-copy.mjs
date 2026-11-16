import { createHash } from 'node:crypto';
import {
  mkdtemp,
  realpath,
  mkdir,
  readFile,
  writeFile,
  rm,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function syntheticCopy({ nullPins = false } = {}) {
  const dir = await mkdtemp(
    join(await realpath(tmpdir()), 'd241-synthetic-copy-')
  );
  await chmod(dir, 0o700);
  const folder = join(dir, 'verified/scripts/auth-ops');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const schema = await readFile(
    new URL('./fleet-qa-receipt.schema.json', import.meta.url)
  );
  let local = await readFile(
    new URL('./fleet-qa-local.mjs', import.meta.url),
    'utf8'
  );
  local = local.replace(
    /(export const PROJECT_REF\s*=\s*)'[^']*'/,
    (_, prefix) => prefix + (nullPins ? 'null' : "'abcdefghijklmnopqrst'")
  );
  const moduleHash = sha(local);
  const original = await readFile(
    new URL('./fleet-qa.mjs', import.meta.url),
    'utf8'
  );
  const source = original.replace(
    /(export const LOCAL_SHA256\s*=\s*)'[0-9a-f]{64}'/,
    (_, prefix) => prefix + JSON.stringify(moduleHash)
  );
  const path = join(folder, 'fleet-qa.mjs');
  await writeFile(path, source, { mode: 0o600 });
  await writeFile(join(folder, 'fleet-qa-local.mjs'), local, { mode: 0o600 });
  await writeFile(join(folder, 'fleet-qa-receipt.schema.json'), schema, {
    mode: 0o600,
  });
  const wrapperPath = join(dir, 'verified/packages/supabase/ops/fleet-qa.mjs');
  await mkdir(join(dir, 'verified/packages/supabase/ops'), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(
    wrapperPath,
    await readFile(
      new URL('../../packages/supabase/ops/fleet-qa.mjs', import.meta.url)
    ),
    { mode: 0o600 }
  );
  return {
    dir,
    folder,
    path,
    source,
    moduleHash,
    wrapperPath,
    import: () => import(pathToFileURL(path).href),
    importWrapper: () => import(pathToFileURL(wrapperPath).href),
    ack: (ackId = 'D241Q-EXECUTION-01') => ({
      ackId,
      helperSha256: sha(source),
      moduleSha256: { 'fleet-qa-local.mjs': moduleHash },
      receiptSchemaSha256: sha(schema),
      projectRef: 'abcdefghijklmnopqrst',
      custodyDirectory: dir,
      executor: 'Rex',
      expiresAt: '2026-11-17T23:59:00+07:00',
      labels: ['a1', 'a2'],
      oneUse: true,
      securityAck: true,
      reviewer: 'Security Desk (Selene, D269)',
    }),
    writeAck: (value) =>
      writeFile(join(dir, 'd241q-ack.json'), JSON.stringify(value), {
        mode: 0o600,
      }),
    close: () => rm(dir, { recursive: true, force: true }),
  };
}
