import { z } from 'zod';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type EmailAppealEntry = {
  appealable: boolean;
  cooldownUntil: string | null;
  email: string;
  reason: 'hard_bounce' | 'soft_bounce_threshold' | 'spam_complaint' | 'manual';
  createdAt: string;
  sourceEvent: string | null;
  status: string | null;
};

export type EmailAppealList = {
  providerInventory: 'checked' | 'partial' | 'unavailable';
  entries: EmailAppealEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export function listWorkspaceEmailAppeals(
  wsId: string,
  query: { search: string; page: number },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<EmailAppealList>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/email-appeals`,
    { query, cache: 'no-store' }
  );
}

const adminRequestResult = z
  .object({
    status: z.literal('waiting_recipient'),
    appealId: z.uuid(),
    recipientRequestPath: z
      .string()
      .regex(/^\/(en|vi)\/email-appeals\/request\?appeal=[a-f0-9-]{36}$/i),
  })
  .refine((result) => result.recipientRequestPath.endsWith(result.appealId));

export function requestWorkspaceEmailAppeal(
  wsId: string,
  payload: { email: string; reason: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options)
    .json<{
      status: 'waiting_recipient';
      appealId: string;
      recipientRequestPath: string;
    }>(`/api/v1/workspaces/${encodePathSegment(wsId)}/email-appeals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .then((result) => adminRequestResult.parse(result));
}

export function confirmEmailAppeal(
  token: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options)
    .json<{
      status: 'confirmed' | 'transport_pending' | 'unavailable';
    }>('/api/v1/email-appeals/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, confirm: true }),
    })
    .then((result) =>
      z
        .object({
          status: z.enum(['confirmed', 'transport_pending', 'unavailable']),
        })
        .parse(result)
    );
}

const recipientDetailsSchema = z.object({
  appealId: z.uuid(),
  workspaceName: z.string().min(1),
  email: z.email(),
  purpose: z.literal('workspace_reports'),
  status: z.string(),
});

export type EmailAppealRecipientDetails = z.infer<
  typeof recipientDetailsSchema
>;

export function readEmailAppealRecipient(
  appealId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options)
    .json<EmailAppealRecipientDetails>('/api/v1/email-appeals/recipient', {
      query: { appealId },
      cache: 'no-store',
    })
    .then((result) => recipientDetailsSchema.parse(result));
}

export function requestEmailAppealConfirmation(
  appealId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options)
    .json<{
      status: 'sent' | 'unavailable' | 'unknown';
    }>('/api/v1/email-appeals/recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appealId }),
    })
    .then((result) =>
      z
        .object({
          status: z.enum(['sent', 'unavailable', 'unknown']),
        })
        .parse(result)
    );
}

export function previewEmailAppeal(
  token: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options)
    .json<{
      workspaceName: string;
      email: string;
      purpose: 'workspace_reports';
      status: 'ready';
    }>('/api/v1/email-appeals/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    .then((result) =>
      z
        .object({
          workspaceName: z.string().min(1),
          email: z.email(),
          purpose: z.literal('workspace_reports'),
          status: z.literal('ready'),
        })
        .parse(result)
    );
}
