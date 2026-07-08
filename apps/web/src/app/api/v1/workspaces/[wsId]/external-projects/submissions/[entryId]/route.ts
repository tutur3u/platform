import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { ExternalProjectEntry } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyExternalAppSecret } from '@/lib/app-coordination/external-apps';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';

const statusSchema = z.object({
  appId: z.string().trim().toLowerCase().default('richfield'),
  appSecret: z.string().min(1),
  emailNotificationStatus: z.enum(['pending', 'sent', 'failed']),
});

type RichfieldStatusPayload = z.infer<typeof statusSchema>;

type PrivateRichfieldSubmissionRpcClient = {
  rpc(
    functionName: 'update_richfield_contact_submission_status',
    args: {
      p_email_notification_status: RichfieldStatusPayload['emailNotificationStatus'];
      p_entry_id: string;
      p_ws_id: string;
    }
  ): Promise<{
    data: ExternalProjectEntry[] | null;
    error: { message: string } | null;
  }>;
};

function getPrivateRichfieldSubmissionRpcClient(admin: TypedSupabaseClient) {
  return admin.schema(
    'private'
  ) as unknown as PrivateRichfieldSubmissionRpcClient;
}

function isMalformedJsonError(error: unknown) {
  return error instanceof SyntaxError;
}

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

    const { data, error } = await getPrivateRichfieldSubmissionRpcClient(
      admin
    ).rpc('update_richfield_contact_submission_status', {
      p_email_notification_status: payload.emailNotificationStatus,
      p_entry_id: entryId,
      p_ws_id: wsId,
    });

    if (error) {
      throw new Error(error.message);
    }

    const entry = data?.[0];

    if (!entry) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ entry });
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

    console.error('Failed to update Richfield contact submission', error);
    return NextResponse.json(
      { error: 'Failed to update contact submission' },
      { status: 500 }
    );
  }
}
