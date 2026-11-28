import { CLI_EXIT, CliError } from '../cli-contracts';
import { type CliEnv, resolveCliEnv } from '../cli-env';
import { readCliConfig } from '../config';
import { rejectSecretFlags } from '../credential-store';
import { formatCliError } from '../ui/errors';
import { formatTable } from '../ui/table';
import { parseWatchInterval, runWatchLoop } from '../ui/watch';
import {
  canonicalizeJson,
  changePacketDigestsMatch,
  createChangePacket,
  packetDigestSchema,
  packetProviderSchema,
  readChangePacketFile,
  writeChangePacketFile,
} from './change-packet';
import {
  assertSafeInfraText,
  createInfraClient,
  dnsRecordTypeSchema,
  type InfraClientOptions,
  infraEnvSecrets,
} from './client';

export interface RunInfraCommandDeps extends Omit<
  InfraClientOptions,
  'env' | 'profile'
> {
  readConfig?: () => Promise<{ defaultEnv?: CliEnv }>;
  write?: (chunk: string) => void;
  writeErr?: (chunk: string) => void;
  setExitCode?: (code: number) => void;
  isTTY?: boolean;
  signal?: AbortSignal;
  now?: () => Date;
}

export function infraHelp(): string {
  return [
    'Usage: ttr infra <command> [options]',
    '',
    '  cloudflare zones|overview',
    '  workers list|get <name>',
    '  deploys list [--worker <project>] [--watch [seconds]]',
    '  dns-readonly list --zone <id> [--type A|AAAA|CNAME|TXT|MX]',
    '  runners list|status [--watch [seconds]]',
    '  hosts list|status',
    '  ip list [--ip <addr>] | inspect <addr> | whoami',
    '  ip unblock <addr> --reason <text>',
    '  ip block <addr> --reason <text> --ttl <seconds>',
    '  ratelimit status',
    '  packet create --provider <provider> --target <target> --action <action>',
    '      --summary <text> --rollback <plan> [--reason <text>] [--changes <json-array>]',
    '      [--out <file> --yes] [--dry-run]',
    '  packet verify --file <path> [--expected-digest <sha256:...>]',
    '  packet show --file <path>',
    '',
    'Options: --env prod|staging|sandbox|local, --profile <name>, --json, --no-color',
    'Watch emits one JSON object per poll with --json. Interval: 10–3600 seconds.',
    'Cloudflare Workers inventory uses TTR_INFRA_CF_ACCOUNT_ID.',
    'Packets propose changes for exact-digest approval. Use --env prod for production packets.',
    'Packet output files require an existing private 0700 directory.',
  ].join('\n');
}

const BOOLEAN_FLAGS = new Set(['json', 'no-color', 'yes', 'dry-run', 'help']);
const GLOBAL_FLAGS = ['json', 'no-color', 'help', 'env', 'profile'];
type Flags = Map<string, string | true>;

function usage(message: string): CliError {
  return new CliError({ code: 'INVALID_INFRA_USAGE', message });
}

function parseInfraArgs(argv: string[]) {
  const optionNames = argv
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => [arg.slice(2).split('=', 1)[0], true]);
  rejectSecretFlags(Object.fromEntries(optionNames));
  const flags: Flags = new Map();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '-h') {
      flags.set('help', true);
      continue;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [name = '', inline] = arg.slice(2).split(/=(.*)/su, 2);
    if (!name || flags.has(name)) throw usage('Invalid or duplicate option.');
    if (BOOLEAN_FLAGS.has(name)) {
      if (inline !== undefined && !(name === 'dry-run' && inline === 'true')) {
        throw usage('Boolean options do not accept a value.');
      }
      flags.set(name, true);
      continue;
    }
    const next = argv[index + 1];
    if (inline === undefined && next && !next.startsWith('-')) {
      flags.set(name, next);
      index += 1;
    } else if (inline !== undefined || name === 'watch') {
      flags.set(name, inline ?? true);
    } else {
      throw usage('Option value is required.');
    }
  }
  return { flags, positionals };
}

function checkFlags(flags: Flags, ...allowed: string[]) {
  for (const key of flags.keys()) {
    if (!GLOBAL_FLAGS.includes(key) && !allowed.includes(key)) {
      throw usage(
        'An option is unavailable for this command. Run ttr infra --help.'
      );
    }
  }
}

