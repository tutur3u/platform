# Tuturuuu outbound SAML protocol fixture

Phase 1 of Tuturuuu acting as a SAML 2.0 IdP for a Claude organization through
WorkOS. This private package exposes protocol primitives, with no live endpoints,
database changes, UI, or enabled connection. All SP values in tests are synthetic.
The customer's Claude-managed WorkOS profile has **not** been observed or tested.

## Library decision

Evaluated on 2026-10-22 against npm releases, installed dependencies and upstream
security advisories:

| Candidate | Decision and tradeoff |
| --- | --- |
| `xml-crypto` **6.4.0** + `@xmldom/xmldom` **0.9.12** | Selected. Maintained Node libraries with explicit RSA-SHA256, exclusive canonicalization, signature references and authenticated-reference extraction. The small supported SAML profile is validated here; these libraries do not implement SAML policy for us. XML construction uses DOM text/attribute APIs; signature generation and canonicalization remain entirely in xml-crypto. |
| `samlify` **2.15.1** | Maintained, higher-level IdP/SP alternative. Its IdP API is attractive for a full server, but adds entity/template configuration and a separate schema-validator selection. The narrower explicit dependency-injected protocol fixture fits this phase better. This is an architectural choice, not evidence that samlify is insecure. |
| `@node-saml/node-saml` **5.1.0** | Development-only independent SP parser/consumer. Its audience, assertion validity, required response/assertion signatures and InResponseTo cache validate our emitted response. It shares xml-crypto underneath, so this is independent SAML consumption, **not independent cryptographic implementation**. |

Security history matters for all candidates:

