# Changelog

## [0.2.0](https://github.com/tutur3u/platform/compare/start-bridge-v0.1.1...start-bridge-v0.2.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **start-bridge,cors:** enforce CSRF on mounts and tighten first-party CORS ([#8096](https://github.com/tutur3u/platform/issues/8096)) ([2abcaa0](https://github.com/tutur3u/platform/commit/2abcaa092a9ea1f50d3243c2d9f29101ac0eabf6))
* **start-bridge:** honour TTR_ONE_ORIGIN_&lt;APP&gt; in every bridged app ([#8098](https://github.com/tutur3u/platform/issues/8098)) ([5c70306](https://github.com/tutur3u/platform/commit/5c70306a0687ce9da6e3047bdb1c2b51bdb7adee))
* **start-bridge:** mounted no-writer guard for the per-app session cookie ([#8093](https://github.com/tutur3u/platform/issues/8093)) ([24e0ffe](https://github.com/tutur3u/platform/commit/24e0ffee9609b0392ab4b4c2bc3c88446f7c2f9c))
* **tasks:** CSP with nonces and Trusted Types, report-only then switchable to enforce (one-origin T6) ([#8121](https://github.com/tutur3u/platform/issues/8121)) ([de3a663](https://github.com/tutur3u/platform/commit/de3a66307efa2643fe5e220d05e18d4e43f434d1))


### Bug Fixes

* **auth,cors:** mounted logout CORS fails closed ([#8102](https://github.com/tutur3u/platform/issues/8102)) ([981de50](https://github.com/tutur3u/platform/commit/981de50799a12d32afc43e1b6b3dda30cccfeb3a))
* **auth:** CSRF check no longer bypassed by a junk Bearer on mounts ([#8101](https://github.com/tutur3u/platform/issues/8101)) ([8c8d949](https://github.com/tutur3u/platform/commit/8c8d94920a43d419df8191230fdd3dd68435f8b9))
* **ci:** refresh retained route digest and type header fixtures ([#8135](https://github.com/tutur3u/platform/issues/8135)) ([add27f5](https://github.com/tutur3u/platform/commit/add27f5f9b25ccce060a1a0ead02b63dc7f40709))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** deny framing when a kept CSP sets no frame-ancestors ([#8140](https://github.com/tutur3u/platform/issues/8140)) ([7882748](https://github.com/tutur3u/platform/commit/78827486265644b81dfc073752b6551d2871e269))
* **start-bridge:** harden thrown-error response headers ([5b3fa45](https://github.com/tutur3u/platform/commit/5b3fa457ab92469c6410daeabb8c3d94572a59eb))
* **start-bridge:** install the request store everywhere except client builds ([#8123](https://github.com/tutur3u/platform/issues/8123)) ([1ad6d50](https://github.com/tutur3u/platform/commit/1ad6d507de5d2b4cedced558d3eb12716720c1d5))
* **start-bridge:** keep AsyncLocalStorage out of the client bundle ([#8069](https://github.com/tutur3u/platform/issues/8069)) ([65693de](https://github.com/tutur3u/platform/commit/65693de765829dbcfaa40cc7468fe7a182d6930d))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))


### Performance Improvements

* **marketing:** reduce landing render delay and hydration ([#8188](https://github.com/tutur3u/platform/issues/8188)) ([3306953](https://github.com/tutur3u/platform/commit/33069539b7a181cd74542ac6d53b9f80d34de92b))

## [0.1.1](https://github.com/tutur3u/platform/compare/start-bridge-v0.1.0...start-bridge-v0.1.1) (2026-11-08)


### Bug Fixes

* **cloudflare:** harden native runtime and artifact qualification ([d2cd64a](https://github.com/tutur3u/platform/commit/d2cd64afe3758a7c3a1804e4f942f17579b27725))
* **release:** preserve cycle compatibility and publication holds ([#7779](https://github.com/tutur3u/platform/issues/7779)) ([ee6e298](https://github.com/tutur3u/platform/commit/ee6e298f623857f543dd74aa7f7d47bb9b0471bf))
* **staging:** host-only __Host- cookies and Set-Cookie Domain backstops ([#7429](https://github.com/tutur3u/platform/issues/7429)) ([e058622](https://github.com/tutur3u/platform/commit/e058622ccafe40c0523ad68bdc2b594718bbd735))
* **start-bridge:** inline server environment and guard Worker startup ([23db573](https://github.com/tutur3u/platform/commit/23db573767d768adfd8e748ddada74cefdcfd7db))
