export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_REDIRECTS = 10;

/**
 * Executes an HTTP fetch following redirects step-by-step to detect loops.
 */
export async function fetchWithRedirectTracking(
  targetUrl,
  options = {},
  {
    fetchImpl = globalThis.fetch,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}
) {
  const chain = [];
  const visited = new Set();
  let currentUrl = targetUrl;
  let redirectsCount = 0;
  const startTime = Date.now();

  while (true) {
    chain.push(currentUrl);

    if (visited.has(currentUrl)) {
      return {
        url: currentUrl,
        finalUrl: currentUrl,
        status: 0,
        statusText: 'Redirect Loop',
        headers: {},
        body: '',
        durationMs: Date.now() - startTime,
        chain,
        redirectsCount,
        loopDetected: true,
        maxRedirectsExceeded: false,
        error: `Redirect loop detected: '${currentUrl}' was visited multiple times in chain [${chain.join(' -> ')}]`,
      };
    }
    visited.add(currentUrl);

    if (redirectsCount > maxRedirects) {
      return {
        url: currentUrl,
        finalUrl: currentUrl,
        status: 0,
        statusText: 'Too Many Redirects',
        headers: {},
        body: '',
        durationMs: Date.now() - startTime,
        chain,
        redirectsCount,
        loopDetected: false,
        maxRedirectsExceeded: true,
        error: `Exceeded maximum redirect limit (${maxRedirects}) while following [${chain.join(' -> ')}]`,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetchImpl(currentUrl, {
        ...options,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        url: targetUrl,
        finalUrl: currentUrl,
        status: 0,
        statusText: 'Fetch Error',
        headers: {},
        body: '',
        durationMs: Date.now() - startTime,
        chain,
        redirectsCount,
        loopDetected: false,
        maxRedirectsExceeded: false,
        error:
          err.name === 'AbortError'
            ? `Request timed out after ${timeoutMs}ms`
            : err.message,
      };
    } finally {
      clearTimeout(timeoutId);
    }

    const status = response.status;
    const isRedirect = [301, 302, 303, 307, 308].includes(status);

    if (isRedirect) {
      const locationHeader =
        response.headers.get?.('location') ||
        (response.headers['location'] ?? response.headers['Location']);

      if (!locationHeader) {
        return {
          url: targetUrl,
          finalUrl: currentUrl,
          status,
          statusText: response.statusText || 'Redirect Without Location',
          headers: response.headers,
          body: '',
          durationMs: Date.now() - startTime,
          chain,
          redirectsCount,
          loopDetected: false,
          maxRedirectsExceeded: false,
          error: `Redirect status ${status} encountered but no Location header present.`,
        };
      }

      redirectsCount++;
      try {
        currentUrl = new URL(locationHeader, currentUrl).href;
      } catch (err) {
        return {
          url: targetUrl,
          finalUrl: currentUrl,
          status,
          statusText: 'Invalid Location Header',
          headers: response.headers,
          body: '',
          durationMs: Date.now() - startTime,
          chain,
          redirectsCount,
          loopDetected: false,
          maxRedirectsExceeded: false,
          error: `Malformed Location header '${locationHeader}': ${err.message}`,
        };
      }
      continue;
    }

    // Non-redirect response reached
    let body = '';
    try {
      body = typeof response.text === 'function' ? await response.text() : '';
    } catch {
      body = '';
    }

    return {
      url: targetUrl,
      finalUrl: currentUrl,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body,
      durationMs: Date.now() - startTime,
      chain,
      redirectsCount,
      loopDetected: false,
      maxRedirectsExceeded: false,
      error: null,
    };
  }
}
