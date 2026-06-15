export interface DevboxCommandPolicy {
  allowed: boolean;
  category: 'blocked' | 'bun' | 'docker' | 'generic';
  reason?: string;
}

const HOST_DESTRUCTIVE_COMMANDS = new Set(['rm', 'sudo', 'su', 'shutdown']);
const BLOCKED_DOCKER_SUBCOMMANDS = new Set(['prune']);
const BLOCKED_DOCKER_PRUNE_TARGETS = new Set([
  'builder',
  'container',
  'image',
  'network',
  'system',
  'volume',
]);

function normalizeCommandPart(value: string) {
  return value.trim().toLowerCase();
}

function stripShellQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function isShellEnvReference(value: string) {
  const stripped = stripShellQuotes(value);
  return stripped.startsWith('$') || stripped.startsWith('${');
}

function isCloudflaredCommand(command: string[]) {
  return command.some((part) =>
    normalizeCommandPart(part).includes('cloudflared')
  );
}

function isDockerPrivilegedFlag(value: string) {
  const normalized = normalizeCommandPart(value);
  return (
    normalized === '--privileged' || normalized.startsWith('--privileged=')
  );
}

function hasInlineCloudflaredToken(command: string[]) {
  for (let index = 0; index < command.length; index++) {
    const part = command[index] ?? '';
    const normalized = normalizeCommandPart(part);

    if (normalized === '--token') {
      const next = command[index + 1];
      if (next && !isShellEnvReference(next)) return true;
    }

    if (normalized.startsWith('--token=')) {
      const value = part.slice('--token='.length);
      if (value && !isShellEnvReference(value)) return true;
    }

    const tokenMatches = part.matchAll(
      /--token(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/giu
    );
    for (const match of tokenMatches) {
      const value = match[1] ?? match[2] ?? match[3] ?? '';
      if (value && !isShellEnvReference(value)) return true;
    }
  }

  return false;
}

function isAbsoluteHostPath(value: string) {
  const stripped = stripShellQuotes(value).trim();

  return (
    stripped.startsWith('/') ||
    /^[a-z]:[\\/]/iu.test(stripped) ||
    stripped.startsWith('~')
  );
}

function getDockerVolumeSource(value: string) {
  const stripped = stripShellQuotes(value).trim();
  const windowsDriveSource = stripped.match(/^[a-z]:[\\/][^:]*/iu)?.[0];

  return windowsDriveSource ?? stripped.split(':')[0] ?? stripped;
}

function isAbsoluteHostMount(value: string) {
  return isAbsoluteHostPath(getDockerVolumeSource(value));
}

function isDockerMountSpecWithHostSource(value: string) {
  const fields = stripShellQuotes(value).split(',');

  return fields.some((field) => {
    const [rawKey, ...rawValueParts] = field.split('=');
    const key = normalizeCommandPart(rawKey ?? '');

    if (key !== 'source' && key !== 'src') {
      return false;
    }

    return isAbsoluteHostPath(rawValueParts.join('='));
  });
}

function isMountValueFlag(value: string) {
  return value === '-v' || value === '--volume' || value === '--mount';
}

function hasHostMount(command: string[]) {
  return command.some((part, index) => {
    if (isMountValueFlag(part)) {
      const next = command[index + 1];
      if (!next) return false;

      return part === '--mount'
        ? isDockerMountSpecWithHostSource(next)
        : isAbsoluteHostMount(next);
    }

    if (part.startsWith('-v') && part.length > 2) {
      return isAbsoluteHostMount(part.slice(part.startsWith('-v=') ? 3 : 2));
    }

    if (part.startsWith('--volume=')) {
      return isAbsoluteHostMount(part.slice('--volume='.length));
    }

    if (part.startsWith('--mount=')) {
      return isDockerMountSpecWithHostSource(part.slice('--mount='.length));
    }

    return false;
  });
}

function evaluateDockerCommand(command: string[]): DevboxCommandPolicy {
  if (command.some(isDockerPrivilegedFlag)) {
    return {
      allowed: false,
      category: 'blocked',
      reason: 'Privileged Docker containers are not allowed in devboxes.',
    };
  }

  if (hasHostMount(command)) {
    return {
      allowed: false,
      category: 'blocked',
      reason:
        'Docker host mounts outside the devbox workspace are not allowed.',
    };
  }

  const subcommand = normalizeCommandPart(command[1] ?? '');
  const target = normalizeCommandPart(command[2] ?? '');

  if (
    BLOCKED_DOCKER_SUBCOMMANDS.has(subcommand) ||
    (BLOCKED_DOCKER_PRUNE_TARGETS.has(subcommand) && target === 'prune')
  ) {
    return {
      allowed: false,
      category: 'blocked',
      reason: 'Docker prune operations are managed by devbox cache cleanup.',
    };
  }

  return { allowed: true, category: 'docker' };
}

export function evaluateDevboxCommandPolicy(
  command: readonly string[]
): DevboxCommandPolicy {
  const normalized = command.map((part) => part.trim()).filter(Boolean);
  const executable = normalizeCommandPart(normalized[0] ?? '');

  if (!executable) {
    return {
      allowed: false,
      category: 'blocked',
      reason: 'Missing command.',
    };
  }

  if (HOST_DESTRUCTIVE_COMMANDS.has(executable)) {
    return {
      allowed: false,
      category: 'blocked',
      reason: `Command "${executable}" is blocked in devboxes.`,
    };
  }

  if (
    executable === 'git' &&
    normalizeCommandPart(normalized[1] ?? '') === 'reset' &&
    normalized.some((part) => normalizeCommandPart(part) === '--hard')
  ) {
    return {
      allowed: false,
      category: 'blocked',
      reason: 'git reset --hard is blocked for synced devbox workspaces.',
    };
  }

  if (
    isCloudflaredCommand(normalized) &&
    hasInlineCloudflaredToken(normalized)
  ) {
    return {
      allowed: false,
      category: 'blocked',
      reason:
        'Cloudflared tunnel tokens must be passed through a devbox environment variable, not inline command arguments.',
    };
  }

  if (executable === 'docker') {
    return evaluateDockerCommand(normalized);
  }

  if (executable === 'bun') {
    return { allowed: true, category: 'bun' };
  }

  return { allowed: true, category: 'generic' };
}
