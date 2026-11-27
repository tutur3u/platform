import { bindings, defineConfig, exports } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'tuturuuu-worlds',
    entrypoint: 'src/worker.ts',
    compatibilityDate: '2026-11-27',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: false,
    previewUrls: false,
    env: {
      WORLDS_VIEWER_ORIGIN: bindings.text('https://worlds.tuturuuu.com'),
      TUTURUUU_APP_COORDINATION_SECRET: bindings.secret(),
      WORLDS_ROOM_ADMISSION_SECRET: bindings.secret(),
      WORLDS_ROOMS: bindings.durableObject({
        worker: 'tuturuuu-worlds',
        exportName: 'WorldRoom',
      }),
    },
    exports: {
      WorldRoom: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});
