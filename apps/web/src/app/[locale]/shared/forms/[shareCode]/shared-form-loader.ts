import 'server-only';

import crypto from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import {
  getAuthenticatedUserContext,
  hasSentResponseCopyEmail,
} from '@/features/forms/response-copy-email';
import { FORM_ACCESS_MODE_VALUES } from '@/features/forms/schema';
import {
  fetchFormDefinition,
  getReadOnlyAnswersForResponder,
  getSessionMetadata,
} from '@/features/forms/server';
import type {
  SharedFormFetchResult,
  SharedFormPayload,
} from './shared-form-data';

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

function resolveAccessMode(value: string) {
  return FORM_ACCESS_MODE_VALUES.includes(
    value as (typeof FORM_ACCESS_MODE_VALUES)[number]
  )
    ? (value as (typeof FORM_ACCESS_MODE_VALUES)[number])
    : 'anonymous';
}

async function getResponderContext(
  headersObj: { headers: Headers },
  accessMode: 'anonymous' | 'authenticated' | 'authenticated_email'
) {
  const { user: authenticatedUser, authenticatedEmail } =
    await getAuthenticatedUserContext(headersObj);

  if (accessMode === 'anonymous') {
    return {
      authenticatedUser,
      authenticatedEmail,
      user: null,
      respondentEmail: null as string | null,
    };
  }

  if (!authenticatedUser) {
    throw new Error('Authentication required to access this form');
  }

  if (accessMode === 'authenticated') {
    return {
      authenticatedUser,
      authenticatedEmail,
      user: authenticatedUser,
      respondentEmail: null as string | null,
    };
  }

  return {
    authenticatedUser,
    authenticatedEmail,
    user: authenticatedUser,
    respondentEmail: authenticatedEmail,
  };
}

/**
 * Server-only loader for shared form page data.
 * Replaces the internal HTTP fetch to the API with direct DB + auth access.
 */
export async function loadSharedFormForPage(
  shareCode: string
): Promise<SharedFormFetchResult> {
  try {
    const headersList = await headers();
    const headersObj = { headers: headersList };
    const { adminClient, shareLink, form, definition } =
      await loadSharedForm(shareCode);

    if (!shareLink || !form || !definition) {
      return { status: 404, data: null };
    }

    if (!isFormAcceptingResponses(form)) {
      return { status: 410, data: null };
    }

    const responder = await getResponderContext(
      headersObj,
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
        const responseCopyAlreadySent = readOnlyAnswers.sessionId
          ? await hasSentResponseCopyEmail(
              adminClient,
              form.ws_id,
              readOnlyAnswers.sessionId
            )
          : false;

        const payload: SharedFormPayload = {
          form: definition,
          readOnly: true,
          initialAnswers: readOnlyAnswers.answers,
          answerIssues: readOnlyAnswers.issues,
          submittedAt: readOnlyAnswers.submittedAt,
          responseCopyEmail: responder.authenticatedEmail,
          readOnlyResponseId: readOnlyAnswers.responseId,
          readOnlyResponseSessionId: readOnlyAnswers.sessionId,
          canRequestResponseCopy: Boolean(
            responder.authenticatedEmail &&
              readOnlyAnswers.responseId &&
              readOnlyAnswers.sessionId &&
              !responseCopyAlreadySent
          ),
          responseCopyAlreadySent,
        };
        return { status: 200, data: payload };
      }
    }

    const metadata = getSessionMetadata(headersObj);

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

    return {
      status: 200,
      data: {
        form: definition,
        sessionId: session.id,
        responseCopyEmail: responder.authenticatedEmail,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('Authentication required')) {
      return { status: 401, data: null };
    }

    return { status: 500, data: null };
  }
}
