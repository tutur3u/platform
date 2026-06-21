import type { Json } from '@tuturuuu/types';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyExternalAppSecret } from '@/lib/app-coordination/external-apps';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';
import {
  createWorkspaceExternalProjectCollection,
  createWorkspaceExternalProjectEntry,
  listWorkspaceExternalProjectCollections,
} from '@/lib/external-projects/store';

const CONTACT_SUBMISSIONS_COLLECTION_SLUG = 'contact-submissions';

const submissionSchema = z.object({
  appId: z.string().trim().toLowerCase().default('richfield'),
  appSecret: z.string().min(1),
  company: z.string().trim().min(1).max(160),
  country: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200),
  inquiryType: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  name: z.string().trim().min(1).max(160),
  receivedAt: z.string().datetime().optional(),
});

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
}) {
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

async function ensureContactSubmissionsCollection(
  workspaceId: string,
  admin: TypedSupabaseClient
) {
  const collections = await listWorkspaceExternalProjectCollections(
    workspaceId,
    admin
  );
  const existing = collections.find(
    (collection) => collection.slug === CONTACT_SUBMISSIONS_COLLECTION_SLUG
  );

  if (existing) return existing;

  return createWorkspaceExternalProjectCollection(
    {
      actorId: null,
      collection_type: CONTACT_SUBMISSIONS_COLLECTION_SLUG,
      config: {
        privateDelivery: true,
      } as Json,
      description:
        'Private inbound contact form messages saved for Richfield admins.',
      slug: CONTACT_SUBMISSIONS_COLLECTION_SLUG,
      title: 'Contact Inbox',
      workspaceId,
    },
    admin
  );
}

function slugifySubmission(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
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

    if ('response' in access) return access.response;

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
          privateDelivery: true,
          source: 'richfield-contact-form',
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
