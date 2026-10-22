// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { guardApiProxyBody } from '../../../../packages/utils/src/api-proxy-body';
import {
  FEEDBACK_REQUEST_BYTES,
  feedbackProxyPayloadLimit,
} from './product-feedback-limits';

function request(path: string, bytes: number, method = 'POST') {
  return new NextRequest(`https://web.example.test${path}`, {
    method,
    body: method === 'GET' ? undefined : 'x'.repeat(bytes),
    headers: { 'content-length': '1' },
  });
}
describe('feedback ingress body allowance', () => {
  it('admits the bounded feedback POST above the old 512 KiB cap without consuming the route body', async () => {
    const req = request('/api/v1/product-feedback', 700000);
    expect(
      await guardApiProxyBody(
        req,
        feedbackProxyPayloadLimit(req.method, req.nextUrl.pathname)
      )
    ).toBeNull();
    expect((await req.text()).length).toBe(700000);
  });
  it.each([
    '/api/v1/product-feedback/other',
    '/api/v1/product-feedback/',
    '/api/v1/product-feedback/receipts/key',
    '/api/v1/tasks',
  ])('retains the original body cap on %s', async (path) => {
    const req = request(path, 524289);
    expect(
      (
        await guardApiProxyBody(
          req,
          feedbackProxyPayloadLimit(req.method, req.nextUrl.pathname)
        )
      )?.status
    ).toBe(413);
  });
  it('does not widen other methods or allow an oversized feedback stream', async () => {
    const other = request('/api/v1/product-feedback', 524289, 'PUT');
    expect(
      (
        await guardApiProxyBody(
          other,
          feedbackProxyPayloadLimit(other.method, other.nextUrl.pathname)
        )
      )?.status
    ).toBe(413);
    const tooLarge = request(
      '/api/v1/product-feedback',
      FEEDBACK_REQUEST_BYTES + 1
    );
    expect(
      (
        await guardApiProxyBody(
          tooLarge,
          feedbackProxyPayloadLimit(tooLarge.method, tooLarge.nextUrl.pathname)
        )
      )?.status
    ).toBe(413);
  });
});
