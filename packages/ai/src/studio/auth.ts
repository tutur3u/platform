import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Tables } from '@tuturuuu/types';
import { extractAiApiKeyPrefix, validateApiKeyHash } from '../api-key-hash';
import { AiStudioError } from './errors';

export type AiStudioApiKey = Tables<
  { schema: 'private' },
  'ai_studio_api_keys'
>;

export type AiStudioCredential = {
  apiKey: AiStudioApiKey;
  actorId: string;
  workspaceId: string;
};

function readBearerToken(request: Request): string {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new AiStudioError('A Tuturuuu AI API key is required.', {
      code: 'invalid_api_key',
      status: 401,
      type: 'authentication_error',
    });
  }

  return authorization.slice('Bearer '.length).trim();
}

export async function authenticateAiStudioRequest(
  request: Request
): Promise<AiStudioCredential> {
  const secret = readBearerToken(request);
  const prefix = extractAiApiKeyPrefix(secret);
  if (!prefix) {
    throw new AiStudioError('The supplied API key is invalid.', {
      code: 'invalid_api_key',
      status: 401,
      type: 'authentication_error',
    });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: apiKey, error } = await sbAdmin
    .schema('private')
    .from('ai_studio_api_keys')
    .select('*')
    .eq('prefix', prefix)
    .maybeSingle();

  const expired =
    apiKey?.expires_at && new Date(apiKey.expires_at).getTime() <= Date.now();
  const valid =
    apiKey &&
    !error &&
    !apiKey.revoked_at &&
    !expired &&
    (await validateApiKeyHash(secret, apiKey.secret_hash));

  if (!valid || !apiKey.created_by) {
    throw new AiStudioError('The supplied API key is invalid or inactive.', {
      code: 'invalid_api_key',
      status: 401,
      type: 'authentication_error',
    });
  }

  return {
    apiKey,
    actorId: apiKey.created_by,
    workspaceId: apiKey.ws_id,
  };
}
