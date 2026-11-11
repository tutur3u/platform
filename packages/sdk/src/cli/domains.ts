import {
  addWorkspaceDomain,
  listWorkspaceDomains,
  removeWorkspaceDomain,
  verifyWorkspaceDomain,
  type WorkspaceDomain,
} from '@tuturuuu/internal-api/workspace-domains';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';

type Options = {
  client: TuturuuuUserClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
};

function write(text: string) {
  process.stdout.write(`${text}\n`);
}

function describeDomain(domain: WorkspaceDomain) {
  const lines = [`${domain.hostname}  ${domain.status}  (${domain.kind})`];
  if (domain.error) lines.push(`  note: ${domain.error}`);
  if (domain.kind === 'custom' && domain.status !== 'active') {
    const records = [
      domain.routingRecord,
      domain.ownershipRecord,
      ...(Array.isArray(domain.providerRecords) ? domain.providerRecords : []),
    ].filter((record) => record !== null);
    for (const record of records) {
      lines.push(`  ${record.type.padEnd(5)} ${record.name}  ${record.value}`);
    }
  }
  return lines.join('\n');
}

function normalize(hostname: string | undefined) {
  const value = hostname?.trim().toLowerCase().replace(/\.+$/u, '');
  if (!value) throw new Error('Missing hostname.');
  return value;
}

async function findDomain(options: Options, hostname: string) {
  const overview = await listWorkspaceDomains(
    options.workspaceId,
    options.client.getClientOptions()
  );
  const domain = overview.domains.find((item) => item.hostname === hostname);
  if (!domain) throw new Error(`Domain ${hostname} not found in workspace.`);
  return domain;
}

/** `ttr domains list|add <host>|verify <host>|remove <host> --confirm <host>`. */
export async function runDomainsCommand(options: Options) {
  const { client, flags, json, positionals } = options;
  const [action = 'list', rawHostname] = positionals;
  const api = client.getClientOptions();
  const emit = (value: unknown, text: string) =>
    write(json ? JSON.stringify(value, null, 2) : text);

  if (action === 'list') {
    const overview = await listWorkspaceDomains(options.workspaceId, api);
    const { entitlement } = overview;
    const header = entitlement.source
      ? `Domains: ${entitlement.used}/${entitlement.total} (${entitlement.source})`
      : `Domains: unavailable (${entitlement.reason})`;
    return emit(
      overview,
      [
        header,
        ...overview.domains.map(describeDomain),
        ...(overview.domains.length ? [] : ['No domains.']),
      ].join('\n')
    );
  }

  const hostname = normalize(rawHostname);
  if (action === 'add') {
    const { domain } = await addWorkspaceDomain(
      options.workspaceId,
      hostname,
      api
    );
    return emit(domain, describeDomain(domain));
  }
  if (action === 'verify') {
    const existing = await findDomain(options, hostname);
    const { domain } = await verifyWorkspaceDomain(
      options.workspaceId,
      existing.id,
      api
    );
    return emit(domain, describeDomain(domain));
  }
  if (action === 'remove') {
    const confirm = getFlag(flags, 'confirm');
    if (!confirm || normalize(confirm) !== hostname) {
      throw new Error(
        `Removing stops serving immediately. Pass --confirm ${hostname}.`
      );
    }
    const existing = await findDomain(options, hostname);
    const result = await removeWorkspaceDomain(
      options.workspaceId,
      existing.id,
      api
    );
    return emit(
      result,
      result.providerCleanupPending
        ? `Removed ${hostname}. Provider cleanup is pending.`
        : `Removed ${hostname}.`
    );
  }
  throw new Error('Unknown domains command. Run ttr domains --help.');
}

export function domainsHelp() {
  return `Workspace domains (custom domains and <label>.ttr.gg addresses)

  ttr domains list [--workspace <id>] [--json]
  ttr domains add <hostname> [--workspace <id>] [--json]
  ttr domains verify <hostname> [--workspace <id>] [--json]
  ttr domains remove <hostname> --confirm <hostname> [--workspace <id>]

Custom domains need a CNAME (or ALIAS at the apex) to saas.ttr.gg and the
ownership TXT record printed by add/list; run verify after publishing DNS.
Requires the view or manage workspace domains permission.
`;
}
