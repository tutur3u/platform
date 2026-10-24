import { execFileSync } from 'node:child_process';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  X509Certificate,
} from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Encoder } from 'cbor-x';

const encode = new Encoder({ mapsAsObjects: false, useRecords: false }).encode;

function appleFixture(
  options: {
    development?: boolean;
    mac?: boolean;
    iosAcl?: string;
    acl?: string | false;
    category?: number;
    version?: string;
  } = {}
) {
  const dir = mkdtempSync(join(tmpdir(), 'integrity-apple-'));
  const openssl = (...args: string[]) =>
    execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  try {
    for (const name of ['root', 'intermediate', 'leaf'])
      openssl(
        'ecparam',
        '-name',
        'prime256v1',
        '-genkey',
        '-noout',
        '-out',
        `${name}.key`
      );
    writeFileSync(
      join(dir, 'root.conf'),
      '[req]\ndistinguished_name=dn\nx509_extensions=v3_ca\n[dn]\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n'
    );
    openssl(
      'req',
      '-new',
      '-x509',
      '-key',
      'root.key',
      '-out',
      'root.pem',
      '-config',
      'root.conf',
      '-subj',
      '/CN=Fixture Root',
      '-days',
      '1'
    );
    openssl(
      'req',
      '-new',
      '-key',
      'intermediate.key',
      '-out',
      'intermediate.csr',
      '-subj',
      '/CN=Fixture Intermediate'
    );
    writeFileSync(
      join(dir, 'intermediate.conf'),
      'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n'
    );
    openssl(
      'x509',
      '-req',
      '-in',
      'intermediate.csr',
      '-CA',
      'root.pem',
      '-CAkey',
      'root.key',
      '-CAcreateserial',
      '-out',
      'intermediate.pem',
      '-days',
      '1',
      '-extfile',
      'intermediate.conf'
    );
    const privateKey = createPrivateKey(readFileSync(join(dir, 'leaf.key')));
    const point = createPublicKey(privateKey)
      .export({ format: 'der', type: 'spki' })
      .subarray(-65);
    const keyId = createHash('sha256').update(point).digest('base64');
    const requestHash = createHash('sha256')
      .update('fixture-bound-request')
      .digest('base64url');
    const appId = `TEAM.${options.mac ? 'com.example.signing' : 'com.example.app'}`;
    const extensions =
      options.mac ||
      options.category !== undefined ||
      options.version !== undefined;
    const flags = Buffer.from([0x40 | (extensions ? 0x80 : 0)]);
    const cose = encode(
      new Map<number, number | Buffer>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, point.subarray(1, 33)],
        [-3, point.subarray(33)],
      ])
    );
    const authData = Buffer.concat([
      createHash('sha256').update(appId).digest(),
      flags,
      Buffer.alloc(4),
      options.development
        ? Buffer.from('appattestdevelop')
        : Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7)]),
      Buffer.from([0, 32]),
      Buffer.from(keyId, 'base64'),
      cose,
      ...(extensions
        ? [
            encode({
              apple_validation_category_01: options.category ?? 4,
              apple_bundle_version_01: options.version ?? '42',
            }),
          ]
        : []),
    ]);
    const nonce = createHash('sha256')
      .update(authData)
      .update(Buffer.from(requestHash, 'base64url'))
      .digest();
    const derOctets = (value: Buffer, tag = 0xa1) =>
      Buffer.concat([
        Buffer.from([
          0x30,
          value.length + 4,
          tag,
          value.length + 2,
          4,
          value.length,
        ]),
        value,
      ])
        .toString('hex')
        .match(/../g)
        ?.join(':') ?? '';
    const acl =
      options.acl === false
        ? ''
        : `1.2.840.113635.100.8.6=DER:${derOctets(Buffer.from(options.iosAcl ?? options.acl ?? 'MEAMAjExMDowCQwCb2uhAwEB/zAJDAJvYaEDAQH/MAsMBG9kZWyhAwEB/zAVDARvc2duoAYMBHJzZWMwBaYDAgEB', 'base64'), 0xa3)}\n`;
    writeFileSync(
      join(dir, 'leaf.conf'),
      `basicConstraints=critical,CA:FALSE\n1.2.840.113635.100.8.2=DER:${derOctets(nonce)}\n${options.mac || options.iosAcl ? acl : ''}`
    );
    openssl(
      'req',
      '-new',
      '-key',
      'leaf.key',
      '-out',
      'leaf.csr',
      '-subj',
      '/CN=Fixture Leaf'
    );
    openssl(
      'x509',
      '-req',
      '-in',
      'leaf.csr',
      '-CA',
      'intermediate.pem',
      '-CAkey',
      'intermediate.key',
      '-CAcreateserial',
      '-out',
      'leaf.pem',
      '-days',
      '1',
      '-extfile',
      'leaf.conf'
    );
    const attestation = encode({
      fmt: 'apple-appattest',
      authData,
      attStmt: {
        x5c: [
          new X509Certificate(readFileSync(join(dir, 'leaf.pem'))).raw,
          new X509Certificate(readFileSync(join(dir, 'intermediate.pem'))).raw,
        ],
        receipt: Buffer.from('fixture-receipt'),
      },
    }).toString('base64');
    return {
      keyId,
      requestHash,
      attestation,
      rootCertificate: readFileSync(join(dir, 'root.pem'), 'utf8'),
      assertion(counter = 1, hash = requestHash) {
        const count = Buffer.alloc(4);
        count.writeUInt32BE(counter);
        const auth = Buffer.concat([
          createHash('sha256').update(appId).digest(),
          Buffer.from([extensions ? 0x80 : 0]),
          count,
          ...(extensions
            ? [
                encode({
                  validationCategory: options.category ?? 4,
                  bundleVersion: options.version ?? '42',
                }),
              ]
            : []),
        ]);
        const nonce = createHash('sha256')
          .update(auth)
          .update(Buffer.from(hash, 'base64url'))
          .digest();
        return encode({
          signature: sign('sha256', nonce, privateKey),
          authenticatorData: auth,
        }).toString('base64');
      },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

import { describe, expect, it } from 'vitest';
import {
  createAppleIntegrityVerifier,
  parseAppleLaunchProperties,
} from './native-integrity-apple';
import { readIntegrityCbor } from './native-integrity-binary';

const policy = { teamId: 'TEAM', bundleId: 'com.example.app' };
describe('real App Attest crypto verification', () => {
  it('parses the current official Apple sample UInt32LE launch properties with trailing signed extensions', () => {
    // https://developer.apple.com/documentation/devicecheck/attestation-object-validation-guide
    const auth = Buffer.from(
      '9EZtaPketsEGIMt+Y8coMkRoXuHWRntUFg51MXIFfwNAAAAAAGFwcGF0dGVzdAAAAAAAAAAAIM4EmPWEg/u02g17LGOlpTj1UtSty5pPqRYZXElhPmVdpQECAyYgASFYIEMyVErPMj23dEQ8qvM59W5+lcck+sLBQlnzZeJEVlCyIlggtfsoW89Um8tgWUQS52gqJCfuran7Ut/tCxqxftCfqb2id2FwcGxlX2J1bmRsZV92ZXJzaW9uXzAxYTF4HGFwcGxlX3ZhbGlkYXRpb25fY2F0ZWdvcnlfMDFEAQAAAA==',
      'base64'
    );
    expect(auth[32]).toBe(0x40);
    const cose = readIntegrityCbor(auth.subarray(87));
    expect(
      parseAppleLaunchProperties(auth.subarray(87 + cose.byteLength), false)
    ).toEqual({ category: 1, version: '1' });
  });
  it('verifies a P256 certificate chain, nonce, key ID, identity and assertion', async () => {
    const fixture = appleFixture();
    const verifier = createAppleIntegrityVerifier({
      ...policy,
      rootCertificate: fixture.rootCertificate,
    });
    const key = await verifier.attest(fixture);
    expect(key.environment).toBe('production');
    expect(
      await verifier.assert({
        ...fixture,
        publicKey: key.publicKey,
        assertion: fixture.assertion(),
        counter: 0,
      })
    ).toBe(1);
    await expect(
      verifier.assert({
        ...fixture,
        publicKey: key.publicKey,
        assertion: fixture.assertion(),
        counter: 1,
      })
    ).rejects.toThrow('counter');
    await expect(
      verifier.assert({
        ...fixture,
        requestHash: Buffer.alloc(32, 1).toString('base64url'),
        publicKey: key.publicKey,
        assertion: fixture.assertion(),
        counter: 0,
      })
    ).rejects.toThrow('signature');
    await expect(
      verifier.attest({
        ...fixture,
        requestHash: Buffer.alloc(32, 1).toString('base64url'),
      })
    ).rejects.toThrow('nonce');
    await expect(
      verifier.attest({
        ...fixture,
        keyId: Buffer.alloc(32, 2).toString('base64'),
      })
    ).rejects.toThrow('credential');
    await expect(
      createAppleIntegrityVerifier(policy).attest(fixture)
    ).rejects.toThrow('chain');
    await expect(
      createAppleIntegrityVerifier({
        ...policy,
        bundleId: 'wrong.bundle',
        rootCertificate: fixture.rootCertificate,
      }).attest(fixture)
    ).rejects.toThrow('auth-data');
    await expect(
      createAppleIntegrityVerifier({
        ...policy,
        rootCertificate: fixture.rootCertificate,
        now: () => Date.now() + 172_800_000,
      }).attest(fixture)
    ).rejects.toThrow('expired');
  });
  it('rejects development keys unless explicitly admitted', async () => {
    const fixture = appleFixture({ development: true });
    await expect(
      createAppleIntegrityVerifier({
        ...policy,
        rootCertificate: fixture.rootCertificate,
      }).attest(fixture)
    ).rejects.toThrow('environment');
    expect(
      (
        await createAppleIntegrityVerifier({
          ...policy,
          rootCertificate: fixture.rootCertificate,
          allowDevelopment: true,
        }).attest(fixture)
      ).environment
    ).toBe('development');
  });
  it('requires the macOS exact ACL and signing identifier, and validates extended proofs', async () => {
    const fixture = appleFixture({ mac: true });
    const macPolicy = {
      ...policy,
      platform: 'macos' as const,
      signingIdentifier: 'com.example.signing',
      allowedBundleVersions: ['42'],
      rootCertificate: fixture.rootCertificate,
    };
    const verifier = createAppleIntegrityVerifier(macPolicy);
    const key = await verifier.attest(fixture);
    expect(key.platform).toBe('macos');
    await expect(
      createAppleIntegrityVerifier({
        ...policy,
        bundleId: 'com.example.signing',
        allowedBundleVersions: ['42'],
        rootCertificate: fixture.rootCertificate,
      }).attest(fixture)
    ).rejects.toThrow('mac-profile-required');
    await expect(
      createAppleIntegrityVerifier({
        ...policy,
        bundleId: 'com.example.signing',
        allowedBundleVersions: ['42'],
        rootCertificate: fixture.rootCertificate,
      }).assert({
        ...fixture,
        publicKey: key.publicKey,
        platform: 'macos',
        assertion: fixture.assertion(),
        counter: 0,
      })
    ).rejects.toThrow('wrong-apple-platform');

    expect(
      await verifier.assert({
        ...fixture,
        publicKey: key.publicKey,
        assertion: fixture.assertion(),
        counter: 0,
      })
    ).toBe(1);
    await expect(
      createAppleIntegrityVerifier({
        ...macPolicy,
        signingIdentifier: 'wrong.signing',
      }).attest(fixture)
    ).rejects.toThrow('auth-data');
    await expect(
      createAppleIntegrityVerifier({
        ...macPolicy,
        allowedBundleVersions: ['43'],
      }).attest(fixture)
    ).rejects.toThrow('launch-policy');
    await expect(
      createAppleIntegrityVerifier({
        ...macPolicy,
        allowedValidationCategories: [6],
      }).attest(fixture)
    ).rejects.toThrow('launch-policy');
    for (const acl of [
      false,
      Buffer.from('wrong-acl').toString('base64'),
    ] as const) {
      const invalid = appleFixture({ mac: true, acl });
      await expect(
        createAppleIntegrityVerifier({
          ...macPolicy,
          rootCertificate: invalid.rootCertificate,
        }).attest(invalid)
      ).rejects.toThrow();
    }
    const legacy = appleFixture();
    await expect(
      verifier.assert({
        ...legacy,
        publicKey: key.publicKey,
        assertion: legacy.assertion(),
        counter: 0,
      })
    ).rejects.toThrow();
  });
  it('requires explicitly trusted iOS ACL policies and never allows the strict Mac ACL as iOS', async () => {
    const acl = Buffer.from('fixture-ios-policy').toString('base64');
    const fixture = appleFixture({ iosAcl: acl, category: 4, version: '42' });
    const config = {
      ...policy,
      allowedBundleVersions: ['42'],
      rootCertificate: fixture.rootCertificate,
    };
    await expect(
      createAppleIntegrityVerifier(config).attest(fixture)
    ).rejects.toThrow('mac-profile-required');
    expect(
      (
        await createAppleIntegrityVerifier({
          ...config,
          allowedIosAclBlobs: [acl],
        }).attest(fixture)
      ).platform
    ).toBe('ios');
    const mac = appleFixture({ mac: true });
    const macAcl =
      'MEAMAjExMDowCQwCb2uhAwEB/zAJDAJvYaEDAQH/MAsMBG9kZWyhAwEB/zAVDARvc2duoAYMBHJzZWMwBaYDAgEB';
    await expect(
      createAppleIntegrityVerifier({
        ...config,
        bundleId: 'com.example.signing',
        rootCertificate: mac.rootCertificate,
        allowedIosAclBlobs: [macAcl],
      }).attest(mac)
    ).rejects.toThrow('mac-profile-required');
  });
  it('rejects unsafe category configuration even if explicitly provided', () => {
    for (const category of [0, 1, 7, 8, 9, 10])
      expect(() =>
        createAppleIntegrityVerifier({
          ...policy,
          allowedValidationCategories: [category],
        })
      ).toThrow('category-policy');
  });
  it('rejects category and version violations on signed assertions and attestation', async () => {
    for (const category of [0, 1, 3, 7, 8, 9, 10]) {
      const fixture = appleFixture({ category });
      await expect(
        createAppleIntegrityVerifier({
          ...policy,
          allowedBundleVersions: ['42'],
          rootCertificate: fixture.rootCertificate,
        }).attest(fixture)
      ).rejects.toThrow('launch-policy');
    }
    const fixture = appleFixture({ version: '41' });
    const verifier = createAppleIntegrityVerifier({
      ...policy,
      allowedBundleVersions: ['41'],
      rootCertificate: fixture.rootCertificate,
    });
    const key = await verifier.attest(fixture);
    await expect(
      createAppleIntegrityVerifier({
        ...policy,
        allowedBundleVersions: ['42'],
        rootCertificate: fixture.rootCertificate,
      }).assert({
        ...fixture,
        publicKey: key.publicKey,
        assertion: fixture.assertion(),
        counter: 0,
      })
    ).rejects.toThrow('launch-policy');
  });
  it('rejects trailing CBOR, deep containers and allocation bombs', async () => {
    const verifier = createAppleIntegrityVerifier(policy);
    for (const bytes of [
      Buffer.from('9affffffff', 'hex'),
      Buffer.alloc(128, 0x81),
      Buffer.from([0xa0, 0xa0]),
    ])
      await expect(
        verifier.attest({
          keyId: Buffer.alloc(32).toString('base64'),
          requestHash: Buffer.alloc(32).toString('base64url'),
          attestation: bytes.toString('base64'),
        })
      ).rejects.toThrow();
  });
});
