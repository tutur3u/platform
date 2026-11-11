import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type WorkspaceDomainKind = 'custom' | 'platform_subdomain';
export type WorkspaceDomainStatus =
  | 'pending_verification'
  | 'verifying'
  | 'active'
  | 'suspended';

export interface WorkspaceDomainDnsRecord {
  type: 'TXT' | 'CNAME';
  name: string;
  value: string;
}

export interface WorkspaceDomain {
  id: string;
  hostname: string;
  kind: WorkspaceDomainKind;
  status: WorkspaceDomainStatus;
  ownershipStatus: string | null;
  sslStatus: string | null;
  entitlementSource: 'paid_addon' | 'staff_bypass';
  error: string | null;
  ownershipRecord: WorkspaceDomainDnsRecord | null;
  routingRecord: WorkspaceDomainDnsRecord | null;
  providerRecords: WorkspaceDomainDnsRecord[];
  createdAt: string;
  lastCheckedAt: string | null;
  activatedAt: string | null;
}

export interface WorkspaceDomainEntitlement {
  allowed: boolean;
  reason: string;
  source: 'paid_addon' | 'staff_bypass' | null;
  cap: number;
  used: number;
  total: number;
  remaining: number;
}

export interface WorkspaceDomainsOverview {
  domains: WorkspaceDomain[];
  entitlement: WorkspaceDomainEntitlement;
  billing: { checkoutEnabled: boolean; pricePerDomainMonthlyUsd: number };
  cnameTarget: string;
  providerConfigured: boolean;
  canManage: boolean;
}

const base = (wsId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(wsId)}/domains`;

export function listWorkspaceDomains(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<WorkspaceDomainsOverview>(
    base(wsId),
    { cache: 'no-store' }
  );
}

export function addWorkspaceDomain(
  wsId: string,
  hostname: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ domain: WorkspaceDomain }>(
    base(wsId),
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname }),
    }
  );
}

export function verifyWorkspaceDomain(
  wsId: string,
  domainId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ domain: WorkspaceDomain }>(
    `${base(wsId)}/${encodeURIComponent(domainId)}/verify`,
    { method: 'POST', cache: 'no-store' }
  );
}

export function removeWorkspaceDomain(
  wsId: string,
  domainId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    id: string;
    hostname: string;
    providerCleanupPending: boolean;
  }>(`${base(wsId)}/${encodeURIComponent(domainId)}`, {
    method: 'DELETE',
    cache: 'no-store',
  });
}
