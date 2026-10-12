import { spawn } from 'node:child_process';
import { expectedTapCounts } from './employee-validation-core.mjs';

export function safeFailure(error, phase = 'employee-gate') {
  return (
    error.receipt ?? {
      phase,
      reason:
        error.code === 'ERR_ASSERTION'
          ? 'assertion-failed'
          : 'validation-failed',
      code: 1,
      clientClosed: null,
      sqlstates: [],
      compilerCodes: [],
    }
  );
}
export function commandFailure(result) {
  const error = new Error(
    `Finite ${result.phase} command failed: ${result.reason}`
  );
  error.receipt = { ...result };
  delete error.receipt.stdout;
  return error;
}
/** Never log raw diagnostics or argv, which can contain credentials or SQL data. */
export function boundedCommand(
  command,
  args,
  cwd,
  {
    timeoutMs = 60000,
    maxBytes = 16 * 1024 * 1024,
    input = null,
    spawnChild = spawn,
    phase = 'command',
    context = null,
  } = {}
) {
  if (context)
    return context.run(command, args, cwd, { timeoutMs, maxBytes, phase });
  return new Promise((resolve) => {
    let output = '',
      bytes = 0,
      failed = false,
      closed = false,
      reason = null,
      diagnosticTail = '';
    const sqlstates = new Set(),
      compilerCodes = new Set();
    const scan = (chunk) => {
      const text = diagnosticTail + chunk.toString();
      for (const match of text.matchAll(
        /(?:SQLSTATE[=: ]+|ERROR:\s+)([0-9A-Z]{5})\b/gu
      ))
        if (/^(?:[0-9]{2}|P0|XX|F0|HV)[0-9A-Z]{3}$/u.test(match[1]))
          sqlstates.add(match[1]);
      for (const match of text.matchAll(/\berror (TS[0-9]{4,5})\b/gu))
        compilerCodes.add(match[1]);
      diagnosticTail = text.slice(-256);
    };
    const receipt = (code, clientClosed, stdout = '') => ({
      code,
      stdout,
      clientClosed,
      phase,
      reason: reason ?? (code === 0 ? 'success' : 'nonzero-exit'),
      sqlstates: [...sqlstates],
      compilerCodes: [...compilerCodes],
    });
    const child = spawnChild(command, args, {
      cwd,
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' },
      stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let deadline, killDeadline, closeDeadline;
    const finish = (result) => {
      if (closed) return;
      closed = true;
      for (const handle of [deadline, killDeadline, closeDeadline])
        clearTimeout(handle);
      resolve(result);
    };
    const fail = (cause) => {
      if (failed || closed) return;
      failed = true;
      reason = cause;
      child.kill('SIGTERM');
      killDeadline = setTimeout(() => child.kill('SIGKILL'), 1000);
      closeDeadline = setTimeout(() => finish(receipt(1, false)), 2000);
    };
    deadline = setTimeout(() => fail('timeout'), timeoutMs);
    child.stdout.on('data', (chunk) => {
      scan(chunk);
      bytes += chunk.length;
      if (bytes > maxBytes) fail('output-overflow');
      else if (!failed) output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      scan(chunk);
      bytes += chunk.length;
      if (bytes > maxBytes) fail('output-overflow');
    });
    child.on('error', () => fail('spawn-error'));
    child.once('close', (code) =>
      // Killing our direct child does not prove its owned descendants closed.
      finish(receipt(failed ? 1 : (code ?? 1), !failed, failed ? '' : output))
    );
    if (input !== null) {
      child.stdin.on('error', () => fail('input-error'));
      child.stdin.end(input);
    }
  });
}

export async function requireCommand(command, args, cwd, options) {
  const result = await boundedCommand(command, args, cwd, options);
  if (result.code !== 0 || !result.clientClosed) throw commandFailure(result);
  return result;
}

/** Each attempted producer has an independent, monotonic closure receipt. */
export function createProducerTracker({ persist = async () => {} } = {}) {
  const receipts = [],
    secondaryFailures = [];
  const recordPersistenceFailure = (error, phase) => {
    secondaryFailures.push({
      source: 'producer-ledger',
      ...safeFailure(error, phase),
    });
  };
  return {
    receipts: () => receipts.map((receipt) => ({ ...receipt })),
    secondaryFailures: () =>
      secondaryFailures.map((receipt) => ({ ...receipt })),
    async attempt(phase, operation) {
      const receipt = { phase, attempted: true, clientClosed: null };
      receipts.push(receipt);
      // Recovery state is written before the operation can produce work.
      await persist(receipts);
      let result;
      try {
        result = await operation();
        // Convert returned native failures before any recovery write can fail.
        if (
          result?.code !== undefined &&
          (result.code !== 0 || result.clientClosed !== true)
        )
          throw commandFailure(result);
      } catch (error) {
        receipt.clientClosed = error.receipt?.clientClosed === true;
        try {
          await persist(receipts);
        } catch (secondary) {
          recordPersistenceFailure(secondary, phase);
          receipt.clientClosed = false;
        }
        throw error;
      }
      receipt.clientClosed = result?.clientClosed === true;
      try {
        await persist(receipts);
      } catch (error) {
        // Success cannot discharge a lost recovery update.
        recordPersistenceFailure(error, phase);
        receipt.clientClosed = false;
        throw error;
      }
      return result;
    },
  };
}

/** Only the existing driver's finite reviewed argument shapes reach the client. */
export function validateSupervisedCommand(command, args, cwd, phase, binding) {
  const fail = () => {
    throw new Error('Unreviewed supervised command');
  };
  const same = (expected) => {
    if (JSON.stringify(args) !== JSON.stringify(expected)) fail();
  };
  const ownedRoot = (root) =>
    typeof root === 'string' &&
    root.startsWith(`${binding.supervisor.temporaryRoot}/tuturuuu-supabase-`) &&
    !root.slice(binding.supervisor.temporaryRoot.length + 1).includes('/') &&
    !root.includes('..');
  const id = (value) => /^[a-f0-9]{64}$/u.test(value);
  const project = '[a-z0-9-]+';
  const excluded =
    'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';
  if (!Array.isArray(args) || !args.every((v) => typeof v === 'string')) fail();
  if (command === 'reviewed-cli') {
    if (!ownedRoot(args[1]) || cwd !== args[1]) fail();
    if (phase === 'start')
      return same(['--workdir', cwd, 'start', '--exclude', excluded]);
    if (phase === 'reset') return same(['--workdir', cwd, 'db', 'reset']);
    fail();
  }
  if (command === 'reviewed-node') {
    if (
      !cwd.endsWith('/actual-types') ||
      !ownedRoot(cwd.slice(0, -'/actual-types'.length))
    )
      fail();
    if (phase !== 'typegen-compiler') fail();
    return same([
      `${binding.host.executionRoot}/node_modules/typescript/bin/tsc`,
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'esnext',
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      'apps/database/scripts/employee-validation-types.ts',
    ]);
  }
  if (command !== 'docker' || cwd !== binding.host.executionRoot) fail();
  const prefix = ['--host', binding.host.daemonEndpoint];
  if (JSON.stringify(args.slice(0, 2)) !== JSON.stringify(prefix)) fail();
  const tail = args.slice(2);
  if (phase === 'owned-inspection') {
    const format =
      '{{json .Id}}\n{{json .Name}}\n{{json .Config.Labels}}\n{{json .HostConfig}}\n{{json .State}}\n{{json .Image}}';
    if (
      !id(tail[3]) &&
      !new RegExp(`^(supabase_db_|employee_types_)${project}$`, 'u').test(
        tail[3]
      )
    )
      fail();
    return same([...prefix, 'inspect', '--format', format, tail[3]]);
  }
  if (phase === 'executor-absence') {
    if (
      !new RegExp(`^name=\\^/employee_types_${project}\\$$`, 'u').test(tail[3])
    )
      fail();
    return same([
      ...prefix,
      'ps',
      '-a',
      '--filter',
      tail[3],
      '--no-trunc',
      '--format',
      '{{.ID}}',
    ]);
  }
  if (phase === 'owned-network') {
    if (!new RegExp(`^supabase_network_${project}$`, 'u').test(tail[4])) fail();
    return same([
      ...prefix,
      'network',
      'inspect',
      '--format',
      '{{.Name}}\n{{json .Labels}}',
      tail[4],
    ]);
  }
  if (phase === 'typegen-execute' || phase === 'typegen-remove') {
    if (!id(tail[2])) fail();
    return same([
      ...prefix,
      ...(phase === 'typegen-execute'
        ? ['start', '--attach']
        : ['rm', '--force']),
      tail[2],
    ]);
  }
  if (phase === 'typegen-create') {
    const name = tail[4],
      token = tail[8]?.split('=')[1];
    const p = name?.slice('employee_types_'.length);
    if (
      !new RegExp(`^employee_types_${project}$`, 'u').test(name) ||
      !/^[a-zA-Z0-9-]+$/u.test(token)
    )
      fail();
    const image = binding.images.find((v) => v.role === 'pgmeta').id;
    return same([
      ...prefix,
      'create',
      '--pull',
      'never',
      '--name',
      name,
      '--label',
      `com.supabase.cli.project=${p}`,
      '--label',
      `tuturuuu.employee.executor=${token}`,
      '--network',
      `supabase_network_${p}`,
      '--cpus',
      '2',
      '--memory',
      '1g',
      '--memory-swap',
      '1g',
      '--pids-limit',
      '128',
      '--env',
      'PG_META_DB_URL=postgresql://postgres:postgres@db:5432/postgres',
      '--env',
      'PG_CONN_TIMEOUT_SECS=15',
      '--env',
      'PG_QUERY_TIMEOUT_SECS=45',
      '--env',
      'PG_META_GENERATE_TYPES=typescript',
      '--env',
      'PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public,private,storage',
      '--env',
      'PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true',
      image,
      'node',
      'dist/server/server.js',
    ]);
  }
  const packet = phase.replace(/^sql-(copy|packet)-/u, '');
  if (!Object.hasOwn(expectedTapCounts, packet)) fail();
  const target = `/tmp/${packet}`;
  if (phase.startsWith('sql-copy-')) {
    const source = tail[1],
      container = tail[2]?.split(':')[0];
    if (
      !source?.endsWith(`/supabase/tests/${packet}`) ||
      !ownedRoot(source.slice(0, -`/supabase/tests/${packet}`.length)) ||
      !new RegExp(`^supabase_db_${project}$`, 'u').test(container)
    )
      fail();
    return same([...prefix, 'cp', source, `${container}:${target}`]);
  }
  if (
    !phase.startsWith('sql-packet-') ||
    !new RegExp(`^supabase_db_${project}$`, 'u').test(tail[3])
  )
    fail();
  return same([
    ...prefix,
    'exec',
    '--env',
    'PGOPTIONS=-c statement_timeout=45000 -c lock_timeout=3000',
    tail[3],
    'psql',
    '-X',
    '-A',
    '-t',
    '-v',
    'VERBOSITY=verbose',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '--dbname',
    'postgres',
    '-f',
    target,
  ]);
}
