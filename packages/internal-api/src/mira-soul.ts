import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface MiraSoul {
  id?: string;
  user_id?: string;
  name: string;
  tone?: string | null;
  personality?: string | null;
  boundaries?: string | null;
  vibe?: string | null;
  push_tone?: string | null;
  chat_tone?: string | null;
}
export interface MiraSoulResponse {
  soul: MiraSoul;
}
export type MiraSoulUpdate = Partial<
  Pick<
    MiraSoul,
    | 'name'
    | 'tone'
    | 'personality'
    | 'boundaries'
    | 'vibe'
    | 'push_tone'
    | 'chat_tone'
  >
>;
export type MiraSoulRequestOptions = InternalApiClientOptions & {
  signal?: AbortSignal;
};

export function validateMiraSoulReceipt(
  payload: unknown,
  actorId: string
): MiraSoulResponse {
  const soul = (payload as { soul?: unknown } | null)?.soul;
  if (!soul || typeof soul !== 'object' || Array.isArray(soul))
    throw new Error('Invalid assistant settings receipt');
  const value = soul as Record<string, unknown>;
  if (
    typeof value.name !== 'string' ||
    value.name.length > 50 ||
    (value.user_id !== undefined && value.user_id !== actorId) ||
    (value.id !== undefined && typeof value.id !== 'string') ||
    [
      'tone',
      'personality',
      'boundaries',
      'vibe',
      'push_tone',
      'chat_tone',
    ].some((field) => value[field] != null && typeof value[field] !== 'string')
  ) {
    throw new Error('Invalid assistant settings receipt');
  }
  return { soul: soul as MiraSoul };
}
export async function getMiraSoul(
  actorId: string,
  options?: MiraSoulRequestOptions
): Promise<MiraSoulResponse> {
  if (!actorId) throw new Error('Assistant settings owner unavailable');
  const response = await getInternalApiClient(options).json<unknown>(
    '/api/v1/mira/soul',
    { credentials: 'same-origin', cache: 'no-store', signal: options?.signal }
  );
  return validateMiraSoulReceipt(response, actorId);
}
export async function updateMiraSoul(
  actorId: string,
  payload: MiraSoulUpdate,
  options?: MiraSoulRequestOptions
): Promise<MiraSoulResponse> {
  if (!actorId) throw new Error('Assistant settings owner unavailable');
  const response = await getInternalApiClient(options).json<unknown>(
    '/api/v1/mira/soul',
    {
      method: 'PATCH',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options?.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  return validateMiraSoulReceipt(response, actorId);
}
