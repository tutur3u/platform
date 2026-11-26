import { type FlagValue, getFlag, parseArgs } from '../args';
import { CLI_EXIT, CliError } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import { rejectSecretFlags } from '../credential-store';
import { requireMutationGate } from '../safety-gate';
import { formatTable } from '../ui/table';
import { assertNoUntrustedPathSymlinks, readPrivateJsonFile } from './http';
import {
  rethrowUnavailableEndpoint,
  type UpskiiExperience,
  type UpskiiProductClient,
} from './product-client';

export interface UpskiiWorkspacesSettingsOptions {
  args: string[];
  client: UpskiiProductClient;
  env: CliEnv;
  explicitEnvFlag?: boolean;
  json: boolean;
  noColor?: boolean;
  write?: (chunk: string) => void;
}

const VALID_SETTINGS_SECTIONS = new Set([
  'assessment',
  'class',
  'display',
  'membership',
  'models',
  'profile',
  'seats',
  'tutor',
  'voice',
]);

function parseScalarValue(raw: string): boolean | number | string {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/u.test(raw)) {
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
  }
  return raw;
}

function parsePlainObjectJson(
  raw: string,
  source: string
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError({
      code: 'INVALID_JSON_PAYLOAD',
      exitCode: CLI_EXIT.usage,
      message: `Invalid JSON in ${source}.`,
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError({
      code: 'INVALID_JSON_PAYLOAD',
      exitCode: CLI_EXIT.usage,
      message: `${source} must be a JSON object.`,
    });
  }
  return parsed as Record<string, unknown>;
}

function validateSettingsSection(
  section: string | undefined
): string | undefined {
  if (!section) return undefined;
  const normalized = section.trim().toLowerCase();
  if (!VALID_SETTINGS_SECTIONS.has(normalized)) {
    throw new CliError({
      code: 'INVALID_SETTINGS_SECTION',
      exitCode: CLI_EXIT.usage,
      message: `Invalid --section "${section}". Use one of: ${[...VALID_SETTINGS_SECTIONS].join(', ')}.`,
    });
  }
  return normalized;
}

function renderRecordTable(
  record: Record<string, unknown>,
  emptyMessage: string,
  noColor?: boolean
): string {
  const entries = Object.entries(record).map(([key, value]) => ({
    Key: key,
    Value:
      typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value ?? ''),
  }));
  return formatTable(entries, { emptyMessage, noColor });
}

async function resolveSettingsPayload(
  flags: Record<string, FlagValue>
): Promise<Record<string, unknown>> {
  const jsonPayload = getFlag(flags, 'json-payload');
  const filePath = getFlag(flags, 'file');
  const key = getFlag(flags, 'key')?.trim();
  const rawValue = getFlag(flags, 'value');

  if (filePath) {
    await assertNoUntrustedPathSymlinks(filePath);
    const loaded = await readPrivateJsonFile(filePath, 'settings payload');
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
      throw new CliError({
        code: 'INVALID_JSON_PAYLOAD',
        exitCode: CLI_EXIT.usage,
        message: 'Settings payload file must contain a JSON object.',
      });
    }
    return loaded as Record<string, unknown>;
  }

  if (jsonPayload) {
    return parsePlainObjectJson(jsonPayload, '--json-payload');
  }

  if (key) {
    if (rawValue === undefined) {
      throw new CliError({
        code: 'MISSING_FLAG',
        exitCode: CLI_EXIT.usage,
        message: 'Pass --value <value> alongside --key <key>.',
      });
    }
    return { [key]: parseScalarValue(rawValue) };
  }

  throw new CliError({
    code: 'MISSING_SETTINGS_PAYLOAD',
    exitCode: CLI_EXIT.usage,
    hint: 'Pass --key <k> --value <v>, --json-payload <json>, or --file <path>.',
    message: 'No settings update payload provided.',
  });
}

export function upskiiWorkspacesHelp(): string {
  return [
    'ttr external upskii workspaces — inspect and switch Upskii account workspaces',
    '',
    'Usage:',
    '  ttr external upskii workspaces list [--experience educator|learn] [--json]',
    '  ttr external upskii workspaces get <wsId> [--json]',
    '  ttr external upskii workspaces members <wsId> [--json]',
    '  ttr external upskii workspaces switch <wsId> [--experience educator|learn] [--yes] [--json]',
    '',
    'Mutations preview a diff unless --yes is passed (and --dry-run always previews).',
  ].join('\n');
}

const VALID_DISPLAY_PREFERENCE_KEYS = new Set([
  'hideVersionBadge',
  'marketplaceEnabled',
  'slideStudioEnabled',
]);

function validateDisplayPreferencePayload(
  payload: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(payload)) {
    if (!VALID_DISPLAY_PREFERENCE_KEYS.has(key) || typeof value !== 'boolean') {
      throw new CliError({
        code: 'INVALID_DISPLAY_PREFERENCE',
        exitCode: CLI_EXIT.usage,
        hint: `Supported boolean display preferences: ${[...VALID_DISPLAY_PREFERENCE_KEYS].join(', ')}.`,
        message: `Unsupported display preference "${key}" or non-boolean value.`,
      });
    }
  }
}

