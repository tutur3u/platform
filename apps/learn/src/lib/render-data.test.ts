// @vitest-environment node
import {
  headers as requestHeaders,
  withBridgeRequest,
} from '@tuturuuu/start-bridge/request-context';
import { describe, expect, it, vi } from 'vitest';
import { getLearnRenderBootstrap } from './render-bootstrap';
import { getLearnRenderProfile } from './render-profile';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(async (options: object) => options),
  profile: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: requestHeaders }));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteCurrentUser: mocks.profile,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getConfiguredLearnApiBaseUrl: () => 'https://learn.example.test',
  getTulearnBootstrap: mocks.bootstrap,
  InternalApiError: class InternalApiError extends Error {},
  withForwardedInternalApiAuth: (headers: Headers, options: object) => ({
    ...options,
    actor: headers.get('authorization'),
  }),
}));

describe('Learn render data', () => {
  it('shares reads across render consumers while isolating concurrent sessions', async () => {
    mocks.profile.mockImplementation(async (target: string) => ({
      actor: (await requestHeaders()).get('authorization'),
      target,
    }));

    const render = (actor: string) =>
      withBridgeRequest(
        new Request('https://tuturuuu.com/learn/dashboard', {
          headers: { authorization: `Bearer ${actor}` },
        }),
        async () => {
          const [menu, footer, badge, layout, page] = await Promise.all([
            getLearnRenderProfile(),
            getLearnRenderProfile(),
            getLearnRenderProfile(),
            getLearnRenderBootstrap(),
            getLearnRenderBootstrap(),
          ]);
          expect(menu).toEqual({ actor: `Bearer ${actor}`, target: 'learn' });
          expect(footer).toBe(menu);
          expect(badge).toBe(menu);
          expect(layout).toEqual({ actor: `Bearer ${actor}` });
          expect(page).toBe(layout);
        }
      );

    await Promise.all([render('first'), render('second')]);
    expect(mocks.profile).toHaveBeenCalledTimes(2);
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2);
  });
});
