import {
  BALANCER_ID_PATTERN,
  type BalancerPurpose,
  type BalancerRun,
  type BalancerRunRequest,
  runIdFor,
} from './model';

const purposes: readonly BalancerPurpose[] = [
  'test',
  'lint',
  'typecheck',
  'build',
  'verify',
  'review',
];
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u;

export class BalancerRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalancerRequestError';
  }
}
const fail = (message: string): never => {
  throw new BalancerRequestError(message);
};

// A clean relative directory inside the checkout: no absolute paths,
// traversal, dot segments or backslashes.
export function cleanRelativeDirectory(value: string) {
  const trimmed = value.replace(/\/+$/u, '');
  if (trimmed === '' || trimmed === '.') return '';
  if (
    trimmed.length > 512 ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0') ||
    trimmed
      .split('/')
      .some((part) => part === '' || part === '.' || part === '..')
  )
    fail('cwd must be a clean relative directory inside the checkout.');
  return trimmed;
}

export function validateCommand(command: unknown): string[] {
  if (
    !Array.isArray(command) ||
    command.length < 1 ||
    command.length > 256 ||
    command.some(
      (part) =>
        typeof part !== 'string' || part.length > 8192 || part.includes('\0')
    )
  )
    fail('command must be a bounded argv array.');
  const argv = command as string[];
  if (!argv[0] || argv[0].startsWith('__ttr_'))
    fail('command cannot be empty or wrap a devbox envelope.');
  return argv;
}

const integer = (value: unknown, min: number, max: number, name: string) => {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    fail(`${name} must be an integer from ${min} to ${max}.`);
  return value as number;
};
const stringList = (value: unknown, name: string) => {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > 16 ||
    value.some(
      (entry) => typeof entry !== 'string' || !entry || entry.length > 64
    )
  )
    fail(`${name} must be a short list of names.`);
  return value as string[];
};

/** Validates a caller's run request; throws BalancerRequestError. */
export function parseRunRequest(raw: unknown): BalancerRunRequest {
  if (!raw || typeof raw !== 'object') fail('request must be an object.');
  const input = raw as Record<string, unknown>;
  const requestId = String(input.requestId ?? '');
  if (!BALANCER_ID_PATTERN.test(requestId))
    fail('requestId must be 16-128 characters of A-Z, a-z, 0-9, _ or -.');
  const source = (input.source ?? {}) as Record<string, unknown>;
  if (!REPO_PATTERN.test(String(source.repo ?? '')))
    fail('source.repo must be owner/name.');
  if (!SHA_PATTERN.test(String(source.baseSha ?? '')))
    fail('source.baseSha must be a full 40-character commit SHA.');
  if (source.patch !== undefined || source.manifest !== undefined)
    fail('dirty-source sync is not enabled yet; submit a pushed commit.');
  const requester = (input.requester ?? { kind: 'user' }) as Record<
    string,
    unknown
  >;
  if (requester.kind !== 'user' && requester.kind !== 't3-thread')
    fail('requester.kind must be user or t3-thread.');
  if (
    requester.kind === 't3-thread' &&
    (typeof requester.threadId !== 'string' || !requester.threadId)
  )
    fail('a t3-thread requester needs threadId.');
  const purpose = input.purpose ?? 'test';
  if (!purposes.includes(purpose as BalancerPurpose))
    fail(`purpose must be one of ${purposes.join(', ')}.`);
  const jobClass = input.jobClass ?? 'heavy';
  if (jobClass !== 'light' && jobClass !== 'heavy')
    fail('jobClass must be light or heavy.');
  const constraints = (input.constraints ?? {}) as Record<string, unknown>;
  return {
    requestId,
    requester: {
      kind: requester.kind as 'user' | 't3-thread',
      ...(typeof requester.threadId === 'string'
        ? { threadId: requester.threadId.slice(0, 256) }
        : {}),
      ...(typeof requester.taskId === 'string'
        ? { taskId: requester.taskId.slice(0, 256) }
        : {}),
    },
    purpose: purpose as BalancerPurpose,
    source: {
      repo: String(source.repo),
      baseSha: String(source.baseSha),
    },
    command: validateCommand(input.command),
    cwd: cleanRelativeDirectory(String(input.cwd ?? '')),
    jobClass: jobClass as BalancerRunRequest['jobClass'],
    priority: integer(input.priority ?? 5, 0, 9, 'priority'),
    constraints: {
      os: stringList(constraints.os, 'constraints.os'),
      arch: stringList(constraints.arch, 'constraints.arch'),
      hosts: stringList(constraints.hosts, 'constraints.hosts'),
      excludeHosts: stringList(
        constraints.excludeHosts,
        'constraints.excludeHosts'
      ),
    },
    replicas: integer(input.replicas ?? 1, 1, 8, 'replicas'),
    timeoutSeconds: integer(
      input.timeoutSeconds ?? 1800,
      30,
      6 * 3600,
      'timeoutSeconds'
    ),
    install: input.install !== false,
  };
}

/** The queued runs of a request: one per replica, with stable run IDs. */
export function runsForRequest(
  request: BalancerRunRequest,
  sourceId: string,
  at: string
): BalancerRun[] {
  return Array.from({ length: request.replicas }, (_, index) => ({
    runId: runIdFor(request.requestId, index + 1),
    requestId: request.requestId,
    replica: index + 1,
    sourceId,
    source: request.source,
    requester: request.requester,
    purpose: request.purpose,
    command: request.command,
    cwd: request.cwd,
    jobClass: request.jobClass,
    priority: request.priority,
    constraints: request.constraints,
    timeoutSeconds: request.timeoutSeconds,
    install: request.install,
    queuedAt: at,
    state: 'queued',
    revision: 1,
    consumedBy: [],
    history: [{ at, from: null, to: 'queued' }],
  }));
}
