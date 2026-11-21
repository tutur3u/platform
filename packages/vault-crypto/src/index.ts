export {
  decodeSymmetricEnvelope,
  ENC_ID_BYTES,
  encodeSymmetricEnvelope,
  KEY_BYTES,
  openSymmetric,
  sealSymmetric,
  type SymmetricEnvelope,
} from './aead';
export { decodeBase32, encodeBase32, groupCode } from './base32';
export {
  concatBytes,
  equalBytes,
  fromHex,
  randomBytes,
  toHex,
  utf8,
} from './bytes';
export {
  type CanonicalObject,
  type CanonicalValue,
  decodeCanonical,
  decodeObject,
  encodeCanonical,
} from './canonical';
export {
  contextBytes,
  domainLabel,
  FORMAT_VERSION,
  PURPOSES,
  type Purpose,
  SUITE_ID,
  type VaultScope,
} from './context';
export { VaultCryptoError, type VaultCryptoErrorCode } from './errors';
export {
  decodeHpkeEnvelope,
  deriveKemKeyPair,
  encodeHpkeEnvelope,
  generateKemKeyPair,
  type HpkeEnvelope,
  type KemKeyPair,
  openWith,
  sealTo,
  X25519_KEY_BYTES,
} from './hpke';
export {
  assertInviteMac,
  INVITE_SECRET_BYTES,
  type InviteContext,
  inviteMac,
  type ProposedIdentityKeys,
} from './invite';
export { hkdfSha256, hmacSha256, sha256 } from './kdf';
export {
  deriveKek,
  displayFingerprint,
  fingerprint,
  PASSKEY_PRF_INPUT,
  type PublicKeyKind,
  type UnlockContext,
  type UnlockMethod,
} from './keys';
export {
  assertFragmentMatches,
  createPairingFragment,
  decodePairingFragment,
  type DeviceKeys,
  encodePairingFragment,
  type PairingFragment,
  transcriptHash,
} from './pairing';
export {
  confirmationGroup,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_BYTES,
} from './recovery';
export {
  assertSignature,
  ED25519_KEY_BYTES,
  ED25519_SIGNATURE_BYTES,
  generateSigningKeyPair,
  type SigningKeyPair,
  signingPublicKey,
  signObject,
  verifyObject,
} from './signing';
export {
  assertEdkId,
  edkId,
  type EntryBody,
  type EntryPayload,
  type EntrySignature,
  entryHash,
  type EnvironmentEpoch,
  type EpochDescriptor,
  type GenesisBody,
  genesisHash,
  type KeyLogState,
  type Managers,
  type PartyKey,
  type Role,
  type RoleChange,
  ROLES,
  type SignedEntry,
  type SignedGenesis,
  sortSignatures,
  vaultIdOf,
  verifyKeyLog,
  WRAP_KINDS,
  type WrapDigest,
  type WrapKind,
  wrapKey,
} from './keylog';
export { inclusionProof, leafHash, treeRoot, verifyInclusion } from './merkle';
export {
  assertCiphertextHash,
  type Authority,
  authorityAt,
  type Cipher,
  CIPHERS,
  MAX_PROVENANCE_DEPTH,
  type ReencryptionSource,
  recordHash,
  type SignedRecord,
  signRecord,
  validateRecord,
  verifyAppend,
  verifyRecord,
  type VersionRecord,
} from './records';
export {
  assertLatestRecord,
  assertMatchesKeyLog,
  type Attestation,
  type EnvRoot,
  environmentRoot,
  MAX_ATTESTATION_AGE_SECONDS,
  type SignedAttestation,
  signAttestation,
  type SnapshotLeaf,
  snapshotLeafHash,
  sortLeaves,
  verifyAttestation,
} from './snapshot';
export { assertCanonicalX25519, dhClass } from './x25519';
export {
  type KeyringAttestation,
  type KeyringConfirmationBody,
  type KeyringHead,
  keyringHeadHash,
  MAX_KEYRING_ATTESTATION_AGE_SECONDS,
  type SignedKeyringAttestation,
  type SignedKeyringHead,
  signKeyringAttestation,
  signKeyringConfirmation,
  signKeyringHead,
  signWitnessConfirmation,
  validateKeyringHead,
  VAULT_USER_ID_BYTES,
  verifyKeyringAttestation,
  verifyKeyringConfirmation,
  verifyKeyringSuccessor,
  verifyWitnessConfirmation,
  type WitnessConfirmation,
  type WitnessHeadView,
} from './witness-heads';
