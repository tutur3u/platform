# Mastermind sealed-runtime tooling admission

Decision: https://github.com/tutur3u/platform/pull/7901

This decision retains the `void-emitted-runtime` tooling gap for exactly
`apps/mastermind/cloudflare/native-built-worker.acceptance.mjs` at source
`a426adea95631be4d1dbba7eb1bd7e7910583b0e`. The permission fix changes only its
implementation and tests; it does not change this fixture. The fixture SHA256 is
`6f6bb494971b33bf919d0e0eea00e01bbf8904800b24fcd1a2a1134e37a75834`.

The canonical scanner reports kind `source`, two mention lines, two uses, and
digest `1189c0451506a0cb5d5ae11dbe49f32222dec6c05bc8fc2724d4b1d211b8a4de`.
The retained entry from #7675 has the same counts and digest
`0237422907598ee7a39a10dc713e863717d472bb08d390ffd18cd4500dc1ba87`.
Commit `a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89` wraps the first assignment
before its `require('wrangler')` call, changing the mention-line digest without
adding an SDK operation. The literal SDK calls remain visible and unchanged.

## Admitted operation and safety

The fixture starts exactly two disposable local Workers with
`require('wrangler').unstable_startWorker`: the sealed emitted application and a
copy missing its coordination-secret binding. It consumes the saved Void config
with bundling and entrypoint processing disabled. Remote execution, persistence,
watching, metrics, inspector, containers, and provider authentication are
disabled. The listener is loopback-only, credentials are generated synthetic
fixtures, and outbound handling serves only fixture JWKS and the synthetic
permission response; every other application-data request throws. The test registers disposal for both Workers and scratch-output removal while
retaining its existing 120-second deadline.

The cf/Vite harness has no qualified equivalent for this saved Void-config
contract with both admission and missing-secret controls. This decision permits
only those two local acceptance operations. It does not permit SDK builds,
publication, deployment, provider authentication, application-data reads, or
changes to any other allowlist row. Permission-path source approval and runtime
results do not themselves admit this tooling record. Binding requires exact-head
security acceptance of the record.

## Binding record

```json
{
  "apps/mastermind/cloudflare/native-built-worker.acceptance.mjs": {
    "gap": "void-emitted-runtime",
    "admitted": {
      "decision": "https://github.com/tutur3u/platform/pull/7901",
      "reason": "MM-7901-CURRENT-BYTES: retain exactly two local unstable_startWorker calls for sealed Void-config acceptance and missing-coordination-secret refusal, with bundle/processEntrypoint disabled, synthetic bindings, loopback-only execution, intercepted fixture JWKS/permission responses, provider auth denied, registered disposal and the existing 120-second test deadline. No SDK build, publication or deployment is admitted. Remove this entry when a qualified cf/Vite harness preserves both controls with the saved emitted config and these isolation boundaries, and both Wrangler SDK calls are removed."
    },
    "lines": 2,
    "uses": 2,
    "digest": "1189c0451506a0cb5d5ae11dbe49f32222dec6c05bc8fc2724d4b1d211b8a4de"
  }
}
```

The shared allowlist writer applies only this row after security acceptance.
Remove the record and its allowlist entry when the qualified cf/Vite replacement
preserves the exact emitted artifact, authenticated owner/revocation assertions,
missing-secret negative, provider denial and disposal, and replaces both SDK
calls. The manifest dependency has separate custody and is not admitted here.
