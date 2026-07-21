# Changelog

## [0.10.0](https://github.com/tutur3u/platform/compare/infra-v0.9.0...infra-v0.10.0) (2026-07-21)


### Features

* **chat:** mirror Zalo history media to Drive ([b8b5d7b](https://github.com/tutur3u/platform/commit/b8b5d7bb86ccac6351d17020fec16605d8413451))
* **infrastructure:** improve internal account management ([fa4e535](https://github.com/tutur3u/platform/commit/fa4e535d3193f275cfac4d808455caaab9d6b326))
* **infrastructure:** manage internal accounts ([02fd9f3](https://github.com/tutur3u/platform/commit/02fd9f3d1b4edb23c881e2dbb04bf244b36e6ed0))
* **inventory:** support Square POS app payments ([2cd087e](https://github.com/tutur3u/platform/commit/2cd087e15abe2a43da3c21333fe8d9494564fe37))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** standardize fixed app headers ([7b86c42](https://github.com/tutur3u/platform/commit/7b86c4283b39ebc5de8bec971ce3bab5fdaef422))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))


### Bug Fixes

* **chat:** harden personal Zalo integration ([f1d12c6](https://github.com/tutur3u/platform/commit/f1d12c60fe12ab3b01a1be3f0381573d44a32226))
* **chat:** keep Zalo phone sync alive ([5cc7a0d](https://github.com/tutur3u/platform/commit/5cc7a0df42c8ad3b7a9e5785cf5d8e9a99c56b76))
* **chat:** stop Zalo phone sync spam ([b45e778](https://github.com/tutur3u/platform/commit/b45e778693f175b7bafcd00d6b3ec46f079a946c))
* localize realtime analytics filters ([10c14fa](https://github.com/tutur3u/platform/commit/10c14faadc0e0fc6e82fabb2001038e3005e08b6))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* resolve remaining quality suggestions ([826aec4](https://github.com/tutur3u/platform/commit/826aec4af9e8291eb02dc8430b4adab4b110018a))
* **satellite:** restore mobile workspace settings ([e276f40](https://github.com/tutur3u/platform/commit/e276f4006175cfb501410b3875e661d3975c27f2))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))

## [0.9.0](https://github.com/tutur3u/platform/compare/infra-v0.8.0...infra-v0.9.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))


### Bug Fixes

* **inventory:** clarify payment sync and settings ([cf05ed6](https://github.com/tutur3u/platform/commit/cf05ed63cfc47022a95177b661d1fa796d68d65e))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))

## [0.8.0](https://github.com/tutur3u/platform/compare/infra-v0.7.0...infra-v0.8.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.7.0](https://github.com/tutur3u/platform/compare/infra-v0.6.0...infra-v0.7.0) (2026-07-11)


### Features

* **infrastructure:** add satellite shell parity ([d2fcaf3](https://github.com/tutur3u/platform/commit/d2fcaf35a8c2dd2ccb6b14961287c3d518c02a26))
* **inventory:** add revenue share and category bundles ([20b2e1e](https://github.com/tutur3u/platform/commit/20b2e1e5302d1db275766b7b4b92d9bdf69de04a))
* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add quick-create targeting and edge autoscroll ([f03e932](https://github.com/tutur3u/platform/commit/f03e9324b0cce18e9f9974cc8fe251bb58b686bd))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **ci:** allow duplicated aws smithy clients ([c29829e](https://github.com/tutur3u/platform/commit/c29829ef65ede187bc55350c52c42354da30d161))
* **ci:** normalize aws presign types ([860e209](https://github.com/tutur3u/platform/commit/860e209d5f986eca5bffc1378e82201284206a86))
* **devboxes:** gate heartbeat and split v1 dispatch ([34c7a49](https://github.com/tutur3u/platform/commit/34c7a49d015d55a3ba910b3e332be819d4528a59))
* **infrastructure:** harden internal dashboard access ([81e8f8b](https://github.com/tutur3u/platform/commit/81e8f8b2d411bbf43a2b5418ea69593ea32418c5))
* **infrastructure:** land root workspace on internal ([b3f63c2](https://github.com/tutur3u/platform/commit/b3f63c2e27dab7c5746f58e306d521f1e581b849))
* **infrastructure:** provide intl context in locale layout ([39ebbba](https://github.com/tutur3u/platform/commit/39ebbba5d2962ca1675b75d7a9e9a598c65418fb))
* **infrastructure:** replace workspace picker with logo link ([0e998eb](https://github.com/tutur3u/platform/commit/0e998eb7650cecad1d5042b59fb46af18f578160))
* **infrastructure:** restore canonical auth host access ([9f6715f](https://github.com/tutur3u/platform/commit/9f6715fb1c5a89598556cba33b16938b76995fc6))
* **infrastructure:** show dashboard error details ([70de0b7](https://github.com/tutur3u/platform/commit/70de0b7f7682805e71faa6ead445c5a62077789d))
* **infrastructure:** stop protected locale redirect loop ([d8843b5](https://github.com/tutur3u/platform/commit/d8843b593fffb577070dc2037b4636de2f7b1e6e))
* **mail:** localize post email dates ([9be736d](https://github.com/tutur3u/platform/commit/9be736dcb5d4594996bdba800aa385334ddf37e4))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))
* **web:** make login shell cache friendly ([0fcf4da](https://github.com/tutur3u/platform/commit/0fcf4da565e5e4260032247d6ee710cb6c4b7fcd))

## [0.6.0](https://github.com/tutur3u/platform/compare/infra-v0.5.0...infra-v0.6.0) (2026-07-11)


### Features

* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))
* **web:** make login shell cache friendly ([0fcf4da](https://github.com/tutur3u/platform/commit/0fcf4da565e5e4260032247d6ee710cb6c4b7fcd))

## [0.5.0](https://github.com/tutur3u/platform/compare/infra-v0.4.0...infra-v0.5.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add quick-create targeting and edge autoscroll ([f03e932](https://github.com/tutur3u/platform/commit/f03e9324b0cce18e9f9974cc8fe251bb58b686bd))

## [0.4.0](https://github.com/tutur3u/platform/compare/infra-v0.3.0...infra-v0.4.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))


### Bug Fixes

* **ci:** allow duplicated aws smithy clients ([c29829e](https://github.com/tutur3u/platform/commit/c29829ef65ede187bc55350c52c42354da30d161))
* **ci:** normalize aws presign types ([860e209](https://github.com/tutur3u/platform/commit/860e209d5f986eca5bffc1378e82201284206a86))
* **devboxes:** gate heartbeat and split v1 dispatch ([34c7a49](https://github.com/tutur3u/platform/commit/34c7a49d015d55a3ba910b3e332be819d4528a59))
* **infrastructure:** replace workspace picker with logo link ([0e998eb](https://github.com/tutur3u/platform/commit/0e998eb7650cecad1d5042b59fb46af18f578160))
* **mail:** localize post email dates ([9be736d](https://github.com/tutur3u/platform/commit/9be736dcb5d4594996bdba800aa385334ddf37e4))

## [0.3.0](https://github.com/tutur3u/platform/compare/infra-v0.2.0...infra-v0.3.0) (2026-07-03)


### Features

* **infrastructure:** add satellite shell parity ([d2fcaf3](https://github.com/tutur3u/platform/commit/d2fcaf35a8c2dd2ccb6b14961287c3d518c02a26))
* **inventory:** add revenue share and category bundles ([20b2e1e](https://github.com/tutur3u/platform/commit/20b2e1e5302d1db275766b7b4b92d9bdf69de04a))


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **infrastructure:** harden internal dashboard access ([81e8f8b](https://github.com/tutur3u/platform/commit/81e8f8b2d411bbf43a2b5418ea69593ea32418c5))
* **infrastructure:** land root workspace on internal ([b3f63c2](https://github.com/tutur3u/platform/commit/b3f63c2e27dab7c5746f58e306d521f1e581b849))
* **infrastructure:** provide intl context in locale layout ([39ebbba](https://github.com/tutur3u/platform/commit/39ebbba5d2962ca1675b75d7a9e9a598c65418fb))
* **infrastructure:** restore canonical auth host access ([9f6715f](https://github.com/tutur3u/platform/commit/9f6715fb1c5a89598556cba33b16938b76995fc6))
* **infrastructure:** show dashboard error details ([70de0b7](https://github.com/tutur3u/platform/commit/70de0b7f7682805e71faa6ead445c5a62077789d))
* **infrastructure:** stop protected locale redirect loop ([d8843b5](https://github.com/tutur3u/platform/commit/d8843b593fffb577070dc2037b4636de2f7b1e6e))

## [0.2.0](https://github.com/tutur3u/platform/compare/infra-v0.1.1...infra-v0.2.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))

## [0.1.1](https://github.com/tutur3u/platform/compare/infra-v0.1.0...infra-v0.1.1) (2026-06-24)


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
