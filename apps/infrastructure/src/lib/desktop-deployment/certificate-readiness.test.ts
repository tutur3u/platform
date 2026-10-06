import { generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  inspectDesktopCertificate,
  inspectNotarizationKey,
} from './certificate-readiness';

const now = new Date('2026-10-06T00:00:00Z');
const password = 'synthetic-test-password';
let keys: forge.pki.rsa.KeyPair;
let otherKeys: forge.pki.rsa.KeyPair;
beforeAll(() => {
  keys = forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 0 });
  otherKeys = forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 0 });
});

function certificate(
  options: {
    developerId?: boolean;
    codeSigning?: boolean;
    notBefore?: Date;
    notAfter?: Date;
    pair?: forge.pki.rsa.KeyPair;
  } = {}
) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = (options.pair ?? keys).publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore =
    options.notBefore ?? new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = options.notAfter ?? new Date('2027-01-01T00:00:00Z');
  const attrs = [
    {
      name: 'commonName',
      value: 'Developer ID Application: Synthetic Fixture (ABCDEFGHIJ)',
    },
    { name: 'organizationalUnitName', value: 'ABCDEFGHIJ' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'extKeyUsage', codeSigning: options.codeSigning !== false },
    ...(options.developerId
      ? [
          {
            id: '1.2.840.113635.100.6.1.13',
            value: forge.asn1
              .toDer(
                forge.asn1.create(
                  forge.asn1.Class.UNIVERSAL,
                  forge.asn1.Type.NULL,
                  false,
                  ''
                )
              )
              .getBytes(),
          },
        ]
      : []),
  ]);
  cert.sign((options.pair ?? keys).privateKey, forge.md.sha256.create());
  return cert;
}
function pfx(
  cert: forge.pki.Certificate | forge.pki.Certificate[],
  key: forge.pki.rsa.PrivateKey | null = keys.privateKey
) {
  return Buffer.from(
    forge.asn1
      .toDer(
        forge.pkcs12.toPkcs12Asn1(key, cert, password, { algorithm: '3des' })
      )
      .getBytes(),
    'binary'
  );
}
function inspect(
  bytes: Uint8Array,
  overrides: Partial<Parameters<typeof inspectDesktopCertificate>[0]> = {}
) {
  return inspectDesktopCertificate({
    platform: 'windows',
    bytes,
    password,
    now,
    ...overrides,
  });
}

describe('portable desktop certificate readiness', () => {
  it('accepts matching current code-signing material and returns only public metadata', () => {
    const result = inspect(pfx(certificate()));
    expect(result).toMatchObject({
      ok: true,
      certificate: { algorithm: 'rsa', expiresAt: '2027-01-01T00:00:00.000Z' },
    });
    expect(JSON.stringify(result)).not.toContain(password);
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');
  });
  it('sanitizes wrong-password rejection', () => {
    expect(inspect(pfx(certificate()), { password: 'wrong' })).toEqual({
      ok: false,
      code: 'certificate_invalid',
    });
  });
  it.each([Buffer.alloc(0), Buffer.from('not a pfx'), Buffer.alloc(2097153)])(
    'rejects invalid/bounded payload %s',
    (bytes) => {
      expect(inspect(bytes)).toEqual({
        ok: false,
        code: 'certificate_invalid',
      });
    }
  );
  it('requires a private key', () => {
    expect(inspect(pfx(certificate(), null))).toEqual({
      ok: false,
      code: 'certificate_key_missing',
    });
  });
  it('requires certificate to match the private key', () => {
    expect(inspect(pfx(certificate({ pair: otherKeys })))).toEqual({
      ok: false,
      code: 'certificate_key_mismatch',
    });
  });
  it('rejects multiple matching certificates rather than choosing silently', () => {
    const cert = certificate();
    expect(inspect(pfx([cert, cert]))).toEqual({
      ok: false,
      code: 'certificate_ambiguous',
    });
  });
  it('rejects expired certificates at the inclusive end', () => {
    expect(inspect(pfx(certificate({ notAfter: now })))).toEqual({
      ok: false,
      code: 'certificate_expired',
    });
  });
  it('rejects certificates not yet valid', () => {
    expect(
      inspect(pfx(certificate({ notBefore: new Date('2026-10-07T00:00:00Z') })))
    ).toEqual({ ok: false, code: 'certificate_not_yet_valid' });
  });
  it('requires explicit code-signing EKU', () => {
    expect(inspect(pfx(certificate({ codeSigning: false })))).toEqual({
      ok: false,
      code: 'certificate_codesigning_required',
    });
  });
  it('does not use mobile/ordinary signing certificates as Developer ID', () => {
    expect(inspect(pfx(certificate()), { platform: 'macos' })).toEqual({
      ok: false,
      code: 'certificate_developer_id_required',
    });
  });
  it('accepts Developer ID only with matching identity and team', () => {
    expect(
      inspect(pfx(certificate({ developerId: true })), {
        platform: 'macos',
        identity: 'Developer ID Application: Synthetic Fixture (ABCDEFGHIJ)',
        teamId: 'ABCDEFGHIJ',
      }).ok
    ).toBe(true);
  });
  it('rejects identity mismatch', () => {
    expect(
      inspect(pfx(certificate({ developerId: true })), {
        platform: 'macos',
        identity: 'Developer ID Application: Other (ABCDEFGHIJ)',
        teamId: 'ABCDEFGHIJ',
      })
    ).toEqual({ ok: false, code: 'certificate_identity_mismatch' });
  });
  it('rejects team mismatch', () => {
    expect(
      inspect(pfx(certificate({ developerId: true })), {
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
