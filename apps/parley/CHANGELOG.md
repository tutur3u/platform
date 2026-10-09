# Changelog

## [1.4.0](https://github.com/tutur3u/platform/compare/parley-v1.3.0...parley-v1.4.0) (2026-10-09)


### Features

* **docs:** expand platform guides and enforce app SEO and runtime pause ([e79cb7e](https://github.com/tutur3u/platform/commit/e79cb7e96c7db4d1baedb09b7420ca41b75e367f))
* **docs:** expand platform guides, enforce SEO, and pause inactive runtimes ([#6085](https://github.com/tutur3u/platform/issues/6085)) ([df7a159](https://github.com/tutur3u/platform/commit/df7a159e9c657fee4f6e0b593c776d6887b2ae11))
* **meet:** keep participant media visible alongside collaboration ([0f684f7](https://github.com/tutur3u/platform/commit/0f684f78f93e1b7f5f1961c8520b8f93b8e60659)) ([#5935](https://github.com/tutur3u/platform/issues/5935)) ([bcdd4da](https://github.com/tutur3u/platform/commit/bcdd4daf1f1a11d5ade99c015aca2eae69d61a63))
* **meet:** simplify the in-call document toolbar ([6020a1e](https://github.com/tutur3u/platform/commit/6020a1eddfc4f8cab9179daf1feb126f9dfc0501)) ([#5918](https://github.com/tutur3u/platform/issues/5918)) ([fa358e7](https://github.com/tutur3u/platform/commit/fa358e76517e5bc9793caf72658738d9bf2b42d6))


### Bug Fixes

* **finance:** bound subscription schedules and block invalid inventory ([f4163bf](https://github.com/tutur3u/platform/commit/f4163bf6697316a06a8b2d3922d9664937dd6940)) ([#5990](https://github.com/tutur3u/platform/issues/5990)) ([f2096f6](https://github.com/tutur3u/platform/commit/f2096f6e20d27dd998a03d11c7b0769d7f06bb2e))
* **finance:** expose safe invoice history recovery ([8a53d36](https://github.com/tutur3u/platform/commit/8a53d367d6888e592a0d64f760d47234d858bd73)) ([#6034](https://github.com/tutur3u/platform/issues/6034)) ([fd65a3d](https://github.com/tutur3u/platform/commit/fd65a3db6f7472771374192ab07f5a97c6fcaee8))
* **finance:** reconcile attendance summary with current main ([fb00e6e](https://github.com/tutur3u/platform/commit/fb00e6ef4373adc1b6b9107f9bba883c101c3438))
* **meet:** end empty rooms and allow owner restoration ([2d6f856](https://github.com/tutur3u/platform/commit/2d6f8562511f0264f700003fa9a2a60b0198e2b5)) ([#5924](https://github.com/tutur3u/platform/issues/5924)) ([c5f75c0](https://github.com/tutur3u/platform/commit/c5f75c0f4fa66a0933123b5580ff6bfa69914481))
* **meet:** explain unavailable assistant workspaces ([92441d5](https://github.com/tutur3u/platform/commit/92441d5115f27b572841496e962e15a8c035d4a4)) ([#5986](https://github.com/tutur3u/platform/issues/5986)) ([e3505dc](https://github.com/tutur3u/platform/commit/e3505dc9c1e2534a772c3f7a03c53dc7a3b5fad8))
* **meet:** stop credit recovery retries and explain AI failures ([6def199](https://github.com/tutur3u/platform/commit/6def199b12e9d2b1a86785ae5a81761604589d7f)) ([#5938](https://github.com/tutur3u/platform/issues/5938)) ([1193fa8](https://github.com/tutur3u/platform/commit/1193fa8304eb0acbd4c19f53479f499280563ddb))

## [1.3.0](https://github.com/tutur3u/platform/compare/parley-v1.2.0...parley-v1.3.0) (2026-10-04)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))

## [1.2.0](https://github.com/tutur3u/platform/compare/parley-v1.1.0...parley-v1.2.0) (2026-09-26)


### Features

* **parley:** add native scenario admin and session entry points ([3351094](https://github.com/tutur3u/platform/commit/3351094d9f8c269e83b67f24dc20906649b142c1)) ([#5531](https://github.com/tutur3u/platform/issues/5531)) ([88610f7](https://github.com/tutur3u/platform/commit/88610f7834a70e30b4c4b2c5a5f26b1beae1a073))


### Bug Fixes

* **parley:** handle admin lookup and scenario authoring edge cases ([647cb0f](https://github.com/tutur3u/platform/commit/647cb0f33a7b5d5a5c217fa344bc8dd5a7e99d2f))

## [1.1.0](https://github.com/tutur3u/platform/compare/parley-v1.0.0...parley-v1.1.0) (2026-09-25)


### Features

* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** adopt satellite shell and session reviews ([7746da1](https://github.com/tutur3u/platform/commit/7746da1f380a1d5761e8f813051fe48594d6e30f)) ([#5509](https://github.com/tutur3u/platform/issues/5509)) ([88f36df](https://github.com/tutur3u/platform/commit/88f36df2d1862a30b824aed9b98d880e72f59368))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))


### Bug Fixes

* **parley:** address studio review edge cases ([bddd876](https://github.com/tutur3u/platform/commit/bddd876eef70e86f10f1f070b23fe8b64ab2c5f5))
* **parley:** complete discovery empty states ([b5c962d](https://github.com/tutur3u/platform/commit/b5c962dfd4d1ed7c7f75ddf7329e44ab4d64d1cc))
* **parley:** complete workspace and deployment setup ([52e979f](https://github.com/tutur3u/platform/commit/52e979fef43a447aadf42b7ccf09e9579e0eee37))
* **parley:** preserve shared cookies during browser cleanup ([#5518](https://github.com/tutur3u/platform/issues/5518)) ([96718c0](https://github.com/tutur3u/platform/commit/96718c0af2fca90bc2da48d26ca2cbe2a75fbefd))
* **parley:** retain verified shared cookies during host cleanup ([7888782](https://github.com/tutur3u/platform/commit/7888782a14c82a2b4dada5ea8aafa35fe91fcaf7))

## 1.0.0 (2026-09-25)


### Features

* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** adopt satellite shell and session reviews ([7746da1](https://github.com/tutur3u/platform/commit/7746da1f380a1d5761e8f813051fe48594d6e30f)) ([#5509](https://github.com/tutur3u/platform/issues/5509)) ([88f36df](https://github.com/tutur3u/platform/commit/88f36df2d1862a30b824aed9b98d880e72f59368))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))


### Bug Fixes

* **parley:** address studio review edge cases ([bddd876](https://github.com/tutur3u/platform/commit/bddd876eef70e86f10f1f070b23fe8b64ab2c5f5))
* **parley:** complete discovery empty states ([b5c962d](https://github.com/tutur3u/platform/commit/b5c962dfd4d1ed7c7f75ddf7329e44ab4d64d1cc))
* **parley:** complete workspace and deployment setup ([52e979f](https://github.com/tutur3u/platform/commit/52e979fef43a447aadf42b7ccf09e9579e0eee37))
* **parley:** preserve shared cookies during browser cleanup ([#5518](https://github.com/tutur3u/platform/issues/5518)) ([96718c0](https://github.com/tutur3u/platform/commit/96718c0af2fca90bc2da48d26ca2cbe2a75fbefd))
* **parley:** retain verified shared cookies during host cleanup ([7888782](https://github.com/tutur3u/platform/commit/7888782a14c82a2b4dada5ea8aafa35fe91fcaf7))
