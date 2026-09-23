export class InternalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
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
  let message: string;
  try {
    const data = (await response.json()) as {
      code?: string;
      error?: string;
      message?: string;
    };
    code = data.code;
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
  return new InternalApiError(message, response.status, code);
}
