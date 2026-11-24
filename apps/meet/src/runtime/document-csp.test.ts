import { WASM_COMPILE_SOURCE } from '@tuturuuu/start-bridge/csp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetMeetDocumentCspWarning,
  withMeetDocumentCsp,
} from './document-csp';

const html = (headers: Record<string, string> = {}) =>
  new Response('<!doctype html><title>Meet</title>', {
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });

describe('Meet mounted document CSP', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetMeetDocumentCspWarning();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds the nonce policy with wasm-unsafe-eval to an HTML document', async () => {
    const secured = withMeetDocumentCsp(html(), 'nonce-value');
    const policy = secured.headers.get('content-security-policy') ?? '';
    expect(policy).toContain("'nonce-nonce-value'");
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).toContain(WASM_COMPILE_SOURCE);
    expect(await secured.text()).toContain('<title>Meet</title>');
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves responses without a nonce or without HTML untouched', () => {
    const plain = html();
    expect(withMeetDocumentCsp(plain, undefined)).toBe(plain);
    const json = Response.json({ ok: true });
    expect(withMeetDocumentCsp(json, 'nonce-value')).toBe(json);
    expect(json.headers.has('content-security-policy')).toBe(false);
  });

  it('keeps an upstream policy and warns once when it blocks the formatters', () => {
    const upstream = "default-src 'self'; script-src 'self'";
    const first = html({ 'content-security-policy': upstream });
    expect(withMeetDocumentCsp(first, 'nonce-value')).toBe(first);
    expect(first.headers.get('content-security-policy')).toBe(upstream);
    withMeetDocumentCsp(
      html({ 'content-security-policy': upstream }),
      'nonce-value'
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(WASM_COMPILE_SOURCE);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(upstream);
  });

  it('keeps an upstream policy that already allows the formatters silently', () => {
    const upstream = `script-src 'self' ${WASM_COMPILE_SOURCE}`;
    const response = html({ 'content-security-policy': upstream });
    expect(withMeetDocumentCsp(response, 'nonce-value')).toBe(response);
    expect(warn).not.toHaveBeenCalled();
  });
});