export function upskiiSettingsHelp(): string {
  return [
    'ttr external upskii settings — read and update Upskii account settings and preferences',
    '',
    'Usage:',
    '  ttr external upskii settings get [--section profile|assessment|class|membership|models|seats|tutor|voice|display] [--class <classId>] [--json]',
    '  ttr external upskii settings preferences [--json]',
    '  ttr external upskii settings update [--section <section>] (--key <k> --value <v> | --json-payload <json> | --file <path>) [--yes] [--json]',
    '',
    'Production updates require explicit --env prod and --reason "<text>".',
  ].join('\n');
}

export async function runUpskiiWorkspacesCommand(
  options: UpskiiWorkspacesSettingsOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'list', id] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiWorkspacesHelp()}\n`);
    return;
  }

  rejectSecretFlags(flags);
  const { client, env, json, noColor } = options;

  if (action === 'list' || action === 'ls') {
    const res = await client.requestJson<{
      items?: Array<Record<string, unknown>>;
      workspaces?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.workspaces.list',
      path: `${client.apiBase}/account-workspaces`,
    });
    const workspaces = Array.isArray(res.data.workspaces)
      ? res.data.workspaces
      : Array.isArray(res.data.items)
        ? res.data.items
        : [];
    if (json) {
      write(
        `${JSON.stringify({ count: workspaces.length, d1Telemetry: res.d1Telemetry, env, workspaces }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        workspaces.map((ws) => ({
          Experience: String(ws.experience ?? client.experience),
          Id: String(ws.id ?? ''),
          Name: String(ws.name ?? ws.title ?? ''),
          Role: String(ws.role ?? ''),
        })),
        { emptyMessage: 'No Upskii workspaces found.', noColor }
      )
    );
    return;
  }

  if (action === 'get' || action === 'show') {
    const wsId = id ?? getFlag(flags, 'workspace') ?? getFlag(flags, 'id');
    if (!wsId) {
      throw new CliError({
        code: 'MISSING_WORKSPACE_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a workspace ID: `ttr external upskii workspaces get <wsId>`.',
      });
    }
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.workspaces.get',
      path: `${client.apiBase}/account-workspaces/${encodeURIComponent(wsId)}`,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  if (action === 'members') {
    const wsId = id ?? getFlag(flags, 'workspace') ?? getFlag(flags, 'id');
    if (!wsId) {
      throw new CliError({
        code: 'MISSING_WORKSPACE_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a workspace ID: `ttr external upskii workspaces members <wsId>`.',
      });
    }
    const res = await client.requestJson<{
      items?: Array<Record<string, unknown>>;
      members?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.workspaces.members',
      path: `${client.apiBase}/account-workspaces/${encodeURIComponent(wsId)}/members`,
    });
    const members = Array.isArray(res.data.members)
      ? res.data.members
      : Array.isArray(res.data.items)
        ? res.data.items
        : [];
    if (json) {
      write(
        `${JSON.stringify({ count: members.length, d1Telemetry: res.d1Telemetry, env, members, workspaceId: wsId }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        members.map((member) => ({
          Email: String(member.email ?? ''),
          Id: String(member.id ?? member.userId ?? ''),
          Name: String(member.name ?? member.displayName ?? ''),
          Role: String(member.role ?? ''),
        })),
        { emptyMessage: 'No workspace members found.', noColor }
      )
    );
    return;
  }

  if (action === 'switch') {
    const wsId = id ?? getFlag(flags, 'workspace') ?? getFlag(flags, 'id');
    if (!wsId) {
      throw new CliError({
        code: 'MISSING_WORKSPACE_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a workspace ID: `ttr external upskii workspaces switch <wsId> --yes`.',
      });
    }
    const experienceRaw = (
      getFlag(flags, 'experience') ?? client.experience
    ).toLowerCase();
    if (experienceRaw !== 'educator' && experienceRaw !== 'learn') {
      throw new CliError({
        code: 'INVALID_EXPERIENCE',
        exitCode: CLI_EXIT.usage,
        message: 'Invalid --experience. Use educator or learn.',
      });
    }
    const targetExperience = experienceRaw as UpskiiExperience;

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii workspaces switch ${wsId} --env ${env}${env === 'prod' ? ' --reason "<reason>"' : ''} --yes`,
        changes: [
          { after: wsId, field: 'workspaceId' },
          { after: targetExperience, field: 'experience' },
        ],
        env,
        origin: client.origins.app,
        target: `workspace:${wsId}`,
        tier: 1,
        title: 'Switch active Upskii workspace',
      },
      write,
    });
    if (!gate.applied) return;

    const res = await client.requestJson<Record<string, unknown>>({
      body: { experience: targetExperience, workspaceId: wsId },
      command: 'external.upskii.workspaces.switch',
      method: 'POST',
      path: `${client.apiBase}/account-workspaces/${encodeURIComponent(wsId)}/switch`,
      reason: gate.reason,
    });
    write(
      `${JSON.stringify({ applied: true, env, experience: targetExperience, result: res.data, workspaceId: wsId }, null, 2)}\n`
    );
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_WORKSPACES_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii workspaces --help`.',
    message: `Unknown workspaces action "${action}".`,
  });
}

function resolveSettingsPath(apiBase: string, section: string): string {
  if (section === 'display') return `${apiBase}/admin/display-preferences`;
  if (section === 'class') return `${apiBase}/settings/class-settings`;
  if (section === 'profile') return `${apiBase}/profile`;
  return `${apiBase}/settings/${encodeURIComponent(section)}`;
}

export async function runUpskiiSettingsCommand(
  options: UpskiiWorkspacesSettingsOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'get'] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiSettingsHelp()}\n`);
    return;
  }

  rejectSecretFlags(flags);
  const { client, env, json, noColor } = options;

  if (action === 'get' || action === 'show') {
    const section =
      validateSettingsSection(getFlag(flags, 'section')) ?? 'membership';
    let path = resolveSettingsPath(client.apiBase, section);
    if (section === 'class') {
      const classId = getFlag(flags, 'class')?.trim();
      if (!classId) {
        throw new CliError({
          code: 'MISSING_FLAG',
          exitCode: CLI_EXIT.usage,
          hint: 'Pass --class <classId> to select the class for settings get --section class.',
          message: 'Missing required flag --class for class settings.',
        });
      }
      path = `${path}?classId=${encodeURIComponent(classId)}`;
    }
    let res: Awaited<
      ReturnType<typeof client.requestJson<Record<string, unknown>>>
    >;
    try {
      res = await client.requestJson<Record<string, unknown>>({
        command: 'external.upskii.settings.get',
        path,
      });
    } catch (error) {
      rethrowUnavailableEndpoint(
        error,
        `Upskii settings section "${section}"`,
        env,
        path
      );
    }
    if (json) {
      write(
        `${JSON.stringify({ d1Telemetry: res.d1Telemetry, env, section, settings: res.data }, null, 2)}\n`
      );
      return;
    }
    write(renderRecordTable(res.data, 'No settings returned.', noColor));
    return;
  }

  if (action === 'preferences' || action === 'prefs') {
    const path = `${client.apiBase}/admin/display-preferences`;
    let res: Awaited<
      ReturnType<typeof client.requestJson<Record<string, unknown>>>
    >;
    try {
      res = await client.requestJson<Record<string, unknown>>({
        command: 'external.upskii.settings.preferences',
        path,
      });
    } catch (error) {
      rethrowUnavailableEndpoint(
        error,
        'Upskii display preferences read endpoint',
        env,
        path
      );
    }
    if (json) {
      write(
        `${JSON.stringify({ d1Telemetry: res.d1Telemetry, env, preferences: res.data }, null, 2)}\n`
      );
      return;
    }
    write(
      renderRecordTable(res.data, 'No display preferences returned.', noColor)
    );
    return;
  }

  if (action === 'update' || action === 'set') {
    const section =
      validateSettingsSection(getFlag(flags, 'section')) ?? 'membership';
    const payload = await resolveSettingsPayload(flags);
    const keys = Object.keys(payload);
    if (keys.length === 0) {
      throw new CliError({
        code: 'EMPTY_SETTINGS_PAYLOAD',
        exitCode: CLI_EXIT.usage,
        message: 'Settings update payload must include at least one field.',
      });
    }
    if (section === 'display') {
      validateDisplayPreferencePayload(payload);
    }

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii settings update --section ${section} --env ${env}${env === 'prod' ? ' --reason "<reason>"' : ''} --yes`,
        changes: keys.map((field) => ({ after: '[redacted]', field })),
        env,
        origin: client.origins.app,
        target: `settings:${section}`,
        tier: 1,
        title: `Update Upskii ${section} settings`,
      },
      write,
    });
    if (!gate.applied) return;

    const path = resolveSettingsPath(client.apiBase, section);
    let res: Awaited<
      ReturnType<typeof client.requestJson<Record<string, unknown>>>
    >;
    try {
      res = await client.requestJson<Record<string, unknown>>({
        body: payload,
        command: 'external.upskii.settings.update',
        discardResponseBody: true,
        ...(section === 'display'
          ? { extraHeaders: { Origin: client.origins.app } }
          : {}),
        fixedErrorMessage: 'Upskii settings update failed.',
        method: section === 'display' ? 'PUT' : 'PATCH',
        path,
        reason: gate.reason,
      });
    } catch (error) {
      rethrowUnavailableEndpoint(
        error,
        `Upskii settings section "${section}"`,
        env,
        path
      );
    }
    write(
      `${JSON.stringify({ applied: true, env, section, status: res.status, updatedFields: keys }, null, 2)}\n`
    );
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_SETTINGS_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii settings --help`.',
    message: `Unknown settings action "${action}".`,
  });
}
