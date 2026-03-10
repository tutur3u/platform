import crypto from 'node:crypto';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { DEV_MODE } from '@/constants/common';
import { normalizeMarkdownToText } from '@/features/forms/content';
import {
  FORM_ACCESS_MODE_VALUES,
  formSubmitSchema,
} from '@/features/forms/schema';
import {
  fetchFormDefinition,
  getReadOnlyAnswersForResponder,
  getSessionMetadata,
  serializeAnswerForStorage,
  validateSubmittedAnswers,
} from '@/features/forms/server';

async function loadSharedForm(shareCode: string) {
  const adminClient = await createAdminClient();
  const { data: shareLink } = await adminClient
    .from('form_share_links')
    .select('id, form_id, active')
    .eq('code', shareCode)
    .maybeSingle();

  if (!shareLink?.active) {
    return { adminClient, shareLink: null, form: null, definition: null };
  }

  const { data: form } = await adminClient
    .from('forms')
    .select('*')
    .eq('id', shareLink.form_id)
    .maybeSingle();

  const definition = form
    ? await fetchFormDefinition(adminClient, form.id)
    : null;

  return { adminClient, shareLink, form, definition };
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

async function getResponderContext(
  request: NextRequest,
  accessMode: 'anonymous' | 'authenticated' | 'authenticated_email'
) {
  const supabase = await createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (accessMode === 'anonymous') {
    return {
      user: null,
      respondentEmail: null as string | null,
    };
  }

  if (!user) {
    throw new Error('Authentication required to access this form');
  }

  if (accessMode === 'authenticated') {
    return {
      user,
      respondentEmail: null as string | null,
    };
  }

  const adminClient = await createAdminClient();
  const { data: emailRow } = await adminClient
    .from('user_private_details')
    .select('email')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    user,
    respondentEmail: emailRow?.email ?? null,
  };
}

function resolveAccessMode(value: string) {
  return FORM_ACCESS_MODE_VALUES.includes(
    value as (typeof FORM_ACCESS_MODE_VALUES)[number]
  )
    ? (value as (typeof FORM_ACCESS_MODE_VALUES)[number])
    : 'anonymous';
}

