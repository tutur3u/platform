const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export type DevboxEnv = Record<string, string>;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function parseDevboxEnvAssignments(assignments: string[]): DevboxEnv {
  const env: DevboxEnv = {};

  for (const assignment of assignments) {
    const separatorIndex = assignment.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid environment assignment: ${assignment}`);
    }

    const name = assignment.slice(0, separatorIndex);
    if (!ENV_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid environment variable name: ${name}`);
    }

    env[name] = assignment.slice(separatorIndex + 1);
  }

  return env;
}

export function mergeDevboxEnv(
  base: DevboxEnv,
  change: {
    removals?: string[];
    updates?: DevboxEnv;
  }
): DevboxEnv {
  const next = { ...base };

  for (const name of change.removals ?? []) {
    delete next[name];
  }

  return {
    ...next,
    ...(change.updates ?? {}),
  };
}

export function redactDevboxSecrets(text: string, env: DevboxEnv) {
  return Object.values(env)
    .filter(Boolean)
    .toSorted((a, b) => b.length - a.length)
    .reduce(
      (output, secret) =>
        output.replace(new RegExp(escapeRegExp(secret), 'gu'), '[REDACTED]'),
      text
    );
}
