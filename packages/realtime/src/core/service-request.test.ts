import { describe, expect, it } from 'vitest';
import {
  REALTIME_SERVICE_USER_AGENT,
  serviceRequestHeaders,
} from './service-request';

describe('serviceRequestHeaders', () => {
  it('always identifies the caller so the API proxy does not treat it as a scanner', () => {
    const headers = serviceRequestHeaders('ticket');
    expect(headers['User-Agent']).toBe(REALTIME_SERVICE_USER_AGENT);
    expect((headers['User-Agent'] ?? '').trim().length).toBeGreaterThan(0);
    expect(headers.Authorization).toBe('Bearer ticket');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
  });
  it('refuses an empty token instead of sending an anonymous request', () => {
    expect(() => serviceRequestHeaders(' ')).toThrow(/token/);
  });
});
