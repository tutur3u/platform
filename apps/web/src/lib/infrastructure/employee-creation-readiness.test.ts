import { describe, expect, it, vi } from 'vitest';
import {
  EMPLOYEE_CREATION_ENV_NAMES,
  EMPLOYEE_CREATION_OPERATOR_MANIFEST,
  loadEmployeeCreationReadiness,
} from './employee-creation-readiness';

vi.mock('server-only', () => ({}));
const now = 1000000;
const sourceSha = '84ec8e04c4a412c7dd1501f2bb7ce14c0dda01ea';
const digest = 'a'.repeat(64);
const configuration = {
  database: {
    host: 'db.example.invalid',
    port: 5432,
    database: 'postgres',
    user: 'employee',
    password: 'synthetic',
  },
  requirements: { fixture: true },
  signedProjectBinding: { fixture: true },
  executionQualification: { fixture: true },
  trustedOperatorPublicKey: 'synthetic',
};
const evidence = {
  sourceSha,
  projectRef: 'a'.repeat(20),
  providerProjectRef: 'a'.repeat(20),
  serverHost: configuration.database.host,
  systemIdentifier: '123',
  tlsPeerSha256: digest,
  workerSha256: digest,
  protocolSha256: digest,
  requirementsSha256: digest,
  schemaQualified: true,
  typesQualified: true,
  consumerQualified: true,
  connectionQualified: true,
  operatorQualified: true,
  providerReservedUuidQualified: true,
  serviceRoleQualified: true,
  functionAclQualified: true,
  observedAt: now - 100,
  expiresAt: now + 100,
};
const input = {
  configuration,
  evidence,
  expectedSourceSha: sourceSha,
  now: () => now,
};
describe('external readiness admission', () => {
  it('denies absent evidence, config, verifier and env-only presence', async () => {
    expect(await loadEmployeeCreationReadiness(input)).toEqual({
      kind: 'denied',
    });
    for (const change of [
      { evidence: null },
      { configuration: null },
      { evidence: { ...evidence, envPresent: true } },
    ]) {
      const verify = vi.fn(async () => true);
      expect(
        await loadEmployeeCreationReadiness({ ...input, ...change, verify })
      ).toEqual({ kind: 'denied' });
      expect(verify).not.toHaveBeenCalled();
    }
  });
  it('requires every actual qualification flag', async () => {
    for (const key of [
      'schemaQualified',
      'typesQualified',
      'consumerQualified',
      'connectionQualified',
      'operatorQualified',
      'providerReservedUuidQualified',
      'serviceRoleQualified',
      'functionAclQualified',
    ]) {
      const verify = vi.fn(async () => true);
      expect(
        await loadEmployeeCreationReadiness({
          ...input,
          evidence: { ...evidence, [key]: false },
          verify,
        })
      ).toEqual({ kind: 'denied' });
      expect(verify).not.toHaveBeenCalled();
    }
  });
  it('denies wrong source/project/host, stale/future/overlong evidence', async () => {
    for (const change of [
      { sourceSha: 'b'.repeat(40) },
      { providerProjectRef: 'b'.repeat(20) },
      { serverHost: 'other.invalid' },
      { observedAt: now + 1 },
      { expiresAt: now },
      { observedAt: now - 600001, expiresAt: now + 1 },
    ]) {
      expect(
        await loadEmployeeCreationReadiness({
          ...input,
          evidence: { ...evidence, ...change },
          verify: async () => true,
        })
      ).toEqual({ kind: 'denied' });
    }
  });
  it('passes exact parsed configuration to external verifier; checks expiry after await', async () => {
    const verify = vi.fn(async () => true);
    expect(await loadEmployeeCreationReadiness({ ...input, verify })).toEqual({
      kind: 'qualified',
      configuration,
      observedAt: evidence.observedAt,
      expiresAt: now + 100,
    });
    expect(verify).toHaveBeenCalledWith({ configuration, evidence });
    let clock = now;
    expect(
      await loadEmployeeCreationReadiness({
        ...input,
        now: () => clock,
        verify: async () => {
          clock = now + 100;
          return true;
        },
      })
    ).toEqual({ kind: 'denied' });
  });
  it('denies rejection, exceptions and nonfinite time without echoing secrets', async () => {
    for (const verify of [
      async () => false,
      async () => {
        throw new Error('secret');
      },
    ])
      expect(await loadEmployeeCreationReadiness({ ...input, verify })).toEqual(
        { kind: 'denied' }
      );
    expect(
      await loadEmployeeCreationReadiness({
        ...input,
        now: () => NaN,
        verify: async () => true,
      })
    ).toEqual({ kind: 'denied' });
  });
  it('exposes reviewable proposed names and exact function access requirements', () => {
    expect(EMPLOYEE_CREATION_ENV_NAMES).toContain('EMPLOYEE_SQL_PASSWORD');
    expect(EMPLOYEE_CREATION_ENV_NAMES).toContain('SUPABASE_SECRET_KEY');
    expect(EMPLOYEE_CREATION_ENV_NAMES).toContain('SUPABASE_SERVER_URL');
    expect(EMPLOYEE_CREATION_ENV_NAMES).not.toContain(
      'SUPABASE_SERVICE_ROLE_KEY'
    );
    expect(EMPLOYEE_CREATION_OPERATOR_MANIFEST.functions).toEqual([
      'private.employee_creation_preflight(uuid,uuid,text,text)',
      'private.finalize_employee_creation(uuid,uuid,text,text)',
      'private.confirm_employee_activation(uuid,uuid,text)',
    ]);
  });
});
