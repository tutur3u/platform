import { createHash } from 'node:crypto';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { MeteredAiCredential as PublicAiCredential } from './public-credential';

/** The canonical Colab server is the trust anchor. No caller-supplied verifier URL. */
export async function authenticateColabGrant(
  request: Request,
  raw: string,
  sponsor: { workshopId: string; hostId: string }
): Promise<PublicAiCredential> {
  const token = request.headers.get('x-colab-grant');
  const reject = () =>
    new AiStudioError(
      'This workshop sponsorship approval is invalid or expired.',
      { code: 'invalid_api_key', status: 403, type: 'authentication_error' }
    );
  if (
    !token ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !/^[a-f0-9-]{36}$/.test(sponsor.workshopId)
  )
    throw reject();
  const digest = createHash('sha256').update(raw).digest('hex');
  const response = await fetch(
    'https://colab.tuturuuu.com/api/sponsorship/verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, digest, roomId: sponsor.workshopId }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) throw reject();
  const approval = await response.json();
  if (approval.approved !== true || approval.digest !== digest) throw reject();
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin.auth.admin.getUserById(sponsor.hostId);
  const host = data?.user;
  if (
    error ||
    !host?.email_confirmed_at ||
    !host.email?.toLowerCase().endsWith('@tuturuuu.com') ||
    (host.banned_until && Date.parse(host.banned_until) > Date.now())
  )
    throw reject();
  return {
    kind: 'first-party',
    appId: 'colab',
    actorId: host.id,
    workspaceId: ROOT_WORKSPACE_ID,
  };
}