function optionalText(flags: Flags, key: string): string | undefined {
  const value = flags.get(key);
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim())
    throw usage(`Provide a value for --${key}.`);
  return value;
}

function requiredText(flags: Flags, key: string): string {
  const value = optionalText(flags, key);
  if (value === undefined) throw usage(`Missing --${key}.`);
  return value;
}

const INVALID_DIGEST =
  'Expected a digest in sha256:<64 lowercase hex digits> form.';

interface PacketCommandOptions {
  env: CliEnv;
  explicitEnvFlag: boolean;
  flags: Flags;
  json: boolean;
  secrets: ReturnType<typeof infraEnvSecrets>;
  write: (chunk: string) => void;
  now?: () => Date;
}

function packetChanges(flags: Flags): unknown[] {
  const value = optionalText(flags, 'changes');
  if (value === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Invalid JSON uses the same diagnostic as a non-array value.
  }
  throw usage('--changes must be a JSON array.');
}

async function packetCommand(
  action: string | undefined,
  options: PacketCommandOptions
) {
  const { env, explicitEnvFlag, flags, json, secrets, write, now } = options;
  if (action === 'create') {
    checkFlags(
      flags,
      'provider',
      'target',
      'action',
      'summary',
      'reason',
      'rollback',
      'changes',
      'out',
      'yes',
      'dry-run'
    );
    if (env === 'prod' && explicitEnvFlag !== true) {
      throw new CliError({
        code: 'PROD_ENV_EXPLICIT_REQUIRED',
        exitCode: CLI_EXIT.policy,
        message:
          'Pass --env prod explicitly to create a production change packet.',
      });
    }
    const provider = packetProviderSchema.safeParse(
      requiredText(flags, 'provider')
    );
    if (!provider.success)
      throw usage(
        'Choose cloudflare, tuturuuu-infra or github-runners as the packet provider.'
      );
    const summary = requiredText(flags, 'summary');
    const outPath = optionalText(flags, 'out');
    const packet = createChangePacket(
      {
        action: requiredText(flags, 'action'),
        changes: packetChanges(flags),
        createdAt: now?.().toISOString(),
        env,
        provider: provider.data,
        reason: optionalText(flags, 'reason') ?? summary,
        rollbackPlan: requiredText(flags, 'rollback'),
        summary,
        target: requiredText(flags, 'target'),
      },
      secrets
    );
    if (outPath && flags.get('yes') === true && flags.get('dry-run') !== true) {
      await writeChangePacketFile(outPath, packet, secrets);
    }
    write(
      `${json ? canonicalizeJson(packet) : JSON.stringify(packet, null, 2)}\n`
    );
    return;
  }

  if (action !== 'verify' && action !== 'show')
    throw usage('Choose packet create, verify or show.');
  if (action === 'verify') checkFlags(flags, 'file', 'expected-digest');
  else checkFlags(flags, 'file');
  const expected = optionalText(flags, 'expected-digest');
  if (
    expected !== undefined &&
    !packetDigestSchema.safeParse(expected).success
  ) {
    throw usage(INVALID_DIGEST);
  }
  const packet = await readChangePacketFile(
    requiredText(flags, 'file'),
    secrets
  );
  if (
    expected !== undefined &&
    !changePacketDigestsMatch(expected, packet.digest)
  ) {
    throw new CliError({
      code: 'CHANGE_PACKET_EXPECTED_DIGEST_MISMATCH',
      exitCode: CLI_EXIT.conflict,
      message: 'Change packet digest differs from the expected digest.',
    });
  }
  const verified = json
    ? JSON.stringify({ ok: true, digest: packet.digest })
    : `Verified change packet ${packet.digest}`;
  const shown = json
    ? canonicalizeJson(packet)
    : JSON.stringify(packet, null, 2);
  write(`${action === 'show' ? shown : verified}\n`);
}

type Client = ReturnType<typeof createInfraClient>;
type Row = Record<string, unknown>;
type ReadView = {
  columns: string[];
  read: (signal?: AbortSignal) => Promise<Row[]>;
  intervalSeconds?: number;
};

