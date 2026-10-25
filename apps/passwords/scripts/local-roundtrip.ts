import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { PasswordsEnvironment } from '../src/service/environment';
import {
  Capture,
  check,
  FixtureCheckError,
  interceptBackend,
  interceptLogs,
} from './local-roundtrip-capture';
import {
  ACTOR,
  captureContainerLogs,
  ITEM,
  isolated,
  ROTATE,
  seed,
  snapshot,
  VAULT,
  WORKSPACE,
} from './local-roundtrip-isolated';
import { tlsBridge } from './local-roundtrip-tls';

async function main() {
  const capture = new Capture();
  const restoreLogs = interceptLogs(capture);
  const mask = process.umask(0o077);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240000);
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let restoreFetch: (() => void) | undefined;
  let bridge: Awaited<ReturnType<typeof tlsBridge>> | undefined;
  let directory: string | undefined;
  const owned: Buffer[] = [];
  let env: PasswordsEnvironment | undefined;
  let stage = 'ISOLATION';
  let passed = false;
  let failure = 'UNEXPECTED';
  let stats = { requests: 0, uploads: 0, captures: 0, tls: 0 };
  let stack: Awaited<ReturnType<typeof isolated>> | undefined;
  const since = new Date().toISOString();
  try {
    stack = await isolated(process.argv.slice(2));
    directory = await mkdtemp(join(stack.root, 'passwords-roundtrip-'));
    const value = randomBytes(4096);
    const coordination = randomBytes(48);
    const master = randomBytes(48);
    owned.push(value, coordination, master);
    for (const secret of owned) capture.secret(secret);
    for (const key of [stack.serviceKey, stack.anonKey]) {
      const bytes = Buffer.from(key);
      capture.secret(bytes);
      bytes.fill(0);
    }
    restoreFetch = interceptBackend(stack.api, capture, controller.signal);
    stage = 'SEED';
    seed(stack);
    const { createAppSessionToken } = await import(
      '@tuturuuu/auth/app-session-core'
    );
    const { workspaceKeyWrapper } = await import(
      '@tuturuuu/storage-core/vault/workspace-key-wrapper'
    );
    const { PASSWORDS_BUCKET } = await import(
      '@tuturuuu/storage-core/vault/passwords-contract'
    );
    const { createPasswordsService } = await import(
      '../src/service/vault-service.server'
    );
    const { createSecretsHandler } = await import(
      '../src/service/secrets-adapter.server'
    );
    const { cliScopeName } = await import('../src/service/cli-scope');
    const { SECRETS_ORIGIN } = await import('../src/service/secrets-protocol');
    const { runSecretsCommand, SecretsUsageError } = await import(
      '../../../packages/sdk/src/cli/secrets'
    );
    const { OperationJournal } = await import(
      '../../../packages/sdk/src/cli/secrets-journal'
    );
    env = {
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
      PASSWORDS_ENABLED: 'true',
      NEXT_PUBLIC_APP_URL: SECRETS_ORIGIN,
      NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
      NEXT_PUBLIC_SUPABASE_URL: stack.api,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: stack.anonKey,
      SUPABASE_SECRET_KEY: stack.serviceKey,
      TUTURUUU_APP_COORDINATION_SECRET: coordination.toString('base64url'),
      ENCRYPTION_MASTER_KEY: master.toString('base64url'),
    };
    const mint = (scoped: boolean) => {
      const now = Math.floor(Date.now() / 1000);
      const issued = createAppSessionToken(
        {
          userId: ACTOR,
          targetApp: 'passwords',
          originApp: 'passwords',
          expiresInSeconds: 240,
          scopes: scoped ? [cliScopeName(WORKSPACE, VAULT)] : [],
          mfa: {
            sessionId: 'synthetic-fixture-proof',
            verifiedAt: now,
            expiresAt: now + 240,
          },
        },
        { secret: env!.TUTURUUU_APP_COORDINATION_SECRET }
      );
      check(issued.claims.exp - issued.claims.iat <= 300, 'TOKEN_LIFETIME');
      const bytes = Buffer.from(issued.token);
      capture.secret(bytes);
      bytes.fill(0);
      return issued;
    };
    stage = 'CREATE_VAULT';
    const owner = mint(false);
    const request = new Request(`${SECRETS_ORIGIN}/en/${WORKSPACE}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${owner.token}` },
      signal: controller.signal,
    });
    const created = await createPasswordsService(request, env).createVault({
      wsId: WORKSPACE,
      requestId: VAULT,
      name: 'Synthetic file fixture',
    });
    check(created.ok && created.value.vaultId === VAULT, 'CREATE_VAULT');
    bridge = await tlsBridge(
      directory,
      createSecretsHandler(env).handle,
      controller.signal
    );
    const tlsKey = await readFile(join(directory, 'server.key'));
    capture.secret(tlsKey);
    tlsKey.fill(0);
    const signed = mint(true);
    const credentials = join(directory, 'credentials.json');
    const source = join(directory, 'source.bin');
    const output = join(directory, 'output.bin');
    const rotatedOutput = join(directory, 'rotated.bin');
    const credentialBytes = Buffer.from(
      JSON.stringify({
        version: 1,
        endpoint: bridge.endpoint,
        workspaceId: WORKSPACE,
        vaultId: VAULT,
        token: signed.token,
        expiresAt: signed.expiresAt,
      })
    );
    try {
      await writeFile(credentials, credentialBytes, {
        mode: 0o600,
        flag: 'wx',
      });
    } finally {
      credentialBytes.fill(0);
    }
    await writeFile(source, value, { mode: 0o600, flag: 'wx' });
    let exit = 0;
    const deps = {
      fetch: bridge.fetch,
      timeoutMs: 30000,
      allowedEndpoints: [bridge.endpoint],
      defaultCredentialsFile: credentials,
      stdout: (text: string) => capture.add(text),
      stderr: (text: string) => capture.add(text),
      setExitCode: (code: number) => {
        exit = code;
      },
    };
    const run = async (args: string[], operationId?: string) => {
      check(!controller.signal.aborted, 'FIXTURE_DEADLINE');
      exit = 0;
      await runSecretsCommand(args, {
        ...deps,
        ...(operationId ? { randomUUID: () => operationId } : {}),
      });
    };
    stage = 'PUT_LOST_RESPONSE';
    await run(['put', 'SYNTHETIC_FILE', '--from-file', source], ITEM);
    check(
      Number(exit) === 3 && bridge.counts().dropped && capture.uploads === 1,
      'UNKNOWN_AFTER_COMMIT'
    );
    const journal = new OperationJournal(OperationJournal.pathFor(credentials));
    const unresolved = await journal.unresolved(WORKSPACE, VAULT);
    check(
      unresolved.length === 1 && unresolved[0]?.requestId === ITEM,
      'ORIGINAL_OPERATION'
    );
    const beforeReconcile = capture.uploads;
    stage = 'RECONCILE';
    await run(['reconcile', ITEM]);
    check(
      Number(exit) === 0 &&
        (await journal.unresolved(WORKSPACE, VAULT)).length === 0 &&
        capture.uploads === beforeReconcile,
      'RECONCILE_WITHOUT_UPLOAD'
    );
    check(
      bridge.actions.filter((action) => action.action === 'put').length === 1 &&
        bridge.actions.some(
          (action) =>
            action.action === 'request.status' &&
            action.targetRequestId === ITEM
        ),
      'RECONCILE_IDENTITY'
    );
    const equalFile = async (path: string) => {
      const bytes = await readFile(path);
      try {
        check(
          bytes.length === value.length && timingSafeEqual(bytes, value),
          'FILE_BYTES'
        );
        const stat = await lstat(path);
        check(
          stat.isFile() &&
            (stat.mode & 0o777) === 0o600 &&
            stat.uid === process.getuid?.(),
          'FILE_MODE'
        );
      } finally {
        bytes.fill(0);
      }
    };
    stage = 'GET';
    await run(['get', 'SYNTHETIC_FILE', '--to-file', output]);
    check(Number(exit) === 0, 'GET_EXIT');
    await equalFile(output);
    const requestsBeforeRefusal = bridge.counts().requests;
    let refused = false;
    try {
      await run(['get', 'SYNTHETIC_FILE', '--to-file', output]);
    } catch (error) {
      refused = error instanceof SecretsUsageError;
    }
    check(
      refused && bridge.counts().requests === requestsBeforeRefusal,
      'OVERWRITE_REFUSAL'
    );
    await equalFile(output);
    stage = 'ROTATE';
    await run(['rotate'], ROTATE);
    check(Number(exit) === 0 && Number(capture.uploads) === 2, 'ROTATE_EXIT');
    await run(['get', 'SYNTHETIC_FILE', '--to-file', rotatedOutput]);
    check(Number(exit) === 0, 'GET_ROTATED_EXIT');
    await equalFile(rotatedOutput);
    stage = 'DATABASE_AND_STORAGE';
    const data = snapshot(stack, capture);
    check(
      data.password_vaults.length === 1 &&
        data.password_vaults[0].active_version === 2 &&
        data.password_vault_versions.length === 2 &&
        data.password_vault_items.length === 1 &&
        data.password_vault_files.length === 2 &&
        data.storage_objects.length === 2,
      'DATABASE_COUNTS'
    );
    const item = data.password_vault_items[0];
    check(
      item.id === ITEM &&
        item.version === 2 &&
        item.encrypted_payload === null &&
        typeof item.encrypted_metadata === 'string' &&
        item.encrypted_file_id,
      'CIPHERTEXT_ROW'
    );
    for (const version of data.password_vault_versions) {
      const dataKey = await workspaceKeyWrapper(
        env.ENCRYPTION_MASTER_KEY
      ).unwrap(version.encrypted_data_key);
      try {
        check(dataKey.length === 32, 'DATA_KEY_LENGTH');
        capture.secret(dataKey);
      } finally {
        dataKey.fill(0);
      }
    }
    for (const file of data.password_vault_files) {
      check(
        file.ws_id === WORKSPACE &&
          file.vault_id === VAULT &&
          file.item_id === ITEM &&
          /^[0-9a-f-]{36}$/.test(file.id) &&
          [1, 2].includes(file.version),
        'STORAGE_ROW'
      );
      const path = `${WORKSPACE}/${VAULT}/${file.version}/${ITEM}/${file.id}`;
      check(
        file.object_path === path &&
          data.storage_objects.some(
            (object: { id: string; name: string }) =>
              object.id === file.storage_object_id && object.name === path
          ),
        'STORAGE_REFERENCE'
      );
      const response = await fetch(
        `${stack.api}/storage/v1/object/${PASSWORDS_BUCKET}/${path}`,
        {
          headers: {
            apikey: stack.serviceKey,
            authorization: `Bearer ${stack.serviceKey}`,
          },
          signal: controller.signal,
        }
      );
      check(response.ok, 'STORAGE_DOWNLOAD');
      const bytes = Buffer.from(await response.arrayBuffer());
      try {
        check(bytes.length === Number(file.ciphertext_bytes), 'STORAGE_LENGTH');
        const envelope = JSON.parse(bytes.toString('utf8'));
        check(
          envelope.alg === 'A256GCM' && typeof envelope.ciphertext === 'string',
          'STORAGE_ENVELOPE'
        );
        capture.add(bytes);
        const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
        try {
          capture.add(ciphertext);
        } finally {
          ciphertext.fill(0);
        }
      } finally {
        bytes.fill(0);
      }
    }
    stage = 'LEAK_CHECK';
    const journalBytes = await readFile(journal.path);
    try {
      capture.add(journalBytes);
    } finally {
      journalBytes.fill(0);
    }
    await bridge.close();
    const tls = bridge.counts();
    check(
      !tls.failed && tls.encrypted === tls.requests && tls.requests === 5,
      'TLS_COUNTS'
    );
    bridge = undefined;
    captureContainerLogs(stack, capture, since);
    capture.verify();
    check(!controller.signal.aborted, 'FIXTURE_DEADLINE');
    stats = {
      requests: capture.requests,
      uploads: capture.uploads,
      captures: capture.records.length,
      tls: tls.encrypted,
    };
    passed = true;
  } catch (error) {
    passed = false;
    if (error instanceof FixtureCheckError) failure = error.code;
  } finally {
    controller.abort();
    try {
      await bridge?.close();
    } catch {
      passed = false;
      stage = 'TLS_CLEANUP';
    }
    restoreFetch?.();
    if (env) {
      env.ENCRYPTION_MASTER_KEY = '';
      env.TUTURUUU_APP_COORDINATION_SECRET = '';
      env.SUPABASE_SECRET_KEY = '';
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '';
    }
    if (stack) {
      stack.serviceKey = '';
      stack.anonKey = '';
    }
    for (const bytes of owned) bytes.fill(0);
    if (directory) {
      try {
        // This fresh 0700 leaf is the only cleanup target; the parent owns the stack.
        for (const name of await readdir(directory)) {
          const path = join(directory, name);
          const stat = await lstat(path);
          check(
            stat.isFile() &&
              !stat.isSymbolicLink() &&
              stat.uid === process.getuid?.(),
            'CLEANUP_FILE'
          );
        }
        await rm(directory, { recursive: true });
      } catch {
        passed = false;
        stage = 'FILE_CLEANUP';
      }
    }
    try {
      capture.verify();
    } catch {
      passed = false;
      stage = 'LEAK_CHECK';
    }
    capture.wipe();
    restoreLogs();
    process.umask(mask);
    clearTimeout(timeout);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
  if (passed)
    process.stdout.write(
      `PASS passwords-real-roundtrip tls=${stats.tls} uploads=${stats.uploads} requests=${stats.requests} captures=${stats.captures}\n`
    );
  else process.stderr.write(`FAIL passwords-real-roundtrip stage=${stage} code=${failure}\n`);
  return passed ? 0 : 1;
}

process.exitCode = await main();
