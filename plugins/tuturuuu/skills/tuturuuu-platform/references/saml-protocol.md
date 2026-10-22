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