function watchInterval(flags: Flags): number {
  try {
    const interval = flags.get('watch');
    if (interval === '') throw usage('Missing watch interval.');
    return parseWatchInterval(interval, 15);
  } catch {
    throw usage(
      'Pass --watch without a value or with an integer from 10 to 3600.'
    );
  }
}

function readView(
  client: Client,
  positionals: string[],
  flags: Flags
): ReadView {
  const [family, action, name] = positionals;
  if (positionals.length > (family === 'workers' && action === 'get' ? 3 : 2)) {
    throw usage('Unexpected positional argument.');
  }
  switch (family) {
    case 'cloudflare': {
      checkFlags(flags);
      if (action === 'zones') {
        return {
          columns: ['name', 'status', 'type', 'id'],
          read: client.listCloudflareZones,
        };
      }
      if (action === 'overview') {
        return {
          columns: ['status', 'zones'],
          async read() {
            const zones = await client.listCloudflareZones();
            const counts = new Map<string, number>();
            for (const zone of zones) {
              const status =
                typeof zone.status === 'string' ? zone.status : 'unknown';
              counts.set(status, (counts.get(status) ?? 0) + 1);
            }
            return Array.from(counts, ([status, zones]) => ({ status, zones }));
          },
        };
      }
      break;
    }
    case 'workers':
      checkFlags(flags);
      if (action === 'list') {
        return {
          columns: ['id', 'modified_on', 'compatibility_date'],
          read: client.listWorkers,
        };
      }
      if (action === 'get' && name) {
        return {
          columns: ['id', 'created_on', 'modified_on', 'compatibility_date'],
          async read() {
            const worker = (await client.listWorkers()).find(
              (row) => row.id === name
            );
            if (!worker) {
              throw new CliError({
                code: 'WORKER_NOT_FOUND',
                exitCode: CLI_EXIT.notFound,
                message:
                  'Worker not found in the configured Cloudflare account.',
              });
            }
            return [worker];
          },
        };
      }
      break;
    case 'deploys':
      checkFlags(flags, 'worker', 'watch');
      if (action === 'list') {
        const worker = optionalText(flags, 'worker');
        return {
          columns: worker
            ? ['lane', 'kind', 'status', 'sha']
            : ['id', 'provider', 'workflows'],
          read: (signal) => client.listDeployments(worker, signal),
          intervalSeconds: watchInterval(flags),
        };
      }
      break;
    case 'dns-readonly': {
      checkFlags(flags, 'zone', 'type');
      if (action !== 'list') break;
      const zone = requiredText(flags, 'zone');
      const type = optionalText(flags, 'type');
      const parsedType = dnsRecordTypeSchema.optional().safeParse(type);
      if (!parsedType.success)
        throw usage('Choose DNS type A, AAAA, CNAME, TXT or MX.');
      return {
        columns: ['type', 'name', 'content', 'ttl'],
        read: () => client.listDnsRecords(zone, parsedType.data),
      };
    }
    case 'runners':
      checkFlags(flags, 'watch');
      if (action === 'list' || action === 'status') {
        return {
          columns:
            action === 'list'
              ? ['id', 'name', 'status']
              : ['name', 'status', 'last_heartbeat_at', 'drained'],
          read: client.listRunners,
          intervalSeconds: watchInterval(flags),
        };
      }
      break;
    case 'hosts':
      checkFlags(flags);
      if (action === 'list' || action === 'status') {
        return {
          columns:
            action === 'list'
              ? ['id', 'name', 'status']
              : ['name', 'status', 'last_heartbeat_at', 'resource_limits'],
          read: client.listHosts,
        };
      }
      break;
  }
  throw usage('Unknown infrastructure command. Run ttr infra --help.');
}

