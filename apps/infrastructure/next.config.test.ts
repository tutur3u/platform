import { autoImplementMethods } from 'next/dist/server/route-modules/app-route/helpers/auto-implement-methods';
import { formatUrl } from 'next/dist/shared/lib/router/utils/format-url';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { getRouteMatcher } from 'next/dist/shared/lib/router/utils/route-matcher';
import { getRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: () => (config: unknown) => config,
}));

describe('Infrastructure next config rewrites', () => {
  it('routes central static APIs before satellite dynamic routes', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://web.example.com');

    const { default: nextConfig } = await import('./next.config');
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual({
      afterFiles: [],
      beforeFiles: [
        {
          destination:
            'https://web.example.com/api/v1/infrastructure/internal-accounts/employees/:path*',
          source: '/api/v1/infrastructure/internal-accounts/employees/:path*',
        },
        {
          destination: 'https://web.example.com/api/workspaces/invitations',
          source: '/api/workspaces/invitations',
        },
        {
          destination:
            'https://web.example.com/api/v1/workspaces/:wsId/settings/permissions',
          source: '/api/v1/workspaces/:wsId/settings/permissions',
        },
        {
          destination:
            'https://web.example.com/api/v1/workspaces/:wsId/users/feedbacks',
          source: '/api/v1/workspaces/:wsId/users/feedbacks',
        },
        {
          destination: 'https://web.example.com/api/v1/workspaces',
          source: '/api/v1/workspaces',
        },
      ],
      fallback: [
        {
          destination: 'https://web.example.com/api/:path*',
          source: '/api/:path*',
        },
      ],
    });
  });
});

const accountsPath = '/api/v1/infrastructure/internal-accounts';
const employeePath = `${accountsPath}/employees`;
const userId = '11111111-1111-4111-8111-111111111111';
const matchLegacyAccount = getRouteMatcher(
  getRouteRegex(`${accountsPath}/[userId]`)
);

async function resolveAccountPath(
  pathname: string,
  originalFallbackOnly = false
) {
  const { default: nextConfig } = await import('./next.config');
  const rewrites = await nextConfig.rewrites?.();
  if (!rewrites || Array.isArray(rewrites)) {
    throw new Error('Expected phased Infrastructure rewrites');
  }
  for (const rewrite of originalFallbackOnly ? [] : rewrites.beforeFiles) {
    const params = getPathMatch(rewrite.source)(pathname);
    if (params) {
      return {
        owner: 'web',
        destination: formatUrl(
          prepareDestination({
            appendParamsToQuery: false,
            destination: rewrite.destination,
            params,
            query: {},
          }).parsedDestination
        ),
      };
    }
  }
  if (pathname === accountsPath) return { owner: 'local-list' };
  const params = matchLegacyAccount(pathname);
  if (params) return { owner: 'local-account', params };
  for (const rewrite of rewrites.fallback) {
    const params = getPathMatch(rewrite.source)(pathname);
    if (params) {
      return {
        owner: 'web',
        destination: formatUrl(
          prepareDestination({
            appendParamsToQuery: false,
            destination: rewrite.destination,
            params,
            query: {},
          }).parsedDestination
        ),
      };
    }
  }
  return { owner: 'unmatched' };
}

describe('employee routing with installed Next matchers', () => {
  it('reproduces the original dynamic shadow and empty GET 405', async () => {
    expect(await resolveAccountPath(employeePath, true)).toEqual({
      owner: 'local-account',
      params: { userId: 'employees' },
    });
    const methods = autoImplementMethods({ PATCH: () => new Response() });
    const response = await methods.GET(
      new Request(`https://infrastructure.example.com${employeePath}`),
      { params: Promise.resolve({ userId: 'employees' }) }
    );
    expect(response.status).toBe(405);
    expect(await response.text()).toBe('');
  });

  it.each([
    '',
    '/',
    `/${userId}`,
    `/${userId}/restore`,
    `/${userId}/reconcile`,
  ])(
    'forwards the employee subtree suffix %s to Web before local routes',
    async (suffix) => {
      vi.stubEnv('WEB_APP_URL', 'https://web.example.com');
      expect(await resolveAccountPath(`${employeePath}${suffix}`)).toEqual({
        owner: 'web',
        destination: `https://web.example.com${employeePath}${suffix === '/' ? '' : suffix}`,
      });
    }
  );

  it('preserves local list and legacy UUID PATCH routing', async () => {
    expect(await resolveAccountPath(accountsPath)).toEqual({
      owner: 'local-list',
    });
    expect(await resolveAccountPath(`${accountsPath}/${userId}`)).toEqual({
      owner: 'local-account',
      params: { userId },
    });
    expect(await resolveAccountPath(`${accountsPath}/employees-other`)).toEqual(
      {
        owner: 'local-account',
        params: { userId: 'employees-other' },
      }
    );
  });

  it.each(['inspect', 'migrate'])(
    'preserves the address migration %s fallback',
    async (action) => {
      const pathname = `${accountsPath}/address-migrations/${action}`;
      expect(await resolveAccountPath(pathname)).toEqual({
        owner: 'web',
        destination: `https://web.example.com${pathname}`,
      });
    }
  );
});
