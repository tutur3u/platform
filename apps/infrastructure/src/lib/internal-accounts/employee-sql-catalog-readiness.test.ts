import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { EMPLOYEE_CREATION_SIGNATURES } from './employee-creation-database-readiness';
import type { EmployeeSqlQuery } from './employee-creation-sql';
import {
  employeeCatalogRequirementsHash,
  employeeProjectBindingPayloadBytes,
  observeEmployeeSqlCatalog,
} from './employee-sql-catalog-readiness';

vi.mock('server-only', () => ({}));
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();
function fixture() {
  const definition = 'synthetic catalog function definition';
  const requirements = {
    database: {
      projectRef: 'a'.repeat(20),
      contractRevision: 1,
      qualifiedSourceSha: 'b'.repeat(40),
      migrations: ['20261011002107', '20261011002108'],
      functions: EMPLOYEE_CREATION_SIGNATURES.map((signature) => ({
        signature,
        definitionHash: createHash('sha256').update(definition).digest('hex'),
      })),
    },
    policies: EMPLOYEE_CREATION_SIGNATURES.map((signature) => ({
      signature,
      ownerRole: 'postgres',
      searchPath: 'public, private',
    })),
  };
  const payload = {
    kind: 'operator-qualified-project-binding',
    projectRef: 'a'.repeat(20),
    systemIdentifier: '123456789123456789',
    qualifiedSourceSha: 'b'.repeat(40),
    requirementsHash: employeeCatalogRequirementsHash(requirements),
    serverHost: 'db.fixture.invalid',
    peerCertificateSha256: 'c'.repeat(64),
    observedAt: 1000,
    expiresAt: 10000,
  };
  const bytes = employeeProjectBindingPayloadBytes(payload);
  if (!bytes) throw new Error('Expected valid fixture binding');
  const signedProjectBinding = {
    payload,
    signature: sign(null, bytes, keys.privateKey).toString('base64'),
  };
  const controller = new AbortController();
  const query = vi.fn<EmployeeSqlQuery>(async (strings) => {
    const text = strings.join('');
    if (text.includes('current_user'))
      return [
        {
          role: 'service_role',
          jwtRole: 'service_role',
          subject: null,
          claims: { role: 'service_role' },
        },
      ];
    if (text.includes('pg_control_system'))
      return [{ systemIdentifier: payload.systemIdentifier }];
    if (text.includes('has_schema_privilege'))
      return [{ privateSchemaUsage: true }];
    if (text.includes('schema_migrations'))
      return requirements.database.migrations.map((version) => ({ version }));
    return [
      {
        definition,
        ownerRole: 'postgres',
        securityDefiner: true,
        searchPath: 'public, private',
        serviceExecute: true,
        publicExecute: false,
        anonExecute: false,
        authenticatedExecute: false,
      },
    ];
  });
  const context = {
    query,
    signal: controller.signal,
    deadlineAt: 15000,
    serverHost: payload.serverHost,
    peerCertificateSha256: payload.peerCertificateSha256,
  };
  const input = {
    context,
    requirements,
    signedProjectBinding,
    trustedOperatorPublicKey: publicKey,
    clock: () => 1500,
    monotonicClock: () => 500,
  };
  return { input, query, controller, definition };
}
describe('same-connection employee catalog proof (synthetic SQL rows, real signatures)', () => {
  it('requires a signed operator binding before any catalog observation', async () => {
    const f = fixture();
    expect(
      await observeEmployeeSqlCatalog({
        ...f.input,
        signedProjectBinding: undefined,
      })
    ).toEqual({ kind: 'unavailable' });
    expect(
      await observeEmployeeSqlCatalog({
        ...f.input,
        trustedOperatorPublicKey: undefined,
      })
    ).toEqual({ kind: 'unavailable' });
    expect(f.query).not.toHaveBeenCalled();
  });
  it('observes every ledger/signature/body/ACL on the supplied connection and bounds freshness', async () => {
    const f = fixture();
    const result = await observeEmployeeSqlCatalog(f.input);
    expect(result.kind).toBe('observed');
    if (result.kind !== 'observed')
      throw new Error('Expected synthetic observation');
    expect(result.proof.observedAt).toBe(1500);
    expect(result.proof.expiresAt).toBe(10000);
    expect(f.query).toHaveBeenCalledTimes(7);
    expect(
      f.query.mock.calls.slice(4).map(([, signature]) => signature)
    ).toEqual([...EMPLOYEE_CREATION_SIGNATURES]);
  });
  it('rejects forged signatures, changed source/connection binding and expired attestation before queries', async () => {
    for (const change of [
      { qualifiedSourceSha: 'd'.repeat(40) },
      { projectRef: 'd'.repeat(20) },
      { systemIdentifier: '999' },
      { expiresAt: 1400 },
    ]) {
      const f = fixture();
      expect(
        await observeEmployeeSqlCatalog({
          ...f.input,
          signedProjectBinding: {
            ...f.input.signedProjectBinding,
            payload: { ...f.input.signedProjectBinding.payload, ...change },
          },
        })
      ).toEqual({ kind: 'unavailable' });
      expect(f.query).not.toHaveBeenCalled();
    }
    const f = fixture();
    expect(
      await observeEmployeeSqlCatalog({
        ...f.input,
        context: { ...f.input.context, peerCertificateSha256: 'e'.repeat(64) },
      })
    ).toEqual({ kind: 'unavailable' });
    expect(f.query).not.toHaveBeenCalled();
  });
  it('denies an observed different cluster even with the expected URL label', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation();
    f.query.mockImplementation(async (strings, ...params) =>
      strings.join('').includes('pg_control_system')
        ? [{ systemIdentifier: '999' }]
        : original?.(strings, ...params)
    );
    expect(await observeEmployeeSqlCatalog(f.input)).toEqual({
      kind: 'unavailable',
    });
    expect(f.query).toHaveBeenCalledTimes(2);
  });
  it('denies catalog privilege errors without raw database error leakage', async () => {
    const f = fixture();
    f.query.mockRejectedValue({
      code: '42501',
      detail: 'synthetic sensitive diagnostics',
    });
    expect(await observeEmployeeSqlCatalog(f.input)).toEqual({
      kind: 'unavailable',
    });
  });
  it('denies missing ledger and effective public/anonymous/owner/search-path/body drift', async () => {
    for (const patch of [
      { publicExecute: true },
      { anonExecute: true },
      { authenticatedExecute: true },
      { serviceExecute: false },
      { ownerRole: 'other' },
      { securityDefiner: false },
      { searchPath: 'unsafe' },
      { definition: 'changed' },
    ]) {
      const f = fixture();
      const original = f.query.getMockImplementation();
      f.query.mockImplementation(async (strings, ...params) =>
        strings.join('').includes('pg_get_functiondef')
          ? [
              {
                definition: f.definition,
                ownerRole: 'postgres',
                securityDefiner: true,
                searchPath: 'public, private',
                serviceExecute: true,
                publicExecute: false,
                anonExecute: false,
                authenticatedExecute: false,
                ...patch,
              },
            ]
          : original?.(strings, ...params)
      );
      expect(await observeEmployeeSqlCatalog(f.input)).toEqual({
        kind: 'unavailable',
      });
    }
    const f = fixture();
    const original = f.query.getMockImplementation();
    f.query.mockImplementation(async (strings, ...params) =>
      strings.join('').includes('schema_migrations')
        ? []
        : original?.(strings, ...params)
    );
    expect(await observeEmployeeSqlCatalog(f.input)).toEqual({
      kind: 'unavailable',
    });
  });
  it('denies cancellation and monotonic deadline expiry during catalog observation', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation();
    f.query.mockImplementation(async (strings, ...params) => {
      const result = await original?.(strings, ...params);
      f.controller.abort();
      return result;
    });
    expect(await observeEmployeeSqlCatalog(f.input)).toEqual({
      kind: 'unavailable',
    });
    expect(f.query).toHaveBeenCalledTimes(1);
    const expired = fixture();
    expect(
      await observeEmployeeSqlCatalog({
        ...expired.input,
        monotonicClock: () => 15000,
      })
    ).toEqual({ kind: 'unavailable' });
    expect(expired.query).not.toHaveBeenCalled();
  });
});
