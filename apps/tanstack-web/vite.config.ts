import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const port = Number.parseInt(process.env.PORT ?? '7824', 10);

export default defineConfig(({ mode }) => {
  const cloudflarePlugins =
    mode === 'test' ? [] : [cloudflare({ viteEnvironment: { name: 'ssr' } })];

  return {
    plugins: [
      tsconfigPaths(),
      ...cloudflarePlugins,
      tanstackStart(),
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
