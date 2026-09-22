import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeHeaders } from './request-headers';

describe('internal API request identity', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('identifies server requests when the runtime supplies no user agent', () => {
    vi.stubGlobal('window', undefined);
    const headers = mergeHeaders({ authorization: 'Bearer test-credential' });
    expect(headers.get('user-agent')).toBe('Tuturuuu-Internal-API/1.0');
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
});
