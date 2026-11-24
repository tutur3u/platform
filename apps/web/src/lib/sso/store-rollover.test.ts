import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import type { SsoConfiguration } from './config';
import { rolloverCertificates, type SsoAdmin } from './store';

/** A disposable self-signed RSA certificate; the key is discarded. */
function certificate() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const directory = mkdtempSync(join(tmpdir(), 'sso-rollover-'));
  try {
    const keyPath = join(directory, 'key.pem');
    writeFileSync(keyPath, privateKey, { mode: 0o600 });
    return execFileSync(
      'openssl',
      [
        'req',
        '-new',
        '-x509',
        '-key',
        keyPath,
        '-subj',
        '/CN=Rollover test',
        '-days',
        '1',
        '-sha256',
      ],
      { encoding: 'utf8' }
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const active = certificate();
const next = certificate();
const old = certificate();
const config = {
  clientId: '00000000-0000-4000-8000-000000000001',
  signingKid: 'pilot',
} as SsoConfiguration;
const admin = (result: { data: unknown; error: unknown }) =>
  ({ rpc: vi.fn(async () => result) }) as unknown as SsoAdmin;
const keys = (...rows: [string, string, string][]) =>
  rows.map(([kid, status, public_certificate]) => ({
    kid,
    status,
    revision: 1,
    public_certificate,
  }));
const current = (certificate: string) => ({ certificate, revision: 1 });

describe('metadata rollover certificates', () => {
  it('returns pending and retiring certificates after the signing key', async () => {
    const client = admin({
      data: keys(
        ['pilot', 'active', active],
        ['next', 'pending', next],
        ['old', 'retiring', old]
      ),
      error: null,
    });
    await expect(
      rolloverCertificates(client, config, current(active))
    ).resolves.toEqual([next, old]);
    expect(client.rpc).toHaveBeenCalledWith('sso_metadata_certificates', {
      p_client_id: config.clientId,
    });
  });

  it('publishes no rollover certificate when only the active key exists', async () => {
    await expect(
      rolloverCertificates(
        admin({ data: keys(['pilot', 'active', active]), error: null }),
        config,
        current(active)
      )
    ).resolves.toEqual([]);
  });

  it.each([
    ['a different active kid', keys(['other', 'active', active])],
    ['a different active certificate', keys(['pilot', 'active', next])],
    ['a pending key first', keys(['pilot', 'pending', active])],
    [
      'two active keys',
      keys(['pilot', 'active', active], ['other', 'active', next]),
    ],
    [
      'a different active key revision',
      keys(['pilot', 'active', active]).map((k) => ({ ...k, revision: 2 })),
    ],
  ])('denies a projection with %s', async (_, data) => {
    await expect(
      rolloverCertificates(
        admin({ data, error: null }),
        config,
        current(active)
      )
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it.each([
    ['an RPC error', { data: null, error: { code: 'x' } }],
    ['no projection', { data: null, error: null }],
    [
      'too many keys',
      {
        data: keys(
          ['pilot', 'active', active],
          ['a', 'pending', next],
          ['b', 'pending', next],
          ['c', 'retiring', next]
        ),
        error: null,
      },
    ],
    [
      'a revoked key',
      { data: keys(['pilot', 'revoked', active]), error: null },
    ],
    [
      'private key material',
      {
        data: keys([
          'pilot',
          'active',
          '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----',
        ]),
        error: null,
      },
    ],
  ])('is unavailable on %s', async (_, result) => {
    await expect(
      rolloverCertificates(admin(result), config, current(active))
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});
