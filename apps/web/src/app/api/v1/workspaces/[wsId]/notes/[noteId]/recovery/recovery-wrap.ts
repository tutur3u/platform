import { decryptWorkspaceKey } from '@tuturuuu/utils/encryption';

const prefix = 'nr1.';
const encoder = new TextEncoder();

export type RecoveryBinding = {
  wsId: string;
  noteId: string;
  userId: string;
};

function bindingData(binding: RecoveryBinding) {
  return encoder.encode(
    JSON.stringify([binding.wsId, binding.noteId, binding.userId])
  );
}

async function recoveryKey(masterKey: string) {
  const root = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey),
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('tuturuuu-note-recovery-v1'),
      info: encoder.encode('note-key-wrap'),
    },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapNoteRecoveryKey(
  secret: string,
  masterKey: string,
  binding: RecoveryBinding
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: bindingData(binding) },
    await recoveryKey(masterKey),
    encoder.encode(secret)
  );
  return `${prefix}${Buffer.concat([Buffer.from(iv), Buffer.from(encrypted)]).toString('base64')}`;
}

export async function unwrapNoteRecoveryKey(
  wrapped: string,
  masterKey: string,
  binding: RecoveryBinding
): Promise<string> {
  if (!wrapped.startsWith(prefix)) {
    // Compatibility for recovery envelopes created before purpose separation.
    const legacy = JSON.parse(
      (await decryptWorkspaceKey(wrapped, masterKey)).toString('utf8')
    ) as Partial<RecoveryBinding> & { secret?: string };
    if (
      legacy.wsId !== binding.wsId ||
      legacy.noteId !== binding.noteId ||
      legacy.userId !== binding.userId ||
      typeof legacy.secret !== 'string'
    ) {
      throw new Error('Recovery key binding mismatch');
    }
    return legacy.secret;
  }
  const bytes = Buffer.from(wrapped.slice(prefix.length), 'base64');
  if (bytes.length < 29) throw new Error('Recovery key is truncated');
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes.subarray(0, 12),
      additionalData: bindingData(binding),
    },
    await recoveryKey(masterKey),
    bytes.subarray(12)
  );
  return new TextDecoder().decode(decrypted);
}
