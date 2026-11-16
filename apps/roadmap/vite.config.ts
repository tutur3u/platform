import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { roadmapBuildDefines } from '../../packages/roadmap-core/src/build-defines.ts';
import { voidPlugin } from 'void';

export default defineConfig(({ command }) => {
  return {
    base: '/roadmap/',
    define: roadmapBuildDefines(command),
    plugins: [
      voidPlugin(),
      tailwindcss(),
      tanstackStart({
        router: { basepath: '/roadmap' },
        serverFns: { base: '/roadmap/_serverFn' },
      }),
      react(),
    ],
  };
});
