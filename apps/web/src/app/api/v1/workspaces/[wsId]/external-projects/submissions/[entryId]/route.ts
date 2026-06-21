import type { Json } from '@tuturuuu/types';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyExternalAppSecret } from '@/lib/app-coordination/external-apps';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';
import { updateWorkspaceExternalProjectEntry } from '@/lib/external-projects/store';

const statusSchema = z.object({
  appId: z.string().trim().toLowerCase().default('richfield'),
  appSecret: z.string().min(1),
  emailNotificationStatus: z.enum(['pending', 'sent', 'failed']),
});

async function authorizeRichfieldSubmissionStatus({
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ entryId: string; wsId: string }> }
) {
  const { entryId, wsId } = await params;
  const admin = (await createAdminClient()) as TypedSupabaseClient;

  try {
    const payload = statusSchema.parse(await request.json());
    const access = await authorizeRichfieldSubmissionStatus({
      admin,
      appId: payload.appId,
      appSecret: payload.appSecret,
      wsId,
    });

    if ('response' in access) return access.response;

    const { data: currentEntry, error: currentEntryError } = await admin
      .from('workspace_external_project_entries')
      .select('metadata, profile_data')
      .eq('ws_id', wsId)
      .eq('id', entryId)
      .maybeSingle();

    if (currentEntryError) {
      throw new Error(currentEntryError.message);
    }

    if (!currentEntry) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const currentProfileData =
      currentEntry.profile_data &&
      typeof currentEntry.profile_data === 'object' &&
      !Array.isArray(currentEntry.profile_data)
        ? (currentEntry.profile_data as Record<string, unknown>)
        : {};
    const currentMetadata =
      currentEntry.metadata &&
      typeof currentEntry.metadata === 'object' &&
      !Array.isArray(currentEntry.metadata)
        ? (currentEntry.metadata as Record<string, unknown>)
        : {};

    const entry = await updateWorkspaceExternalProjectEntry(
      entryId,
      {
        actorId: null,
        metadata: {
          ...currentMetadata,
          emailNotificationStatus: payload.emailNotificationStatus,
          privateDelivery: true,
        } as Json,
        profile_data: {
          ...currentProfileData,
          emailNotificationStatus: payload.emailNotificationStatus,
        } as Json,
        workspaceId: wsId,
      },
      admin
    );

    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.flatten() },
        { status: 400 }
      );
    }

    console.error('Failed to update Richfield contact submission', error);
    return NextResponse.json(
      { error: 'Failed to update contact submission' },
      { status: 500 }
    );
  }
}
