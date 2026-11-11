import {
  createInternalApiClient,
  encodePathSegment,
} from '@tuturuuu/internal-api/client';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';

type DnsRecord = { type: string; name: string; value: string };

/** Fields of `GET /api/v1/workspaces/:wsId/domains` the CLI reads. */
interface WorkspaceDomain {
  id: string;
  hostname: string;
  kind: string;
  status: string;
  error: string | null;
  ownershipRecord: DnsRecord | null;
  routingRecord: DnsRecord | null;
  providerRecords: DnsRecord[];
}
interface DomainsOverview {
  cnameTarget: string | null;
  platformApex: string | null;
  domains: WorkspaceDomain[];
  entitlement: {
    reason: string;
    source: string | null;
    used: number;
    total: number;
  };
}

function domainsApi(client: TuturuuuUserClient, workspaceId: string) {
  const api = createInternalApiClient(client.getClientOptions());
  const base = `/api/v1/workspaces/${encodePathSegment(workspaceId)}/domains`;
  const item = (id: string) => `${base}/${encodePathSegment(id)}`;
  return {
    list: () => api.json<DomainsOverview>(base, { cache: 'no-store' }),
    add: (hostname: string) =>
      api.json<{ domain: WorkspaceDomain }>(base, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname }),
      }),
    verify: (id: string) =>
      api.json<{ domain: WorkspaceDomain }>(`${item(id)}/verify`, {
        method: 'POST',
        cache: 'no-store',
      }),
    remove: (id: string) =>
      api.json<{ hostname: string; providerCleanupPending: boolean }>(
        item(id),
        { method: 'DELETE', cache: 'no-store' }
      ),
  };
}

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

async function findDomain(
  api: ReturnType<typeof domainsApi>,
  hostname: string
) {
  const overview = await api.list();
  const domain = overview.domains.find((item) => item.hostname === hostname);
  if (!domain) throw new Error(`Domain ${hostname} not found in workspace.`);
  return domain;
}

/** `ttr domains list|add <host>|verify <host>|remove <host> --confirm <host>`. */
export async function runDomainsCommand(options: Options) {
  const { client, flags, json, positionals } = options;
  const [action = 'list', rawHostname] = positionals;
  const api = domainsApi(client, options.workspaceId);
  const emit = (value: unknown, text: string) =>
    write(json ? JSON.stringify(value, null, 2) : text);

  if (action === 'list') {
    const overview = await api.list();
    const { entitlement } = overview;
    const header = entitlement.source
      ? `Domains: ${entitlement.used}/${entitlement.total} (${entitlement.source})`
      : `Domains: unavailable (${entitlement.reason})`;
    const targets = [
      overview.cnameTarget
        ? `Custom domains: CNAME (or ALIAS at the apex) to ${overview.cnameTarget}`
        : 'Custom domains: not configured',
      overview.platformApex
        ? `Platform subdomains: <label>.${overview.platformApex}`
        : 'Platform subdomains: not configured',
    ];
    return emit(
      overview,
      [
        header,
        ...targets,
        ...overview.domains.map(describeDomain),
        ...(overview.domains.length ? [] : ['No domains.']),
      ].join('\n')
    );
  }

  const hostname = normalize(rawHostname);
  if (action === 'add') {
    const { domain } = await api.add(hostname);
    return emit(domain, describeDomain(domain));
  }
  if (action === 'verify') {
    const existing = await findDomain(api, hostname);
    const { domain } = await api.verify(existing.id);
    return emit(domain, describeDomain(domain));
  }
  if (action === 'remove') {
    const confirm = getFlag(flags, 'confirm');
    if (!confirm || normalize(confirm) !== hostname) {
      throw new Error(
        `Removing stops serving immediately. Pass --confirm ${hostname}.`
      );
    }
    const existing = await findDomain(api, hostname);
    const result = await api.remove(existing.id);
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
  return `Workspace domains (custom domains and platform subdomains)

  ttr domains list [--workspace <id>] [--json]
  ttr domains add <hostname> [--workspace <id>] [--json]
  ttr domains verify <hostname> [--workspace <id>] [--json]
  ttr domains remove <hostname> --confirm <hostname> [--workspace <id>]

Custom domains need a CNAME (or ALIAS at the apex) to the fallback origin and
the ownership TXT record that list prints; run verify after publishing DNS.
Requires the view or manage workspace domains permission.
`;
}
