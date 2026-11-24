import { bindings, defineConfig, exports } from 'cf/config';

// The SSO identity provider's signer Worker. Dark: no routes, no custom
// domains, no workers.dev and no preview URLs, and no CI workflow publishes
// it. Callers reach it only through service bindings to `SignerEntry` and
// `ControlEntry`. No secret is provisioned by this config: the request key,
// the control key and each `SSO_SIGNING_KEY_<KID>` are written by the
// release authority. With the empty kid map, permit key and transaction
// check below, every sign request is refused. `SSO_SIGNER_DB` names a
// placeholder Hyperdrive configuration; the release authority creates the
// real one (caching disabled, role `sso_signer`) and replaces the id.
export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-sso-signer',
    compatibilityDate: '2026-09-28',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: 'src/worker.ts',
    workersDev: false,
    previewUrls: false,
    // Console logs carry a correlation ID and an outcome code only.
    // Invocation logs stay off: they would record request metadata, and the
    // sign request's headers carry the nonce and the request signature.
    observability: {
      enabled: true,
      headSamplingRate: 1,
      logs: { enabled: true, headSamplingRate: 1, invocationLogs: false },
    },
    env: {
      // `production` on the deployed Worker, set by the release authority
      // (there is no staging signer). It names the Durable Objects and is the
      // audience every request HMAC and permit must carry; empty refuses
      // every call as `misconfigured`.
      SSO_SIGNER_ENV: bindings.text(''),
      // Break-glass minimum fence mode; empty is `running`, any other value
      // but `running` is `stopped`.
      SSO_SIGNER_FENCE_FLOOR: bindings.text(''),
      // Empty uses the default in src/budget-store.ts.
      SSO_SIGNER_DAILY_BUDGET: bindings.text(''),
      // JSON `{ "<kid>": { client, protocol, certificate, entityId,
      // acsOrigins } }` (the SP entity ID and its ACS origins); empty refuses.
      SSO_SIGNER_KEYS: bindings.text(''),
      // The finalization permit's Ed25519 public key(s); empty refuses.
      SSO_SIGNER_PERMIT_PUBLIC_KEY: bindings.text(''),
      // `database` confirms each transaction through `SSO_SIGNER_DB`; empty
      // (or anything else) refuses every request.
      SSO_SIGNER_TRANSACTION_CHECK: bindings.text(''),
      // Hyperdrive to Postgres as the NOLOGIN-by-default role `sso_signer`,
      // which can only execute public.sso_signer_confirm_transaction.
      SSO_SIGNER_DB: bindings.hyperdrive({
        id: '00000000000000000000000000000000',
      }),
      SSO_SIGNER_REQUEST_KEY: bindings.secret(),
      SSO_SIGNER_CONTROL_KEY: bindings.secret(),
      SIGNER_CONTROL: bindings.durableObject({
        worker: 'tuturuuu-sso-signer',
        exportName: 'SignerControl',
      }),
      SIGNER_BUDGET: bindings.durableObject({
        worker: 'tuturuuu-sso-signer',
        exportName: 'SignerBudget',
      }),
      SIGNER_REPLAY: bindings.durableObject({
        worker: 'tuturuuu-sso-signer',
        exportName: 'SignerReplay',
      }),
    },
    exports: {
      SignerControl: exports.durableObject({ storage: 'sqlite' }),
      SignerBudget: exports.durableObject({ storage: 'sqlite' }),
      SignerReplay: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});
