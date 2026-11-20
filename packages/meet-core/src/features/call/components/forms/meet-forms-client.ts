'use client';

import {
  encodePathSegment,
  getInternalApiClient,
  resolveOwnAppApiPath,
} from '@tuturuuu/internal-api/client';
import type { FormsResults } from '../../server/forms-results/results';
import type {
  MeetFormsAnswers,
  MeetFormsBinding,
  MeetFormsDefinition,
} from './types';

export type MeetFormLaunch = MeetFormsBinding & {
  form: Omit<MeetFormsDefinition, 'launchId' | 'versionId'>;
  submissionPolicy: {
    accessMode: 'anonymous' | 'authenticated' | 'authenticated_email';
    acceptingResponses: boolean;
    requireTurnstile: boolean;
  };
  turnstile: { action: string; cData: string } | null;
};

export type MeetFormCatalogItem = {
  formId: string;
  title: string;
};

export type MeetFormDraft = {
  title: string;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  sections: Array<{
    questions: Array<{ title: string; type: string }>;
  }>;
};

function formsPath(meetingId: string) {
  return `/api/meet-call/${encodePathSegment(meetingId)}/forms`;
}

function resultsPath(
  meetingId: string,
  launchId: string,
  params: Record<string, string> = {}
) {
  return `${formsPath(meetingId)}/results?${new URLSearchParams({ launchId, ...params })}`;
}

function post<Result>(url: string, data: object) {
  return getInternalApiClient().json<Result>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function readMeetForms(meetingId: string, signal: AbortSignal) {
  return getInternalApiClient().json<{ launches: MeetFormLaunch[] }>(
    formsPath(meetingId),
    { signal }
  );
}

export function readMeetFormCatalog(meetingId: string, signal: AbortSignal) {
  return getInternalApiClient().json<{ items: MeetFormCatalogItem[] }>(
    `${formsPath(meetingId)}/catalog`,
    { signal }
  );
}

export function launchMeetForm(
  meetingId: string,
  action:
    | { action: 'launch'; formId: string; launchId: string }
    | { action: 'create'; requestId: string; definition: MeetFormDraft }
) {
  return post<MeetFormLaunch>(formsPath(meetingId), action);
}

export function draftMeetForm(
  meetingId: string,
  prompt: string,
  locale: 'en' | 'vi'
) {
  return post<{ definition: MeetFormDraft }>(formsPath(meetingId), {
    action: 'mira_draft',
    prompt,
    locale,
  });
}

export function requestMeetFormPrefill(
  meetingId: string,
  { launchId, ...binding }: MeetFormsBinding,
  questionIds: string[],
  meetDisplayName?: string
) {
  return post<{ answers: MeetFormsAnswers }>(
    `${formsPath(meetingId)}/${encodePathSegment(launchId)}/prefill`,
    { ...binding, consent: true, questionIds, meetDisplayName }
  );
}

export function submitMeetForm(
  meetingId: string,
  {
    launchId,
    ...submission
  }: MeetFormsBinding & {
    answers: MeetFormsAnswers;
    submissionId: string;
    turnstileToken?: string;
  }
) {
  return post<MeetFormsBinding & { kind: 'submitted'; responseId: string }>(
    `${formsPath(meetingId)}/${encodePathSegment(launchId)}/submit`,
    submission
  );
}

export function readMeetFormResults(
  meetingId: string,
  launchId: string,
  signal: AbortSignal
) {
  return getInternalApiClient().json<FormsResults>(
    resultsPath(meetingId, launchId),
    { signal }
  );
}

export function meetFormResultsCsv(meetingId: string, launchId: string) {
  return resolveOwnAppApiPath(
    'meet',
    resultsPath(meetingId, launchId, { format: 'csv' })
  );
}

export function summarizeMeetForm(
  meetingId: string,
  launchId: string,
  locale: 'en' | 'vi',
  requestId: string
) {
  return getInternalApiClient().json<{ summary: string | null }>(
    resultsPath(meetingId, launchId, { locale }),
    { method: 'POST', headers: { 'Idempotency-Key': requestId } }
  );
}
