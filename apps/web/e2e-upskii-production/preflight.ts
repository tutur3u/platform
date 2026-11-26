import { execFile } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_CLI_ENTRY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/sdk/src/cli/index.ts'
);

const CHILD_ENV_ALLOWLIST = [
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LANG',
  'LC_ALL',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'PATH',
  'SSL_CERT_FILE',
  'TMPDIR',
  'TZ',
  'USER',
] as const;

const CLI_TIMEOUT_MS = 30_000;
const CLI_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export interface PreflightOptions {
  json: boolean;
  requireProvisioner: boolean;
  studentSessionFile?: string;
  teacherSessionFile?: string;
}

export interface CliInvocationResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export type PreflightCliRunner = (
  args: readonly string[],
  env: Record<string, string | undefined>
) => Promise<CliInvocationResult>;

export interface PreflightCheckResult {
  detail: string;
  durationMs: number;
  name: string;
  status: 'fail' | 'pass' | 'skip';
}

export interface PreflightReport {
  checkedAt: string;
  checks: PreflightCheckResult[];
  env: 'prod';
  ok: boolean;
  readOnly: true;
}

function normalizeSessionFilePath(
  raw: string | undefined,
  sourceName: string
): string {
  const value = raw?.trim();
  if (!value || value.startsWith('-')) {
    throw new Error(`Invalid or missing path for ${sourceName}`);
  }
  return resolve(value);
}

export function parsePreflightArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env
): PreflightOptions {
  let json = false;
  let requireProvisioner = false;
  let teacherSessionFile =
    env.UPSKII_PREFLIGHT_TEACHER_SESSION_FILE !== undefined
      ? normalizeSessionFilePath(
          env.UPSKII_PREFLIGHT_TEACHER_SESSION_FILE,
          'UPSKII_PREFLIGHT_TEACHER_SESSION_FILE'
        )
      : undefined;
  let studentSessionFile =
    env.UPSKII_PREFLIGHT_STUDENT_SESSION_FILE !== undefined
      ? normalizeSessionFilePath(
          env.UPSKII_PREFLIGHT_STUDENT_SESSION_FILE,
          'UPSKII_PREFLIGHT_STUDENT_SESSION_FILE'
        )
      : undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--require-provisioner') {
      requireProvisioner = true;
      continue;
    }
    if (arg === '--teacher-session-file') {
      teacherSessionFile = normalizeSessionFilePath(
        argv[i + 1],
        '--teacher-session-file'
      );
      i += 1;
      continue;
    }
    if (arg?.startsWith('--teacher-session-file=')) {
      teacherSessionFile = normalizeSessionFilePath(
        arg.slice('--teacher-session-file='.length),
        '--teacher-session-file'
      );
      continue;
    }
    if (arg === '--student-session-file') {
      studentSessionFile = normalizeSessionFilePath(
        argv[i + 1],
        '--student-session-file'
      );
      i += 1;
      continue;
    }
    if (arg?.startsWith('--student-session-file=')) {
      studentSessionFile = normalizeSessionFilePath(
        arg.slice('--student-session-file='.length),
        '--student-session-file'
      );
      continue;
    }
    throw new Error(`Unknown preflight argument: ${arg}`);
  }

  return {
    json,
    requireProvisioner,
    studentSessionFile,
    teacherSessionFile,
  };
}

function buildChildEnv(
  sourceEnv: Record<string, string | undefined>,
  extra: Record<string, string> = {}
): Record<string, string> {
  const childEnv: Record<string, string> = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = sourceEnv[key];
    if (value !== undefined) childEnv[key] = value;
  }
  return { ...childEnv, ...extra };
}

interface ResolvedProvisionerToken {
  rejectedReason?: string;
  token: string | null;
}

function resolveProvisionerToken(
  env: Record<string, string | undefined>
): ResolvedProvisionerToken {
  for (const key of [
    'TTR_UPSKII_QA_TOKEN_PROD',
    'UPSKII_QA_PROVISIONER_TOKEN_PROD',
  ]) {
    const value = env[key]?.trim();
    if (value) return { token: value };
  }
  const globalBoundEnv = env.TTR_CREDENTIAL_ENV?.trim().toLowerCase();
  for (const key of ['TTR_UPSKII_QA_TOKEN', 'UPSKII_QA_PROVISIONER_TOKEN']) {
    const value = env[key]?.trim();
    if (!value) continue;
    const boundEnv = env[`${key}_ENV`]?.trim().toLowerCase() || globalBoundEnv;
    if (boundEnv === 'prod') return { token: value };
    return {
      rejectedReason: boundEnv
        ? `refusing ${key} bound to "${boundEnv}" for prod pre-flight`
        : `refusing unscoped ${key} without prod binding (set ${key}_PROD or ${key}_ENV=prod)`,
      token: null,
    };
  }
  return { token: null };
}

