import { open, readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag, parseCsv } from './args';
import { runExternalProjectsCommand } from './external-projects';

type Options = {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
};
function required(flags: Options['flags'], key: string) {
  const value = getFlag(flags, key);
  if (!value) throw new Error(`Missing --${key}.`);
  return value;
}
function confirm(flags: Options['flags'], value: string) {
  if (getFlag(flags, 'confirm') !== value)
    throw new Error(`Review the configuration, then pass --confirm ${value}.`);
}
function emit(result: unknown) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const appSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,64}$/u),
    displayName: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    origins: z.array(z.url()).min(1).max(20),
    allowedScopes: z.array(z.string().trim().min(1).max(80)).max(50),
    allowedWorkspaceIds: z.array(z.uuid()).min(1).max(50),
  })
  .strict();

async function readJson(path: string): Promise<unknown> {
  const content = await readFile(path, 'utf8');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON file. Check its syntax.');
  }
}

async function readConfiguration(path: string) {
  const parsed = appSchema.safeParse(await readJson(path));
  // Do not echo an invalid input: it may contain an accidentally pasted secret.
  if (!parsed.success)
    throw new Error(
      'Invalid app JSON. Use only the documented fields; workspace allowlists must be explicit.'
    );
  return parsed.data;
}

export async function runExternalCommand(options: Options) {
  const { client, flags, positionals } = options;
  const [group, action = 'list', id] = positionals;
  const admin = client.external.admin;
  if (group === 'projects')
    return runExternalProjectsCommand({
      ...options,
      positionals: positionals.slice(1),
    });
  if (group === 'apps') {
    if (action === 'list') return emit(await admin.apps());
    if (action === 'get') {
      if (!id) throw new Error('Missing app ID.');
      const app = (await admin.apps()).apps.find((app) => app.id === id);
      if (!app) throw new Error('App not found.');
      return emit(app);
    }
    if (action === 'save') {
      const config = await readConfiguration(required(flags, 'file'));
      if (flags['dry-run'] === true)
        return emit({ action: 'save', configuration: config });
      confirm(flags, 'CONFIGURE_EXTERNAL_APP');
      return emit(await admin.saveApp(config));
    }
    if (action === 'scopes') {
      if (!id) throw new Error('Missing app ID.');
      const app = (await admin.apps()).apps.find((app) => app.id === id);
      if (!app) throw new Error('App not found.');
      if (!getFlag(flags, 'scopes') && flags['clear-scopes'] !== true)
        return emit({ id, allowedScopes: app.allowedScopes });
      if (getFlag(flags, 'scopes') && flags['clear-scopes'] === true)
        throw new Error('Use --scopes or --clear-scopes, not both.');
      const allowedScopes =
        flags['clear-scopes'] === true
          ? []
          : parseCsv(required(flags, 'scopes'));
      if (flags['dry-run'] === true)
        return emit({ id, before: app.allowedScopes, after: allowedScopes });
      confirm(flags, 'APPROVE_EXTERNAL_APP_SCOPES');
      // Send only writable fields; never copy server audit or secret metadata.
      return emit(
        await admin.saveApp({
          id: app.id,
          displayName: app.displayName,
          origins: app.origins,
          enabled: app.enabled,
          allowedWorkspaceIds: app.allowedWorkspaceIds,
          allowedScopes,
        })
      );
    }
    if (action === 'rotate-secret') {
      if (!id) throw new Error('Missing app ID.');
      confirm(flags, 'ROTATE_EXTERNAL_APP_SECRET');
      const path = required(flags, 'secret-out');
      // Fail before rotating if the destination exists or is not writable.
      const output = await open(path, 'wx', 0o600);
      try {
        const result = await admin.rotateSecret(id);
        await output.writeFile(`${result.secret}\n`);
        emit({
          id,
          secretFile: path,
          message:
            'Secret written privately. Update the server environment; the previous secret is invalid.',
        });
      } finally {
        await output.close();
      }
      return;
    }
  }
  if (group === 'templates') {
    if (action === 'list') return emit(await admin.templates());
    if (action === 'create') {
      const parsed = z
        .object({
          id: z.string().min(1).max(120),
          display_name: z.string().min(1).max(120),
          adapter: z.string().min(1),
          is_active: z.boolean().optional(),
          allowed_collections: z.array(z.string()).optional(),
          allowed_features: z.array(z.string()).optional(),
        })
        .strict()
        .safeParse(await readJson(required(flags, 'file')));
      if (!parsed.success)
        throw new Error(
          'Invalid template JSON. Use only the documented fields.'
        );
      const payload = parsed.data;
      if (flags['dry-run'] === true) return emit(payload);
      confirm(flags, 'CREATE_SITE_TEMPLATE');
      return emit(await admin.saveTemplate(payload));
    }
  }
  if (group === 'binding') {
    const workspace = required(flags, 'workspace');
    if (action === 'get' || action === 'list')
      return emit(await admin.binding(workspace));
    if (action === 'set') {
      const template = required(flags, 'template');
      if (flags['dry-run'] === true)
        return emit({
          workspace,
          current: await admin.binding(workspace),
          template,
        });
      confirm(flags, 'LINK_SITE_TEMPLATE');
      return emit(await admin.bind(workspace, template));
    }
  }
  throw new Error('Unknown external command. Run ttr external --help.');
}

export function externalAdminHelp() {
  return `External site administration (root permissions required)

  ttr external apps list|get <id>
  ttr external apps save --file app.json --dry-run
  ttr external apps save --file app.json --confirm CONFIGURE_EXTERNAL_APP
  ttr external apps scopes <id> [--scopes external-projects:read,external-projects:manage,external-projects:publish --confirm APPROVE_EXTERNAL_APP_SCOPES]
  ttr external apps rotate-secret <id> --secret-out /private/path --confirm ROTATE_EXTERNAL_APP_SECRET
  ttr external templates list
  ttr external templates create --file template.json --confirm CREATE_SITE_TEMPLATE
  ttr external binding get --workspace <id>
  ttr external binding set --workspace <id> --template <key> --confirm LINK_SITE_TEMPLATE
  ttr external projects --help

App JSON: id, displayName, enabled, origins, allowedScopes, allowedWorkspaceIds.
Scopes replace the approved list; use --dry-run to review or --clear-scopes to revoke all. Workspace allowlists must be explicit.
Template JSON: id (same as custom app ID), display_name, adapter: custom.
Secrets never print; --secret-out creates a NEW owner-only file. Rotation invalidates the old secret.
Use projects setup/diff/apply with a manifest after linking; apply requires --confirm APPLY_EXTERNAL_PROJECT_SYNC.
--json works without prompts.
`;
}
