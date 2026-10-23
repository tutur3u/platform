// @vitest-environment node

import { generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  inspectDesktopCertificate,
  inspectNotarizationKey,
} from './certificate-readiness';

const now = new Date('2026-10-06T00:00:00Z');
const password = 'synthetic-test-password';
type TestKeyPair = ReturnType<typeof generateKeyPairSync>;
type TestPki = {
  x509: {
    sign(
      spec: Record<string, unknown>,
      issuer: Record<string, unknown>
    ): Promise<Buffer>;
    extension(oid: string, value: unknown): Buffer;
  };
  asn1: { build: { null(): Buffer } };
  pkcs12: {
    build(
      spec: Record<string, unknown>,
      options: { password: string; mac?: { algorithm: string; hash: string } }
    ): Promise<Buffer>;
  };
};
const pki = require('@blamejs/pki') as TestPki;
let keys: TestKeyPair;
let otherKeys: TestKeyPair;
beforeAll(() => {
  keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
});

async function certificate(
  options: {
    developerId?: boolean;
    codeSigning?: boolean;
    notBefore?: Date;
    notAfter?: Date;
    pair?: TestKeyPair;
  } = {}
): Promise<Buffer> {
  const pair = options.pair ?? keys;
  const subject = [
    { commonName: 'Developer ID Application: Synthetic Fixture (ABCDEFGHIJ)' },
    { organizationalUnitName: 'ABCDEFGHIJ' },
  ];
  return pki.x509.sign(
    {
      subject,
      subjectPublicKey: pair.publicKey.export({ format: 'der', type: 'spki' }),
      notBefore: options.notBefore ?? new Date('2026-01-01T00:00:00Z'),
      notAfter: options.notAfter ?? new Date('2027-01-01T00:00:00Z'),
      extensions: [
        pki.x509.extension('basicConstraints', { cA: false }),
        ...(options.codeSigning === false
          ? []
          : [pki.x509.extension('extendedKeyUsage', ['codeSigning'])]),
        ...(options.developerId
          ? [
              pki.x509.extension(
                '1.2.840.113635.100.6.1.13',
                Buffer.from([0x05, 0x00])
              ),
            ]
          : []),
      ],
    },
    {
      key: pair.privateKey,
      name: subject,
      publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }),
    }
  );
}
async function pfx(cert: Buffer | Buffer[], key: TestKeyPair | null = keys) {
  const certs = Array.isArray(cert) ? cert : [cert];
  return pki.pkcs12.build(
    {
      safeContents: [
        {
          bags: [
            ...certs.map((entry) => ({ type: 'cert', cert: entry })),
            ...(key
              ? [
                  {
                    type: 'shroudedKey',
                    key: key.privateKey.export({
                      format: 'der',
                      type: 'pkcs8',
                    }),
                    encrypt: { password },
                  },
                ]
              : []),
          ],
        },
      ],
    },
    { password, mac: { algorithm: 'hmac', hash: 'sha256' } }
  );
}
async function inspect(
  bytes: Uint8Array,
  overrides: Partial<Parameters<typeof inspectDesktopCertificate>[0]> = {}
) {
  return await inspectDesktopCertificate({
    platform: 'windows',
    bytes,
    password,
    now,
    ...overrides,
  });
}

