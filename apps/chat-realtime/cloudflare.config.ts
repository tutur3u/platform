import { bindings, defineConfig, exports } from 'cf/config';

// Staging is a separate Worker reached only on workers.dev: no zone route, no
// custom domain, and its own Durable Object namespaces and ticket secret.
const staging = process.env.CHAT_REALTIME_DEPLOY_ENV === 'staging';
const worker = staging
  ? 'tuturuuu-chat-realtime-staging'
  : 'tuturuuu-chat-realtime';

export default defineConfig({
  worker: {
    name: worker,
    compatibilityDate: '2026-10-19',
    entrypoint: 'src/worker.ts',
    workersDev: staging,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: false },
    },
    limits: { cpuMs: 50 },
    env: {
      // Stop fence: "true" rejects every connect and publish, and each room
      // closes open sockets on their next frame or expiry alarm. A secret, so operators flip it with a
      // secret update instead of a code deploy. Any other value runs.
      CHAT_REALTIME_STOPPED: bindings.secret(),
      CHAT_REALTIME_TOKEN_SECRET: bindings.secret(),
      // Optional during a rotation: tickets signed with the previous secret
      // stay valid until it is unset. Signers always use the current secret.
      CHAT_REALTIME_TOKEN_PREVIOUS_SECRET: bindings.secret(),
      INBOX: bindings.durableObject({
        worker,
        exportName: 'ChatInboxRoom',
      }),
      CONVERSATION: bindings.durableObject({
        worker,
        exportName: 'ChatConversationRoom',
      }),
    },
    exports: {
      ChatInboxRoom: exports.durableObject({ storage: 'sqlite' }),
      ChatConversationRoom: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});
