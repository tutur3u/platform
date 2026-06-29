export type FlagValue = boolean | string;

export interface ParsedArgs {
  flags: Record<string, FlagValue>;
  positionals: string[];
}

export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, FlagValue> = {};
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/su, 2);
    const key = rawKey || '';
    if (!key) continue;

    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }

    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
      continue;
    }

    flags[key] = true;
  }

  return { flags, positionals };
}

export function getFlag(flags: Record<string, FlagValue>, key: string) {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

export function getDefaultAction(group?: string) {
  return group &&
    [
      'boards',
      'labels',
      'lists',
      'projects',
      'relationships',
      'task-templates',
      'tasks',
      'workspaces',
    ].includes(group)
    ? 'list'
    : undefined;
}

export function getTaskStateFilters(flags: Record<string, FlagValue>) {
  if (flags.all === true) {
    return {};
  }

  if (flags.done === true || flags.completed === true) {
    return {
      completed: 'only' as const,
      closed: flags.closed === true ? ('only' as const) : undefined,
    };
  }

  if (flags.closed === true) {
    return {
      completed: undefined,
      closed: 'only' as const,
    };
  }

  return {
    completed:
      flags['include-done'] === true ? undefined : ('exclude' as const),
    closed: flags['include-closed'] === true ? undefined : ('exclude' as const),
  };
}

export function parseCsv(value?: string) {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}
