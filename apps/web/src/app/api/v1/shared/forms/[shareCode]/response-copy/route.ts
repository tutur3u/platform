import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  isTurnstileError,
  verifyTurnstileToken,
} from '@tuturuuu/turnstile/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAuthenticatedUserContext,
  hasSentResponseCopyEmail,
  maybeSendResponseCopyEmail,
} from '@/features/forms/response-copy-email';

const responseCopyRequestSchema = z.object({
  responseId: z.uuid(),
  sessionId: z.uuid(),
  turnstileToken: z.string().max(4096).optional(),
});

async function loadSharedForm(shareCode: string) {
  const adminClient = await createAdminClient();
  const { data: shareLink } = await adminClient
    .from('form_share_links')
    .select('id, form_id, active')
    .eq('code', shareCode)
    .maybeSingle();

  if (!shareLink?.active) {
    return { adminClient, shareLink: null, form: null };
  }

  const { data: form } = await adminClient
    .from('forms')
    .select('id, title, ws_id, status, open_at, close_at')
    .eq('id', shareLink.form_id)
    .maybeSingle();

  return { adminClient, shareLink, form };
}

function isFormAcceptingResponses(form: {
  status: string;
  open_at: string | null;
  close_at: string | null;
}) {
  const now = Date.now();

  if (form.status !== 'published') {
    return false;
  }

  if (form.open_at && new Date(form.open_at).getTime() > now) {
    return false;
  }

  if (form.close_at && new Date(form.close_at).getTime() < now) {
    return false;
  }

  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const { adminClient, shareLink, form } = await loadSharedForm(shareCode);

    if (!shareLink || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    if (!isFormAcceptingResponses(form)) {
      return NextResponse.json(
        { error: 'This form is not currently accepting responses' },
        { status: 410 }
      );
    }

    const parsed = responseCopyRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            'Invalid response copy request payload',
        },
        { status: 400 }
      );
    }

    const responder = await getAuthenticatedUserContext(request);

    if (!responder.user?.id || !responder.authenticatedEmail) {
      return NextResponse.json(
        {
          error:
            'Sign in with the email account that should receive the response copy',
        },
        { status: 401 }
      );
    }

    const { data: response } = await adminClient
      .from('form_responses')
      .select('id, session_id, submitted_at')
      .eq('id', parsed.data.responseId)
      .eq('form_id', form.id)
      .eq('respondent_user_id', responder.user.id)
      .eq('session_id', parsed.data.sessionId)
      .maybeSingle();

    if (!response?.session_id || !response.submitted_at) {
      return NextResponse.json(
        { error: 'Response not found' },
        { status: 404 }
      );
    }

    await verifyTurnstileToken(request, parsed.data.turnstileToken);

    const responseCopyAlreadySent = await hasSentResponseCopyEmail(
      adminClient,
      form.ws_id,
      response.session_id
    );

    if (responseCopyAlreadySent) {
      return NextResponse.json(
        { error: 'A response copy has already been sent for this submission' },
        { status: 409 }
      );
    }

    const { data: answerRows } = await adminClient
      .from('form_response_answers')
      .select('question_title, answer_text, answer_json')
      .eq('response_id', response.id);

    const responseCopySentTo = await maybeSendResponseCopyEmail({
      adminClient,
      request,
      form,
      sessionId: response.session_id,
      responseId: response.id,
      responder: {
        authenticatedUser: responder.user,
        authenticatedEmail: responder.authenticatedEmail,
      },
      answerRows: answerRows ?? [],
      submittedAt: response.submitted_at,
    });

    if (!responseCopySentTo) {
      return NextResponse.json(
        {
          error:
            'Failed to send your response copy. Please contact support@tuturuuu.com.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      responseCopySentTo,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    if (isTurnstileError(error)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (message.includes('Too many response copy emails')) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
