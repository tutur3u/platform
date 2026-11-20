import { timingSafeEqual, X509Certificate } from 'node:crypto';
import { decodeBase64, parseIntegrityDer } from './native-integrity-binary';

type DerNode = ReturnType<typeof parseIntegrityDer>[number];
type AndroidKeySecurityLevel = 'tee' | 'strongbox';

const KEY_DESCRIPTION_OID = '2b06010401d679020111';
const MAX_CERTIFICATE_BYTES = 8192;

function invalid(): never {
  throw new Error('Invalid Android approval-key attestation');
}

function exact(node: DerNode | undefined, tag: number): DerNode {
  if (!node || node.tag !== tag) invalid();
  return node;
}

function integer(node: DerNode | undefined, tag = 0x02) {
  const bytes = exact(node, tag).value;
  if (
    bytes.length < 1 ||
    bytes.length > 4 ||
    bytes[0]! & 0x80 ||
    (bytes.length > 1 && bytes[0] === 0 && !(bytes[1]! & 0x80))
  )
    invalid();
  return bytes.readUIntBE(0, bytes.length);
}

function same(first: Buffer, second: Buffer) {
  return first.length === second.length && timingSafeEqual(first, second);
}

function parseSequence(bytes: Buffer) {
  const der = parseIntegrityDer(bytes);
  if (der.length !== 1) invalid();
  return exact(der[0], 0x30).children;
}

function extension(certificate: X509Certificate) {
  const extensions = parseSequence(certificate.raw)[0]?.children.find(
    (entry) => entry.tag === 0xa3
  )?.children[0]?.children;
  const descriptions = extensions?.filter(
    (entry) =>
      entry.children[0]?.tag === 6 &&
      entry.children[0]?.value.toString('hex') === KEY_DESCRIPTION_OID
  );
  if (!descriptions?.length) return null;
  if (descriptions.length !== 1) invalid();
  return exact(descriptions[0]?.children.at(-1), 4).value;
}

function authorizationList(node: DerNode | undefined) {
  const entries = new Map<number, DerNode>();
  for (const entry of exact(node, 0x30).children) {
    const id = entry.tagNumber;
    if (
      (entry.tag & 0xe0) !== 0xa0 ||
      entries.has(id) ||
      entry.children.length !== 1
    )
      invalid();
    entries.set(id, entry.children[0]!);
  }
  return entries;
}

function checkApplicationId(
  encoded: DerNode | undefined,
  packageName: string,
  trustedSigningDigests: ReadonlySet<string>
) {
  const entries = parseSequence(exact(encoded, 4).value);
  const packages = exact(entries[0], 0x31).children;
  const signatures = exact(entries[1], 0x31).children;
  if (
    entries.length !== 2 ||
    packages.length !== 1 ||
    signatures.length < 1 ||
    signatures.length > 8
  )
    invalid();
  const identity = exact(packages[0], 0x30).children;
  if (
    identity.length !== 2 ||
    !same(exact(identity[0], 4).value, Buffer.from(packageName)) ||
    identity[1]?.tag !== 2 ||
    !signatures.every((entry) => {
      const digest = exact(entry, 4).value;
      return (
        digest.length === 32 &&
        trustedSigningDigests.has(digest.toString('hex'))
      );
    })
  )
    invalid();
}

function checkHardwareAuthorization(
  hardware: Map<number, DerNode>,
  software: Map<number, DerNode>
) {
  // KeyMint KM_PURPOSE_SIGN, KM_ALGORITHM_EC, KM_DIGEST_SHA_2_256,
  // KM_EC_CURVE_P_256, KM_ORIGIN_GENERATED.
  const purpose = exact(hardware.get(1), 0x31).children;
  const digest = exact(hardware.get(5), 0x31).children;
  if (
    purpose.length !== 1 ||
    integer(purpose[0]) !== 2 ||
    digest.length !== 1 ||
    integer(digest[0]) !== 4 ||
    integer(hardware.get(2)) !== 3 ||
    integer(hardware.get(10)) !== 1 ||
    integer(hardware.get(702)) !== 0 ||
    // Per-operation hardware verification with only the registered biometric
    // or device credential authenticator types.
    ![1, 2, 3].includes(integer(hardware.get(504))) ||
    software.has(503) ||
    hardware.has(503) ||
    software.has(505) ||
    (hardware.has(505) && integer(hardware.get(505)) !== 0)
  )
    invalid();
  const boot = exact(hardware.get(704), 0x30).children;
  if (
    !same(exact(boot[1], 1).value, Buffer.from([0xff])) ||
    integer(boot[2], 10) !== 0
  )
    invalid();
}

export function verifyAndroidApprovalKeyAttestation(input: {
  certificateChain: readonly string[];
  roots: readonly X509Certificate[];
  revokedSerials: ReadonlySet<string>;
  publicKeyDer: Buffer;
  challenge: Buffer;
  packageName: string;
  signingDigests: ReadonlySet<string>;
  minimumSecurityLevel: AndroidKeySecurityLevel;
  now?: number;
}): AndroidKeySecurityLevel {
  if (
    input.certificateChain.length < 2 ||
    input.certificateChain.length > 8 ||
    input.challenge.length !== 32 ||
    !input.packageName ||
    !input.signingDigests.size ||
    !input.roots.length
  )
    invalid();
  const chain = input.certificateChain.map(
    (value) => new X509Certificate(decodeBase64(value, MAX_CERTIFICATE_BYTES))
  );
  const leaf = chain[0]!;
  const tip = chain.at(-1)!;
  const root = input.roots.find(
    (trusted) =>
      trusted.ca &&
      (trusted.fingerprint256 === tip.fingerprint256 ||
        (tip.checkIssued(trusted) && tip.verify(trusted.publicKey)))
  );
  if (!root || leaf.ca) invalid();
  const now = input.now ?? Date.now();
  for (const [index, cert] of chain.entries()) {
    const issuer = chain[index + 1];
    if (
      input.revokedSerials.has(
        cert.serialNumber.replace(/^0+(?=.)/, '').toLowerCase()
      ) ||
      ((cert.fingerprint256 !== root.fingerprint256 ||
        root.subject.includes('f92009e853b6b045') === false) &&
        (now < Date.parse(cert.validFrom) ||
          now >= Date.parse(cert.validTo))) ||
      (issuer &&
        (!issuer.ca ||
          !cert.checkIssued(issuer) ||
          !cert.verify(issuer.publicKey))) ||
      (index > 0 && extension(cert))
    )
      invalid();
  }
  const attestation = extension(leaf);
  if (
    !attestation ||
    leaf.publicKey.asymmetricKeyType !== 'ec' ||
    leaf.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1' ||
    !same(
      leaf.publicKey.export({ type: 'spki', format: 'der' }),
      input.publicKeyDer
    )
  )
    invalid();
  const record = parseSequence(attestation);
  const security = integer(record[1], 10);
  if (
    record.length !== 8 ||
    (security !== 1 && security !== 2) ||
    integer(record[3], 10) !== security ||
    !same(exact(record[4], 4).value, input.challenge)
  )
    invalid();
  const level = security === 2 ? 'strongbox' : 'tee';
  if (input.minimumSecurityLevel === 'strongbox' && level !== 'strongbox')
    invalid();
  const software = authorizationList(record[6]);
  const hardware = authorizationList(record[7]);
  checkHardwareAuthorization(hardware, software);
  checkApplicationId(
    software.get(709) ?? hardware.get(709),
    input.packageName,
    input.signingDigests
  );
  return level;
}
