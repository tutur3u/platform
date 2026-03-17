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

interface LoadedSharedFormRecord {
  adminClient: any;
  shareLink: { id: string; form_id: string; active: boolean } | null;
  form: {
    id: string;
    ws_id: string;
    status: string;
    access_mode: string;
    open_at: string | null;
    close_at: string | null;
  } | null;
  definition: SharedFormPayload['form'] | null;
  accessMode: 'anonymous' | 'authenticated' | 'authenticated_email';
}

async function loadSharedFormRecord(
  shareCode: string
): Promise<LoadedSharedFormRecord> {
  const adminClient = await createAdminClient();
  const { data: shareLink } = await adminClient
    .from('form_share_links')
    .select('id, form_id, active')
    .eq('code', shareCode)
    .maybeSingle();

  if (!shareLink?.active) {
    return {
      adminClient,
      shareLink: null,
      form: null,
      definition: null,
      accessMode: 'anonymous',
    };
  }

  const { data: form } = await adminClient
    .from('forms')
    .select('*')
    .eq('id', shareLink.form_id)
    .maybeSingle();

  const definition = form
    ? await fetchFormDefinition(adminClient, form.id)
    : null;

  return {
    adminClient,
    shareLink,
    form,
    definition,
    accessMode: form ? resolveAccessMode(form.access_mode) : 'anonymous',
  };
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

function resolveSharedFormBaseResult(
  loaded: Pick<LoadedSharedFormRecord, 'shareLink' | 'form' | 'definition'>
): { status: 200 | 404 | 410; form: SharedFormPayload['form'] | null } {
  if (!loaded.shareLink || !loaded.form || !loaded.definition) {
    return { status: 404, form: null };
  }

  if (!isFormAcceptingResponses(loaded.form)) {
    return { status: 410, form: null };
  }

  return { status: 200, form: loaded.definition };
}

export function buildSharedFormSnapshotResult(
  loaded: Pick<
    LoadedSharedFormRecord,
    'shareLink' | 'form' | 'definition' | 'accessMode'
  >
): SharedFormFetchResult {
  const resolved = resolveSharedFormBaseResult(loaded);

  if (resolved.status !== 200 || !resolved.form) {
    return { status: resolved.status, data: null };
  }

  if (loaded.accessMode !== 'anonymous') {
    return { status: 401, data: null };
  }

  return {
    status: 200,
    data: {
      form: resolved.form,
    },
  };
}

export async function loadSharedFormSnapshot(
  shareCode: string
): Promise<SharedFormFetchResult> {
  try {
    const loaded = await loadSharedFormRecord(shareCode);
    return buildSharedFormSnapshotResult(loaded);
  } catch {
    return { status: 500, data: null };
  }
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
    const { adminClient, shareLink, form, definition, accessMode } =
      await loadSharedFormRecord(shareCode);
    const resolved = resolveSharedFormBaseResult({
      shareLink,
      form,
      definition,
    });

    if (resolved.status !== 200 || !shareLink || !form || !definition) {
      return { status: resolved.status, data: null };
    }

    const responder = await getResponderContext(headersObj, accessMode);

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
