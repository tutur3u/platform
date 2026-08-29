import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isTurnstileError, verifyTurnstileToken } from '@tuturuuu/turnstile';
import type { ExternalProjectCollection, Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyExternalAppSecret } from '@/lib/app-coordination/external-apps';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';
import {
  authorizeExternalAppRequest,
  readExternalAppCredentials,
} from '@/lib/external-projects/app-credentials';
import { createWorkspaceExternalProjectEntry } from '@/lib/external-projects/store';

const CONTACT_SUBMISSIONS_COLLECTION_SLUG = 'contact-submissions';

const submissionSchema = z.object({
  appId: z.string().trim().toLowerCase().default('richfield'),
  appSecret: z.string().min(1),
  company: z.string().trim().min(1).max(160),
  country: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).pipe(z.email()),
  inquiryType: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
  name: z.string().trim().min(1).max(160),
  formSlug: z.string().trim().min(1).max(120).default('contact'),
  formVersion: z.number().int().positive().max(1000).default(1),
  receivedAt: z.iso.datetime().optional(),
  turnstileToken: z.string().trim().max(2048).optional(),
});

/**
 * Bot protection for public forms on linked external projects.
 *
 * Verified here rather than in each satellite so every bound project gets the
 * same protection without shipping the secret to it. Enforcement is driven by
 * whether the platform has a secret configured: with one, a valid token is
 * mandatory; without one, submissions still flow, so turning Turnstile on is a
 * matter of setting the secret rather than redeploying every site.
 */
function getSubmissionTurnstileSecret(appId: string) {
  if (appId === 'richfield') {
    return (
      process.env.TURNSTILE_SECRET_KEY_RICHFIELD ??
      process.env.TURNSTILE_SECRET_KEY
    );
  }

  return process.env.TURNSTILE_SECRET_KEY;
}

async function verifySubmissionTurnstile(
  request: Request,
  token: string | undefined,
  appId: string
) {
  const secretKey = getSubmissionTurnstileSecret(appId);
  if (!secretKey) {
    return null;
  }

  try {
    // This request is relayed by the authenticated external app's server, so
    // its forwarding headers describe the relay rather than the browser that
    // completed the challenge. Cloudflare treats remoteip as optional; omit it
    // here and verify the signed token itself instead of binding it to the
    // wrong machine.
    await verifyTurnstileToken(request, token, {
      includeRemoteIp: false,
      secretKey,
    });
    return null;
  } catch (error) {
    if (isTurnstileError(error)) {
      return NextResponse.json(
        { code: error.code, error: 'Turnstile verification failed' },
        { status: 403 }
      );
    }

    throw error;
  }
}

// Explicit union with `?: never` on the absent arm: inferring it lets
// TypeScript normalise the members to `response?: undefined`, which defeats
// `'response' in access` narrowing at the call sites.
type RichfieldSubmissionAccess =
  | { binding?: never; response: NextResponse }
  | {
      binding: Awaited<
        ReturnType<typeof resolveWorkspaceExternalProjectBinding>
      >;
      response?: never;
    };

async function authorizeRichfieldSubmission({
  admin,
  appId,
  appSecret,
  wsId,
}: {
  admin: TypedSupabaseClient;
  appId: string;
  appSecret: string;
  wsId: string;
}): Promise<RichfieldSubmissionAccess> {
  const verification = await verifyExternalAppSecret({ appId, appSecret });

  if (!verification.ok) {
    return {
      response: NextResponse.json(
        { error: verification.error },
        { status: 401 }
      ),
    };
  }

  const binding = await resolveWorkspaceExternalProjectBinding(wsId, admin);

  if (
    !binding.enabled ||
    binding.adapter !== 'richfield' ||
    verification.app.id !== 'richfield'
  ) {
    return {
      response: NextResponse.json(
        { error: 'Richfield submissions are not enabled for this workspace' },
        { status: 403 }
      ),
    };
  }

  return { binding };
}

function isMalformedJsonError(error: unknown) {
  return error instanceof SyntaxError;
}

