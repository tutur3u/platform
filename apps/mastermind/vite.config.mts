import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { startBridgePreset } from '@tuturuuu/start-bridge/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import { voidPlugin } from 'void';
import { fleetServerFunctionId } from './src/native/fleet-admission';

// Root only: Mastermind never mounts on the shared tuturuuu.com origin, so a
// TUTURUUU_BASE_PATH in the build environment cannot produce a mounted build
// (apps/docs/build/devops/mastermind-web.mdx#no-apex-path-hosting).
const bridge = startBridgePreset({
  appRoot: import.meta.url,
  app: 'mastermind',
  basePath: '',
  shims: [],
});
export default defineConfig(({ command }) => ({
  base: bridge.base,
  define: {
    ...bridge.define,
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [
    voidPlugin(),
    tanstackStart({
      ...bridge.tanstackStart,
      // Readable IDs for the Fleet functions a grantee may call; the rest keep
      // their hashed IDs and stay owner-only (src/native/fleet-admission.ts).
      serverFns: {
        ...bridge.tanstackStart.serverFns,
        generateFunctionId: fleetServerFunctionId,
      },
    }),
    react(),
    tailwindcss(),
  ],
  environments: { client: { define: bridge.clientDefine(command) } },
  resolve: { alias: bridge.alias },
}));
