import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyAndroidApprovalKeyAttestation } from './native-integrity-android-key';

function der(tag: number | number[], ...parts: Buffer[]) {
  const content = Buffer.concat(parts);
  let length = Buffer.from([content.length]);
  if (content.length >= 128) {
    length =
      content.length <= 255
        ? Buffer.from([0x81, content.length])
        : Buffer.from([0x82, content.length >> 8, content.length & 0xff]);
  }
  return Buffer.concat([
    Buffer.from(Array.isArray(tag) ? tag : [tag]),
    length,
    content,
  ]);
}

const seq = (...nodes: Buffer[]) => der(0x30, ...nodes);
const octet = (bytes: Buffer) => der(4, bytes);
const int = (value: number) => der(2, Buffer.from([value]));
const enumValue = (value: number) => der(10, Buffer.from([value]));
const ctx = (id: number, node: Buffer) =>
  der(id < 31 ? 0xa0 | id : [0xbf, 0x80 | (id >> 7), id & 0x7f], node);
const challenge = Buffer.alloc(32, 41);
const signingDigest = Buffer.alloc(32, 29);
const packageName = 'test.tuturuuu.signed.approval';

function keyDescription(options: { timeout?: number; security?: number }) {
  const security = options.security ?? 2;
  const appId = seq(
    der(0x31, seq(octet(Buffer.from(packageName)), int(1))),
    der(0x31, octet(signingDigest))
  );
  return seq(
    int(4),
    enumValue(security),
    int(4),
    enumValue(security),
    octet(challenge),
    octet(Buffer.alloc(0)),
    seq(ctx(709, octet(appId))),
    seq(
      ctx(1, der(0x31, int(2))),
      ctx(2, int(3)),
      ctx(5, der(0x31, int(4))),
      ctx(10, int(1)),
      ctx(504, int(3)),
      ...(options.timeout === undefined
        ? []
        : [ctx(505, int(options.timeout))]),
      ctx(702, int(0)),
      ctx(
        704,
        seq(
          octet(Buffer.alloc(32)),
          der(1, Buffer.from([0xff])),
          enumValue(0),
          octet(Buffer.alloc(32))
        )
      )
    )
  );
}

function fixture(description: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'integrity-android-key-'));
  const openssl = (...args: string[]) =>
    execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  try {
    for (const name of ['root', 'leaf'])
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
      '[req]\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n'
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
      '/CN=Fixture Android Root',
      '-days',
      '1'
    );
    openssl(
      'req',
      '-new',
      '-key',
      'leaf.key',
      '-out',
      'leaf.csr',
      '-subj',
      '/CN=Fixture Android Signer'
    );
    writeFileSync(
      join(dir, 'leaf.conf'),
      `basicConstraints=critical,CA:FALSE\n1.3.6.1.4.1.11129.2.1.17=DER:${description.toString('hex')}\n`
    );
    openssl(
      'x509',
      '-req',
      '-in',
      'leaf.csr',
      '-CA',
      'root.pem',
      '-CAkey',
      'root.key',
      '-CAcreateserial',
      '-out',
      'leaf.pem',
      '-days',
      '1',
      '-extfile',
      'leaf.conf'
    );
    const leaf = new X509Certificate(readFileSync(join(dir, 'leaf.pem')));
    const root = new X509Certificate(readFileSync(join(dir, 'root.pem')));
    return {
      certificateChain: [leaf, root].map((cert) => cert.raw.toString('base64')),
      roots: [root],
      revokedSerials: new Set<string>(),
      publicKeyDer: leaf.publicKey.export({ type: 'spki', format: 'der' }),
      challenge,
      packageName,
      signingDigests: new Set([signingDigest.toString('hex')]),
      minimumSecurityLevel: 'tee' as const,
      leafSerial: leaf.serialNumber.replace(/^0+(?=.)/, '').toLowerCase(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Android approval key certificate verification', () => {
  let strongbox: ReturnType<typeof fixture>;
  let tee: ReturnType<typeof fixture>;

  beforeAll(() => {
    strongbox = fixture(keyDescription({}));
    tee = fixture(keyDescription({ security: 1 }));
  });

  it('reports the attested security level and enforces a StrongBox requirement', () => {
    expect(verifyAndroidApprovalKeyAttestation(strongbox)).toBe('strongbox');
    expect(verifyAndroidApprovalKeyAttestation(tee)).toBe('tee');
    expect(() =>
      verifyAndroidApprovalKeyAttestation({
        ...tee,
        minimumSecurityLevel: 'strongbox',
      })
    ).toThrow();
  });

  it('rejects substituted keys, challenges, apps, signers and revoked certificates', () => {
    for (const changes of [
      { publicKeyDer: tee.publicKeyDer },
      { roots: tee.roots },
      { challenge: Buffer.alloc(32, 1) },
      { packageName: 'wrong.app' },
      { signingDigests: new Set(['wrong']) },
      { revokedSerials: new Set([strongbox.leafSerial]) },
    ]) {
      expect(() =>
        verifyAndroidApprovalKeyAttestation({ ...strongbox, ...changes })
      ).toThrow();
    }
  });

  it('rejects keys with a verification timeout', () => {
    expect(() =>
      verifyAndroidApprovalKeyAttestation(
        fixture(keyDescription({ timeout: 5 }))
      )
    ).toThrow();
  });
});
