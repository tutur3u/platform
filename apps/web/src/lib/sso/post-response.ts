import { randomBytes } from 'node:crypto';
import type { createLoginResponse } from '@tuturuuu/sso';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';
import { privateHeaders } from './config';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
export function postResponse(
  response: ReturnType<typeof createLoginResponse>,
  locale: 'en' | 'vi'
) {
  const nonce = randomBytes(24).toString('base64');
  const text = (locale === 'vi' ? vi : en).sso_consent;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(text.continue)}</title></head><body><main><form method="post" action="${escapeHtml(response.destination)}"><input type="hidden" name="SAMLResponse" value="${escapeHtml(response.samlResponse)}">${response.relayState === undefined ? '' : `<input type="hidden" name="RelayState" value="${escapeHtml(response.relayState)}">`}<button type="submit">${escapeHtml(text.continue)}</button></form></main><script nonce="${nonce}">document.forms[0].submit()</script></body></html>`;
  return new Response(html, {
    headers: {
      ...privateHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action ${response.destination}; script-src 'nonce-${nonce}'`,
    },
  });
}
