# Changelog

## [0.8.0](https://github.com/tutur3u/platform/compare/auth-v0.7.0...auth-v0.8.0) (2026-10-30)


### Features

* **auth:** add a framework-free CSRF check in report mode ([#6847](https://github.com/tutur3u/platform/issues/6847)) ([23ce8a3](https://github.com/tutur3u/platform/commit/23ce8a3c18dd293d76ba60051216a49e5ecc15a3))
* **finance:** brand reconciliation money and test token bounds ([#6873](https://github.com/tutur3u/platform/issues/6873)) ([63417bb](https://github.com/tutur3u/platform/commit/63417bb06522ed9c64cc6ecc06cb0a9a881a88e2))


### Bug Fixes

* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** revoke cross-app tokens on logout and password change ([#6839](https://github.com/tutur3u/platform/issues/6839)) ([091c3dd](https://github.com/tutur3u/platform/commit/091c3dda067db3e8c3459b041dcb2a5b4f85bd2e))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **e2e:** collect Playwright specs and keep shared localhost sessions ([#7163](https://github.com/tutur3u/platform/issues/7163)) ([35b2963](https://github.com/tutur3u/platform/commit/35b2963c77ddc5207f6fa778f9d40dc997af2a50))


### Performance Improvements

* **auth:** verify the request user once across refresh, guard and MFA ([#7153](https://github.com/tutur3u/platform/issues/7153)) ([959206e](https://github.com/tutur3u/platform/commit/959206efa1b1b686c75a1d17eade931519e8729f))

## [0.7.0](https://github.com/tutur3u/platform/compare/auth-v0.6.0...auth-v0.7.0) (2026-10-17)


### Features

* **cli:** register private feedback commands ([a1d9c87](https://github.com/tutur3u/platform/commit/a1d9c875ce918be676d184e036d7210c6785c46d))
* **infrastructure:** add employee creation HTTP boundary ([688a0b2](https://github.com/tutur3u/platform/commit/688a0b261d55996c8d86ff27f76f539cf42a7109))
* **infrastructure:** reconcile employee creation orchestration ([9356a36](https://github.com/tutur3u/platform/commit/9356a36872910c28552f494e75c3f89dc79cb543))
* **infrastructure:** reconcile employee restoration HTTP boundary ([7bbcb3b](https://github.com/tutur3u/platform/commit/7bbcb3bc2feab4c8f652f808a6921da92cf7d4bd))
* **infrastructure:** reconcile employee restoration orchestration ([862d22d](https://github.com/tutur3u/platform/commit/862d22dfbfb19c871bb3ecebcc2a4998902d1567))
* **mail:** reconcile connected accounts with main ([3e2eae1](https://github.com/tutur3u/platform/commit/3e2eae1e93d8f03bf6425055f51453a1061aaada))
* **reports:** reconcile feedback consumer with current main ([e6775b1](https://github.com/tutur3u/platform/commit/e6775b16698e08407a8de89984d1ab964ecea098))
* **supabase:** support scoped server Auth construction ([eec9ea8](https://github.com/tutur3u/platform/commit/eec9ea87c3180c9a4b358705b0c8365e74a46a1a))


### Bug Fixes

* **cli:** require explicit private feedback content opt-in ([32165bd](https://github.com/tutur3u/platform/commit/32165bd7b59721ee7780933f035a61c7f43a88d6))
* **feedback:** qualify bounded staff operation lifetimes ([5d338b1](https://github.com/tutur3u/platform/commit/5d338b1d0417df51870e37464581a06f6a57deb0))
* **feedback:** qualify scoped staff auth transport ([1c5e796](https://github.com/tutur3u/platform/commit/1c5e79691e53eeab19279167f506d1e061e3f652))
* **feedback:** qualify staff reads and contain flag faults ([fb7a4de](https://github.com/tutur3u/platform/commit/fb7a4de29233219f9ba8dbd38f99ac68ab413868))
* **feedback:** require own eligibility key and reconcile main ([fe21bd4](https://github.com/tutur3u/platform/commit/fe21bd4bf290bbc5f2dc50383f07a1ad27d11419))
* **internal-api:** reconcile employee clients with main ([ca3533c](https://github.com/tutur3u/platform/commit/ca3533c0d2918aa94574f0b9474d23e72b86d71d))
* **internal-api:** reconcile shared feedback clients with main ([d49d9e9](https://github.com/tutur3u/platform/commit/d49d9e9b431beba6e13171881ec9dd706921b708))
* reconcile external project storage analytics with main ([573f414](https://github.com/tutur3u/platform/commit/573f414522a1e77c657cb7b54a43331d1b06922b))
* **reports:** reconcile feedback evidence foundation with main ([33c04b9](https://github.com/tutur3u/platform/commit/33c04b9e5e71196c5e9b4a56720578c9b564927a))

## [0.6.0](https://github.com/tutur3u/platform/compare/auth-v0.5.0...auth-v0.6.0) (2026-09-25)


### Features

* **auth:** add trusted mobile authenticators and login approvals ([55e4d79](https://github.com/tutur3u/platform/commit/55e4d792bde2c543c3be8204a980fa99069527e4))
* **auth:** enforce required account MFA lifecycle ([e08f27d](https://github.com/tutur3u/platform/commit/e08f27dbc082f7d9c951bb0792357638f3dcfb0a)) ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))
* **auth:** trusted mobile authenticators and desktop login approvals ([#5400](https://github.com/tutur3u/platform/issues/5400)) ([4e9e9d2](https://github.com/tutur3u/platform/commit/4e9e9d20fd6a65c07b9f83008ef5ccd7c4d60d7f))


### Bug Fixes

* **auth:** identify cross-app verification requests ([4165eda](https://github.com/tutur3u/platform/commit/4165edaf6460b0f884d8b0984a1f5ac6dd213e34)) ([#5435](https://github.com/tutur3u/platform/issues/5435)) ([570c849](https://github.com/tutur3u/platform/commit/570c84905a02f9b17d7df1255357c554c921395f))
* **auth:** resolve proxy sessions from explicit request cookies ([aa26f80](https://github.com/tutur3u/platform/commit/aa26f808ba00850c57a94024c229b39dbb014960)) ([#5516](https://github.com/tutur3u/platform/issues/5516)) ([856a8d7](https://github.com/tutur3u/platform/commit/856a8d7c179a35da68882230859609a1ee71d010))

## [0.5.0](https://github.com/tutur3u/platform/compare/auth-v0.4.1...auth-v0.5.0) (2026-09-25)


### Features

* **auth:** enforce required account MFA lifecycle ([e08f27d](https://github.com/tutur3u/platform/commit/e08f27dbc082f7d9c951bb0792357638f3dcfb0a)) ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))


### Bug Fixes

* **auth:** resolve proxy sessions from explicit request cookies ([aa26f80](https://github.com/tutur3u/platform/commit/aa26f808ba00850c57a94024c229b39dbb014960)) ([#5516](https://github.com/tutur3u/platform/issues/5516)) ([856a8d7](https://github.com/tutur3u/platform/commit/856a8d7c179a35da68882230859609a1ee71d010))

## [0.4.1](https://github.com/tutur3u/platform/compare/auth-v0.4.0...auth-v0.4.1) (2026-09-23)


### Bug Fixes

* **auth:** identify cross-app verification requests ([4165eda](https://github.com/tutur3u/platform/commit/4165edaf6460b0f884d8b0984a1f5ac6dd213e34)) ([#5435](https://github.com/tutur3u/platform/issues/5435)) ([570c849](https://github.com/tutur3u/platform/commit/570c84905a02f9b17d7df1255357c554c921395f))

## [0.4.0](https://github.com/tutur3u/platform/compare/auth-v0.3.4...auth-v0.4.0) (2026-09-20)


### Features

* **auth:** add trusted mobile authenticators and login approvals ([55e4d79](https://github.com/tutur3u/platform/commit/55e4d792bde2c543c3be8204a980fa99069527e4))
* **auth:** trusted mobile authenticators and desktop login approvals ([#5400](https://github.com/tutur3u/platform/issues/5400)) ([4e9e9d2](https://github.com/tutur3u/platform/commit/4e9e9d20fd6a65c07b9f83008ef5ccd7c4d60d7f))


### Bug Fixes

* **deps:** align React types and published consumer ranges ([3612cd8](https://github.com/tutur3u/platform/commit/3612cd81723fb5a6982152688227ed21bc4095fd))
* **deps:** preserve React peer compatibility and clarify audit ([777b9ed](https://github.com/tutur3u/platform/commit/777b9ed7f42095bb9361e6bed94d989310c222de))

## [0.3.4](https://github.com/tutur3u/platform/compare/auth-v0.3.3...auth-v0.3.4) (2026-09-09)


### Bug Fixes

* **meet:** persist participant releases before notifying clients ([ac6989c](https://github.com/tutur3u/platform/commit/ac6989c78edbca1b28cadbafade54d7eb1f4e529))
* **meet:** preserve retained chat and safe reconnect state ([01f744c](https://github.com/tutur3u/platform/commit/01f744cb9b7083ed6976d1f20615c64b7b5c44c2))
* **meet:** recover invitations transcription and signaling ([94668ce](https://github.com/tutur3u/platform/commit/94668cef9b452eb67cbad63ff618307c1a4b306a))
* **meet:** recover invitations, transcription, and reconnects ([#5284](https://github.com/tutur3u/platform/issues/5284)) ([b65d3c0](https://github.com/tutur3u/platform/commit/b65d3c02dbdd1ad2477c400924fdad0a3b83347e))
* **meet:** retain reconnect state and cancel abandoned recovery ([9acbe9f](https://github.com/tutur3u/platform/commit/9acbe9fe3b1053018c4ebbbadb2260753dd2ee37))

## [0.3.3](https://github.com/tutur3u/platform/compare/auth-v0.3.2...auth-v0.3.3) (2026-09-04)


### Performance Improvements

* **auth:** index API key prefixes ([#5206](https://github.com/tutur3u/platform/issues/5206)) ([2a343d9](https://github.com/tutur3u/platform/commit/2a343d929b4a1e3cca3843a1da2f56725e1570c1))

## [0.3.2](https://github.com/tutur3u/platform/compare/auth-v0.3.1...auth-v0.3.2) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))

## [0.3.1](https://github.com/tutur3u/platform/compare/auth-v0.3.0...auth-v0.3.1) (2026-07-27)


### Bug Fixes

* **ai:** prevent satellite auth loops ([80f264c](https://github.com/tutur3u/platform/commit/80f264cc91e1709a96148f203ab12bca8a8e392b))

## [0.3.0](https://github.com/tutur3u/platform/compare/auth-v0.2.5...auth-v0.3.0) (2026-07-25)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))

## [0.2.5](https://github.com/tutur3u/platform/compare/auth-v0.2.4...auth-v0.2.5) (2026-07-18)


### Bug Fixes

* **mobile:** restore tasks bearer access ([2aedf84](https://github.com/tutur3u/platform/commit/2aedf8439f6d989ebf9bb69f83f74f1b25e5b06e))

## [0.2.4](https://github.com/tutur3u/platform/compare/auth-v0.2.3...auth-v0.2.4) (2026-07-03)


### Bug Fixes

* **infrastructure:** restore canonical auth host access ([9f6715f](https://github.com/tutur3u/platform/commit/9f6715fb1c5a89598556cba33b16938b76995fc6))

## [0.2.3](https://github.com/tutur3u/platform/compare/auth-v0.2.2...auth-v0.2.3) (2026-06-17)


### Bug Fixes

* **auth:** consume external app refresh tokens ([7f5a4ab](https://github.com/tutur3u/platform/commit/7f5a4ab250214018ca34e61b7084fd55865c17bc))
* **auth:** enforce MFA for satellite Supabase sessions ([fff184e](https://github.com/tutur3u/platform/commit/fff184e754326fd3b91dac3e68263795aa386325))
* **auth:** reject unsafe verify-token redirects ([1a1db96](https://github.com/tutur3u/platform/commit/1a1db960b0570af7f311afe25a62a24515b4a188))
* **auth:** restrict Portless return ports ([7977bfc](https://github.com/tutur3u/platform/commit/7977bfc074a211a20b3bf133fe78cf94ff8c1d33))

## [0.2.2](https://github.com/tutur3u/platform/compare/auth-v0.2.1...auth-v0.2.2) (2026-06-13)


### Bug Fixes

* **auth:** allow local portless e2e auth ([928da7d](https://github.com/tutur3u/platform/commit/928da7d75ff72298bd1f0d2af6872e951decae3b))

## [0.2.1](https://github.com/tutur3u/platform/compare/auth-v0.2.0...auth-v0.2.1) (2026-06-10)


### Bug Fixes

* **chat:** harden production auth handoff ([8d2ba61](https://github.com/tutur3u/platform/commit/8d2ba61d817bb98f8b4b5880ea8ac802006e4a51))

## [0.2.0](https://github.com/tutur3u/platform/compare/auth-v0.1.1...auth-v0.2.0) (2026-06-08)


### Features

* **auth:** share Supabase cookies across apps ([f72ec8e](https://github.com/tutur3u/platform/commit/f72ec8e7a35f13a301b95b2aa916aefbc5848e6e))


### Bug Fixes

* **auth:** clear duplicate shared supabase cookies ([32fbd04](https://github.com/tutur3u/platform/commit/32fbd046a30fadba98eba278107c334aafcd7bde))
* **auth:** preserve satellite Supabase sessions ([a8b49bb](https://github.com/tutur3u/platform/commit/a8b49bb2d29f42b4a0267aadd5d2e2fd1074aeab))
* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))
* **auth:** support supabase-first satellite sessions ([b014fcf](https://github.com/tutur3u/platform/commit/b014fcf6db8218a1b54fd79f5e13629f66cad090))
* **ci:** unblock e2e docker builds ([7a09469](https://github.com/tutur3u/platform/commit/7a09469822261d1b82e07d969c4e61885a54d5f6))

## [0.1.1](https://github.com/tutur3u/platform/compare/auth-v0.1.0...auth-v0.1.1) (2026-06-03)


### Bug Fixes

* **auth:** normalize satellite login redirects ([fbf45da](https://github.com/tutur3u/platform/commit/fbf45dab3dc03397aa5eb225e1ba913905e94d9f))
* **auth:** require refresh tokens for cross-app refresh ([debfd34](https://github.com/tutur3u/platform/commit/debfd348484414e36ec330d61ce3ea1f3174fe4f))
