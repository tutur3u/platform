import { z } from 'zod';
import { verifyExternalChatSecret } from './crypto';
import { isExternalChatLiveAuthority } from './schemas';
import { readExternalChatBinding } from './store';

export async function authenticateExternalChatIngest(request: Request) {
  const wsId = request.headers.get('x-external-binding-id');
  const authorization = request.headers.get('authorization');
  const secret = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;
  if (!wsId || !z.string().uuid().safeParse(wsId).success || !secret)
    return null;

  const state = await readExternalChatBinding(wsId);
  const credentials = state?.credentials;
  const expectedHash = credentials?.ingest_secret_hash;
  const pendingHash =
    credentials?.pending_action === 'set_ingest'
      ? credentials.pending_secret_hash
      : null;
  const matches = Boolean(
    (expectedHash && verifyExternalChatSecret(secret, expectedHash)) ||
      (pendingHash && verifyExternalChatSecret(secret, pendingHash))
  );
  if (
    !state?.binding.is_enabled ||
    !isExternalChatLiveAuthority(state.binding.settings) ||
    !credentials?.verified_at ||
    !expectedHash ||
    !matches
  )
    return null;

  return {
    state: { binding: state.binding, credentials },
    wsId,
  };
}
