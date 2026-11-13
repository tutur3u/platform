# Changelog

## [0.2.0](https://github.com/tutur3u/platform/compare/workspace-v0.1.0...workspace-v0.2.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **web:** add workspace domains settings page ([f37c0c0](https://github.com/tutur3u/platform/commit/f37c0c0fc8a2293ca9a82402155e253ca811b67d))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))
* **workspace:** carve authenticated app out of web onto Start ([#7944](https://github.com/tutur3u/platform/issues/7944)) ([51d7454](https://github.com/tutur3u/platform/commit/51d7454b305abc360a3320e6e43dcb1e1aa64c6c))
* **workspace:** carve the changelog, crawlers, polls and queues groups and register page modules ([#7972](https://github.com/tutur3u/platform/issues/7972)) ([870563a](https://github.com/tutur3u/platform/commit/870563ae3b7c5bb6e6d3f4c1f219924bfa4089e8))


### Bug Fixes

* close [#8157](https://github.com/tutur3u/platform/issues/8157) route-registry, inventory and policy gates on main ([#8166](https://github.com/tutur3u/platform/issues/8166)) ([ab9dbab](https://github.com/tutur3u/platform/commit/ab9dbabcd592b58002ed7cb9f79dde87351b8fda))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **seo:** register the marketing app and generate the new robots.txt files ([#8038](https://github.com/tutur3u/platform/issues/8038)) ([d830cec](https://github.com/tutur3u/platform/commit/d830cec3dbcebe696713ad7b4308e85b2308cf57))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
* **workspace:** authorize datasets with the satellite actor ([#8024](https://github.com/tutur3u/platform/issues/8024)) ([88cf376](https://github.com/tutur3u/platform/commit/88cf3761d497ae18e7303681d7a2341467493d42))
* **workspace:** do not register an offline worker ([#8019](https://github.com/tutur3u/platform/issues/8019)) ([de5c76a](https://github.com/tutur3u/platform/commit/de5c76a8dc89c6e3772de17586d90188d9c4b553))
* **workspace:** fail closed on the API forward origin, resync Web copies, allowlist the subdomain for CSRF ([#7981](https://github.com/tutur3u/platform/issues/7981)) ([b84abea](https://github.com/tutur3u/platform/commit/b84abea571c5de1dc3ee29708a4be06d3effd682))
* **workspace:** keep the node:test profile out of vitest ([#8036](https://github.com/tutur3u/platform/issues/8036)) ([de2ad31](https://github.com/tutur3u/platform/commit/de2ad31d2821a217a478ff276674370e13ccf324))
* **workspace:** move account-switch routes out of the vault directory ([#8016](https://github.com/tutur3u/platform/issues/8016)) ([8016403](https://github.com/tutur3u/platform/commit/8016403b1afd8a8d3259462b021d8e749af75170))
* **workspace:** resync Web auth copies ([#8183](https://github.com/tutur3u/platform/issues/8183)) ([81233bd](https://github.com/tutur3u/platform/commit/81233bdf3457403a4b39af5bccef9bf8d9f3c078))


### Performance Improvements

* **mira:** send immediately and show thinking state instantly ([2401331](https://github.com/tutur3u/platform/commit/240133125b1a5f4d7359b63f80ff8a2d62be7866))
