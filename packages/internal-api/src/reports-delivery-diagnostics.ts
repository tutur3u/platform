import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import type { PeriodicReportDeliveryStatus } from './reports';

export interface PeriodicReportDeliveryDiagnostics {
  report: {
    user_email: string | null;
    delivery_status: PeriodicReportDeliveryStatus;
    delivered_at: string | null;
    delivery_requested_at: string | null;
    last_delivery_error: string | null;
  };
  queue: {
    status: PeriodicReportDeliveryStatus;
    recipient_email: string;
    delivery_kind: 'send' | 'test';
    attempt_count: number;
    next_attempt_at: string;
    sent_at: string | null;
    last_error: string | null;
    provider_message_id: string | null;
  } | null;
  attempts: Array<{
    id: string;
    status: 'sent' | 'failed' | 'blocked';
    attempted_at: string;
    error_message: string | null;
    provider_message_id: string | null;
  }>;
}

export function getPeriodicReportDeliveryDiagnostics(
  workspaceId: string,
  reportId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<PeriodicReportDeliveryDiagnostics>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/reports/${encodePathSegment(reportId)}/delivery`,
    { cache: 'no-store' }
  );
}

export interface PeriodicReportEmailPreview {
  html: string;
  title: string;
  content: string;
  feedback: string;
  recipient: string | null;
}

export async function getPeriodicReportEmailPreview(
  wsId: string,
  reportId: string,
  options?: InternalApiClientOptions
) {
  const preview = await getInternalApiClient(
    options
  ).json<PeriodicReportEmailPreview>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/users/reports/${encodePathSegment(reportId)}/delivery?preview=true`,
    { cache: 'no-store' }
  );
  if (typeof preview.html !== 'string' || !preview.html.trim()) {
    throw new Error('Email preview is not available yet.');
  }
  return preview;
}