- xml-crypto's multiple-reference and DigestValue-comment verification bypasses
  were patched in 6.0.1; use the current pinned version and only
  `getSignedReferences()` after successful verification. See upstream
  [multiple-reference advisory](https://github.com/node-saml/xml-crypto/security/advisories/GHSA-9p8x-f768-wp2g)
  and [comment advisory](https://github.com/node-saml/xml-crypto/security/advisories/GHSA-x3m8-899r-f7c3).
- [Samlify CVE-2025-47949](https://github.com/tngan/samlify/security/advisories/GHSA-r683-v43c-6xqv)
  affected releases before 2.10.0; the evaluated release includes its fix.
- [Node-SAML CVE-2025-54369](https://github.com/node-saml/node-saml/security/advisories/GHSA-m837-g268-mmv7)
  was fixed in 5.1.0 by consuming authenticated assertion content.
- xmldom has parser/serialization and resource-exhaustion advisories. Our direct
  parser is 0.9.12; xml-crypto and the SP verifier resolve their supported 0.8
  branch to **0.8.15** in bun.lock. Both branches contain the corresponding fixes.
  Review the [upstream advisories](https://github.com/xmldom/xmldom/security/advisories)
  and the whole lockfile closure before upgrades. Pinning is not a permanent
  security guarantee.

Node-SAML 5.1.0 does not check login-response Destination/Recipient. The local SP
harness explicitly checks both against its registered ACS after mandatory
signature validation and checks the authenticated issuer. Wrong-ACS tests use
valid signatures, so they exercise this semantic boundary rather than merely
failing a digest. This harness does not substitute for Claude/WorkOS acceptance.

## Supported profile and ports

- `spProfileSchema` / `idpConfigSchema`: strict Zod boundary schemas. ACS/SSO
  endpoints are canonical HTTPS, with no credentials, fragment, wildcard or
  nondefault port. Runtime equality uses the original strings. No runtime
  metadata fetching or arbitrary certificate URL resolution occurs.
- `parseAuthnRequest`: Redirect raw DEFLATE/base64 or POST base64, strict XML
  namespace/root/structure checks, unique IDs/parameters, five-minute freshness,
  30-second future skew, exact destination/issuer/ACS, persistent NameID and only
  exact REFEDS MFA requested context. Unsupported contexts, indices, extensions,
  `SPNameQualifier`, email NameID and passive requests fail closed.
- Request-signature policy is explicit: `required` pins an RSA certificate and
  accepts only RSA-SHA256 (POST additionally SHA256 digests and exclusive c14n).
  `unsigned` permits only unsigned requests and conveys no authenticated SP
  provenance. Unexpected signatures fail rather than being silently ignored.
  Redirect verification uses the original percent-encoded binding parameters.
- `createLoginResponse`: inject `now`, `generateId` and `signer`. Unique response
  and assertion IDs, two-minute validity, bearer Recipient/InResponseTo/expiry,
  audience, response destination and MFA AuthnContext are fixed by the profile.
  Both assertion and response are signed. A synchronous signer is supported;
  returning a response after five seconds is forbidden. This check does not
  preempt an arbitrary injected signer; bounded/cancellable remote signing is
  future service-adapter work. No retries or background operations exist.
- Identity input contains an **already allocated**, stable, random pairwise UUID
  for `(client, Auth user)`, confirmed email, validated first/last names. Only
  `id`, `email`, `firstName`, `lastName` are shared. Subject allocation/persistence
  is a later phase; when `AllowCreate=false`, the caller must find an existing
  mapping or deny. Never generate a new subject per login or derive it from email.
- Assurance input is a trusted adapter result, never browser input: verified
  primary-auth and current TOTP MFA timestamps, MFA at most ten minutes old.
  ForceAuthn additionally requires both after the request. The adapter must prove
  live account/factor lineage and REFEDS MFA semantics; a posted timestamp,
  `aal2`, refreshed JWT `iat`, or enrolled factor is insufficient.
- `createIdpMetadata`: public certificate, persistent format and both request
  bindings; no SLO. Metadata alone does not enable any service. The global
  `WantAuthnRequestsSigned=false` allows per-SP policy; registered profiles still
  enforce required signatures individually.
- `@tuturuuu/sso/node-signer`: dedicated RSA key/certificate matching adapter.
  Resolve private keys only in a future server composition boundary, separate
  from Supabase/session secrets. Config and metadata contain public certs only.

No Next, React, Cloudflare runtime, request globals, environment lookup or database
client enters the package. It targets **Node.js**, including Next.js Node runtime
on Vercel, using Node crypto/zlib and pure JS XML packages with no native addons.
Local Node tests establish this dependency/runtime path; a deployed Vercel build
and real WorkOS login are still unrun. Edge/Workers compatibility is not claimed.
Root workspace discovery and Turbo `test`/`type-check` scripts follow sibling
portable packages; no package build task or generated output is needed.

## Bounds and verification

Requests: 64 KiB raw form/query, four fields, 8 KiB compressed bytes, 32 KiB
expanded XML, 80-byte RelayState, depth 16, 256 DOM nodes, 24 attributes per
element. DTDs/entities, comments, CDATA and non-XML processing instructions are
rejected. Patched parsing plus hard input/output caps bounds synchronous work;
there is no claim of a preemptive XML parser wall-clock timeout. Future ingress
must bound streamed body reads before invoking these functions.

Run from the repository root (OpenSSL must be on PATH for disposable test certs):

```sh
ttr resources run -- bun run --cwd packages/sso test
ttr resources run -- bun run --cwd packages/sso type-check
bunx --no-install biome check packages/sso apps/docs/docs.json
```

Tests generate an RSA key in memory and pipe it to OpenSSL to issue a temporary
self-signed public certificate; no private key is committed or written to disk.
They cover signed and explicitly unsigned request bindings, signature tampering,
wrapping/duplicate IDs, unsigned assertions inside signed responses, wrong trust
anchors/audience/ACS, expiry, SP request replay and malicious compressed XML.
Issuance tests exercise fresh MFA, ForceAuthn, ID collisions and signing deadlines.

## Deferred authorization and delivery

These primitives **do not authorize issuance**. The future server must load a
current registered profile and atomically reserve/consume requests; verify a
nonpersonal active selected workspace, current MEMBER status, explicit assignment,
confirmed allowed-domain email, account recovery/factor lineage, fresh MFA,
per-login disclosure approval, current key/policy revisions and durable audit.
Never accept a serialized `ValidatedRequest` or assurance object from a browser.
The SP's in-memory replay cache in tests is not an IdP transaction store.

Phases 2–5 own persistence/RLS/RPCs, Web/session/MFA/signer adapters and disabled
routes, management/consent UI, then key rotation/disable operations and actual
Claude acceptance. Invite-only Claude provisioning remains the pilot default.
No SLO, IdP-initiated login, SCIM, OIDC, group mapping or global enforcement.
