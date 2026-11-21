/**
 * Display-only description of what a devbox run executes. The runner is the
 * authority that validates and decodes envelopes; this never feeds execution.
 * Balancer runs (`@tuturuuu/devbox/balancer`) have their own identities and
 * link back through `balancer_runs.devbox_run_id` once that table exists.
 */

const COMMIT_RUN_ENVELOPE = '__ttr_commit_run_v1__';
const ENVELOPE_PREFIX = '__ttr_';

export type RunSource =
  | { kind: 'command'; argv: string[] }
  | { argv: string[]; kind: 'commit'; prefix: string; sha: string }
  | { kind: 'maintenance'; name: string }
  | { kind: 'invalid_envelope' };

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  );
}

function decodeCommitRun(payload: string | undefined): RunSource {
  if (!payload) return { kind: 'invalid_envelope' };
  try {
    const value = JSON.parse(decodeBase64Url(payload)) as Record<
      string,
      unknown
    >;
    if (
      value.v !== 1 ||
      typeof value.sha !== 'string' ||
      !/^[0-9a-f]{40}$/.test(value.sha) ||
      typeof value.prefix !== 'string' ||
      !Array.isArray(value.command) ||
      !value.command.every((part) => typeof part === 'string')
    ) {
      return { kind: 'invalid_envelope' };
    }
    return {
      argv: value.command as string[],
      kind: 'commit',
      prefix: value.prefix,
      sha: value.sha,
    };
  } catch {
    return { kind: 'invalid_envelope' };
  }
}

export function describeRunSource(command: string[]): RunSource {
  const [first, ...rest] = command;
  if (first === COMMIT_RUN_ENVELOPE) {
    return rest.length === 1
      ? decodeCommitRun(rest[0])
      : { kind: 'invalid_envelope' };
  }
  if (first?.startsWith(ENVELOPE_PREFIX)) {
    return {
      kind: 'maintenance',
      name: first.replace(/^__ttr_/, '').replace(/__$/, ''),
    };
  }
  return { argv: command, kind: 'command' };
}

/** One-line label for tables: the argv a person would recognise. */
export function getRunSourceLabel(source: RunSource) {
  switch (source.kind) {
    case 'commit':
    case 'command':
      return source.argv.join(' ') || '-';
    case 'maintenance':
      return source.name;
    case 'invalid_envelope':
      return null;
  }
}