async function getContactSubmissionsCollection(
  workspaceId: string,
  admin: TypedSupabaseClient
): Promise<ExternalProjectCollection | null> {
  const { data, error } = await admin
    .from('workspace_external_project_collections')
    .select('*')
    .eq('ws_id', workspaceId)
    .eq('slug', CONTACT_SUBMISSIONS_COLLECTION_SLUG)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function ensureContactSubmissionsCollection(
  workspaceId: string,
  admin: TypedSupabaseClient
) {
  const existing = await getContactSubmissionsCollection(workspaceId, admin);

  if (existing) return existing;

  const { data, error } = await admin
    .from('workspace_external_project_collections')
    .insert({
      collection_type: CONTACT_SUBMISSIONS_COLLECTION_SLUG,
      config: {
        privateDelivery: true,
      } as Json,
      created_by: null,
      description:
        'Private inbound contact form messages saved for Richfield admins.',
      slug: CONTACT_SUBMISSIONS_COLLECTION_SLUG,
      title: 'Contact Inbox',
      updated_by: null,
      ws_id: workspaceId,
    })
    .select('*')
    .maybeSingle();

  if (error && error.code !== '23505') {
    throw new Error(error.message);
  }

  const collection =
    data ?? (await getContactSubmissionsCollection(workspaceId, admin));

  if (!collection) {
    throw new Error('Contact submissions collection could not be created');
  }

  return collection;
}

function slugifySubmission(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const EMAIL_NOTIFICATION_STATUSES = ['pending', 'sent', 'failed'] as const;
const DEFAULT_SUBMISSION_PAGE_SIZE = 50;
const MAX_SUBMISSION_PAGE_SIZE = 200;

function readSubmissionQuery(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('emailNotificationStatus') ?? 'pending';
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);

  return {
    limit: Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_SUBMISSION_PAGE_SIZE)
      : DEFAULT_SUBMISSION_PAGE_SIZE,
    status: (EMAIL_NOTIFICATION_STATUSES as readonly string[]).includes(status)
      ? status
      : null,
  };
}

/**
 * List inbound form submissions for the owning external app.
 *
 * Exists so an unattended job (Richfield forwards responses to a configured
 * inbox on a schedule) can find what still needs sending. It authenticates with
 * the same app id/secret pair as POST, but reads them from headers rather than
 * the query string so the secret never lands in a URL, access log, or referrer.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
): Promise<NextResponse> {
  const { wsId } = await params;
  const admin = (await createAdminClient()) as TypedSupabaseClient;

  try {
    const credentials = readExternalAppCredentials(request);
    const access = await authorizeExternalAppRequest({
      admin,
      appId: credentials.appId || 'richfield',
      appSecret: credentials.appSecret,
      wsId,
    });

    if (access.response) return access.response;

    const { limit, status } = readSubmissionQuery(request);

    if (!status) {
      return NextResponse.json(
        { error: 'Invalid emailNotificationStatus filter' },
        { status: 400 }
      );
    }

    const collection = await getContactSubmissionsCollection(wsId, admin);

    // No collection yet simply means nothing has ever been submitted; that is
    // an empty inbox, not a failure.
    if (!collection) {
      return NextResponse.json({ submissions: [] });
    }

    const { data, error } = await admin
      .from('workspace_external_project_entries')
      .select('id, title, subtitle, summary, profile_data, created_at')
      .eq('ws_id', wsId)
      .eq('collection_id', collection.id)
      .eq('profile_data->>emailNotificationStatus', status)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ submissions: data ?? [] });
  } catch (error) {
    console.error('Failed to list Richfield contact submissions', error);
    return NextResponse.json(
      { error: 'Failed to list contact submissions' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
): Promise<NextResponse> {
  const { wsId } = await params;
  const admin = (await createAdminClient()) as TypedSupabaseClient;

  try {
    const payload = submissionSchema.parse(await request.json());
    const access = await authorizeRichfieldSubmission({
      admin,
      appId: payload.appId,
      appSecret: payload.appSecret,
      wsId,
    });

    if (access.response) return access.response;

    // After authorization (so an unauthenticated caller cannot probe whether
    // Turnstile is on) but before anything is written.
    const turnstileFailure = await verifySubmissionTurnstile(
      request,
      payload.turnstileToken,
      payload.appId
    );

    if (turnstileFailure) return turnstileFailure;

    const receivedAt = payload.receivedAt ?? new Date().toISOString();
    const collection = await ensureContactSubmissionsCollection(wsId, admin);
    const slugBase = slugifySubmission(
      `${receivedAt}-${payload.company}-${payload.name}`
    );
    const slug = `${slugBase || 'contact-submission'}-${crypto.randomUUID().slice(0, 8)}`;

    const entry = await createWorkspaceExternalProjectEntry(
      {
        actorId: null,
        collection_id: collection.id,
        metadata: {
          externalAppId: payload.appId,
          formSlug: payload.formSlug,
          formVersion: payload.formVersion,
          privateDelivery: true,
          source: 'external-project-form',
        } as Json,
        profile_data: {
          company: payload.company,
          country: payload.country ?? 'Vietnam',
          email: payload.email,
          emailNotificationStatus: 'pending',
          inquiryType: payload.inquiryType,
          name: payload.name,
          receivedAt,
          submissionStatus: 'new',
        } as Json,
        scheduled_for: null,
        slug,
        status: 'draft',
        subtitle: payload.email,
        summary: payload.message,
        title: `${payload.company} - ${payload.name}`,
        workspaceId: wsId,
      },
      admin
    );

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (isMalformedJsonError(error)) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to save Richfield contact submission', error);
    return NextResponse.json(
      { error: 'Failed to save contact submission' },
      { status: 500 }
    );
  }
}
