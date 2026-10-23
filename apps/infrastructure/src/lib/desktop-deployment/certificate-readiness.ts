import 'server-only';

import {
  createPrivateKey,
  createPublicKey,
  X509Certificate,
} from 'node:crypto';

type Pkcs12Store = {
  keys: Array<{ pkcs8: Buffer }>;
  certs: Array<{ cert: Buffer }>;
};

type PkiApi = {
  pkcs12: {
    open(bytes: Buffer, password: string): Promise<Pkcs12Store>;
  };
  schema: {
    x509: {
      parse(bytes: Buffer): {
        subject: { rdns: Array<Array<{ name: string | null; value: string }>> };
        validity: { notBefore: Date; notAfter: Date };
        extensions: Array<{ oid: string }>;
      };
      decodeExtensions(certificate: unknown): Array<{
        name: string | null;
        decoded?: unknown;
      }>;
    };
  };
};

export type DesktopCertificateFailure =
  | 'certificate_invalid'
  | 'certificate_expired'
  | 'certificate_not_yet_valid'
  | 'certificate_key_missing'
  | 'certificate_key_mismatch'
  | 'certificate_ambiguous'
  | 'certificate_codesigning_required'
  | 'certificate_developer_id_required'
  | 'certificate_identity_mismatch'
  | 'certificate_team_mismatch'
  | 'notarization_key_invalid';

export type DesktopCertificateReadiness =
  | { ok: false; code: DesktopCertificateFailure }
  | {
      ok: true;
      certificate: {
        fingerprintSha256: string;
        expiresAt: string;
        algorithm: string;
      };
    };

// Portable material checks do not establish OS trust-chain, revocation,
// Apple account access, notarization or successful artifact signing.
export async function inspectDesktopCertificate(input: {
  platform: 'windows' | 'macos';
  bytes: Uint8Array;
  password: string;
  identity?: string;
  teamId?: string;
  now?: Date;
}): Promise<DesktopCertificateReadiness> {
  try {
    if (input.bytes.byteLength === 0 || input.bytes.byteLength > 2097152) {
      return { ok: false, code: 'certificate_invalid' };
    }
    // The parser captures Node URL intrinsics at module load. Defer loading it
    // until certificate parsing so route imports in DOM-based tests don't load
    // Node-only intrinsics into the jsdom runtime.
    const pki = require('@blamejs/pki') as PkiApi;
    const p12 = await pki.pkcs12.open(Buffer.from(input.bytes), input.password);
    const certificates = p12.certs.map(({ cert }) => ({ cert }));
    const keys = p12.keys;
    if (keys.length === 0)
      return { ok: false, code: 'certificate_key_missing' };
    if (keys.length !== 1) return { ok: false, code: 'certificate_ambiguous' };
    const key = keys[0];
    if (!key) return { ok: false, code: 'certificate_key_missing' };
    const privateKey = createPrivateKey({
      key: key.pkcs8,
      format: 'der',
      type: 'pkcs8',
    });
    const publicDer = createPublicKey(privateKey).export({
      type: 'spki',
      format: 'der',
    });
    const matched = certificates.flatMap((bag) => {
      const x509 = new X509Certificate(bag.cert);
      return x509.publicKey
        .export({ type: 'spki', format: 'der' })
        .equals(publicDer)
        ? [{ certificate: pki.schema.x509.parse(bag.cert), x509 }]
        : [];
    });
    if (matched.length === 0)
      return { ok: false, code: 'certificate_key_mismatch' };
    if (matched.length !== 1)
      return { ok: false, code: 'certificate_ambiguous' };
    const selected = matched[0];
    if (!selected) return { ok: false, code: 'certificate_invalid' };
    const now = input.now ?? new Date();
    if (selected.certificate.validity.notBefore > now) {
      return { ok: false, code: 'certificate_not_yet_valid' };
    }
    if (selected.certificate.validity.notAfter <= now) {
      return { ok: false, code: 'certificate_expired' };
    }
    const extensions = pki.schema.x509.decodeExtensions(selected.certificate);
    const eku = extensions.find(
      (extension) => extension.name === 'extKeyUsage'
    );
    if (
      !Array.isArray(eku?.decoded) ||
      !eku.decoded.includes('1.3.6.1.5.5.7.3.3')
    ) {
      return { ok: false, code: 'certificate_codesigning_required' };
    }
    if (input.platform === 'macos') {
      if (
        !selected.certificate.extensions.some(
          (extension) => extension.oid === '1.2.840.113635.100.6.1.13'
        )
      ) {
        return { ok: false, code: 'certificate_developer_id_required' };
      }
      const subject = selected.certificate.subject.rdns.flat();
      const commonName = subject.find(
        (field) => field.name === 'commonName'
      )?.value;
      const team = subject.find(
        (field) => field.name === 'organizationalUnitName'
      )?.value;
      if (!input.identity || input.identity !== commonName) {
        return { ok: false, code: 'certificate_identity_mismatch' };
      }
      if (!input.teamId || input.teamId !== team) {
        return { ok: false, code: 'certificate_team_mismatch' };
      }
    }
    return {
      ok: true,
      certificate: {
        fingerprintSha256: selected.x509.fingerprint256,
        expiresAt: selected.certificate.validity.notAfter.toISOString(),
        algorithm: privateKey.asymmetricKeyType ?? 'unknown',
      },
    };
  } catch {
    return { ok: false, code: 'certificate_invalid' };
  }
}

export function inspectNotarizationKey(
  bytes: Uint8Array
): { ok: true } | { ok: false; code: 'notarization_key_invalid' } {
  try {
    if (bytes.byteLength === 0 || bytes.byteLength > 32768) {
      return { ok: false, code: 'notarization_key_invalid' };
    }
    const text = Buffer.from(bytes).toString('utf8');
    if (!text.startsWith('-----BEGIN PRIVATE KEY-----')) {
      return { ok: false, code: 'notarization_key_invalid' };
    }
    const key = createPrivateKey({ key: text, format: 'pem', type: 'pkcs8' });
    if (
      key.asymmetricKeyType !== 'ec' ||
      key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      return { ok: false, code: 'notarization_key_invalid' };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'notarization_key_invalid' };
  }
}
