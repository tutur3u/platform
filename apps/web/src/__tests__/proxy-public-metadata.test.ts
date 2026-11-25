import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Public metadata images (opengraph-image, twitter-image, icon, apple-icon)
// run through the proxy because the matcher skips only real static assets.
// They must stay public (no /login redirect) and never hit the API rate-limit
// guard.

const mocks = vi.hoisted(() => ({
  guardApiProxyRequest: vi.fn(),
}));

vi.mock('@/lib/api-cost-guard', () => ({
  guardApiCost: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  // Mirror the centralized proxy's public-path contract
  // (packages/auth/src/proxy/index.ts) with the options the web proxy passes.
  createCentralizedAuthProxy: (options: {
    isPublicPath?: (pathname: string) => boolean;
    publicPaths?: string[];
  }) =>
    vi.fn(async (req: NextRequest) => {
      const { pathname } = req.nextUrl;
      const isPublic =
        (options.publicPaths ?? []).some((p) => pathname.startsWith(p)) ||
        !!options.isPublicPath?.(pathname);
      return isPublic
        ? NextResponse.next()
        : NextResponse.redirect(new URL('/login', req.url));
    }),
  propagateAuthCookies: vi.fn(),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: vi.fn(() => ({ error: 'invalid', ok: false })),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (...args: unknown[]) =>
    mocks.guardApiProxyRequest(...args),
  hasSupabaseSessionCookie: vi.fn(() => false),
  isTrustedProxyBypassRequest: vi.fn(() => false),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn().mockRejectedValue(new Error('not configured')),
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  }),
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  getMalformedSupabaseAuthCookieNames: vi.fn(() => []),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  blockIPEdge: vi.fn(),
  extractIPFromRequest: vi.fn(() => '203.0.113.10'),
  isIPBlockedEdge: vi.fn().mockResolvedValue(null),
  recordMalformedAuthCookieEdge: vi.fn().mockResolvedValue(null),
  recordSuspiciousApiRequestEdge: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn().mockResolvedValue(false),
  isWorkspaceUuidLiteral: vi.fn(() => false),
  normalizeWorkspaceId: vi.fn(async (wsId: string) => wsId),
  verifyWorkspaceMembershipType: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@tuturuuu/utils/user-helper', () => ({
  getUserDefaultWorkspace: vi.fn().mockResolvedValue(null),
}));
vi.mock('../lib/workspace-invitations/status', () => ({
  hasPendingWorkspaceInvitations: vi.fn().mockResolvedValue(false),
  listPendingWorkspaceInvitations: vi.fn().mockResolvedValue([]),
}));
vi.mock('@tuturuuu/utils/email/client', () => ({
  isExactTuturuuuDotComEmail: vi.fn(() => false),
}));

const METADATA_FILE =
  /^(opengraph-image|twitter-image|icon|apple-icon)\.(png|jpg|jpeg|gif|svg|tsx|ts)$/;

// Derive the served URL path of every file-convention metadata image under
// the localized app tree, so a new public OG image is covered automatically.
function collectMetadataRoutes(dir: string, segments: string[]): string[] {
  const routes: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const name = entry.name;
      if (name.startsWith('_')) continue;
      const segment = /^\(.*\)$/.test(name)
        ? null
        : name.startsWith('[')
          ? 'sample'
          : name;
      routes.push(
        ...collectMetadataRoutes(
          path.join(dir, name),
          segment ? [...segments, segment] : segments
        )
      );
      continue;
    }
    const match = entry.name.match(METADATA_FILE);
    if (!match) continue;
    const isStatic = !['ts', 'tsx'].includes(match[2] ?? '');
    routes.push(
      `/${[...segments, isStatic ? entry.name : match[1]].join('/')}`
    );
  }
  return routes;
}

const localizedAppDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../app/[locale]'
);

const metadataRoutes = collectMetadataRoutes(localizedAppDir, []);
const metadataPaths = metadataRoutes.flatMap((route) => [
  route,
  `/vi${route}`,
  `/en${route}`,
]);

describe('web proxy public metadata images', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.guardApiProxyRequest.mockResolvedValue(null);
  });

  it('discovers the public metadata image routes', () => {
    expect(metadataRoutes).toEqual(
      expect.arrayContaining([
        '/partners/opengraph-image.png',
        '/women-in-tech/opengraph-image.jpg',
        '/branding/opengraph-image',
      ])
    );
  });

  it.each(metadataPaths)(
    'serves %s signed out without a login redirect or API rate limit',
    async (pathname) => {
      const { proxy } = await import('../proxy');
      const response = await proxy(
        new NextRequest(`http://localhost${pathname}`)
      );
      const location = response.headers.get('location');

      expect(location ?? '').not.toMatch(/\/login(?:$|[/?])/);
      expect(response.status).not.toBe(404);
      if (location) {
        // A locale canonicalization redirect is fine; the asset path must
        // survive it.
        expect(
          new URL(location).pathname.endsWith(
            pathname.replace(/^\/(?:vi|en)(?=\/)/, '')
          )
        ).toBe(true);
      }
      expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    }
  );
});
