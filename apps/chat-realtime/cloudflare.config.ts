import { bindings, defineConfig, exports } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'tuturuuu-chat-realtime',
    compatibilityDate: '2026-10-19',
    entrypoint: 'src/worker.ts',
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: false },
    },
    limits: { cpuMs: 50 },
    env: {
      // Stop fence: "true" rejects every connect and publish and closes open
      // sockets on their next frame. A secret, so operators flip it with a
      // secret update instead of a code deploy. Any other value runs.
      CHAT_REALTIME_STOPPED: bindings.secret(),
      CHAT_REALTIME_TOKEN_SECRET: bindings.secret(),
      INBOX: bindings.durableObject({
        worker: 'tuturuuu-chat-realtime',
        exportName: 'ChatInboxRoom',
      }),
      CONVERSATION: bindings.durableObject({
        worker: 'tuturuuu-chat-realtime',
        exportName: 'ChatConversationRoom',
      }),
    },
    exports: {
      ChatInboxRoom: exports.durableObject({ storage: 'sqlite' }),
      ChatConversationRoom: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});
