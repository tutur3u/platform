import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Runtime alias: shared @tuturuuu/ui clients import navigation hooks from
// `next/navigation`, which has no provider in TanStack Start and throws at
// runtime. Resolve those imports to a TanStack Router-backed compat shim that
// covers the full surface they use (useRouter/usePathname/useSearchParams/
// useParams/redirect/notFound). Runtime-only (no tsconfig paths remap), so tsc
// still type-checks the shared components against the real `next` types.
const nextNavigationShim = fileURLToPath(
  new URL('./src/lib/platform/next-navigation-shim.tsx', import.meta.url)
);

// Runtime alias: shared @tuturuuu/ui clients import the default `Link` from
// `next/link` (51 files). Resolve it to a TanStack Router-backed shim that
// renders the identical `<a href>` (so SSR/prerender output is unchanged) but
// upgrades plain internal left-clicks to real SPA navigation. Runtime-only.
const nextLinkShim = fileURLToPath(
  new URL('./src/lib/platform/next-link-shim.tsx', import.meta.url)
);

// Runtime aliases: shared @tuturuuu/ui clients still import the browser
// Supabase helpers through package exports whose dist files are not built in
// the TanStack Docker image. Resolve those imports to workspace source.
const supabaseNextClient = fileURLToPath(
  new URL('../../packages/supabase/src/next/client.ts', import.meta.url)
);
const supabaseRealtimeBrowser = fileURLToPath(
  new URL(
    '../../packages/supabase/src/next/realtime-browser.ts',
    import.meta.url
  )
);

const port = Number.parseInt(process.env.PORT ?? '7824', 10);
const prerenderLocales = ['en', 'vi'] as const;
const staticPublicRouteSegments = [
  '',
  '/about',
  '/acceptable-use',
  '/blog',
  '/branding',
  '/careers',
  '/community-guidelines',
  '/contributors',
  '/facebook-mockup',
  '/meet-together',
  '/partners',
  '/pricing',
  '/privacy',
  '/security',
  '/security/bug-bounty',
  '/security/policy',
  '/terms',
  '/women-in-tech',
  '/products/ai',
  '/products/calendar',
  '/products/crm',
  '/products/documents',
  '/products/drive',
  '/products/finance',
  '/products/inventory',
  '/products/lms',
  '/products/mail',
  '/products/tasks',
  '/products/workflows',
  '/solutions/construction',
  '/solutions/education',
  '/solutions/healthcare',
  '/solutions/hospitality',
  '/solutions/manufacturing',
  '/solutions/pharmacies',
  '/solutions/realestate',
  '/solutions/restaurants',
  '/solutions/retail',
  '/ui',
  '/ui/components',
  '/ui/contributing',
  '/ui/setup',
] as const;

const staticPrerenderRoutes = [
  '/',
  ...prerenderLocales.flatMap((locale) =>
    staticPublicRouteSegments.map((segment) => `/${locale}${segment}`)
  ),
];
const staticPrerenderRouteSet = new Set(staticPrerenderRoutes);

function normalizePrerenderPath(path: string) {
  const cleanPath = path.split(/[?#]/u, 1)[0] || '/';

  return cleanPath === '/' ? cleanPath : cleanPath.replace(/\/+$/u, '');
}

export default defineConfig(({ mode }) => {
  const cloudflarePlugins =
    mode === 'test'
      ? []
      : process.env.TANSTACK_WEB_RUNTIME === 'node'
        ? []
        : [cloudflare({ viteEnvironment: { name: 'ssr' } })];

  return {
    plugins: [
      tsconfigPaths(),
      ...cloudflarePlugins,
      tanstackStart({
        pages: staticPrerenderRoutes.map((path) => ({ path })),
        prerender: {
          enabled: true,
          crawlLinks: true,
          filter: (page) =>
            staticPrerenderRouteSet.has(normalizePrerenderPath(page.path)),
        },
        router: {
          quoteStyle: 'single',
          semicolons: true,
        },
      }),
      viteReact(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        'next/link': nextLinkShim,
        'next/navigation': nextNavigationShim,
        '@tuturuuu/supabase/next/client': supabaseNextClient,
        '@tuturuuu/supabase/next/realtime-browser': supabaseRealtimeBrowser,
      },
    },
    server: {
      host: '0.0.0.0',
      port: Number.isFinite(port) ? port : 7824,
      strictPort: true,
    },
    test: {
      exclude: ['e2e/**', 'node_modules/**'],
    },
  };
});