function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 6) {
      out = out.split(secret).join('[REDACTED]');
    }
  }
  return out;
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function summarizeCliFailure(
  res: CliInvocationResult,
  secrets: readonly string[]
): string {
  const errPayload = parseJsonRecord(res.stderr) ?? parseJsonRecord(res.stdout);
  const errObj =
    errPayload?.error &&
    typeof errPayload.error === 'object' &&
    !Array.isArray(errPayload.error)
      ? (errPayload.error as Record<string, unknown>)
      : null;
  if (errObj) {
    const code = typeof errObj.code === 'string' ? errObj.code : 'CLI_ERROR';
    const message = typeof errObj.message === 'string' ? errObj.message : '';
    return redactSecrets(
      `exit=${res.exitCode} ${code}${message ? `: ${message}` : ''}`,
      secrets
    );
  }
  return `exit=${res.exitCode}`;
}

function formatD1Suffix(payload: Record<string, unknown> | null): string {
  const d1 =
    payload?.d1Telemetry &&
    typeof payload.d1Telemetry === 'object' &&
    !Array.isArray(payload.d1Telemetry)
      ? (payload.d1Telemetry as Record<string, unknown>)
      : null;
  if (!d1 || Object.keys(d1).length === 0) return '';
  const reads = d1['x-upskii-d1-rows-read'] ?? '-';
  const writes = d1['x-upskii-d1-rows-written'] ?? '-';
  return ` (d1 r=${String(reads)}, w=${String(writes)})`;
}

export function createBunCliRunner(
  cliEntryPath = DEFAULT_CLI_ENTRY
): PreflightCliRunner {
  const bunBin = basename(process.execPath).startsWith('bun')
    ? process.execPath
    : 'bun';

  return async (args, env) => {
    const started = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync(
        bunBin,
        ['--no-env-file', cliEntryPath, ...args],
        {
          env,
          maxBuffer: CLI_MAX_BUFFER_BYTES,
          timeout: CLI_TIMEOUT_MS,
          windowsHide: true,
        }
      );
      return {
        durationMs: Date.now() - started,
        exitCode: 0,
        stderr: String(stderr ?? ''),
        stdout: String(stdout ?? ''),
      };
    } catch (error) {
      const err = error as {
        code?: number | string;
        killed?: boolean;
        message?: string;
        stderr?: string | Buffer;
        stdout?: string | Buffer;
      };
      const stderr = String(err.stderr ?? '');
      const fallbackStderr =
        !stderr && err.killed
          ? JSON.stringify({
              error: {
                code: 'CLI_TIMEOUT',
                message: `ttr timed out after ${CLI_TIMEOUT_MS}ms`,
              },
            })
          : !stderr && typeof err.code === 'string'
            ? JSON.stringify({
                error: {
                  code: err.code,
                  message: err.message ?? 'CLI execution failed',
                },
              })
            : stderr;
      return {
        durationMs: Date.now() - started,
        exitCode: typeof err.code === 'number' ? err.code : 1,
        stderr: fallbackStderr,
        stdout: String(err.stdout ?? ''),
      };
    }
  };
}

interface SessionReadSpec {
  args: readonly string[];
  label: string;
  validate: (payload: Record<string, unknown>) => string | null;
}

const TEACHER_READ_CHECKS: readonly SessionReadSpec[] = [
  {
    args: ['external', 'upskii', 'accounts', 'profile'],
    label: 'teacher: accounts profile',
    validate: (p) =>
      p.profile && typeof p.profile === 'object' ? null : 'missing profile',
  },
  {
    args: ['external', 'upskii', 'accounts', 'sessions', 'list'],
    label: 'teacher: accounts sessions list',
    validate: (p) =>
      p.currentSessionResolved === true
        ? null
        : 'currentSessionResolved !== true',
  },
  {
    args: ['external', 'upskii', 'workspaces', 'list'],
    label: 'teacher: workspaces list',
    validate: (p) =>
      Array.isArray(p.workspaces) ? null : 'workspaces is not an array',
  },
  {
    args: ['external', 'upskii', 'classes', 'list'],
    label: 'teacher: classes list',
    validate: (p) =>
      Array.isArray(p.classes) ? null : 'classes is not an array',
  },
  {
    args: ['external', 'upskii', 'tutor', 'prompts', 'list'],
    label: 'teacher: tutor prompts list',
    validate: (p) =>
      Array.isArray(p.prompts) ? null : 'prompts is not an array',
  },
  {
    args: ['external', 'upskii', 'chat', 'models'],
    label: 'teacher: chat models',
    validate: (p) =>
      Array.isArray(p.models) ? null : 'models is not an array',
  },
  {
    args: ['external', 'upskii', 'credits', 'balance'],
    label: 'teacher: credits balance',
    validate: (p) =>
      typeof p.remaining === 'number' || typeof p.unlimited === 'boolean'
        ? null
        : 'missing credit balance fields',
  },
  {
    args: ['external', 'upskii', 'status', 'link-readiness'],
    label: 'teacher: link readiness',
    validate: (p) =>
      typeof p.enabled === 'boolean' || Object.hasOwn(p, 'link')
        ? null
        : 'missing link readiness fields',
  },
];