async function verifyTurnstileToken(
  request: NextRequest,
  token: string | undefined
) {
  if (DEV_MODE) {
    return;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    throw new Error('Turnstile is not configured');
  }

  if (!token) {
    throw new Error('Turnstile verification is required');
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  const remoteIp = forwardedFor?.split(',')[0]?.trim();
  const formData = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    formData.set('remoteip', remoteIp);
  }

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error('Turnstile verification failed');
  }

  const result = (await response.json()) as { success?: boolean };

  if (!result.success) {
    throw new Error('Turnstile verification failed');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const { adminClient, shareLink, form, definition } =
      await loadSharedForm(shareCode);

    if (!shareLink || !form || !definition) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    if (!isFormAcceptingResponses(form)) {
      return NextResponse.json(
        { error: 'This form is not currently accepting responses' },
        { status: 410 }
      );
    }

    const responder = await getResponderContext(
      request,
      resolveAccessMode(form.access_mode)
    );

    if (definition.settings.oneResponsePerUser && responder.user?.id) {
      const { data: existingResponse } = await adminClient
        .from('form_responses')
        .select('id')
        .eq('form_id', form.id)
        .eq('respondent_user_id', responder.user.id)
        .maybeSingle();

      if (existingResponse) {
        const readOnlyAnswers = await getReadOnlyAnswersForResponder(
          adminClient,
          definition,
          {
            formId: form.id,
            respondentUserId: responder.user.id,
          }
        );

        return NextResponse.json({
          form: definition,
          readOnly: true,
          initialAnswers: readOnlyAnswers.answers,
          answerIssues: readOnlyAnswers.issues,
          submittedAt: readOnlyAnswers.submittedAt,
        });
      }
    }

    const metadata = getSessionMetadata(request);

    const { data: session, error } = await adminClient
      .from('form_sessions')
      .insert({
        form_id: form.id,
        share_link_id: shareLink.id,
        session_token: crypto.randomUUID(),
        respondent_user_id: responder.user?.id ?? null,
        respondent_email: responder.respondentEmail,
        last_section_id: definition.sections[0]?.id ?? null,
        referrer_domain: metadata.referrerDomain,
        device_type: metadata.deviceType,
        browser: metadata.browser,
        os: metadata.os,
        country: metadata.country,
        city: metadata.city,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      form: definition,
      sessionId: session.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('Authentication required')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message.includes('Turnstile')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> }
) {
  try {
    const { shareCode } = await params;
    const { adminClient, shareLink, form, definition } =
      await loadSharedForm(shareCode);

    if (!shareLink || !form || !definition) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    if (!isFormAcceptingResponses(form)) {
      return NextResponse.json(
        { error: 'This form is not currently accepting responses' },
        { status: 410 }
      );
    }

    const parsed = formSubmitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Invalid response payload',
        },
        { status: 400 }
      );
    }

    const responder = await getResponderContext(
      request,
      resolveAccessMode(form.access_mode)
    );
    await verifyTurnstileToken(request, parsed.data.turnstileToken);
    const validation = validateSubmittedAnswers(
      definition,
      parsed.data.answers
    );

    if (!validation.valid) {
      const errorMessage =
        validation.missingRequired.length > 0
          ? `Missing required answers: ${validation.missingRequired.join(', ')}`
          : (validation.validationErrors[0] ?? 'Validation failed');
      return NextResponse.json(
        {
          error: errorMessage,
          validationErrors: validation.validationErrors,
          validationErrorsByQuestionId: validation.validationErrorsByQuestionId,
        },
        { status: 400 }
      );
    }

    const { data: session } = await adminClient
      .from('form_sessions')
      .select('id, viewed_at, submitted_at')
      .eq('id', parsed.data.sessionId)
      .eq('form_id', form.id)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.submitted_at) {
      return NextResponse.json(
        { error: 'This session has already been submitted' },
        { status: 409 }
      );
    }

    if (definition.settings.oneResponsePerUser && responder.user?.id) {
      const { data: existingResponse } = await adminClient
        .from('form_responses')
        .select('id')
        .eq('form_id', form.id)
        .eq('respondent_user_id', responder.user.id)
        .maybeSingle();

      if (existingResponse) {
        return NextResponse.json(
          { error: 'Only one response is allowed for this form' },
          { status: 409 }
        );
      }
    }

    const { count } = await adminClient
      .from('form_responses')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', form.id);

    if (form.max_responses && (count ?? 0) >= form.max_responses) {
      return NextResponse.json(
        { error: 'This form has reached its response limit' },
        { status: 409 }
      );
    }

    const now = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((now.getTime() - new Date(session.viewed_at).getTime()) / 1000)
    );

    const { data: response, error: responseError } = await adminClient
      .from('form_responses')
      .insert({
        form_id: form.id,
        share_link_id: shareLink.id,
        session_id: session.id,
        respondent_user_id: responder.user?.id ?? null,
        respondent_email: responder.respondentEmail,
        duration_seconds: durationSeconds,
      })
      .select('id')
      .single();

    if (responseError) {
      throw new Error(responseError.message);
    }

    const questionMap = new Map(
      definition.sections.flatMap((section) =>
        section.questions.map((question) => [question.id, question] as const)
      )
    );
    const answerRows = Object.entries(parsed.data.answers)
      .filter(([, value]) => value != null && value !== '')
      .map(([questionId, value]) => {
        const question = questionMap.get(questionId);
        const serialized = serializeAnswerForStorage(value);
        return {
          response_id: response.id,
          question_id: question?.id ?? null,
          question_title:
            normalizeMarkdownToText(question?.title) || 'Untitled question',
          question_type: question?.type ?? 'short_text',
          answer_text: serialized.answer_text,
          answer_json: serialized.answer_json,
        };
      });

    if (answerRows.length > 0) {
      const { error: answersError } = await adminClient
        .from('form_response_answers')
        .insert(answerRows);

      if (answersError) {
        throw new Error(answersError.message);
      }
    }

    const lastSectionId =
      definition.sections.at(-1)?.id ?? definition.sections[0]?.id ?? null;

    await adminClient
      .from('form_sessions')
      .update({
        respondent_user_id: responder.user?.id ?? null,
        respondent_email: responder.respondentEmail,
        started_at: new Date(session.viewed_at).toISOString(),
        submitted_at: now.toISOString(),
        last_section_id: lastSectionId,
      })
      .eq('id', session.id);

    return NextResponse.json({ responseId: response.id }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('Authentication required')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
