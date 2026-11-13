# Changelog

## [1.7.0](https://github.com/tutur3u/platform/compare/parley-v1.6.0...parley-v1.7.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **meet:** floating self-preview and calmer ended screen ([#7924](https://github.com/tutur3u/platform/issues/7924)) ([eb8b552](https://github.com/tutur3u/platform/commit/eb8b5528e9e0aa3c2a89c204982378b1fbda540a))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **meet:** gate private Mira on durable participant consent ([#8274](https://github.com/tutur3u/platform/issues/8274)) ([061a566](https://github.com/tutur3u/platform/commit/061a566123e309f9004eb0793cd9a59016924c04))
* **meet:** make Private Mira choices, leave and denials visible ([#8287](https://github.com/tutur3u/platform/issues/8287)) ([aad395d](https://github.com/tutur3u/platform/commit/aad395d94983c82d4623086e269d53f540fbae4e))
* **meet:** prepare transcript readers for erasure markers ([#7517](https://github.com/tutur3u/platform/issues/7517)) ([f35343e](https://github.com/tutur3u/platform/commit/f35343e88998b4748ffe459a86debf26fb6bfb2c))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))

## [1.6.0](https://github.com/tutur3u/platform/compare/parley-v1.5.0...parley-v1.6.0) (2026-11-08)


### Features

* **meet:** default-allow Meet AI with a kill switch ([#7410](https://github.com/tutur3u/platform/issues/7410)) ([a96f160](https://github.com/tutur3u/platform/commit/a96f1609656bed08678af0dd1fb828711af4278a))
* **meet:** gate Meet AI behind a default-deny workspace allowlist ([#7354](https://github.com/tutur3u/platform/issues/7354)) ([c1ec761](https://github.com/tutur3u/platform/commit/c1ec761dedcdd01041e4b6b82f53aa62f001655f))
* **meet:** limit transcript and notes reads to participants and admins ([#7293](https://github.com/tutur3u/platform/issues/7293)) ([ab3216d](https://github.com/tutur3u/platform/commit/ab3216dceaaed5483fa0debd90f091cb9473d06f))
* **meet:** lobby device controls ([#7418](https://github.com/tutur3u/platform/issues/7418)) ([9ecc80f](https://github.com/tutur3u/platform/commit/9ecc80fe6caadd2667213f02679ed77396bbed76))
* **meet:** make the preparing-call screen minimal ([#7449](https://github.com/tutur3u/platform/issues/7449)) ([b003573](https://github.com/tutur3u/platform/commit/b003573eff405c5b3b1e03015e107621785d15c2))
* **meet:** pre-join waiting room UI controls ([e21631d](https://github.com/tutur3u/platform/commit/e21631d74a706f4cfbe8c5900dd577864f2aefc1))
* **tasks:** end sprints from a summary with carry or backlog decisions ([cafc56c](https://github.com/tutur3u/platform/commit/cafc56c3a7590bb000ffd7625022f97a5fee1a59)) ([#7089](https://github.com/tutur3u/platform/issues/7089)) ([6596ff5](https://github.com/tutur3u/platform/commit/6596ff54da29eaebd5c13338223330b30479de2b))
* **tasks:** plan the next sprint from a Plan tab ([457c109](https://github.com/tutur3u/platform/commit/457c10949a77eb7d0494a4d0fad728249d45a9e2)) ([#7088](https://github.com/tutur3u/platform/issues/7088)) ([02844d7](https://github.com/tutur3u/platform/commit/02844d7084d83571607a67c8790cc6b75dacb619))
* **tasks:** plan up to five sprints ahead and park tasks outside sprints ([#7224](https://github.com/tutur3u/platform/issues/7224)) ([d114c02](https://github.com/tutur3u/platform/commit/d114c02b0f4ea11bb41ea68c057d9d50bf1abf1e))
* **tasks:** show the board's sprint in the header and Board view ([9d91b1a](https://github.com/tutur3u/platform/commit/9d91b1aae612b205f723542b02d7e43a51a0862e)) ([#7046](https://github.com/tutur3u/platform/issues/7046)) ([f3f31bd](https://github.com/tutur3u/platform/commit/f3f31bde4003f4db9b70f154619eb665a2df5597))
* **tasks:** show the task's sprint in the task panel ([#7108](https://github.com/tutur3u/platform/issues/7108)) ([978e783](https://github.com/tutur3u/platform/commit/978e7839909bfee471a304e942705f733f215421))
* **tasks:** simplify sprint planning, summary and board filtering ([#7396](https://github.com/tutur3u/platform/issues/7396)) ([9d45884](https://github.com/tutur3u/platform/commit/9d458840f0064f6c37e43da5d4fca3bccd4fa88c))
* **tasks:** two-row board header with people, project and focus filters ([8d53440](https://github.com/tutur3u/platform/commit/8d53440a1a2f08b1f1632558bb8e480e5d2bac32)) ([#7042](https://github.com/tutur3u/platform/issues/7042)) ([b48007d](https://github.com/tutur3u/platform/commit/b48007d34f18a714a2d6379273850d813c959998))


### Bug Fixes

* **meet:** format the lobby roster overflow as one ICU message ([39f3079](https://github.com/tutur3u/platform/commit/39f3079213692171d356479c41660295e8758a20))
* **meet:** use "micro" consistently in new vi lobby copy ([17747ce](https://github.com/tutur3u/platform/commit/17747ce14c8f5c332658869ff17b9624c7de805e))
* **release:** preserve cycle compatibility and publication holds ([#7779](https://github.com/tutur3u/platform/issues/7779)) ([ee6e298](https://github.com/tutur3u/platform/commit/ee6e298f623857f543dd74aa7f7d47bb9b0471bf))
* **tasks:** pluralize the per-person task totals in the sprint summary ([5ad85ec](https://github.com/tutur3u/platform/commit/5ad85ec2eded60fa0016bae84eaf034d243a874d))
* **tasks:** trash a new backlog task that cannot leave the running sprint ([d2aa74c](https://github.com/tutur3u/platform/commit/d2aa74c748b56969024ab49d990bd856d95687e4))
* **tasks:** wait for the sprint's tasks before allowing End ([5b61c32](https://github.com/tutur3u/platform/commit/5b61c329e87a8bfa46f58678d005f9485693e35a))

## [1.5.0](https://github.com/tutur3u/platform/compare/parley-v1.4.1...parley-v1.5.0) (2026-10-24)


### Features

* **satellite:** shared account, profile and security settings in every app ([#6477](https://github.com/tutur3u/platform/issues/6477)) ([2cd0879](https://github.com/tutur3u/platform/commit/2cd087939043a1dd91d1bfecee3337e4122badae))


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))

## [1.4.1](https://github.com/tutur3u/platform/compare/parley-v1.4.0...parley-v1.4.1) (2026-10-17)


### Bug Fixes

* **meet:** reconcile landed Lettin adapter integration ([629cf21](https://github.com/tutur3u/platform/commit/629cf21338d7e4898cc3d512c93ea50447156306))
* **meet:** repair Worker login and build-info initialization ([#6296](https://github.com/tutur3u/platform/issues/6296)) ([aca23da](https://github.com/tutur3u/platform/commit/aca23da2f266567a3473fa7906a679172fe44415))
* **meet:** use workerd-compatible OpenNext runtime ([0fa685f](https://github.com/tutur3u/platform/commit/0fa685f2f57b4ed1963109ff44d425e992d04b24))
* **release:** reconcile production history before Contacts rollout ([dc017a2](https://github.com/tutur3u/platform/commit/dc017a227de6f284268b34690198972c06c52434)) ([#6241](https://github.com/tutur3u/platform/issues/6241)) ([66654a5](https://github.com/tutur3u/platform/commit/66654a5d7ad441a93070d1502f267d6d4e08a6cd))

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
