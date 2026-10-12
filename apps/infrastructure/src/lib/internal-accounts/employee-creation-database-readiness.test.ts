import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_CREATION_SIGNATURES,
  verifyEmployeeDatabaseReadiness,
} from './employee-creation-database-readiness';

function fixture() {
  const requirements = {
    projectRef: 'a'.repeat(20),
    contractRevision: 1,
    qualifiedSourceSha: 'b'.repeat(40),
    migrations: ['20261011002107', '20261011002108'],
    functions: EMPLOYEE_CREATION_SIGNATURES.map((signature) => ({
      signature,
      definitionHash: 'c'.repeat(64),
    })),
  };
  const proof = {
    ...requirements,
    kind: 'qualified',
    connectionConfigured: true,
    qualificationPassed: true,
    executionRole: 'service_role',
    privateSchemaUsage: true,
    publicExecute: false,
    anonExecute: false,
    authenticatedExecute: false,
    functionExecutionAllowed: true,
    observedAt: 1000,
    expiresAt: 2000,
  };
  return { proof, requirements, now: 1500 };
}
describe('server-owned employee database readiness proof', () => {
  it('accepts only fresh exact project/qualified source/function/ACL/ledger binding', () => {
    const input = fixture();
    expect(verifyEmployeeDatabaseReadiness(input)).toEqual({
      kind: 'ready',
      requirements: input.requirements,
    });
  });
  it.each([null, {}, { kind: 'pending' }])(
    'fails closed for absent or pending proof',
    (proof) => {
      expect(
        verifyEmployeeDatabaseReadiness({ ...fixture(), proof }).kind
      ).toBe('unavailable');
    }
  );
  it('does not permit configuration, qualifications or privilege overrides', () => {
    const input = fixture();
    for (const change of [
      { connectionConfigured: false },
      { qualificationPassed: false },
      { executionRole: 'postgres' },
      { publicExecute: true },
      { anonExecute: true },
      { authenticatedExecute: true },
      { privateSchemaUsage: false },
      { functionExecutionAllowed: false },
      { ignoreMissingLedger: true },
    ]) {
      expect(
        verifyEmployeeDatabaseReadiness({
          ...input,
          proof: { ...input.proof, ...change },
        }).kind
      ).toBe('unavailable');
    }
    expect(
      verifyEmployeeDatabaseReadiness({ ...input, requirements: {} }).kind
    ).toBe('unavailable');
  });
  it('rejects expired/future/unbounded proof and invalid clock', () => {
    const input = fixture();
    for (const change of [
      { expiresAt: 1500 },
      { observedAt: 1600 },
      { expiresAt: 100_000 },
    ]) {
      expect(
        verifyEmployeeDatabaseReadiness({
          ...input,
          proof: { ...input.proof, ...change },
        }).kind
      ).toBe('unavailable');
    }
    expect(
      verifyEmployeeDatabaseReadiness({ ...input, now: Number.NaN }).kind
    ).toBe('unavailable');
  });
  it('rejects mismatched project, source, signatures, body hashes and missing ledger', () => {
    const input = fixture();
    for (const change of [
      { projectRef: 'd'.repeat(20) },
      { qualifiedSourceSha: 'e'.repeat(40) },
      { migrations: [] },
      { migrations: ['20261011002107', '20261011002109'] },
      {
        functions: input.proof.functions.map((entry) => ({
          ...entry,
          definitionHash: 'f'.repeat(64),
        })),
      },
      {
        functions: [
          input.proof.functions[0],
          input.proof.functions[0],
          input.proof.functions[0],
        ],
      },
    ]) {
      expect(
        verifyEmployeeDatabaseReadiness({
          ...input,
          proof: { ...input.proof, ...change },
        }).kind
      ).toBe('unavailable');
    }
  });
});
