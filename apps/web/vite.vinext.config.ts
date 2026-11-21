import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import postcssPresetMantine from 'postcss-preset-mantine';
import postcssSimpleVars from 'postcss-simple-vars';
import vinext from 'vinext';
import { patchCssModules } from 'vite-css-modules';
import { defineConfig } from 'vite-plus';
import { createWebNextConfig } from './next-config.web';

// The same discovery the Next.js build runs (a CommonJS script).
const { generate: generatePublicSeoRoutes } = createRequire(import.meta.url)(
  '../../scripts/generate-public-seo-routes.js'
) as { generate: () => string[] };
const publicSeoPaths = generatePublicSeoRoutes();

// Whole-app vinext Worker build of apps/web. `vite.config.mts` stays the
// native Start candidate config; this file is selected explicitly with
// `--config` / `--vite-config`.
export default defineConfig({
  plugins: [
    patchCssModules({ exportMode: 'default' }),
    // Tailwind resolves `@import`/`@plugin` itself; Vite's PostCSS import
    // inlining would resolve package `@plugin`s from the importing package.
    tailwindcss(),
    vinext({
      nextConfig: createWebNextConfig({ publicSeoPaths }),
      react: { compiler: false },
    }),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
  environments: {
    // The RSC entry loads `./ssr/index.js`. Without `"type": "module"` (which
    // the Next.js build of this package cannot take) Vite names ESM entries
    // `.mjs`.
    ssr: {
      build: { rolldownOptions: { output: { entryFileNames: '[name].js' } } },
    },
  },
  resolve: {
    alias: [
      // Abuse-guard and rate-limit state goes through the ABUSE_GUARD service
      // binding; the Workers carry no legacy Redis network client.
      {
        find: /^@upstash\/redis(\/.*)?$/,
        replacement: fileURLToPath(
          new URL('./cloudflare/opennext/redis-unavailable.ts', import.meta.url)
        ),
      },
      // Bindings come from `cloudflare:workers`, not the OpenNext context.
      {
        find: /^@opennextjs\/cloudflare(\/.*)?$/,
        replacement: fileURLToPath(
          new URL('./cloudflare/vinext/cloudflare-context.ts', import.meta.url)
        ),
      },
    ],
    // RSC transforms inject these imports into workspace package sources;
    // the isolated linker only installs them for apps/web.
    dedupe: [
      '@vitejs/plugin-rsc',
      'react-server-dom-webpack',
      'vinext',
      '@vinext/cloudflare',
    ],
  },
  css: {
    // postcss.config.mjs without @tailwindcss/postcss.
    postcss: {
      plugins: [
        postcssPresetMantine(),
        postcssSimpleVars({
          variables: {
            'mantine-breakpoint-xs': '36em',
            'mantine-breakpoint-sm': '48em',
            'mantine-breakpoint-md': '62em',
            'mantine-breakpoint-lg': '75em',
            'mantine-breakpoint-xl': '88em',
          },
        }),
      ],
    },
    modules: {
      generateScopedName(name: string, filename: string) {
        const relativePath = path
          .relative(import.meta.dirname, filename.replace(/\?.*$/, ''))
          .replaceAll('\\', '/');
        return `_${name}_${createHash('sha256').update(relativePath).digest('hex').slice(0, 7)}`;
      },
    },
  },
});
