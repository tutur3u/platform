const MAX_SESSION_USER_AGENT_LENGTH = 512;

type HeaderReader = {
  get(name: string): string | null | undefined;
};

/**
 * User-Agent GoTrue copies onto auth.sessions. Node's fetch otherwise sends
 * "node", which is what every server-created or server-refreshed session stored.
 * Only this header is forwarded. IP and credential headers stay on the incoming
 * request and are not copied onto the auth client.
 */
export function sessionUserAgentHeaderValue(
  value: string | null | undefined
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const sanitized = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
    .slice(0, MAX_SESSION_USER_AGENT_LENGTH);

  return sanitized.length > 0 ? sanitized : undefined;
}

export function sessionUserAgentHeaders(
  headerStore: HeaderReader | null | undefined
): { 'User-Agent': string } | undefined {
  const userAgent = sessionUserAgentHeaderValue(
    headerStore?.get('user-agent') ?? headerStore?.get('User-Agent')
  );

  if (!userAgent) {
    return undefined;
  }

  return { 'User-Agent': userAgent };
}