async function runReadView(
  view: ReadView,
  options: Pick<RunInfraCommandDeps, 'isTTY' | 'signal'> & {
    json: boolean;
    noColor: boolean;
    title: string;
    write: (chunk: string) => void;
  }
) {
  const {
    json,
    noColor,
    isTTY = Boolean(process.stdout.isTTY),
    signal,
    title,
    write,
  } = options;
  function renderHuman(rows: Row[]) {
    return formatTable(rows, {
      columns: view.columns.map((key) => ({ key })),
      emptyMessage: 'No matching records.',
      noColor: noColor || !isTTY,
    });
  }
  if (!view.intervalSeconds) {
    const rows = await view.read(signal);
    write(
      json ? `${JSON.stringify(rows)}\n` : `${renderHuman(rows).trimEnd()}\n`
    );
    return;
  }

  const terminal = new AbortController();
  const watchSignal = signal
    ? AbortSignal.any([signal, terminal.signal])
    : terminal.signal;
  await runWatchLoop({
    async fetch({ signal: tickSignal }) {
      try {
        return await view.read(tickSignal);
      } catch (error) {
        if (
          !(error instanceof CliError) ||
          error.exitCode !== CLI_EXIT.unavailable
        ) {
          terminal.abort(error);
        }
        throw error;
      }
    },
    intervalSeconds: view.intervalSeconds,
    isTTY: isTTY && !noColor,
    json: json || !isTTY,
    renderHuman,
    signal: watchSignal,
    title,
    write,
  });
  if (terminal.signal.aborted) throw terminal.signal.reason;
}

function formatInfraError(
  error: unknown,
  json: boolean,
  noColor: boolean,
  secrets: ReturnType<typeof infraEnvSecrets>
) {
  const safeError =
    error instanceof CliError
      ? error
      : new CliError({
          code: 'INFRA_FAILED',
          message: 'Infrastructure command failed.',
        });
  const formatted = formatCliError(safeError, { json, noColor });
  try {
    assertSafeInfraText(formatted.output, secrets);
    return formatted;
  } catch {
    return {
      exitCode: CLI_EXIT.policy,
      output: json
        ? '{"ok":false,"error":{"code":"CREDENTIAL_LEAK_BLOCKED","message":"Credential output blocked."}}\n'
        : 'Credential output blocked.\n',
    };
  }
}

export async function runInfraCommand(
  argv: string[],
  deps: RunInfraCommandDeps = {}
): Promise<void> {
  const envVars = deps.envVars ?? process.env;
  const secrets = infraEnvSecrets(envVars);
  const output = deps.write ?? ((chunk: string) => process.stdout.write(chunk));
  const writeErr =
    deps.writeErr ?? ((chunk: string) => process.stderr.write(chunk));
  const setExitCode =
    deps.setExitCode ??
    ((code: number) => {
      process.exitCode = code;
    });
  const write = (chunk: string) => {
    assertSafeInfraText(chunk, secrets);
    output(chunk);
  };
  const json = argv.includes('--json');
  const noColor = argv.includes('--no-color');
  try {
    const { flags, positionals } = parseInfraArgs(argv);
    assertSafeInfraText(JSON.stringify(argv), secrets);
    const [family, action] = positionals;
    if (flags.has('help') || family === 'help' || !family) {
      checkFlags(flags);
      write(`${infraHelp()}\n`);
      return;
    }
    if (family === 'ip' || family === 'ratelimit') {
      const { runIpOperator } = await import('./ip.js');
      await runIpOperator(positionals, flags, write);
      return;
    }
    const explicitFlag = optionalText(flags, 'env');
    const config =
      explicitFlag || envVars.TTR_ENV
        ? undefined
        : await (deps.readConfig ?? readCliConfig)().catch(() => undefined);
    const env = resolveCliEnv({
      explicitFlag,
      env: envVars,
      configuredEnv: config?.defaultEnv,
    });
    if (family === 'packet') {
      if (positionals.length !== 2) throw usage('Expected a packet action.');
      await packetCommand(action, {
        env,
        explicitEnvFlag: explicitFlag === 'prod',
        flags,
        json,
        secrets,
        write,
        now: deps.now,
      });
      return;
    }
    const client = createInfraClient({
      ...deps,
      env,
      profile: optionalText(flags, 'profile'),
    });
    await runReadView(readView(client, positionals, flags), {
      json,
      noColor,
      isTTY: deps.isTTY,
      signal: deps.signal,
      title: `infra ${family} ${action}`,
      write,
    });
  } catch (error) {
    const formatted = formatInfraError(error, json, noColor, secrets);
    writeErr(formatted.output);
    setExitCode(formatted.exitCode);
  }
}
