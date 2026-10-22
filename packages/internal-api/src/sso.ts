import { getInternalApiClient, type InternalApiClientOptions } from './client';

export const SSO_NAME_ID_FORMAT =
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent';
export type SsoRequestSigning =
  | { mode: 'unsigned' }
  | { mode: 'required'; certificate: string };
export interface SsoClientInput {
  displayName: string;
  domains: string[];
  entityId: string;
  acsUrl: string;
  nameIdFormat: typeof SSO_NAME_ID_FORMAT;
  requestSigning: SsoRequestSigning;
}
export interface SsoManagedClient
  extends Omit<SsoClientInput, 'requestSigning'> {
  id: string;
  enabled: boolean;
  revision: number;
  requestSigningMode: 'unsigned' | 'required' | null;
  spCertificate: string | null;
}
export interface SsoOverview {
  clients: SsoManagedClient[];
  globalEnabled: boolean;
}
export interface SsoMember {
  userId: string;
  displayName: string | null;
  active: boolean;
  revision: number;
}
export interface SsoPublicKey {
  kid: string;
  status: 'pending' | 'active' | 'retiring' | 'revoked';
  publicCertificate: string;
  notBefore: string;
  notAfter: string;
  createdAt: string;
  activatedAt: string | null;
  retiredAt: string | null;
  revokedAt: string | null;
}
export interface SsoAuditEvent {
  id: string;
  eventType: string;
  revision: number;
  createdAt: string;
}
export interface SsoClientDetail {
  members: SsoMember[];
  keys: SsoPublicKey[];
  audit: SsoAuditEvent[];
  setup: { metadataUrl: string; entityId: string; ssoUrl: string } | null;
  pilotSelected: boolean;
}
export type SsoClientUpdate = SsoClientInput & {
  expectedRevision: number;
  enabled: boolean;
  confirmEnable?: boolean;
};
const base = (wsId: string) =>
  `/api/v1/workspaces/${encodeURIComponent(wsId)}/sso/clients`;
export function listSsoClients(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<SsoOverview>(base(wsId), {
    cache: 'no-store',
  });
}
export function getSsoClientDetail(
  wsId: string,
  clientId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<SsoClientDetail>(
    `${base(wsId)}/${encodeURIComponent(clientId)}`,
    { cache: 'no-store' }
  );
}
export function createSsoClient(
  wsId: string,
  input: SsoClientInput,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ id: string; revision: number }>(
    base(wsId),
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}
export function updateSsoClient(
  wsId: string,
  clientId: string,
  input: SsoClientUpdate,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ id: string; revision: number }>(
    `${base(wsId)}/${encodeURIComponent(clientId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}
export function setSsoAssignment(
  wsId: string,
  clientId: string,
  input: { userId: string; expectedRevision: number; active: boolean },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: true }>(
    `${base(wsId)}/${encodeURIComponent(clientId)}/assignments`,
    {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export function setSsoClientEnabled(
  wsId: string,
  clientId: string,
  input: {
    expectedRevision: number;
    enabled: boolean;
    confirmEnable?: boolean;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ id: string; revision: number }>(
    `${base(wsId)}/${encodeURIComponent(clientId)}/activation`,
    {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}
