import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      remoteBindings: false,
      experimental: { newConfig: { cfBuildOutput: true } },
    }),
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
});
