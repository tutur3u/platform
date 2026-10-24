import {
  createHash,
  timingSafeEqual,
  verify,
  X509Certificate,
} from 'node:crypto';
import { z } from 'zod';
import { APPLE_APP_ATTEST_ROOT } from './native-integrity-apple-root.js';
import {
  decodeBase64,
  decodeHash,
  decodeIntegrityCbor,
  integrityBytesSchema,
  parseIntegrityDer,
  readIntegrityCbor,
} from './native-integrity-binary.js';

const attestationSchema = z.object({
  fmt: z.literal('apple-appattest'),
  authData: integrityBytesSchema,
  attStmt: z.object({
    x5c: z.array(integrityBytesSchema).length(2),
    receipt: integrityBytesSchema,
  }),
});
const assertionSchema = z.object({
  signature: integrityBytesSchema,
  authenticatorData: integrityBytesSchema,
});
const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest();
function equal(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}
function certificateExtension(raw: Buffer, oid: string): Buffer {
  const certificate = parseIntegrityDer(raw);
  const extensions = certificate[0]?.children[0]?.children.find(
    (node) => node.tag === 0xa3
  )?.children[0]?.children;
  const extension = extensions?.find(
    (node) => node.children[0]?.value.toString('hex') === oid
  );
  const octet = extension?.children.at(-1);
  if (octet?.tag !== 4) throw new Error('invalid-apple-nonce');
  const outer = parseIntegrityDer(octet.value);
  const nonce = outer[0]?.children[0]?.children[0];
  if (
    outer.length !== 1 ||
    outer[0]?.tag !== 0x30 ||
    outer[0].children.length !== 1 ||
    outer[0].children[0]?.tag !== (oid.endsWith('06') ? 0xa3 : 0xa1) ||
    outer[0].children[0].children.length !== 1 ||
    nonce?.tag !== 4
  )
    throw new Error('invalid-apple-nonce');
  return nonce.value;
}
const categorySchema = z.union([
  z.number().int().min(0).max(0xffffffff),
  integrityBytesSchema
    .refine((value) => value.length === 4)
    .transform((value) => value.readUInt32LE(0)),
]);
const extensionsSchema = z.object({
  apple_validation_category_01: categorySchema.optional(),
  apple_bundle_version_01: z.string().min(1).max(100).optional(),
  validationCategory: categorySchema.optional(),
  bundleVersion: z.string().min(1).max(100).optional(),
});
export function parseAppleLaunchProperties(bytes: Buffer, assertion: boolean) {
  const ext = extensionsSchema.parse(decodeIntegrityCbor(bytes));
  const category = assertion
    ? ext.validationCategory
    : ext.apple_validation_category_01;
  const version = assertion ? ext.bundleVersion : ext.apple_bundle_version_01;
  if (category === undefined || !version)
    throw new Error('invalid-apple-launch-policy');
  return { category, version };
}
export function createAppleIntegrityVerifier(config: {
  teamId: string;
  bundleId: string;
  platform?: 'ios' | 'macos';
  signingIdentifier?: string;
  allowedBundleVersions?: readonly string[];
  allowedValidationCategories?: readonly number[];
  allowedIosAclBlobs?: readonly string[];
  allowDevelopment?: boolean;
  rootCertificate?: string;
  now?: () => number;
}) {
  const root = new X509Certificate(
    config.rootCertificate ?? APPLE_APP_ATTEST_ROOT
  );
  const mac = config.platform === 'macos';
  if (
    mac &&
    (!config.signingIdentifier || !config.allowedBundleVersions?.length)
  )
    throw new Error('invalid-mac-policy');
  const appIdHash = sha256(
    `${config.teamId}.${mac ? config.signingIdentifier : config.bundleId}`
  );
  const categories =
    config.allowedValidationCategories ?? (mac ? [4, 6] : [2, 4]);
  if (
    !categories.length ||
    categories.some((category) => ![2, 3, 4, 5, 6].includes(category))
  )
    throw new Error('invalid-apple-category-policy');
  const macAcl = Buffer.from(
    'MEAMAjExMDowCQwCb2uhAwEB/zAJDAJvYaEDAQH/MAsMBG9kZWyhAwEB/zAVDARvc2duoAYMBHJzZWMwBaYDAgEB',
    'base64'
  );
  function checkExtensions(auth: Buffer, offset: number, assertion: boolean) {
    const hasExtensions = offset < auth.length;
    if (!hasExtensions) {
      if (mac || auth[32]! & 0x80) throw new Error('missing-apple-extensions');
      return;
    }
    const { category, version } = parseAppleLaunchProperties(
      auth.subarray(offset),
      assertion
    );
    if (
      category === undefined ||
      !categories.includes(category) ||
      !version ||
      !config.allowedBundleVersions?.includes(version)
    )
      throw new Error('invalid-apple-launch-policy');
  }
  const now = config.now ?? Date.now;
  function checkCertificate(certificate: X509Certificate) {
    if (
      now() < Date.parse(certificate.validFrom) ||
      now() >= Date.parse(certificate.validTo)
    )
      throw new Error('expired-apple-certificate');
  }
  return {
    async attest(input: {
      attestation: string;
      keyId: string;
      requestHash: string;
    }) {
      const value = attestationSchema.parse(
        decodeIntegrityCbor(decodeBase64(input.attestation, 24_576))
      );
      const leafBytes = value.attStmt.x5c[0];
      const intermediateBytes = value.attStmt.x5c[1];
      if (!leafBytes || !intermediateBytes)
        throw new Error('invalid-apple-chain');
      const leaf = new X509Certificate(leafBytes);
      const intermediate = new X509Certificate(intermediateBytes);
      const hasAcl = parseIntegrityDer(leaf.raw)[0]
        ?.children[0]?.children.find((node) => node.tag === 0xa3)
        ?.children[0]?.children.some(
          (node) =>
            node.children[0]?.value.toString('hex') === '2a864886f763640806'
        );
      if (!mac && hasAcl) {
        const acl = certificateExtension(leaf.raw, '2a864886f763640806');
        if (
          equal(acl, macAcl) ||
          !config.allowedIosAclBlobs?.some((value) =>
            equal(acl, decodeBase64(value, 1024))
          )
        )
          throw new Error('mac-profile-required');
      }
      for (const cert of [root, intermediate, leaf]) checkCertificate(cert);
      if (
        !root.ca ||
        !intermediate.ca ||
        leaf.ca ||
        !intermediate.checkIssued(root) ||
        !intermediate.verify(root.publicKey) ||
        !leaf.checkIssued(intermediate) ||
        !leaf.verify(intermediate.publicKey)
      )
        throw new Error('invalid-apple-chain');
      if (
        leaf.publicKey.asymmetricKeyType !== 'ec' ||
        leaf.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
      )
        throw new Error('invalid-apple-key');
      if (
        mac &&
        !equal(certificateExtension(leaf.raw, '2a864886f763640806'), macAcl)
      )
        throw new Error('invalid-mac-acl');
      const auth = value.authData;
      if (
        auth.length < 55 ||
        !(auth[32]! & 0x40) ||
        !equal(auth.subarray(0, 32), appIdHash) ||
        auth.readUInt32BE(33) !== 0
      )
        throw new Error('invalid-apple-auth-data');
      const production = equal(
        auth.subarray(37, 53),
        Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7)])
      );
      const development = equal(
        auth.subarray(37, 53),
        Buffer.from('appattestdevelop')
      );
      if (!production && !(development && config.allowDevelopment))
        throw new Error('invalid-apple-environment');
      const keyId = decodeHash(input.keyId);
      const credentialLength = auth.readUInt16BE(53);
      if (
        credentialLength !== 32 ||
        auth.length <= 55 + credentialLength ||
        !equal(auth.subarray(55, 87), keyId)
      )
        throw new Error('invalid-apple-credential');
      const cose = readIntegrityCbor(auth.subarray(87));
      const encodedKey = z
        .object({
          '1': z.literal(2),
          '3': z.literal(-7),
          '-1': z.literal(1),
          '-2': integrityBytesSchema,
          '-3': integrityBytesSchema,
        })
        .parse(cose.value);
      checkExtensions(auth, 87 + cose.byteLength, false);
      const publicDer = leaf.publicKey.export({ format: 'der', type: 'spki' });
      const keyPoint = publicDer.subarray(-65);
      if (
        keyPoint[0] !== 4 ||
        !equal(
          Buffer.concat([Buffer.from([4]), encodedKey['-2'], encodedKey['-3']]),
          keyPoint
        ) ||
        !equal(sha256(keyPoint), keyId)
      )
        throw new Error('invalid-apple-key-id');
      if (
        !equal(
          certificateExtension(leaf.raw, '2a864886f763640802'),
          sha256(Buffer.concat([auth, decodeHash(input.requestHash)]))
        )
      )
        throw new Error('invalid-apple-nonce');
      return {
        platform: mac ? ('macos' as const) : ('ios' as const),
        publicKey: leaf.publicKey
          .export({ format: 'pem', type: 'spki' })
          .toString(),
        environment: production
          ? ('production' as const)
          : ('development' as const),
      };
    },
    async assert(input: {
      assertion: string;
      publicKey: string;
      platform?: 'ios' | 'macos';
      counter: number;
      requestHash: string;
    }) {
      if (input.platform && input.platform !== (mac ? 'macos' : 'ios'))
        throw new Error('wrong-apple-platform');
      const value = assertionSchema.parse(
        decodeIntegrityCbor(decodeBase64(input.assertion, 16_384))
      );
      const auth = value.authenticatorData;
      if (
        auth.length < 37 ||
        auth[32]! & 0x40 ||
        !equal(auth.subarray(0, 32), appIdHash)
      )
        throw new Error('invalid-apple-auth-data');
      checkExtensions(auth, 37, true);
      const counter = auth.readUInt32BE(33);
      if (
        !Number.isInteger(input.counter) ||
        input.counter < 0 ||
        input.counter > 0xffffffff ||
        counter <= input.counter
      )
        throw new Error('invalid-apple-counter');
      const nonce = sha256(
        Buffer.concat([auth, decodeHash(input.requestHash)])
      );
      if (!verify('sha256', nonce, input.publicKey, value.signature))
        throw new Error('invalid-apple-signature');
      return counter;
    },
  };
}
