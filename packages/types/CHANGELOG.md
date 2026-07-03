# Changelog

## [0.14.0](https://github.com/tutur3u/platform/compare/types-v0.13.1...types-v0.14.0) (2026-07-03)


### Features

* **inventory:** add revenue share and category bundles ([20b2e1e](https://github.com/tutur3u/platform/commit/20b2e1e5302d1db275766b7b4b92d9bdf69de04a))

## [0.13.1](https://github.com/tutur3u/platform/compare/types-v0.13.0...types-v0.13.1) (2026-07-02)


### Bug Fixes

* **security:** limit auth recovery code attempts ([72d454c](https://github.com/tutur3u/platform/commit/72d454c507b0d4b7e69c7b38ad2099dbb83193b2))

## [0.13.0](https://github.com/tutur3u/platform/compare/types-v0.12.0...types-v0.13.0) (2026-06-29)


### Features

* **auth:** add email auth recovery override ([0debe1c](https://github.com/tutur3u/platform/commit/0debe1c71efb30bb51081cc3494a732975be0a86))
* **cli:** add task search ([b8ec86f](https://github.com/tutur3u/platform/commit/b8ec86ffd7bf401d32ac29f7c4db0ee60565b717))
* **external-apps:** add managed scheduler cron integration ([431ed1b](https://github.com/tutur3u/platform/commit/431ed1b41682ba41ef190455816e53e06e4d0039))
* **inventory:** add Square Terminal checkout ([0a3bd76](https://github.com/tutur3u/platform/commit/0a3bd7635cf9836a379d94851e1a303cec848457))
* **inventory:** store Square credentials per workspace ([e606f23](https://github.com/tutur3u/platform/commit/e606f2341c2684b1ef8a7b72900a056ff7b70469))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))

## [0.12.0](https://github.com/tutur3u/platform/compare/types-v0.11.0...types-v0.12.0) (2026-06-26)


### Features

* **cms:** integrate exocorpse external project ([c07081b](https://github.com/tutur3u/platform/commit/c07081b0bd98379eac97c3258b483ad8e39c9b39))

## [0.11.0](https://github.com/tutur3u/platform/compare/types-v0.10.0...types-v0.11.0) (2026-06-24)


### Features

* add test apge ([2d62fc8](https://github.com/tutur3u/platform/commit/2d62fc883379ad54e800e8555e40168de5327295))
* **calendar:** add configurable two-way sync ([76078d8](https://github.com/tutur3u/platform/commit/76078d865618b4970b430b08f0db7a1a8c30ffcb))
* implement teach test submission review and student question feedback ([11cb373](https://github.com/tutur3u/platform/commit/11cb3736d3c35c18f0ed341f807f5df5a5775c31))
* implement test score visibility control and add submission review functionality ([2ce0416](https://github.com/tutur3u/platform/commit/2ce0416d6f192f539a859e5b66d7b8333dbe7b63))
* **tasks:** add public board sharing ([b5a4a07](https://github.com/tutur3u/platform/commit/b5a4a0796dab947e8dca3970d6aa136a4863dd35))
* **tasks:** add shareable kanban task plans ([2de4e58](https://github.com/tutur3u/platform/commit/2de4e5819673e11b01cdc1f21c317f33dc196f56))


### Bug Fixes

* **inventory:** bind Polar webhook workspace ([0cadc2b](https://github.com/tutur3u/platform/commit/0cadc2bf2df8a6ac6add5459d8d38c92d4e24ee9))

## [0.10.0](https://github.com/tutur3u/platform/compare/types-v0.9.0...types-v0.10.0) (2026-06-17)


### Features

* add tests ([1bd19e0](https://github.com/tutur3u/platform/commit/1bd19e0402a78084095dd523603aca6ee52418fc))
* create test ([c225f9d](https://github.com/tutur3u/platform/commit/c225f9d636a701397c43249131f35fbb36e284e4))
* create test page ([618fffa](https://github.com/tutur3u/platform/commit/618fffabeeedfa09d72cd877e2bfd9e806a05090))
* create test view for student ([40bdd08](https://github.com/tutur3u/platform/commit/40bdd08ca449c7e151b0beae6d27d60fb913fe51))
* **inventory:** add a central Polar hub operator view ([95d7c18](https://github.com/tutur3u/platform/commit/95d7c18c5dbf7e0e04d241ab31203430e4a72c66))
* **inventory:** fix Polar checkout currency, add 2-way product sync, cache + redesign storefront ([de2f6fd](https://github.com/tutur3u/platform/commit/de2f6fd6e06ce5242a150a35d3989798f52b9ee9))
* **inventory:** per-storefront Polar environment + clearer checkout errors ([b30c2ed](https://github.com/tutur3u/platform/commit/b30c2eddced0d63ce47c857e8da4578fcf6151d1))
* **inventory:** per-variant SKUs + storefront cart, dialog & instant checkout ([9662b85](https://github.com/tutur3u/platform/commit/9662b8501bcab51033edde79b44991c8ba648a37))
* **inventory:** per-workspace Polar webhook ingestion + signature verification ([862b25a](https://github.com/tutur3u/platform/commit/862b25af444a56ef85c6a4e3dab7b91ae71438fe))
* **inventory:** store commerce money in minor units and harden Polar sync ([3f7ee1d](https://github.com/tutur3u/platform/commit/3f7ee1da9335732854037e7e79fca9d5d2a381d0))
* **tasks:** add per-board default list for new tasks ([2d1d308](https://github.com/tutur3u/platform/commit/2d1d3082422bdd4813accb258fee79b322ce647b))
* **web:** extend profile completion links ([e8585a3](https://github.com/tutur3u/platform/commit/e8585a390b4cc8ae44cd0a15e667ae0f94a52494))
* **web:** rate limits admin center ([fe61dc9](https://github.com/tutur3u/platform/commit/fe61dc933615466f6169a3db3a4a1840f705e80b))
* **web:** trust-gated per-session read limits and trusted-location uplift ([3e64c89](https://github.com/tutur3u/platform/commit/3e64c8929dbe7987ad83900620a25a9559fe1edf))


### Bug Fixes

* **finance:** harden transaction enrichment ([eddd93b](https://github.com/tutur3u/platform/commit/eddd93bd11fb451a7fa5da2e4ab2892fad931ab5))
* **inventory:** currency-correct Polar checkout products (fixes non-USD checkout) ([a26adbb](https://github.com/tutur3u/platform/commit/a26adbb20f142e57ec9bf0e50ea27b5f3cea401f))
* ording question ([f0c32a4](https://github.com/tutur3u/platform/commit/f0c32a4e3b7634c73b0b7cc9b9b05af83468549a))
* **tasks:** preserve task list creator attribution ([1392f5c](https://github.com/tutur3u/platform/commit/1392f5c8f318a3ee3abb0a2328da342bbfd59fd8))
* **tulearn:** harden course test persistence ([42b9fab](https://github.com/tutur3u/platform/commit/42b9fabc3a7bbc3ae63022e9d524901544c64d0e))
* **web:** batch user-groups attendance to avoid per-row read rate limits ([19286c0](https://github.com/tutur3u/platform/commit/19286c05b7ae9dcc01fa45fa252da87173a43e09))
* **web:** stop new-workspace setup from trapping users on "Preparing Workspace" ([3f7ee1d](https://github.com/tutur3u/platform/commit/3f7ee1da9335732854037e7e79fca9d5d2a381d0))

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
