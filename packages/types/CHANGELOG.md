# Changelog

## [0.10.0](https://github.com/tutur3u/platform/compare/types-v0.9.0...types-v0.10.0) (2026-06-15)


### Features

* **inventory:** add a central Polar hub operator view ([95d7c18](https://github.com/tutur3u/platform/commit/95d7c18c5dbf7e0e04d241ab31203430e4a72c66))
* **inventory:** per-storefront Polar environment + clearer checkout errors ([b30c2ed](https://github.com/tutur3u/platform/commit/b30c2eddced0d63ce47c857e8da4578fcf6151d1))

## [0.9.0](https://github.com/tutur3u/platform/compare/types-v0.8.0...types-v0.9.0) (2026-06-15)


### Features

* **cms:** redesign for non-technical users with finance/inventory/storefront integrations ([3558bd5](https://github.com/tutur3u/platform/commit/3558bd588d3428f38370a95f58a8d0389d5bca0e))
* **inventory:** mirror coupons to Polar discounts + Polar setup runbook ([5e44968](https://github.com/tutur3u/platform/commit/5e4496841b283c3bfb5e15b1a86d401bcde26d34))
* **inventory:** upgrade storefront commerce ([ac43942](https://github.com/tutur3u/platform/commit/ac439426ec6d7abc25efbf7ef88468e32be3a46e))

## [0.8.0](https://github.com/tutur3u/platform/compare/types-v0.7.0...types-v0.8.0) (2026-06-13)


### Features

* **ci:** add GitHub bot check auto-pickup ([9e62daa](https://github.com/tutur3u/platform/commit/9e62daa5267b29ca5e55ed85c7d560415cef3b77))
* **finance:** add wallet checkpoint audit history ([11139c7](https://github.com/tutur3u/platform/commit/11139c7e354a8f29e83187748711f6ae39c48e70))
* **inventory:** improve operator form workflows ([aa853a6](https://github.com/tutur3u/platform/commit/aa853a69c5d0166a55d2111ac962d0676bf91a56))


### Bug Fixes

* **inventory:** restore operator CRUD and commerce APIs ([dd38d43](https://github.com/tutur3u/platform/commit/dd38d43bea0e812e48ccc989c7204d1212ae4649))

## [0.7.0](https://github.com/tutur3u/platform/compare/types-v0.6.1...types-v0.7.0) (2026-06-11)


### Features

* **finance:** add wallet checkpoints ([54f9f29](https://github.com/tutur3u/platform/commit/54f9f29446ff9991e09a68abb258ce66c640b086))

## [0.6.1](https://github.com/tutur3u/platform/compare/types-v0.6.0...types-v0.6.1) (2026-06-11)


### Bug Fixes

* **finance:** allow app-session transaction enrichment ([15feedd](https://github.com/tutur3u/platform/commit/15feedd3ac03810998e78ef60e91735ac44ca16c))
* **storefront:** load public inventory through private rpcs ([80d1149](https://github.com/tutur3u/platform/commit/80d11493e546a594021345f95e3f8e8b22b65e13))
* **web:** disambiguate user group member embeds ([abb3e7e](https://github.com/tutur3u/platform/commit/abb3e7e15f3c68cbc3646f1b9eab732ca48433f6))

## [0.6.0](https://github.com/tutur3u/platform/compare/types-v0.5.0...types-v0.6.0) (2026-06-10)


### Features

* **mobile:** add deployment vault CI flow ([b1d21eb](https://github.com/tutur3u/platform/commit/b1d21eb1e30d74b412e4687b095004c21cf03dd1))
* **web:** store multi-account sessions server-side ([2359f35](https://github.com/tutur3u/platform/commit/2359f35a849488f5b6c4070b87dbff8de2d8c9c4))

## [0.5.0](https://github.com/tutur3u/platform/compare/types-v0.4.1...types-v0.5.0) (2026-06-10)


### Features

* **cli:** add host switching and finance transfers ([6c732c1](https://github.com/tutur3u/platform/commit/6c732c13fae9173e97cadb0b4534f37d42908a92))


### Bug Fixes

* **ci:** auto-recover package release dependencies ([40b2539](https://github.com/tutur3u/platform/commit/40b25390c903194a3c85cc627c737a4acd0d6fa9))

## [0.4.1](https://github.com/tutur3u/platform/compare/types-v0.4.0...types-v0.4.1) (2026-06-09)


### Bug Fixes

* **ci:** recover releases and package tsgo builds ([d82b846](https://github.com/tutur3u/platform/commit/d82b846c6232d9fb72b7d2aa808020bc24292a19))

## [0.4.0](https://github.com/tutur3u/platform/compare/types-v0.3.0...types-v0.4.0) (2026-06-08)


### Features

* **devbox:** execute claimed runner jobs ([2d99e6c](https://github.com/tutur3u/platform/commit/2d99e6cb6b275f7ddf423a021cb1cfcb1d944235))
* **platform:** add calendar sources and personal Zalo agents ([2746e72](https://github.com/tutur3u/platform/commit/2746e7297a43def06c3c2f12b7751dea94074113))


### Bug Fixes

* **ci:** align package provenance metadata ([0f7ef88](https://github.com/tutur3u/platform/commit/0f7ef8834c0054b020c3eaa1042bfcf10145ab1a))
* **ci:** stabilize package release workflows ([d6243c2](https://github.com/tutur3u/platform/commit/d6243c2d7ee7ae599d9f17fba4be9f9cc71a1722))
* **e2e:** stabilize native auth bypass ([c3dee2f](https://github.com/tutur3u/platform/commit/c3dee2fdb557d211a2d56792ab4fc472497aa9f2))
* **tasks:** reconcile review dates and drag state ([176dcd3](https://github.com/tutur3u/platform/commit/176dcd305d8292e5cf1a2178bfe759b1074bcb54))


### Performance Improvements

* **tasks:** filter task boards through server RPCs ([657f445](https://github.com/tutur3u/platform/commit/657f4458cd40c2e31774c7d9ef0628f986af1838))

## [0.3.0](https://github.com/tutur3u/platform/compare/types-v0.2.4...types-v0.3.0) (2026-06-03)


### Features

* **devbox:** add remote devbox foundation ([88f81d2](https://github.com/tutur3u/platform/commit/88f81d2a369ba80a3ee601122ca10d9031b63b87))


### Bug Fixes

* **ci:** surface dockerized e2e failures ([9e251d1](https://github.com/tutur3u/platform/commit/9e251d1cac13b897528f0eda94748f7b04d24bc0))
