// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mode: vi.fn(),
  runtime: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('./runtime', () => ({
  nativeIntegrityMode: mocks.mode,
  nativeIntegrityRuntime: mocks.runtime,
}));

import { guardNativeCalendarIntegrity } from './guard';

const request = (headers: Record<string, string> = {}) =>
  new NextRequest('https://tuturuuu.com/api/v1/users/calendar-settings', {
    method: 'PATCH',
    headers,
    body: '{"timezone":"auto"}',
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  mocks.runtime.mockReturnValue({ verify: mocks.verify });
  mocks.verify.mockResolvedValue({
    allowed: true,
    mode: 'monitor',
    reason: 'verified',
  });
});
afterEach(() => vi.restoreAllMocks());
describe('native calendar integrity route guard', () => {
  it('does no verification or logging when off', async () => {
    mocks.mode.mockReturnValue('off');
    expect(await guardNativeCalendarIntegrity(request(), 'actor')).toBeNull();
    expect(mocks.runtime).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
  });
  it('binds the exact request bytes and server-resolved actor without consuming the route body', async () => {
    mocks.mode.mockReturnValue('monitor');
    const req = request({ 'x-tuturuuu-native-integrity': 'app-attest' });
    expect(await guardNativeCalendarIntegrity(req, 'server-actor')).toBeNull();
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'server-actor',
        method: 'PATCH',
        path: '/api/v1/users/calendar-settings',
        mechanism: 'app-attest',
        proof: null,
      })
    );
    expect(mocks.verify.mock.calls[0]?.[0].bodyHash).toMatch(
      /^[A-Za-z0-9_-]{43}$/
    );
    expect(await req.json()).toEqual({ timezone: 'auto' });
  });
  it('never blocks monitor on verifier/store/configuration failure or malformed proof', async () => {
    mocks.mode.mockReturnValue('monitor');
    mocks.runtime.mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(
      await guardNativeCalendarIntegrity(
        request({ 'x-tuturuuu-integrity-proof': 'malformed!' }),
        'actor'
      )
    ).toBeNull();
    expect(console.info).toHaveBeenCalledExactlyOnceWith('native-integrity', {
      mode: 'monitor',
      mechanism: 'none',
      verdict: 'provider-unavailable',
    });
  });
  it('enforces even when both mechanism and proof headers are absent', async () => {
    mocks.mode.mockReturnValue('enforce');
    mocks.verify.mockResolvedValue({
      allowed: false,
      mode: 'enforce',
      reason: 'missing-proof',
    });
    const response = await guardNativeCalendarIntegrity(request(), 'actor');
    expect(response?.status).toBe(403);
    expect(response?.headers.get('X-Tuturuuu-Integrity-Fallback')).toBe(
      'turnstile'
    );
    expect(await response?.json()).toMatchObject({
      code: 'NATIVE_INTEGRITY_REQUIRED',
    });
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({ mechanism: 'none' })
    );
  });
  it('permits verified Turnstile fallback in enforce and fails closed on outages', async () => {
    mocks.mode.mockReturnValue('enforce');
    mocks.verify.mockResolvedValue({
      allowed: true,
      mode: 'enforce',
      reason: 'verified',
    });
    expect(
      await guardNativeCalendarIntegrity(
        request({ 'x-tuturuuu-native-integrity': 'turnstile' }),
        'actor'
      )
    ).toBeNull();
    mocks.runtime.mockImplementation(() => {
      throw new Error('outage');
    });
    expect(
      (await guardNativeCalendarIntegrity(request(), 'actor'))?.status
    ).toBe(403);
  });
});