const STUDENT_READ_CHECKS: readonly SessionReadSpec[] = [
  {
    args: [
      'external',
      'upskii',
      'accounts',
      'profile',
      '--experience',
      'learn',
    ],
    label: 'student(learn): accounts profile',
    validate: (p) =>
      p.profile && typeof p.profile === 'object' ? null : 'missing profile',
  },
  {
    args: ['external', 'upskii', 'classes', 'list', '--experience', 'learn'],
    label: 'student(learn): classes list',
    validate: (p) =>
      Array.isArray(p.classes) ? null : 'classes is not an array',
  },
  {
    args: ['external', 'upskii', 'chat', 'models', '--experience', 'learn'],
    label: 'student(learn): chat models',
    validate: (p) =>
      Array.isArray(p.models) ? null : 'models is not an array',
  },
  {
    args: ['external', 'upskii', 'credits', 'balance', '--experience', 'learn'],
    label: 'student(learn): credits balance',
    validate: (p) =>
      typeof p.remaining === 'number' || typeof p.unlimited === 'boolean'
        ? null
        : 'missing credit balance fields',
  },
  {
    args: [
      'external',
      'upskii',
      'status',
      'link-readiness',
      '--experience',
      'learn',
    ],
    label: 'student(learn): link readiness',
    validate: (p) =>
      typeof p.enabled === 'boolean' || Object.hasOwn(p, 'link')
        ? null
        : 'missing link readiness fields',
  },
];

