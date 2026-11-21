import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

// Key handling for the people registry. Workspace key material is random per
// purpose and version and is stored only in wrapped form; see
// apps/docs/platform/features/people-registry.mdx#keys.

export const PEOPLE_KEY_PURPOSES = [
  'sender_lookup',
  'conversation_lookup',
  'suppression',
  'display',
  'audit',
] as const;

export type PeopleKeyPurpose = (typeof PEOPLE_KEY_PURPOSES)[number];

export type WrappedPeopleKey = {
  purpose: PeopleKeyPurpose;
  version: number;
  wrappedKey: string;
  current: boolean;
};

export type PeopleKey = {
  purpose: PeopleKeyPurpose;
  version: number;
  key: Buffer;
};

const WRAP_TAG = 'people-registry-wrap-v2';
const WRAP_FORMAT = 0x02;
const KID = /^[0-9a-f]{8}$/;
const KEY_HEX = /^[0-9a-f]{64}$/;

// Root wrap keys are one secret per kid, PEOPLE_REGISTRY_WRAP_KEY_<kid>, and
// PEOPLE_REGISTRY_WRAP_KID names the kid for new wraps. Rotation adds a new
// kid secret and moves the current kid; old kid secrets stay for unwrapping.
function rootKey(kid: string) {
  if (!KID.test(kid)) return null;
  const hex = process.env[`PEOPLE_REGISTRY_WRAP_KEY_${kid}`] ?? '';
  return KEY_HEX.test(hex) ? Buffer.from(hex, 'hex') : null;
}

function currentWrapKey() {
  const kid = process.env.PEOPLE_REGISTRY_WRAP_KID ?? '';
  const key = rootKey(kid);
  if (!key) throw new Error('People registry wrap key is not configured');
  return { kid, key };
}

function wrapAad(
  kid: string,
  wsId: string,
  purpose: PeopleKeyPurpose,
  version: number
) {
  return Buffer.from(JSON.stringify([WRAP_TAG, kid, wsId, purpose, version]));
}

// Layout: 0x02, kid (4 bytes), iv (12), ciphertext (32), tag (16).
export function wrapWorkspaceKey(
  wsId: string,
  purpose: PeopleKeyPurpose,
  version: number,
  key: Buffer
) {
  const { kid, key: root } = currentWrapKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', root, iv, { authTagLength: 16 });
  cipher.setAAD(wrapAad(kid, wsId, purpose, version));
  const body = Buffer.concat([cipher.update(key), cipher.final()]);
  return Buffer.concat([
    Buffer.from([WRAP_FORMAT]),
    Buffer.from(kid, 'hex'),
    iv,
    body,
    cipher.getAuthTag(),
  ]).toString('base64');
}

export function wrappedKeyId(wrappedKey: string) {
  const bytes = Buffer.from(wrappedKey, 'base64');
  // Node's decoder skips invalid characters, so only canonical base64 counts.
  if (bytes.toString('base64') !== wrappedKey) return null;
  return bytes.length === 65 && bytes[0] === WRAP_FORMAT
    ? bytes.subarray(1, 5).toString('hex')
    : null;
}

export function unwrapWorkspaceKey(
  wsId: string,
  wrapped: WrappedPeopleKey
): PeopleKey {
  const kid = wrappedKeyId(wrapped.wrappedKey);
  const root = kid ? rootKey(kid) : null;
  if (!kid || !root) throw new Error('Invalid wrapped key');
  const sealed = Buffer.from(wrapped.wrappedKey, 'base64').subarray(5);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    root,
    sealed.subarray(0, 12),
    {
      authTagLength: 16,
    }
  );
  decipher.setAAD(wrapAad(kid, wsId, wrapped.purpose, wrapped.version));
  decipher.setAuthTag(sealed.subarray(44));
  const key = Buffer.concat([
    decipher.update(sealed.subarray(12, 44)),
    decipher.final(),
  ]);
  return { purpose: wrapped.purpose, version: wrapped.version, key };
}

// Fresh key material for a new workspace, wrapped for people_registry_enable.
export function newWorkspaceKeys(wsId: string) {
  return Object.fromEntries(
    PEOPLE_KEY_PURPOSES.map((purpose) => [
      purpose,
      wrapWorkspaceKey(wsId, purpose, 1, randomBytes(32)),
    ])
  ) as Record<PeopleKeyPurpose, string>;
}

