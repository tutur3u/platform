import { getInternalApiClient, type InternalApiClientOptions } from './client';
import { InternalApiError, parseInternalApiError } from './internal-api-error';

/** Account-scoped text intake. Actor identity is always resolved by the server. */
export interface ProductFeedbackSubmission {
  title: string;
  body: string;
  idempotencyKey: string;
  turnstileToken: string;
}
export interface ProductFeedbackReceipt {
  id: string;
  createdAt: string;
}
export function submitProductFeedback(
  submission: ProductFeedbackSubmission,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ProductFeedbackReceipt>(
    '/api/v1/product-feedback',
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
      cache: 'no-store',
    }
  );
}

export interface ProductFeedbackListItem {
  id: string;
  title: string;
  createdAt: string;
  status: 'open' | 'resolved';
  archivedAt: string | null;
  revision: number;
}
export interface ProductFeedbackDetail extends ProductFeedbackListItem {
  body: string;
  updatedAt: string;
  capabilities: { canManage: false };
}
export interface ProductFeedbackListQuery {
  view?: 'inbox' | 'resolved' | 'archive' | 'all';
  status?: 'open' | 'resolved';
  q?: string;
  limit?: number;
  cursor?: string;
}
export function listProductFeedback(
  query: ProductFeedbackListQuery = {},
  options?: InternalApiClientOptions
) {
  const params = new URLSearchParams();
  for (const key of ['view', 'status', 'q', 'limit', 'cursor'] as const) {
    const value = query[key];
    if (value !== undefined) params.set(key, String(value));
  }
  const suffix = params.size ? `?${params}` : '';
  return getInternalApiClient(options).json<{
    items: ProductFeedbackListItem[];
    nextCursor: string | null;
  }>(`/api/v1/product-feedback${suffix}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
}
export function getProductFeedback(
  id: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<ProductFeedbackDetail>(
    `/api/v1/product-feedback/${encodeURIComponent(id)}`,
    { method: 'GET', credentials: 'include', cache: 'no-store' }
  );
}

/** Current-request availability only; later reads independently recheck access. */
export async function checkProductFeedbackEligibility(
  options?: InternalApiClientOptions
): Promise<{ eligible: true }> {
  const response = await getInternalApiClient(options).fetch(
    '/api/v1/product-feedback/eligibility',
    { method: 'GET', credentials: 'include', cache: 'no-store' }
  );
  if (!response.ok) throw await parseInternalApiError(response);
  const unavailable = () =>
    new InternalApiError('feedback_unavailable', 503, 'feedback_unavailable');
  if (response.status !== 200) throw unavailable();
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw unavailable();
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    Object.keys(payload)[0] !== 'eligible' ||
    !('eligible' in payload) ||
    payload.eligible !== true
  )
    throw unavailable();
  return { eligible: true };
}
