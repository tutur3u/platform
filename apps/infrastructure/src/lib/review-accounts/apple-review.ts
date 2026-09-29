import 'server-only';

import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { importPKCS8, SignJWT } from 'jose';
import { recordAudit } from '@/lib/mobile-deployment/store';
import { readActiveAppleReviewCredentials } from './apple-vault';
import { assertActiveReviewerAccount, ReviewAccountError } from './service';

type AdminClient = SupabaseClient<Database>;
const APPLE_ORIGIN = 'https://api.appstoreconnect.apple.com';
const BUNDLE_ID = 'com.tuturuuu.app.mobile';
const REVIEW_NOTES =
  "On the first screen, enter the demo email and tap Continue with email. On the code screen, tap Use password instead, then enter the demo password. Open the personal workspace and use Apps to explore Tasks, Calendar, Finance, Notes, and Mail. Home and Profile are also available. Mail is limited to this account's personal review workspace. This account uses the live production backend.";

type AppleResource = {
  id: string;
  attributes?: Record<string, unknown>;
};

async function appleRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${APPLE_ORIGIN}${path}`, {
    ...options,
    cache: 'no-store',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    // Apple error payloads may echo reviewer credentials. Never read or log them.
    throw new ReviewAccountError(
      `Apple review metadata update failed (${response.status})`,
      502
    );
  }
  return (await response.json()) as T;
}

export async function publishReviewerToApple({
  db,
  actorUserId,
  reviewerUserId,
  email,
  password,
}: {
  db: AdminClient;
  actorUserId: string;
  reviewerUserId: string;
  email: string;
  password: string;
}) {
  if (password.length < 12 || password.length > 128)
    throw new ReviewAccountError('Invalid reviewer password', 400);
  await assertActiveReviewerAccount(db, reviewerUserId, email);
  const credentials = await readActiveAppleReviewCredentials(db);
  const key = await importPKCS8(credentials.privateKey, 'ES256');
  const token = await new SignJWT({})
    .setProtectedHeader({
      alg: 'ES256',
      kid: credentials.keyId,
      typ: 'JWT',
    })
    .setIssuer(credentials.issuerId)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key);
  const apps = await appleRequest<{ data: AppleResource[] }>(
    token,
    `/v1/apps?${new URLSearchParams({ 'filter[bundleId]': BUNDLE_ID, limit: '2' })}`
  );
  if (apps.data.length !== 1)
    throw new ReviewAccountError('Apple mobile app was not found', 502);
  const detail = await appleRequest<{ data: AppleResource }>(
    token,
    `/v1/apps/${encodeURIComponent(apps.data[0]!.id)}/betaAppReviewDetail`
  );
  if (!detail.data?.id)
    throw new ReviewAccountError('Apple beta review detail was not found', 502);
  await appleRequest(
    token,
    `/v1/betaAppReviewDetails/${encodeURIComponent(detail.data.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'betaAppReviewDetails',
          id: detail.data.id,
          attributes: {
            demoAccountRequired: true,
            demoAccountName: email.trim().toLowerCase(),
            demoAccountPassword: password,
            notes: REVIEW_NOTES,
          },
        },
      }),
    }
  );
  const confirmed = await appleRequest<{ data: AppleResource }>(
    token,
    `/v1/apps/${encodeURIComponent(apps.data[0]!.id)}/betaAppReviewDetail`
  );
  if (
    confirmed.data?.attributes?.demoAccountRequired !== true ||
    confirmed.data.attributes?.demoAccountName !== email.trim().toLowerCase() ||
    confirmed.data.attributes?.notes !== REVIEW_NOTES
  ) {
    throw new ReviewAccountError(
      'Apple review metadata was not confirmed',
      502
    );
  }
  await recordAudit(db, {
    actorType: 'user',
    actorUserId,
    environmentId: credentials.environmentId,
    eventType: 'review_account.apple_metadata_published',
    metadata: { reviewerUserId },
    resourceKind: 'app_store_connect_beta_review',
    versionId: credentials.versionId,
  });
  console.info('Apple beta review account metadata updated', {
    actorUserId,
    reviewerUserId,
  });
  return { configured: true };
}