export async function runUpskiiPreflight(
  options: PreflightOptions,
  deps: {
    env?: Record<string, string | undefined>;
    now?: () => Date;
    runCli?: PreflightCliRunner;
  } = {}
): Promise<PreflightReport> {
  const sourceEnv = deps.env ?? process.env;
  const runCli = deps.runCli ?? createBunCliRunner();
  const provisionerResolution = resolveProvisionerToken(sourceEnv);
  const provisionerToken = provisionerResolution.token;
  const secrets = [
    sourceEnv.TTR_UPSKII_QA_TOKEN_PROD,
    sourceEnv.UPSKII_QA_PROVISIONER_TOKEN_PROD,
    sourceEnv.TTR_UPSKII_QA_TOKEN,
    sourceEnv.UPSKII_QA_PROVISIONER_TOKEN,
  ].filter((value): value is string => Boolean(value?.trim()));
  const baseEnv = buildChildEnv(sourceEnv);
  const checks: PreflightCheckResult[] = [];

  // 1. CLI doctor (Upskii family, explicit --env prod)
  const doctorRes = await runCli(
    ['doctor', '--family', 'upskii', '--env', 'prod', '--json'],
    baseEnv
  );
  const doctorJson = parseJsonRecord(doctorRes.stdout);
  if (doctorRes.exitCode === 0 && doctorJson?.ok === true) {
    checks.push({
      detail: 'ttr doctor --family upskii ok',
      durationMs: doctorRes.durationMs,
      name: 'doctor: upskii',
      status: 'pass',
    });
  } else {
    checks.push({
      detail: summarizeCliFailure(doctorRes, secrets),
      durationMs: doctorRes.durationMs,
      name: 'doctor: upskii',
      status: 'fail',
    });
  }

  // 2. Public host health across app.upskii.com, upskii.com, admin.upskii.com
  const healthRes = await runCli(
    ['external', 'upskii', 'status', 'health', '--env', 'prod', '--json'],
    baseEnv
  );
  const healthJson = parseJsonRecord(healthRes.stdout);
  const hostChecks = Array.isArray(healthJson?.checks)
    ? (healthJson.checks as Array<Record<string, unknown>>)
    : [];
  if (healthRes.exitCode === 0 && healthJson?.ok === true) {
    const summary = hostChecks
      .map((c) => `${String(c.name ?? 'host')}=${String(c.status ?? '?')}`)
      .join(', ');
    checks.push({
      detail: summary || 'all production Upskii hosts reachable',
      durationMs: healthRes.durationMs,
      name: 'status: health',
      status: 'pass',
    });
  } else {
    const failedHosts = hostChecks
      .filter((c) => c.ok !== true)
      .map((c) => `${String(c.name ?? 'host')}=${String(c.status ?? 'ERR')}`)
      .join(', ');
    checks.push({
      detail: failedHosts || summarizeCliFailure(healthRes, secrets),
      durationMs: healthRes.durationMs,
      name: 'status: health',
      status: 'fail',
    });
  }

  // 3. Provisioner window probe (required in CI via --require-provisioner)
  let provisionerFailed = false;
  if (!provisionerToken) {
    const failed =
      options.requireProvisioner ||
      Boolean(provisionerResolution.rejectedReason);
    provisionerFailed = failed;
    checks.push({
      detail:
        provisionerResolution.rejectedReason ??
        (options.requireProvisioner
          ? 'missing prod-scoped provisioner token (UPSKII_QA_PROVISIONER_TOKEN_PROD or UPSKII_QA_PROVISIONER_TOKEN with UPSKII_QA_PROVISIONER_TOKEN_ENV=prod)'
          : 'skipped (no provisioner token; pass --require-provisioner to enforce)'),
      durationMs: 0,
      name: 'status: provisioner',
      status: failed ? 'fail' : 'skip',
    });
  } else {
    const provEnv = buildChildEnv(sourceEnv, {
      UPSKII_QA_PROVISIONER_TOKEN_PROD: provisionerToken,
    });
    const provRes = await runCli(
      [
        'external',
        'upskii',
        'status',
        'provisioner',
        '--env',
        'prod',
        '--probe',
        '--json',
      ],
      provEnv
    );
    const provJson = parseJsonRecord(provRes.stdout);
    const windowOpen =
      provRes.exitCode === 0 &&
      provJson?.configured === true &&
      provJson?.probed === true &&
      provJson?.ok === true &&
      provJson?.windowOpen === true;
    provisionerFailed = !windowOpen;
    checks.push({
      detail: windowOpen
        ? `window open (HTTP ${String(provJson?.status ?? 200)})`
        : provJson && typeof provJson.status === 'number'
          ? `provisioner window closed or rejected (HTTP ${provJson.status})`
          : summarizeCliFailure(provRes, secrets),
      durationMs: provRes.durationMs,
      name: 'status: provisioner',
      status: windowOpen ? 'pass' : 'fail',
    });
  }

  if (options.requireProvisioner && provisionerFailed) {
    return {
      checkedAt: (deps.now?.() ?? new Date()).toISOString(),
      checks,
      env: 'prod',
      ok: false,
      readOnly: true,
    };
  }

  // 4. Optional read-only educator/learner walkthrough session checks
  const runSessionChecks = async (
    specs: readonly SessionReadSpec[],
    sessionFile: string,
    sourceName: string
  ) => {
    const resolvedSessionFile = normalizeSessionFilePath(
      sessionFile,
      sourceName
    );
    for (const spec of specs) {
      const res = await runCli(
        [
          ...spec.args,
          '--env',
          'prod',
          `--session-file=${resolvedSessionFile}`,
          '--json',
        ],
        baseEnv
      );
      const payload = parseJsonRecord(res.stdout);
      const failure =
        res.exitCode !== 0
          ? summarizeCliFailure(res, secrets)
          : !payload
            ? 'invalid JSON output'
            : spec.validate(payload);
      checks.push({
        detail: failure ?? `ok${formatD1Suffix(payload)}`,
        durationMs: res.durationMs,
        name: spec.label,
        status: failure ? 'fail' : 'pass',
      });
    }
  };

  if (options.teacherSessionFile !== undefined) {
    await runSessionChecks(
      TEACHER_READ_CHECKS,
      options.teacherSessionFile,
      '--teacher-session-file'
    );
  }
  if (options.studentSessionFile !== undefined) {
    await runSessionChecks(
      STUDENT_READ_CHECKS,
      options.studentSessionFile,
      '--student-session-file'
    );
  }

  return {
    checkedAt: (deps.now?.() ?? new Date()).toISOString(),
    checks,
    env: 'prod',
    ok: checks.every((check) => check.status !== 'fail'),
    readOnly: true,
  };
}

export function formatPreflightSummary(report: PreflightReport): string[] {
  const passed = report.checks.filter((c) => c.status === 'pass').length;
  const failed = report.checks.filter((c) => c.status === 'fail').length;
  const skipped = report.checks.filter((c) => c.status === 'skip').length;
  const lines = [
    `Upskii read-only pre-flight (prod): ${report.ok ? 'PASS' : 'FAIL'} (${passed} passed, ${failed} failed, ${skipped} skipped)`,
    ...report.checks.map(
      (c) =>
        `  [${c.status.toUpperCase()}] ${c.name} (${c.durationMs}ms): ${c.detail}`
    ),
  ];
  return lines;
}
