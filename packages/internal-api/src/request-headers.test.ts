import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstPartyUserAgent, mergeHeaders } from './request-headers';

describe('internal API request identity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('identifies server requests when the runtime supplies no user agent', () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('TUTURUUU_SERVICE_NAME', 'web-vinext-api-core');
    const headers = mergeHeaders({ authorization: 'Bearer test-credential' });
    expect(headers.get('user-agent')).toBe('tuturuuu-web-vinext-api-core/1.0');
    expect(headers.get('authorization')).toBe('Bearer test-credential');
    expect(headers.get('accept')).toBe('application/json');
  });

  it('preserves an explicitly provided agent and request header precedence', () => {
    vi.stubGlobal('window', undefined);
    const headers = mergeHeaders(
      { 'User-Agent': 'Default', accept: 'text/plain' },
      { 'user-agent': 'Explicit', accept: 'application/octet-stream' }
    );
    expect(headers.get('user-agent')).toBe('Explicit');
    expect(headers.get('accept')).toBe('application/octet-stream');
  });

  it('leaves user-agent management to the browser', () => {
    vi.stubGlobal('window', {});
    expect(mergeHeaders().has('user-agent')).toBe(false);
  });

  it('names the service in a header-safe agent', () => {
    expect(firstPartyUserAgent(undefined)).toBe('tuturuuu-internal-api/1.0');
    expect(firstPartyUserAgent(' Web Mail\n')).toBe('tuturuuu-web-mail/1.0');
  });
});
