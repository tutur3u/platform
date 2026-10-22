# Outbound SAML protocol boundary

Phase 1 lives in `packages/sso`; read its README and
`apps/docs/platform/features/sso.mdx` before composing a Web adapter. It supplies
protocol construction, not issuance authorization or a durable replay store.
The current fixtures contain synthetic SP values; they do not qualify Claude.

Use the library's authenticated signature references for claim extraction and
retain byte/depth/parameter bounds before processing untrusted requests. Pin and
review the full XML dependency closure when upgrading, including xmldom's separate
0.8 and 0.9 branches. Keep signature wrapping and semantic rejection tests.

Node-SAML 5.1.0's login-response consumer does not enforce Destination/Recipient;
the local SP harness checks exact ACS after mandatory signature validation.
Do not remove those checks because signature-only tests pass. Real WorkOS
acceptance, verified MFA lineage, current membership/assignment/disclosure,
atomic transaction consumption, signer custody and durable audit remain separate
gates before any live issuance route.

For both request bindings, omitted NameIDPolicy or AllowCreate means false;
only an explicit true XML boolean permits later subject allocation. Preserve
this default for authenticated requests too. Parser and signature-library
exceptions must leave the package as fixed SAML_XML_INVALID or
SAML_INVALID_SIGNATURE errors, without diagnostic text or attached raw causes.
Keep explicit structural/reference errors outside those library catch boundaries.

Wrapping regressions must retain a valid original assertion signature and use a
distinct-ID unsigned attacker assertion with different claims. Re-sign the outer
response in the test so a broken outer digest cannot satisfy the negative check;
verify the intended signatures before expecting semantic rejection. Duplicate-ID
and digest-tamper controls remain separate. The focused security-review suite
covers these invariants and nested-request signed-target selection.

Phase-3 Web adapters use service-only issuance snapshot/finalization RPCs; direct
service-role reads of private SSO tables remain revoked. Preserve the post-signing
policy/key/assignment fence, durable final audit and five-second emission budget.
Never retry unknown consume/finalize outcomes. The existing account MFA helper
permits optional-MFA accounts: SSO must additionally verify current factor lineage
and ten-minute freshness from verified AMR, including primary-auth/recovery rules.
The adapter accepts phase-2 hex pairwise subjects as well as earlier UUID fixtures.
See the SSO feature page for the default-off flag, server secret names, browser
binding, fixture boundaries and later pilot runbook. None of these fixtures proves
real Claude acceptance or authorizes enabling a client.

Web admission stores the verified starter user/session hash separately from the
later consent actor. Signed-out requests claim that hash atomically at their
first authenticated continuation using `sso_bind_transaction`. Check it on both
consent load and decision POST; never mint a fresh CSRF token for another session.
A mismatch returns false after committing rejection/audit, rather than raising
and rolling back the invalidation. Preserve committed consent against a losing
concurrent binder. Require SP restart after account changes or replacement
sessions. Re-evaluate verified MFA age after the finalization RPC before releasing
the signed response, preserving the inclusive ten-minute limit. Keep negative
factor/recovery fixtures otherwise valid and assert their exact error branch;
retain a successful fixture and a clock-crossing positive control.
