# Changelog

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
