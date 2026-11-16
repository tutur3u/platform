import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Pull-request creation tools of the GitHub MCP servers agents load. Claude
 * Code permission rules name MCP tools exactly (`mcp__<server>__<tool>`), so
 * each known server name is listed. Only these rules are ever added.
 */
export const AGENT_DENY_RULES = [
  'github',
  'plugin_github_github',
  'claude_ai_GitHub',
].flatMap((server) => [
  `mcp__${server}__create_pull_request`,
  `mcp__${server}__create_pull_request_with_copilot`,
]);

export interface AgentConfigRecord {
  path: string;
  /** Rules this guard added (removed again on uninstall). */
  added: string[];
  backup: string | null;
}

/** Claude settings files: the default config dir plus per-account T3 dirs. */
export function agentSettingsFiles(
  home = homedir(),
  env: NodeJS.ProcessEnv = process.env
) {
  const dirs = new Set<string>([join(home, '.claude')]);
  if (env.CLAUDE_CONFIG_DIR?.trim()) dirs.add(env.CLAUDE_CONFIG_DIR.trim());
  const t3 = join(home, '.claude-t3');
  if (existsSync(t3))
    for (const name of readdirSync(t3)) {
      if (name === 'backups' || name.startsWith('.')) continue;
      dirs.add(join(t3, name));
    }
  return [...dirs]
    .map((dir) => join(dir, 'settings.json'))
    .filter((file) => existsSync(file));
}

type Settings = Record<string, unknown> & {
  permissions?: Record<string, unknown> & { deny?: unknown };
};

async function readSettings(path: string): Promise<Settings> {
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Refusing to edit non-object settings: ${path}`);
  return value as Settings;
}

async function writeSettings(path: string, value: Settings) {
  const staged = `${path}.${process.pid}.ttr-git-guard.tmp`;
  await writeFile(staged, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(staged, path);
}

const denyList = (settings: Settings) => {
  const deny = settings.permissions?.deny;
  if (deny === undefined) return [];
  if (!Array.isArray(deny) || deny.some((rule) => typeof rule !== 'string'))
    throw new Error('permissions.deny is not a string list');
  return deny as string[];
};

/**
 * Add the deny rules to each settings file. Idempotent; backs each file up
 * once before its first change; never removes or alters other keys or rules.
 */
export async function applyAgentDenyRules(options: {
  files: string[];
  backupDir: string;
  previous?: AgentConfigRecord[];
  rules?: string[];
}) {
  const rules = options.rules ?? AGENT_DENY_RULES;
  const records = new Map(
    (options.previous ?? []).map((record) => [record.path, record])
  );
  for (const path of options.files) {
    const settings = await readSettings(path);
    const deny = denyList(settings);
    const missing = rules.filter((rule) => !deny.includes(rule));
    const record = records.get(path) ?? { path, added: [], backup: null };
    if (missing.length) {
      if (!record.backup) {
        await mkdir(options.backupDir, { recursive: true, mode: 0o700 });
        record.backup = join(
          options.backupDir,
          `${Buffer.from(path).toString('base64url')}.${Date.now()}.json`
        );
        await copyFile(path, record.backup);
      }
      settings.permissions = {
        ...settings.permissions,
        deny: [...deny, ...missing],
      };
      await writeSettings(path, settings);
      record.added = [...new Set([...record.added, ...missing])];
    }
    records.set(path, record);
  }
  return [...records.values()];
}

/** Remove only the rules this guard added; leave everything else intact. */
export async function removeAgentDenyRules(records: AgentConfigRecord[]) {
  for (const record of records) {
    if (!existsSync(record.path) || !record.added.length) continue;
    const settings = await readSettings(record.path);
    const deny = denyList(settings);
    const next = deny.filter((rule) => !record.added.includes(rule));
    if (next.length === deny.length) continue;
    const permissions = { ...settings.permissions };
    if (next.length) permissions.deny = next;
    else delete permissions.deny;
    if (Object.keys(permissions).length) settings.permissions = permissions;
    else delete settings.permissions;
    await writeSettings(record.path, settings);
  }
}

/** Which settings files currently carry every guard deny rule. */
export async function agentDenyStatus(
  files: string[],
  rules = AGENT_DENY_RULES
) {
  const result = [];
  for (const path of files) {
    try {
      const deny = denyList(await readSettings(path));
      result.push({
        path,
        denied: rules.every((rule) => deny.includes(rule)),
      });
    } catch (error) {
      result.push({
        path,
        denied: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
