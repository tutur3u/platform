import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';

export default defineConfig(({ command }) => {
  const source = process.env.ROADMAP_SOURCE_SHA ?? process.env.GITHUB_SHA;
  if (command === 'build' && !/^[a-f0-9]{40}$/.test(source ?? '')) {
    throw new Error(
      'A roadmap build requires its immutable ROADMAP_SOURCE_SHA'
    );
  }
  return {
    base: '/roadmap/',
    define: { __ROADMAP_BUILD_SHA__: JSON.stringify(source ?? 'development') },
    plugins: [
      voidPlugin(),
      tanstackStart({
        router: { basepath: '/roadmap' },
        serverFns: { base: '/roadmap/_serverFn' },
      }),
      react(),
    ],
  };
});
