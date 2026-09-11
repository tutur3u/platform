# Changelog

## [0.7.0](https://github.com/tutur3u/platform/compare/realtime-v0.6.0...realtime-v0.7.0) (2026-09-10)


### Features

* **meet:** add private and room-wide Gemini Live voice ([#5293](https://github.com/tutur3u/platform/issues/5293)) ([f39119a](https://github.com/tutur3u/platform/commit/f39119aab3fc76946955a6e1de8e8165336a1ab6))
* **meet:** add private solo mode and reliable media recovery ([8aec940](https://github.com/tutur3u/platform/commit/8aec940c63185e815ce6253d9483f1251a7ab052))
* **meet:** complete Gemini Live voice and private tool controls ([6e327c7](https://github.com/tutur3u/platform/commit/6e327c711ddfb66b18d289d6c6d9251296055e6f))
* **meet:** private solo mode and reliable reconnect recovery ([#5286](https://github.com/tutur3u/platform/issues/5286)) ([e3c6b03](https://github.com/tutur3u/platform/commit/e3c6b03b0e319ea7b9a528e285b801a11ca62459))


### Bug Fixes

* **meet:** confirm live audio forwarding before reporting recovery ([a0f5baa](https://github.com/tutur3u/platform/commit/a0f5baaf2f3b175a0b6ed961772884f33e2b678c))
* **meet:** harden live audio cancellation and tool replay ([613def7](https://github.com/tutur3u/platform/commit/613def78b74c42d86915306a28a90a2522288f2d))
* **meet:** harden live voice recovery and private approvals ([a2c5950](https://github.com/tutur3u/platform/commit/a2c595016b67c904cb7147b1cf4c4898499d4a4a))
* **meet:** keep mute authoritative and release ended room sessions ([3f11a2a](https://github.com/tutur3u/platform/commit/3f11a2a2c4f724d13fa4b6e13240f5a1df439bda))
* **meet:** preserve live accounting and reconnect state ([d59fd76](https://github.com/tutur3u/platform/commit/d59fd7668adaddd777af320109b8c6687f7bfab5))
* **meet:** preserve private receipts and cancel stale media work ([e5b33bc](https://github.com/tutur3u/platform/commit/e5b33bc3ff3f07c30271727daa5232089eb1899d))
* **meet:** recover personal replies and publisher startup ([6c4352d](https://github.com/tutur3u/platform/commit/6c4352d27d1c672ff7122da64de8bf88394d3b91))
* **meet:** retire stale media sessions across reconnects ([0d3f582](https://github.com/tutur3u/platform/commit/0d3f582cf617cafc0659504677d2d68c88b17a25))

## [0.6.0](https://github.com/tutur3u/platform/compare/realtime-v0.5.0...realtime-v0.6.0) (2026-09-09)


### Features

* **meet:** add grounded Mira tools with private approvals ([1ae6826](https://github.com/tutur3u/platform/commit/1ae6826ea9ee5e47329b53f2c6c1a0bc5d68a5f9))
* **meet:** give Mira a distinct identity and refine call panels ([#5269](https://github.com/tutur3u/platform/issues/5269)) ([6ba3f1c](https://github.com/tutur3u/platform/commit/6ba3f1c5e2408ae0a564c97177282978f38b4ce8))
* **meet:** give Mira live tools and private workspace approvals ([#5275](https://github.com/tutur3u/platform/issues/5275)) ([4f53e8a](https://github.com/tutur3u/platform/commit/4f53e8aa4e3f386b1f4e83cb9fbad6fec7878c00))


### Bug Fixes

* **meet:** bound stalled recovery and preserve retry accounting ([49665ab](https://github.com/tutur3u/platform/commit/49665ab53cbd2db14a015320ba5aaf73bd5cf500))
* **meet:** harden private assistant reviews and search boundaries ([0a536d5](https://github.com/tutur3u/platform/commit/0a536d582c68e48d279e93ada064240010778791))
* **meet:** preserve retained chat and safe reconnect state ([01f744c](https://github.com/tutur3u/platform/commit/01f744cb9b7083ed6976d1f20615c64b7b5c44c2))
* **meet:** recover invitations transcription and signaling ([94668ce](https://github.com/tutur3u/platform/commit/94668cef9b452eb67cbad63ff618307c1a4b306a))
* **meet:** recover invitations, transcription, and reconnects ([#5284](https://github.com/tutur3u/platform/issues/5284)) ([b65d3c0](https://github.com/tutur3u/platform/commit/b65d3c02dbdd1ad2477c400924fdad0a3b83347e))
* **meet:** recover malformed reviews and preserve shared chat history ([331387c](https://github.com/tutur3u/platform/commit/331387ce90ef02cd9b99b44a65e50bd694ad1218))
* **meet:** retain reconnect state and cancel abandoned recovery ([9acbe9f](https://github.com/tutur3u/platform/commit/9acbe9fe3b1053018c4ebbbadb2260753dd2ee37))
* **meet:** validate private continuations and incomplete search usage ([0a19050](https://github.com/tutur3u/platform/commit/0a190506d5e51408e8a55cbfe4633ebee3f30348))

## [0.5.0](https://github.com/tutur3u/platform/compare/realtime-v0.4.0...realtime-v0.5.0) (2026-09-09)


### Features

* **meet:** coordinate room devices, recordings, and trusted services ([#5261](https://github.com/tutur3u/platform/issues/5261)) ([c0f7110](https://github.com/tutur3u/platform/commit/c0f71107160d56691d0af3946ea8a7089cfbd1ae))


### Bug Fixes

* **meet:** harden room state transitions and usage accounting ([b427db9](https://github.com/tutur3u/platform/commit/b427db9b1761ab7ca1c0416c0eac9bc2800ec604))
* **meet:** preserve revoked approvals and reclaim upload slots ([0413cdf](https://github.com/tutur3u/platform/commit/0413cdfbe2be00d6dba015da65ef40504ff6d51c))
* **meet:** preserve room updates and bound usage accounting ([278a7e8](https://github.com/tutur3u/platform/commit/278a7e86dfc0b03fc7645e580b2efa3467038512))
* **meet:** preserve terminal events and isolate usage safeguards ([44629a2](https://github.com/tutur3u/platform/commit/44629a22c35cf56e91155fc72523a622b6b22780))
* **meet:** recover abandoned assistant requests ([9d84a0b](https://github.com/tutur3u/platform/commit/9d84a0bd15b3b80fcd4876bac95d800393b19168))

## [0.4.0](https://github.com/tutur3u/platform/compare/realtime-v0.3.0...realtime-v0.4.0) (2026-09-08)


### Features

* **meet:** improve shared audio, receiving recovery, and call controls ([#5250](https://github.com/tutur3u/platform/issues/5250)) ([45a9e2e](https://github.com/tutur3u/platform/commit/45a9e2ea556cb9b1634fc69752f7feb73007f4fd))


### Bug Fixes

* **meet:** apply partial sharing policies atomically ([8915cac](https://github.com/tutur3u/platform/commit/8915cac00022966c0690f1f35643600ade96d7a7))
* **meet:** synchronize video readiness and refine room experience ([6c98340](https://github.com/tutur3u/platform/commit/6c98340d442307878737ea1c5b38290fb228bef8))
* **meet:** synchronize video readiness and refine room experience ([#5256](https://github.com/tutur3u/platform/issues/5256)) ([f27f237](https://github.com/tutur3u/platform/commit/f27f237b495d8105345b764fa796096117a0b160))
* **meet:** verify media ownership and retain call notifications ([9b7402e](https://github.com/tutur3u/platform/commit/9b7402e568658fe6614eb9ee77c9b015a5e01b50))

## [0.3.0](https://github.com/tutur3u/platform/compare/realtime-v0.2.0...realtime-v0.3.0) (2026-09-07)


### Features

* **meet:** host frontend and realtime on Cloudflare ([0dbdbed](https://github.com/tutur3u/platform/commit/0dbdbed731333ff4cd82b85f95e79049ef59600f))
* **meet:** host on Cloudflare and restrict meeting creation ([#5223](https://github.com/tutur3u/platform/issues/5223)) ([dff093b](https://github.com/tutur3u/platform/commit/dff093b4b6ade986ffd54f3c756d08589e47ad8e))
* **meet:** improve call controls and persistent room permissions ([a4e9a3c](https://github.com/tutur3u/platform/commit/a4e9a3cf729f5e39a92db56b360b0f223306663e))
* **meet:** improve call experience and persistent room controls ([#5247](https://github.com/tutur3u/platform/issues/5247)) ([efae606](https://github.com/tutur3u/platform/commit/efae606f9023fcb080fe795ef13933cfb34d8167))


### Bug Fixes

* **meet:** bound retired publication history ([fb33179](https://github.com/tutur3u/platform/commit/fb3317967b092fc6e294362309e5bbbb5b58b706))
* **meet:** bound stale connections and verify token changes ([0ab28c2](https://github.com/tutur3u/platform/commit/0ab28c228ddd373c1803afeff07ba1a03086ffac))
* **meet:** complete production playback and UI cleanup ([726fd7e](https://github.com/tutur3u/platform/commit/726fd7e46ada9366f11e318a17b4a7fde970decf))
* **meet:** complete production playback and UI cleanup ([#5228](https://github.com/tutur3u/platform/issues/5228)) ([5c7299e](https://github.com/tutur3u/platform/commit/5c7299efa88a6f4c58c70a77582d430f2bbb1a83))
* **meet:** confirm media transitions and finalize call resources ([dae1c06](https://github.com/tutur3u/platform/commit/dae1c06b72ea064b57436d7592eda1d834adb95a))
* **meet:** deliver room snapshots after guest admission ([#5238](https://github.com/tutur3u/platform/issues/5238)) ([0b521ae](https://github.com/tutur3u/platform/commit/0b521ae92553fb0ae9a465709851e7d8200f4ba4))
* **meet:** preserve muted tracks and recover media peers ([4dc823a](https://github.com/tutur3u/platform/commit/4dc823af551c9b9e22137bd6143cb7210bc62432))
* **meet:** preserve muted tracks and recover media peers ([#5244](https://github.com/tutur3u/platform/issues/5244)) ([7249f42](https://github.com/tutur3u/platform/commit/7249f42104439cfe2ffabb8857fd480f8a139aec))
* **meet:** reject retired track publications ([6a1104e](https://github.com/tutur3u/platform/commit/6a1104e69e957d7ec712424df07662f091601e1b))
* **meet:** replace recovered publisher registrations ([fb98dcc](https://github.com/tutur3u/platform/commit/fb98dccdc064585d449974e170eb704514d174e2))
* **meet:** replace recovered publisher registrations ([#5246](https://github.com/tutur3u/platform/issues/5246)) ([229fa05](https://github.com/tutur3u/platform/commit/229fa0520c44d94bc5645adc07785801f4b71256))
* **meet:** retain connected participants during timer throttling ([3c0fbfb](https://github.com/tutur3u/platform/commit/3c0fbfb3060bf6b0a0c89a120b08bafda324d26b))

## [0.2.0](https://github.com/tutur3u/platform/compare/realtime-v0.1.0...realtime-v0.2.0) (2026-08-06)


### Features

* **chat:** complete connected-site operational parity ([#5093](https://github.com/tutur3u/platform/issues/5093)) ([397e11b](https://github.com/tutur3u/platform/commit/397e11bd87d583fe1c65f83a2b8019c287650e19))
* **chat:** complete connected-site parity ([fd4061d](https://github.com/tutur3u/platform/commit/fd4061d8b2f654e521c40ea9819a348ae81575c9))

## [0.1.0](https://github.com/tutur3u/platform/compare/realtime-v0.0.3...realtime-v0.1.0) (2026-08-04)


### Features

* **meet:** add Google-Meet-style calls on Cloudflare Realtime SFU ([a32dd52](https://github.com/tutur3u/platform/commit/a32dd522cdb1a176f9e1312fe52a85e9516870f5))

## [0.0.3](https://github.com/tutur3u/platform/compare/realtime-v0.0.2...realtime-v0.0.3) (2026-06-08)


### Performance Improvements

* **web:** split yjs-heavy server compile graph ([8420fd4](https://github.com/tutur3u/platform/commit/8420fd443bf63c9809283087a71302616ba0aed5))

## [0.0.2](https://github.com/tutur3u/platform/compare/realtime-v0.0.1...realtime-v0.0.2) (2026-06-03)


### Bug Fixes

* **hive:** bound object footprints ([436c835](https://github.com/tutur3u/platform/commit/436c835b58c8c57ff7c5b262d58d0c61f66c6dca))
* **hive:** reject untrusted realtime events ([4f560d8](https://github.com/tutur3u/platform/commit/4f560d8aa6365759256ea45ea843f797b688af98))
* **hive:** require admin for world resets ([aae2e4b](https://github.com/tutur3u/platform/commit/aae2e4b13259ec66a259e35d4b6943eaa5326583))
