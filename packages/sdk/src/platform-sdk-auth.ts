const PROTOCOL_RELATIVE_URL_PATTERN = /^\/\//u;

function getRequestInfoUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }

  const requestLike = input as { url?: unknown };
  return typeof requestLike.url === 'string' ? requestLike.url : null;
}

export function shouldAttachSdkAuth(input: RequestInfo | URL, baseUrl: string) {
  const requestUrl = getRequestInfoUrl(input);

  if (!requestUrl) {
    return false;
  }

  const trimmedUrl = requestUrl.trim();

  if (PROTOCOL_RELATIVE_URL_PATTERN.test(trimmedUrl)) {
    return false;
  }

  try {
    return new URL(trimmedUrl).origin === baseUrl;
  } catch {
    return true;
  }
}
