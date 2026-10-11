# Changelog

## [1.4.0](https://github.com/tutur3u/platform/compare/meet-core-v1.3.0...meet-core-v1.4.0) (2026-10-09)


### Features

* **meet:** keep participant media visible alongside collaboration ([0f684f7](https://github.com/tutur3u/platform/commit/0f684f78f93e1b7f5f1961c8520b8f93b8e60659)) ([#5935](https://github.com/tutur3u/platform/issues/5935)) ([bcdd4da](https://github.com/tutur3u/platform/commit/bcdd4daf1f1a11d5ade99c015aca2eae69d61a63))
* **meet:** simplify the in-call document toolbar ([6020a1e](https://github.com/tutur3u/platform/commit/6020a1eddfc4f8cab9179daf1feb126f9dfc0501)) ([#5918](https://github.com/tutur3u/platform/issues/5918)) ([fa358e7](https://github.com/tutur3u/platform/commit/fa358e76517e5bc9793caf72658738d9bf2b42d6))


### Bug Fixes

* **meet:** avoid generating notes for empty saved speech ([b17cd52](https://github.com/tutur3u/platform/commit/b17cd52430f9d5849b6898ea2df0d0ab4982bc49)) ([#5940](https://github.com/tutur3u/platform/issues/5940)) ([da868c5](https://github.com/tutur3u/platform/commit/da868c5498a18bf0bbbafabb2509aed3c80d039f))
* **meet:** bind shared documents to collaboration ([cf2c962](https://github.com/tutur3u/platform/commit/cf2c962e52fa0f57f843775f4627d80fffa02563)) ([#5934](https://github.com/tutur3u/platform/issues/5934)) ([aedd877](https://github.com/tutur3u/platform/commit/aedd8774ec681ffd9711ee2b9d4988c4c4b799bf))
* **meet:** commit capture leases before admitting operations ([df452d5](https://github.com/tutur3u/platform/commit/df452d55cad587d2eea7b54ad238728972079009))
* **meet:** end empty rooms and allow owner restoration ([2d6f856](https://github.com/tutur3u/platform/commit/2d6f8562511f0264f700003fa9a2a60b0198e2b5)) ([#5924](https://github.com/tutur3u/platform/issues/5924)) ([c5f75c0](https://github.com/tutur3u/platform/commit/c5f75c0f4fa66a0933123b5580ff6bfa69914481))
* **meet:** explain unavailable assistant workspaces ([92441d5](https://github.com/tutur3u/platform/commit/92441d5115f27b572841496e962e15a8c035d4a4)) ([#5986](https://github.com/tutur3u/platform/issues/5986)) ([e3505dc](https://github.com/tutur3u/platform/commit/e3505dc9c1e2534a772c3f7a03c53dc7a3b5fad8))
* **meet:** fence automatic finalizers by capture epoch ([9a7826d](https://github.com/tutur3u/platform/commit/9a7826dcd3fb8d7eb7ec1576bfeddcd06628c864))
* **meet:** fence transcription capture by actor and room scope ([5d8257f](https://github.com/tutur3u/platform/commit/5d8257f8b8cbfd9ff1da640a9ebc4cdbdec8146a))
* **meet:** retry final notes persistence without regeneration ([eab84a6](https://github.com/tutur3u/platform/commit/eab84a64929fb722c8bbaa29087b86d763e236a0))
* **meet:** retry notes persistence without repeating generation ([#5978](https://github.com/tutur3u/platform/issues/5978)) ([d1265f2](https://github.com/tutur3u/platform/commit/d1265f222c0e0cf3d7af85eedc356bdc644d346c))
* **meet:** retry settled transcript persistence ([459bb48](https://github.com/tutur3u/platform/commit/459bb48e87dfc327dc82c011035dbee6c928e30e)) ([#5982](https://github.com/tutur3u/platform/issues/5982)) ([7cfb5d7](https://github.com/tutur3u/platform/commit/7cfb5d71b2a8763034804ffcebc576293c6b8899))
* **meet:** scope transcription capture to committed actor and room ([#5980](https://github.com/tutur3u/platform/issues/5980)) ([1f85042](https://github.com/tutur3u/platform/commit/1f85042bee9d99c9f10fe0f50b046874c3cc2557))
* **meet:** show live document collaborators in toolbar ([d26bf74](https://github.com/tutur3u/platform/commit/d26bf74add981bac864ad7142e51d5ac9f33c43c)) ([#5939](https://github.com/tutur3u/platform/issues/5939)) ([11eac0c](https://github.com/tutur3u/platform/commit/11eac0c3de1cb58fd6824acf16819ef625eae1ae))
* **meet:** stop credit recovery retries and explain AI failures ([6def199](https://github.com/tutur3u/platform/commit/6def199b12e9d2b1a86785ae5a81761604589d7f)) ([#5938](https://github.com/tutur3u/platform/issues/5938)) ([1193fa8](https://github.com/tutur3u/platform/commit/1193fa8304eb0acbd4c19f53479f499280563ddb))
* **meet:** use account identity for assistant workspace admission ([d928646](https://github.com/tutur3u/platform/commit/d928646ddebe6a456f559073a9fc50872773a43e)) ([#5937](https://github.com/tutur3u/platform/issues/5937)) ([6809ba4](https://github.com/tutur3u/platform/commit/6809ba498f045f903f0fc6d0241d8fffa49e1cb3))

## [1.3.0](https://github.com/tutur3u/platform/compare/meet-core-v1.2.1...meet-core-v1.3.0) (2026-10-04)


### Features

* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **identity:** integrate main and order unapplied creator migrations ([5512e24](https://github.com/tutur3u/platform/commit/5512e2414abaa0c78b68cbdd3186a1d4bab861e7))
* **meet:** restore mobile capture and room notifications ([#5721](https://github.com/tutur3u/platform/issues/5721)) ([d116a54](https://github.com/tutur3u/platform/commit/d116a54262fb74da780968d27ee8bbe0245d5812))

## [1.2.1](https://github.com/tutur3u/platform/compare/meet-core-v1.2.0...meet-core-v1.2.1) (2026-09-28)


### Bug Fixes

* **meet:** restore shared call styling and responsive lobby ([cc05c81](https://github.com/tutur3u/platform/commit/cc05c8154bc13c7bbee1945eb1170b4ff2283386)) ([#5591](https://github.com/tutur3u/platform/issues/5591)) ([5bdb763](https://github.com/tutur3u/platform/commit/5bdb763144391742e7dc8faa36d83df352fe868e))

## [1.2.0](https://github.com/tutur3u/platform/compare/meet-core-v1.1.0...meet-core-v1.2.0) (2026-09-26)


### Features

* **parley:** add native scenario admin and session entry points ([3351094](https://github.com/tutur3u/platform/commit/3351094d9f8c269e83b67f24dc20906649b142c1)) ([#5531](https://github.com/tutur3u/platform/issues/5531)) ([88610f7](https://github.com/tutur3u/platform/commit/88610f7834a70e30b4c4b2c5a5f26b1beae1a073))

## [1.1.0](https://github.com/tutur3u/platform/compare/meet-core-v1.0.0...meet-core-v1.1.0) (2026-09-25)


### Features

* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** adopt satellite shell and session reviews ([7746da1](https://github.com/tutur3u/platform/commit/7746da1f380a1d5761e8f813051fe48594d6e30f)) ([#5509](https://github.com/tutur3u/platform/issues/5509)) ([88f36df](https://github.com/tutur3u/platform/commit/88f36df2d1862a30b824aed9b98d880e72f59368))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))


### Bug Fixes

* **parley:** address studio review edge cases ([bddd876](https://github.com/tutur3u/platform/commit/bddd876eef70e86f10f1f070b23fe8b64ab2c5f5))
* **parley:** complete discovery empty states ([b5c962d](https://github.com/tutur3u/platform/commit/b5c962dfd4d1ed7c7f75ddf7329e44ab4d64d1cc))
* **parley:** complete workspace and deployment setup ([52e979f](https://github.com/tutur3u/platform/commit/52e979fef43a447aadf42b7ccf09e9579e0eee37))

## 1.0.0 (2026-09-25)


### Features

* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** adopt satellite shell and session reviews ([7746da1](https://github.com/tutur3u/platform/commit/7746da1f380a1d5761e8f813051fe48594d6e30f)) ([#5509](https://github.com/tutur3u/platform/issues/5509)) ([88f36df](https://github.com/tutur3u/platform/commit/88f36df2d1862a30b824aed9b98d880e72f59368))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))


### Bug Fixes

* **parley:** address studio review edge cases ([bddd876](https://github.com/tutur3u/platform/commit/bddd876eef70e86f10f1f070b23fe8b64ab2c5f5))
* **parley:** complete discovery empty states ([b5c962d](https://github.com/tutur3u/platform/commit/b5c962dfd4d1ed7c7f75ddf7329e44ab4d64d1cc))
* **parley:** complete workspace and deployment setup ([52e979f](https://github.com/tutur3u/platform/commit/52e979fef43a447aadf42b7ccf09e9579e0eee37))
