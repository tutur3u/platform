import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseBinaryPath } from '../../database/scripts/run-supabase.js';
import { deriveIsolatedIdentity } from '../../database/scripts/run-supabase-isolated.js';
import {
  type Capture,
  check,
  FixtureCheckError,
} from './local-roundtrip-capture';

export const ACTOR = 'f8000000-0000-4000-8000-000000000001';
export const WORKSPACE = 'f8100000-0000-4000-8000-000000000001';
export const VAULT = 'f8200000-0000-4000-8000-000000000001';
export const ITEM = 'f8300000-0000-4000-8000-000000000001';
export const ROTATE = 'f8400000-0000-4000-8000-000000000001';
const DEADLINE = Date.now() + 240000;

export function command(
  binary: string,
  args: string[],
  cwd: string,
  input?: string
) {
  const remaining = DEADLINE - Date.now();
  check(remaining > 0, 'COMMAND_DEADLINE');
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'HOME',
    'TMPDIR',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_CONFIG',
  ])
    if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync(binary, args, {
    cwd,
    input,
    env,
    timeout: Math.min(20000, remaining),
    killSignal: 'SIGKILL',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0 || result.signal) {
    result.stdout?.fill(0);
    result.stderr?.fill(0);
    throw new FixtureCheckError('CHILD_COMMAND_FAILED');
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function jsonCommand(binary: string, args: string[], cwd: string) {
  const result = command(binary, args, cwd);
  try {
    return JSON.parse(result.stdout.toString('utf8'));
  } finally {
    result.stdout.fill(0);
    result.stderr.fill(0);
  }
}

async function privateJson(path: string) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  let bytes: Buffer | undefined;
  try {
    const stat = await handle.stat();
    check(
      stat.isFile() &&
        stat.uid === process.getuid?.() &&
        stat.nlink === 1 &&
        (stat.mode & 0o077) === 0 &&
        stat.size <= 65536,
      'METADATA_FILE'
    );
    bytes = await handle.readFile();
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    bytes?.fill(0);
    await handle.close();
  }
}

export async function isolated(argv: string[]) {
  check(argv.length === 2, 'USAGE_ROOT_CONTAINER');
  const requestedRoot = resolve(argv[0]!);
  const root = await realpath(requestedRoot);
  const container = argv[1]!;
  check(
    dirname(requestedRoot) === resolve(tmpdir()) &&
      dirname(root) === (await realpath(tmpdir())),
    'ROOT_LOCATION'
  );
  const stat = await lstat(requestedRoot);
  check(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === process.getuid?.() &&
      (stat.mode & 0o077) === 0 &&
      basename(root).startsWith('tuturuuu-supabase-'),
    'ROOT_OWNERSHIP'
  );
  const metadata = await privateJson(
    join(root, '.tuturuuu-isolated-supabase.json')
  );
  const repository = await realpath(
    fileURLToPath(new URL('../../../', import.meta.url))
  );
  check(
    metadata.version === 1 &&
      metadata.disposableRoot === requestedRoot &&
      (await realpath(metadata.disposableRoot)) === root &&
      metadata.repositoryRoot === repository &&
      /^[a-f0-9]{40}$/.test(metadata.headSha),
    'METADATA_IDENTITY'
  );
  const identity = deriveIsolatedIdentity({
    headSha: metadata.headSha,
    repositoryPath: repository,
  });
  check(
    metadata.projectId === identity.projectId &&
      /^tt-[a-z0-9-]+$/.test(identity.projectId),
    'PROJECT_IDENTITY'
  );
  check(container === `supabase_db_${identity.projectId}`, 'CONTAINER_NAME');
  const head = command('git', ['rev-parse', 'HEAD'], repository);
  try {
    check(head.stdout.toString().trim() === metadata.headSha, 'SOURCE_HEAD');
  } finally {
    head.stdout.fill(0);
    head.stderr.fill(0);
  }
  check(
    Number.isInteger(metadata.basePort) &&
      metadata.basePort >= 12000 &&
      metadata.basePort < 32000,
    'PORT_BLOCK'
  );
  check(
    ['resetting', 'testing', 'typegen'].includes(metadata.status),
    'LIFECYCLE_PHASE'
  );
  const context = jsonCommand('docker', ['context', 'inspect'], root);
  const dockerHost =
    process.env.DOCKER_HOST || context[0]?.Endpoints?.docker?.Host;
  check(
    typeof dockerHost === 'string' && dockerHost.startsWith('unix://'),
    'LOCAL_DOCKER_REQUIRED'
  );
  const namesResult = command(
    'docker',
    [
      'ps',
      '--filter',
      `label=com.supabase.cli.project=${identity.projectId}`,
      '--format',
      '{{.Names}}',
    ],
    root
  );
  let containers: string[];
  try {
    containers = namesResult.stdout.toString().trim().split('\n');
  } finally {
    namesResult.stdout.fill(0);
    namesResult.stderr.fill(0);
  }
  check(
    containers.length >= 5 &&
      containers.length <= 24 &&
      containers.every(
        (name) =>
          /^supabase_[a-z0-9_]+_tt-[a-z0-9-]+$/.test(name) &&
          name.endsWith(`_${identity.projectId}`)
      ),
    'CONTAINER_SET'
  );
  for (const service of ['db', 'kong', 'rest', 'auth', 'storage'])
    check(
      containers.includes(`supabase_${service}_${identity.projectId}`),
      'CONTAINER_REQUIRED'
    );
  for (const name of containers) {
    const inspected = jsonCommand(
      'docker',
      ['inspect', '--format', '{{json .}}', name],
      root
    );
    check(
      inspected.Name === `/${name}` &&
        inspected.State?.Running === true &&
        inspected.Config?.Labels?.['com.supabase.cli.project'] ===
          identity.projectId,
      'CONTAINER_OWNERSHIP'
    );
    if (name === `supabase_kong_${identity.projectId}`) {
      const ports = inspected.NetworkSettings?.Ports?.['8000/tcp'];
      check(
        Array.isArray(ports) &&
          ports.length > 0 &&
          ports.every(
            (p: { HostPort: string }) =>
              Number(p.HostPort) === metadata.basePort + 1
          ),
        'GATEWAY_PORT'
      );
    }
  }
  const binary = getSupabaseBinaryPath(join(repository, 'apps/database'));
  const status = jsonCommand(
    binary,
    ['--workdir', root, 'status', '-o', 'json'],
    root
  );
  const api = new URL(status.API_URL);
  check(
    api.protocol === 'http:' &&
      api.hostname === '127.0.0.1' &&
      Number(api.port) === metadata.basePort + 1 &&
      api.pathname === '/' &&
      !api.search &&
      !api.hash &&
      !api.username &&
      !api.password,
    'API_LOOPBACK'
  );
  check(
    typeof status.SERVICE_ROLE_KEY === 'string' &&
      status.SERVICE_ROLE_KEY.length > 32 &&
      typeof status.ANON_KEY === 'string' &&
      status.ANON_KEY.length > 32,
    'LOCAL_STATUS_KEYS'
  );
  const sql = (query: string) => {
    const result = command(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      root,
      `SET statement_timeout = '10s';\n${query}`
    );
    result.stderr.fill(0);
    return result.stdout;
  };
  return {
    root,
    sql,
    containers,
    api: api.origin,
    serviceKey: status.SERVICE_ROLE_KEY as string,
    anonKey: status.ANON_KEY as string,
  };
}

export type Isolated = Awaited<ReturnType<typeof isolated>>;

export function seed(stack: Isolated) {
  const result = stack.sql(`BEGIN;
    INSERT INTO auth.users(id,email,email_confirmed_at,aud,role,instance_id,
      encrypted_password,confirmation_token,recovery_token,email_change_token_new,
      email_change,email_change_token_current,phone_change,phone_change_token,
      reauthentication_token,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES ('${ACTOR}','pw-file-fixture@example.test',now(),'authenticated','authenticated',
      '00000000-0000-0000-0000-000000000000','','','','','','','','','',
      '{"provider":"email","providers":["email"]}','{}',now(),now());
    INSERT INTO public.workspaces(id,name,personal,creator_id)
    VALUES ('${WORKSPACE}','Synthetic file fixture',false,'${ACTOR}');
    COMMIT;`);
  result.fill(0);
}

export function snapshot(stack: Isolated, capture: Capture) {
  const names = [
    'password_vaults',
    'password_vault_members',
    'password_vault_versions',
    'password_vault_items',
    'password_vault_files',
    'password_vault_machine_grants',
    'password_vault_machine_tokens',
    'password_vault_requests',
    'password_vault_audit_events',
  ];
  const pairs = names.map(
    (name) => `'${name}', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM private.${name} t WHERE ws_id = '${WORKSPACE}')`
  );
  pairs.push(`'storage_objects', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    FROM storage.objects t WHERE bucket_id = 'password-vault-files' AND name LIKE '${WORKSPACE}/%')`);
  const bytes = stack.sql(`SELECT jsonb_build_object(${pairs.join(',')});`);
  try {
    capture.add(bytes);
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    bytes.fill(0);
  }
}

export function captureContainerLogs(
  stack: Isolated,
  capture: Capture,
  since: string
) {
  for (const name of stack.containers) {
    const result = command(
      'docker',
      ['logs', '--since', since, name],
      stack.root
    );
    try {
      capture.add(result.stdout);
      capture.add(result.stderr);
    } finally {
      result.stdout.fill(0);
      result.stderr.fill(0);
    }
  }
}
