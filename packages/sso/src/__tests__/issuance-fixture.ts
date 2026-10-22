import type { IssuancePolicy, IssuancePrincipal } from '../issuance/policy';

const now = new Date('2026-10-22T10:00:00Z');
export const policy: IssuancePolicy = {
  clientId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  revision: 1,
  domains: ['example.test'],
  member: true,
  assigned: true,
  keyId: '00000000-0000-4000-8000-000000000003',
  keyRevision: 1,
};
export const actor: IssuancePrincipal = {
  userId: '00000000-0000-4000-8000-000000000004',
  sessionId: 'verified-provider-session',
  email: 'member@example.test',
  firstName: 'Given',
  lastName: 'Family',
  emailConfirmed: true,
  accountAllowed: true,
  factorCurrent: true,
  primaryAt: now.getTime() / 1000 - 30,
  mfaAt: now.getTime() / 1000 - 10,
};
