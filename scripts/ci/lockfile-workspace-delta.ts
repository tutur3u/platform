// Structural bun.lock comparison for affected-workflow gating.
//
// A lockfile edit is treated as global unless every changed entry is provably
// scoped to named workspaces. Unknown shapes, parse failures, root workspace
// edits and any changed or removed third-party resolution stay global, so the
// only narrowing is: workspace entries, workspace links, nested resolutions
// under a workspace (`@scope/app/dep`), and brand-new top-level packages that no
// existing workspace could have resolved before.

export type LockfileDelta =
  | { global: true; reason: string }
  | { global: false; workspaces: string[] };

type BunLock = {
  workspaces?: Record<string, { name?: string } & Record<string, unknown>>;
  packages?: Record<string, unknown>;
  [key: string]: unknown;
};

// bun.lock is JSON with trailing commas. Drop only commas that directly
// precede a closing bracket outside string literals.
export function parseBunLock(text: string): BunLock | null {
  let output = '';
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      output += char;
      if (char === '\\') {
        output += text[index + 1] ?? '';
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === ',') {
      const rest = /^\s*([}\]])/.exec(text.slice(index + 1));
      if (rest) continue;
    }
    output += char;
  }
  try {
    const parsed: unknown = JSON.parse(output);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as BunLock)
      : null;
  } catch {
    return null;
  }
}

// Split `@scope/a/b/@scope/c` into package names.
export function packagePath(key: string): string[] | null {
  const segments = key.split('/');
  const names: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) return null;
    if (segment.startsWith('@')) {
      const next = segments[index + 1];
      if (!next) return null;
      names.push(`${segment}/${next}`);
      index += 1;
    } else {
      names.push(segment);
    }
  }
  return names;
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isWorkspaceLink(value: unknown) {
  return (
    Array.isArray(value) &&
    typeof value[0] === 'string' &&
    /@workspace:/.test(value[0])
  );
}

export function lockfileWorkspaceDelta(
  baseText: string,
  headText: string
): LockfileDelta {
  const base = parseBunLock(baseText);
  const head = parseBunLock(headText);
  if (!base || !head) return { global: true, reason: 'unparseable bun.lock' };

  for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
    if (key === 'workspaces' || key === 'packages') continue;
    if (!same(base[key], head[key]))
      return { global: true, reason: `bun.lock ${key} changed` };
  }

  const baseWorkspaces = base.workspaces ?? {};
  const headWorkspaces = head.workspaces ?? {};
  const workspaceNames = new Set<string>();
  for (const entry of [
    ...Object.values(baseWorkspaces),
    ...Object.values(headWorkspaces),
  ]) {
    if (typeof entry?.name === 'string') workspaceNames.add(entry.name);
  }

  const affected = new Set<string>();
  for (const path of new Set([
    ...Object.keys(baseWorkspaces),
    ...Object.keys(headWorkspaces),
  ])) {
    const before = baseWorkspaces[path];
    const after = headWorkspaces[path];
    if (same(before, after)) continue;
    // The root workspace's dependencies are shared by every task.
    if (path === '') return { global: true, reason: 'root workspace changed' };
    const name = after?.name ?? before?.name;
    if (typeof name !== 'string')
      return { global: true, reason: `unnamed workspace ${path}` };
    affected.add(name);
  }

  const basePackages = base.packages ?? {};
  const headPackages = head.packages ?? {};
  for (const key of new Set([
    ...Object.keys(basePackages),
    ...Object.keys(headPackages),
  ])) {
    const before = basePackages[key];
    const after = headPackages[key];
    if (same(before, after)) continue;
    if (isWorkspaceLink(before) || isWorkspaceLink(after)) {
      if (!workspaceNames.has(key))
        return { global: true, reason: `unknown workspace link ${key}` };
      affected.add(key);
      continue;
    }
    const names = packagePath(key);
    if (!names) return { global: true, reason: `unparseable key ${key}` };
    const [owner] = names;
    if (names.length > 1 && owner && workspaceNames.has(owner)) {
      // A nested resolution only changes what that workspace installs.
      affected.add(owner);
      continue;
    }
    // A new top-level package was unresolvable before, so no unchanged
    // workspace or package could have depended on it.
    if (names.length === 1 && before === undefined) continue;
    return { global: true, reason: `shared resolution ${key} changed` };
  }

  return { global: false, workspaces: [...affected].sort() };
}
