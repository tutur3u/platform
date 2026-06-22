import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

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
  '/tools/random',
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
