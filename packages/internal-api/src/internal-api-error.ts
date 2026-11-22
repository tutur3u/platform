export class InternalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    /** Seconds until a rate/budget limit resets, from `Retry-After` or the body. */
    public readonly retryAfter?: number,
    public readonly existingId?: string,
    public readonly billingStatus?: 'unknown' | 'settled'
  ) {
    super(message);
    this.name = 'InternalApiError';
  }
}

let mfaNavigationStarted = false;

/** Reload the current browser route so its auth proxy can retain the return
 * destination and send the user to enrollment/verification. Never reload the
 * login surface itself or mutate server/CLI navigation. */
function routeRequiredMfa(code: string | undefined) {
  if (
    code !== 'MFA_REQUIRED' ||
    typeof window === 'undefined' ||
    mfaNavigationStarted ||
    /(?:^|\/)login(?:\/|$)/.test(window.location.pathname)
  )
    return;
  mfaNavigationStarted = true;
  window.location.reload();
}

export async function parseInternalApiError(response: Response) {
  const fallbackMessage = `Internal API request failed: ${response.status}`;
  let code: string | undefined;
  let retryAfter: number | undefined;
  let existingId: string | undefined;
  let billingStatus: 'unknown' | 'settled' | undefined;
  let message: string;
  try {
    const data = (await response.json()) as {
      code?: string;
      error?: string;
      message?: string;
      retryAfter?: number;
      retryAfterSeconds?: number;
      existingId?: unknown;
      billingStatus?: unknown;
    };
    code = data.code;
    if (data.billingStatus === 'unknown' || data.billingStatus === 'settled')
      billingStatus = data.billingStatus;
    if (
      response.status === 409 &&
      code === 'DUPLICATE_SOURCE' &&
      typeof data.existingId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        data.existingId
      )
    )
      existingId = data.existingId;
    const header = Number(response.headers?.get?.('retry-after'));
    // Room action envelopes name the hint `retryAfterSeconds`.
    const body = Number(data.retryAfter ?? data.retryAfterSeconds);
    retryAfter = [header, body].find((n) => Number.isFinite(n) && n > 0);
    const challenge = response.headers?.get?.('x-abuse-challenge');
    if (code === 'ABUSE_CHALLENGE_REQUIRED' || challenge) {
      message = [
        data.message || 'Additional verification is required before retrying.',
        'This API request needs a browser verification challenge that the CLI cannot complete automatically.',
        'Open Tuturuuu in a browser to complete verification, then retry the CLI command.',
      ].join(' ');
    } else message = data.message || data.error || fallbackMessage;
  } catch {
    message = fallbackMessage;
  }
  routeRequiredMfa(code);
  return new InternalApiError(
    message,
    response.status,
    code,
    retryAfter,
    existingId,
    billingStatus
  );
}