describe('portable desktop certificate readiness', () => {
  it('accepts matching current code-signing material and returns only public metadata', async () => {
    const result = await inspect(await pfx(await certificate()));
    expect(result).toMatchObject({
      ok: true,
      certificate: { algorithm: 'rsa', expiresAt: '2027-01-01T00:00:00.000Z' },
    });
    expect(JSON.stringify(result)).not.toContain(password);
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');
  });
  it('sanitizes wrong-password rejection', async () => {
    expect(
      await inspect(await pfx(await certificate()), { password: 'wrong' })
    ).toEqual({
      ok: false,
      code: 'certificate_invalid',
    });
  });
  it.each([Buffer.alloc(0), Buffer.from('not a pfx'), Buffer.alloc(2097153)])(
    'rejects invalid/bounded payload %s',
    async (bytes) => {
      expect(await inspect(bytes)).toEqual({
        ok: false,
        code: 'certificate_invalid',
      });
    }
  );
  it('requires a private key', async () => {
    expect(await inspect(await pfx(await certificate(), null))).toEqual({
      ok: false,
      code: 'certificate_key_missing',
    });
  });
  it('requires certificate to match the private key', async () => {
    expect(
      await inspect(await pfx(await certificate({ pair: otherKeys })))
    ).toEqual({
      ok: false,
      code: 'certificate_key_mismatch',
    });
  });
  it('rejects multiple matching certificates rather than choosing silently', async () => {
    const cert = await certificate();
    expect(await inspect(await pfx([cert, cert]))).toEqual({
      ok: false,
      code: 'certificate_ambiguous',
    });
  });
  it('rejects expired certificates at the inclusive end', async () => {
    expect(
      await inspect(await pfx(await certificate({ notAfter: now })))
    ).toEqual({
      ok: false,
      code: 'certificate_expired',
    });
  });
  it('rejects certificates not yet valid', async () => {
    expect(
      await inspect(
        await pfx(
          await certificate({ notBefore: new Date('2026-10-07T00:00:00Z') })
        )
      )
    ).toEqual({ ok: false, code: 'certificate_not_yet_valid' });
  });
  it('requires explicit code-signing EKU', async () => {
    expect(
      await inspect(await pfx(await certificate({ codeSigning: false })))
    ).toEqual({
      ok: false,
      code: 'certificate_codesigning_required',
    });
  });
  it('does not use mobile/ordinary signing certificates as Developer ID', async () => {
    expect(
      await inspect(await pfx(await certificate()), { platform: 'macos' })
    ).toEqual({
      ok: false,
      code: 'certificate_developer_id_required',
    });
  });
  it('accepts Developer ID only with matching identity and team', async () => {
    expect(
      await inspect(await pfx(await certificate({ developerId: true })), {
        platform: 'macos',
        identity: 'Developer ID Application: Synthetic Fixture (ABCDEFGHIJ)',
        teamId: 'ABCDEFGHIJ',
      })
    ).toMatchObject({ ok: true });
  });
  it('rejects identity mismatch', async () => {
    expect(
      await inspect(await pfx(await certificate({ developerId: true })), {
        platform: 'macos',
        identity: 'Developer ID Application: Other (ABCDEFGHIJ)',
        teamId: 'ABCDEFGHIJ',
      })
    ).toEqual({ ok: false, code: 'certificate_identity_mismatch' });
  });
  it('rejects team mismatch', async () => {
    expect(
      await inspect(await pfx(await certificate({ developerId: true })), {
        platform: 'macos',
        identity: 'Developer ID Application: Synthetic Fixture (ABCDEFGHIJ)',
        teamId: 'KLMNOPQRST',
      })
    ).toEqual({ ok: false, code: 'certificate_team_mismatch' });
  });
});

describe('App Store Connect notarization key material', () => {
  it('accepts PKCS8 EC P-256 material without claiming Apple account access', () => {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    expect(
      inspectNotarizationKey(
        Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' }))
      )
    ).toEqual({ ok: true });
  });
  it.each(['rsa', 'ec'])('rejects incorrect algorithm/curve %s', (type) => {
    const { privateKey } =
      type === 'rsa'
        ? generateKeyPairSync('rsa', { modulusLength: 2048 })
        : generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    expect(
      inspectNotarizationKey(
        Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' }))
      )
    ).toEqual({ ok: false, code: 'notarization_key_invalid' });
  });
  it.each([Buffer.alloc(0), Buffer.alloc(32769), Buffer.from('not pem')])(
    'rejects invalid key material',
    (bytes) => {
      expect(inspectNotarizationKey(bytes)).toEqual({
        ok: false,
        code: 'notarization_key_invalid',
      });
    }
  );
});