// Length-prefixed encoding keeps every field boundary unambiguous.
function canonical(parts: readonly (string | number)[]) {
  return Buffer.concat(
    parts.flatMap((part) => {
      const value = Buffer.from(String(part), 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(value.length);
      return [length, value];
    })
  );
}

// Phone numbers must carry their country code (`+` or `00`), so a national
// spelling cannot become a different international number. WhatsApp user IDs
// already carry it and may be bare digits.
function canonicalPhone(value: string, allowBare: boolean) {
  const compact = value.replace(/[\s().-]/g, '');
  const international = compact.startsWith('00')
    ? `+${compact.slice(2)}`
    : compact;
  if (!international.startsWith('+') && !allowBare) return null;
  const withPlus = international.startsWith('+')
    ? international
    : `+${international}`;
  return /^\+[1-9]\d{6,14}$/.test(withPlus) ? withPlus : null;
}

// One canonical form per identifier, so a deleted identity cannot be
// re-proposed under another spelling. Returns null for an invalid identifier.
export function normaliseExternalId(channel: string, externalId: string) {
  const trimmed = externalId.normalize('NFKC').trim();
  if (!trimmed) return null;
  if (channel === 'email')
    return /^[^\s@]+@[^\s@]+$/.test(trimmed) ? trimmed.toLowerCase() : null;
  if (channel === 'phone') return canonicalPhone(trimmed, false);
  if (channel === 'whatsapp') {
    const user = /^([+(\d][\d\s()+.-]*)(?:@s\.whatsapp\.net)?$/i.exec(
      trimmed
    )?.[1];
    return user ? canonicalPhone(user, true) : trimmed.toLowerCase();
  }
  return trimmed;
}

export class InvalidExternalIdError extends Error {
  constructor() {
    super('invalid_external_id');
  }
}

export function lookupHash(
  key: PeopleKey,
  input: { wsId: string; channel: string; account: string; externalId: string }
) {
  if (
    key.purpose !== 'sender_lookup' &&
    key.purpose !== 'conversation_lookup'
  ) {
    throw new Error('Lookup hashes need a lookup key');
  }
  const externalId = normaliseExternalId(input.channel, input.externalId);
  if (!externalId) throw new InvalidExternalIdError();
  return createHmac('sha256', key.key)
    .update(
      canonical([
        key.purpose,
        key.version,
        input.wsId,
        input.channel,
        input.account,
        externalId,
      ])
    )
    .digest();
}

export function suppressionToken(key: PeopleKey, wsId: string, lookup: Buffer) {
  if (key.purpose !== 'suppression')
    throw new Error('Suppression tokens need the suppression key');
  return createHmac('sha256', key.key)
    .update(
      canonical(['suppression', key.version, wsId, lookup.toString('hex')])
    )
    .digest();
}

// Display values bind to their workspace, person, channel and provider account,
// so a ciphertext cannot be moved to another person or workspace.
export function displayBinding(
  personId: string,
  channel?: string,
  account?: string
) {
  return JSON.stringify([personId, channel ?? '', account ?? '']);
}

function displayAad(wsId: string, binding: string, version: number) {
  return Buffer.from(
    JSON.stringify(['people-registry-display-v2', wsId, binding, version])
  );
}

// Layout: two-byte key version, 12-byte IV, ciphertext, 16-byte tag. The
// version is also authenticated as additional data.
export function encryptDisplay(
  key: PeopleKey,
  wsId: string,
  binding: string,
  value: string
) {
  if (key.purpose !== 'display')
    throw new Error('Display values need the display key');
  const version = Buffer.alloc(2);
  version.writeUInt16BE(key.version);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.key, iv);
  cipher.setAAD(displayAad(wsId, binding, key.version));
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([version, iv, body, cipher.getAuthTag()]);
}

export function decryptDisplay(
  keys: readonly PeopleKey[],
  wsId: string,
  binding: string,
  ciphertext: Buffer
) {
  if (ciphertext.length < 2 + 12 + 16) return null;
  const version = ciphertext.readUInt16BE(0);
  const key = keys.find(
    (k) => k.purpose === 'display' && k.version === version
  );
  if (!key) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key.key,
      ciphertext.subarray(2, 14)
    );
    decipher.setAAD(displayAad(wsId, binding, version));
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
    return Buffer.concat([
      decipher.update(ciphertext.subarray(14, ciphertext.length - 16)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
