import { describe, expect, it, vi } from 'vitest';
import {
  CLIENT_ACTION_HEADERS,
  isClientForwardingHeader,
} from './forwarding-headers';
import { manifest } from './manifest';
import { familyRequest } from './web-family';
import { withWebRest } from './web-rest.test-helper';
import { type CacheLike, createHandler, type Env } from './worker';

class MemoryCache implements CacheLike {
  async match() {
    return undefined;
  }
  async put() {}
}

const ACTION_HEADERS = [...CLIENT_ACTION_HEADERS];

describe('client action headers', () => {
  it('lists the mutation intent headers first-party clients send', () => {
    expect([...ACTION_HEADERS].sort()).toEqual([
      'x-tuturuuu-account-action',
      'x-tuturuuu-desktop-deployment-action',
      'x-tuturuuu-feature-flag-action',
      'x-tuturuuu-github-bot-action',
      'x-tuturuuu-mobile-deployment-action',
    ]);
    for (const name of ACTION_HEADERS) {
      expect(isClientForwardingHeader(name), name).toBe(false);
      expect(isClientForwardingHeader(name.toUpperCase()), name).toBe(false);
    }
    // Every other client x-tuturuuu-* header is still stripped.
    for (const name of [
      'x-tuturuuu-app-base',
      'x-tuturuuu-origin-auth',
      'x-tuturuuu-origin-worker',
      'x-tuturuuu-mobile-deployment-actions',
    ]) {
      expect(isClientForwardingHeader(name), name).toBe(true);
    }
  });

  it('keeps the vault upload intent header through the /admin mount', async () => {
    const handle = createHandler({
      cache: () => new MemoryCache(),
      now: () => 0,
      manifest,
    });
    let seen: Request | undefined;
    let body = '';
    const fetch = vi.fn(async (incoming: Request) => {
      seen = incoming;
      body = await incoming.text();
      return new Response(null, { status: 200 });
    });
    const env = {
      PUBLIC_HOST: 'tuturuuu.com',
      ...withWebRest(),
      GATEWAY_MOUNTED_PATHS: '/admin,/admin/*',
      MOUNT_ADMIN: { fetch },
    } as unknown as Env;
    const form = new FormData();
    form.set('file', new File(['fixture'], 'profile.mobileprovision'));
    const headers = new Headers(ACTION_HEADERS.map((name) => [name, '1']));
    headers.set('cookie', 'fixture_session=1');
    headers.set('origin', 'https://tuturuuu.com');
    headers.set('x-tuturuuu-app-base', '/untrusted');
    headers.set('x-tuturuuu-origin-auth', 'untrusted');
    const request = new Request(
      'https://tuturuuu.com/admin/api/v1/mobile-deployment/files/apple_app_store_provisioning_profile',
      { method: 'POST', headers, body: form, redirect: 'manual' }
    );
    const contentType = request.headers.get('content-type');

    expect((await handle(request, env)).status).toBe(200);

    expect(fetch).toHaveBeenCalledTimes(1);
    const sent = seen as Request;
    for (const name of ACTION_HEADERS) {
      expect(sent.headers.get(name), name).toBe('1');
    }
    expect(sent.headers.has('x-tuturuuu-app-base')).toBe(false);
    expect(sent.headers.has('x-tuturuuu-origin-auth')).toBe(false);
    expect(sent.headers.get('cookie')).toBe('fixture_session=1');
    expect(sent.headers.get('origin')).toBe('https://tuturuuu.com');
    expect(sent.headers.get('content-type')).toBe(contentType);
    expect(body).toContain('profile.mobileprovision');
  });

  it('keeps action headers on web family requests', () => {
    const headers = new Headers(ACTION_HEADERS.map((name) => [name, '1']));
    headers.set('x-tuturuuu-app-base', '/untrusted');
    const sent = familyRequest(
      new Request('https://tuturuuu.com/api/v1/fixture', {
        method: 'POST',
        headers,
      }),
      '/api/v1/fixture',
      'tuturuuu.com'
    );
    for (const name of ACTION_HEADERS) {
      expect(sent.headers.get(name), name).toBe('1');
    }
    expect(sent.headers.has('x-tuturuuu-app-base')).toBe(false);
  });
});
