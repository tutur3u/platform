import 'server-only';

import {
  createPrivateKey,
  createPublicKey,
  X509Certificate,
} from 'node:crypto';
import forge from 'node-forge';

const CERT_BAG = '1.2.840.113549.1.12.10.1.3';
const KEY_BAG = '1.2.840.113549.1.12.10.1.1';
const ENCRYPTED_KEY_BAG = '1.2.840.113549.1.12.10.1.2';

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
export function inspectDesktopCertificate(input: {
  platform: 'windows' | 'macos';
  bytes: Uint8Array;
  password: string;
  identity?: string;
  teamId?: string;
  now?: Date;
}): DesktopCertificateReadiness {
  try {
    if (input.bytes.byteLength === 0 || input.bytes.byteLength > 2097152) {
      return { ok: false, code: 'certificate_invalid' };
    }
    const asn1 = forge.asn1.fromDer(
      Buffer.from(input.bytes).toString('binary')
    );
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, true, input.password);
    const certificates = p12.getBags({ bagType: CERT_BAG })[CERT_BAG] ?? [];
    const keys = [
      ...(p12.getBags({ bagType: KEY_BAG })[KEY_BAG] ?? []),
      ...(p12.getBags({ bagType: ENCRYPTED_KEY_BAG })[ENCRYPTED_KEY_BAG] ?? []),
    ].flatMap((bag) => (bag.key ? [bag.key] : []));
    if (keys.length === 0)
      return { ok: false, code: 'certificate_key_missing' };
    if (keys.length !== 1) return { ok: false, code: 'certificate_ambiguous' };
    const key = keys[0];
    if (!key) return { ok: false, code: 'certificate_key_missing' };
    const privateKey = createPrivateKey(forge.pki.privateKeyToPem(key));
    const publicDer = createPublicKey(privateKey).export({
      type: 'spki',
      format: 'der',
    });
    const matched = certificates.flatMap((bag) => {
      if (!bag.cert) return [];
      const x509 = new X509Certificate(forge.pki.certificateToPem(bag.cert));
      return x509.publicKey
        .export({ type: 'spki', format: 'der' })
        .equals(publicDer)
        ? [{ certificate: bag.cert, x509 }]
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
    const eku = selected.certificate.getExtension('extKeyUsage') as {
      codeSigning?: boolean;
    } | null;
    if (eku?.codeSigning !== true) {
      return { ok: false, code: 'certificate_codesigning_required' };
    }
    if (input.platform === 'macos') {
      if (
        !selected.certificate.extensions.some(
          (extension) => extension.id === '1.2.840.113635.100.6.1.13'
        )
      ) {
        return { ok: false, code: 'certificate_developer_id_required' };
      }
      const commonName = selected.certificate.subject.getField('CN')?.value;
      const team = selected.certificate.subject.getField('OU')?.value;
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
