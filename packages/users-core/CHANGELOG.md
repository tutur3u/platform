# Changelog

## [0.9.0](https://github.com/tutur3u/platform/compare/users-core-v0.8.2...users-core-v0.9.0) (2026-09-12)


### Features

* **contacts:** familiar report statuses and branded monthly emails ([#5309](https://github.com/tutur3u/platform/issues/5309)) ([88d74a8](https://github.com/tutur3u/platform/commit/88d74a828ce4deb2047906c66452d17ae50e7b61))
* **contacts:** track and automate approved report delivery ([5a73577](https://github.com/tutur3u/platform/commit/5a73577fd404f223d025f88daa04b16002a11e81))
* **contacts:** track and automate approved report delivery ([#5300](https://github.com/tutur3u/platform/issues/5300)) ([b69c22f](https://github.com/tutur3u/platform/commit/b69c22f433df8a1aa7cea18b538c1a3016582b9e))
* **contacts:** unify report status UX and branded email previews ([8d464ab](https://github.com/tutur3u/platform/commit/8d464ab47c3297b9846f5d768581a7091704f3a8))


### Bug Fixes

* **contacts:** handle report migration rollout gracefully ([d058163](https://github.com/tutur3u/platform/commit/d05816394d67265862f002be9abc24779f3f2190))
* **contacts:** harden delivery action boundaries ([1b2969d](https://github.com/tutur3u/platform/commit/1b2969d74d92f2b981610b5665c7255f90742904))
* **contacts:** make report delivery transitions atomic ([72cffb9](https://github.com/tutur3u/platform/commit/72cffb94ac34702bd9f53fa055209c575c967829))
* **contacts:** preserve cancellation on delivery retries ([2c84cda](https://github.com/tutur3u/platform/commit/2c84cdae2288d49ca3b2952f44e23911e44f12a0))
* **contacts:** serialize approval and delivery requests safely ([caafe51](https://github.com/tutur3u/platform/commit/caafe517131bfa8693f46ae41f27b34fc3d3f129))
* **contacts:** unify report stages and skip legacy unsent reports ([0f7fce8](https://github.com/tutur3u/platform/commit/0f7fce8cd1841f777ba18db6e335946ed2fb80bb))
* **contacts:** unify report stages and skip legacy unsent reports ([#5322](https://github.com/tutur3u/platform/issues/5322)) ([dd9dc1b](https://github.com/tutur3u/platform/commit/dd9dc1bfd3ca6d1ddb113105381387c9f690137e))
* **finance:** complete invoice loading recovery ([5f4cd04](https://github.com/tutur3u/platform/commit/5f4cd049ab462e774d09c7060878bdedda164d12))
* **finance:** recover stalled invoice loading ([#5310](https://github.com/tutur3u/platform/issues/5310)) ([a5c6a37](https://github.com/tutur3u/platform/commit/a5c6a3765008e1fb503d6e2ceadec9c43b1e23e5))
* **reports:** clarify delivery and streamline review filters ([b790cb3](https://github.com/tutur3u/platform/commit/b790cb38e48cf7429a698d6360977e35a9aa2617))
* **reports:** clarify delivery and streamline review filters ([#5314](https://github.com/tutur3u/platform/issues/5314)) ([e9af5a5](https://github.com/tutur3u/platform/commit/e9af5a58f0c133764e91c745b183eae24e512270))
* **reports:** clarify delivery states and protect active sends ([e8396f2](https://github.com/tutur3u/platform/commit/e8396f269a42703aac3852c1b86ff2299324819e))
* **reports:** expose draft filters and freeze approval metadata ([58469b2](https://github.com/tutur3u/platform/commit/58469b2092d975deaf4d140cf2a8766bafb1e5da))
* **reports:** guard skipped deliveries and share stage metadata ([9744b3e](https://github.com/tutur3u/platform/commit/9744b3e8315ff70596a811fad42742dcdcbfc809))
* **reports:** retain exact smart-search pagination totals ([67ef0b9](https://github.com/tutur3u/platform/commit/67ef0b9b1e199b4f4095107a021fdae0af1924a4))
* **reports:** retain exact smart-search pagination totals ([#5312](https://github.com/tutur3u/platform/issues/5312)) ([fe8f826](https://github.com/tutur3u/platform/commit/fe8f82699581ce2aa0b2cee9962c3bde7fa48ca8))
* **reports:** validate filters and legacy approval states ([d86bd68](https://github.com/tutur3u/platform/commit/d86bd6814986895962fc72dec7dee89570c9269b))

## [0.8.2](https://github.com/tutur3u/platform/compare/users-core-v0.8.1...users-core-v0.8.2) (2026-09-02)


### Bug Fixes

* **contacts:** address review findings on the tutoring gate work ([fc86e08](https://github.com/tutur3u/platform/commit/fc86e08e6cbe62c8b933596f0cf56fa580221ded))
* **contacts:** replace module 404s with an actionable availability gate ([d49bef9](https://github.com/tutur3u/platform/commit/d49bef97e0047fff6c8322c19fef66932b25f4a8))
* **contacts:** replace module 404s with an actionable availability gate ([#5179](https://github.com/tutur3u/platform/issues/5179)) ([2427785](https://github.com/tutur3u/platform/commit/24277858ed8ce38c17b3e79413c7f81c98008eb7))

## [0.8.1](https://github.com/tutur3u/platform/compare/users-core-v0.8.0...users-core-v0.8.1) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))

## [0.8.0](https://github.com/tutur3u/platform/compare/users-core-v0.7.3...users-core-v0.8.0) (2026-08-15)


### Features

* **contacts:** add smart report search ([579b6d5](https://github.com/tutur3u/platform/commit/579b6d5ce501386608079b4998d4456cdacfd9e8))


### Bug Fixes

* **contacts:** restore invited member data access ([9a1e079](https://github.com/tutur3u/platform/commit/9a1e079881e72529330203582dcfc4d0a8c509c4))

## [0.7.3](https://github.com/tutur3u/platform/compare/users-core-v0.7.2...users-core-v0.7.3) (2026-08-14)


### Bug Fixes

* **contacts:** harden satellite workspace access ([b160723](https://github.com/tutur3u/platform/commit/b160723b509062a4f8edf2694c0af27c25c05775))
* **contacts:** preserve teacher report feedback ([a4fc9d4](https://github.com/tutur3u/platform/commit/a4fc9d4c0b86b6bcc06614495f278da7208c9251))
* **workspaces:** restore invited member access ([f81bd3e](https://github.com/tutur3u/platform/commit/f81bd3e912179636f002eda5f6b4e16504cff782))

## [0.7.2](https://github.com/tutur3u/platform/compare/users-core-v0.7.1...users-core-v0.7.2) (2026-08-11)


### Bug Fixes

* **contacts:** authorize user group tags ([0773c3c](https://github.com/tutur3u/platform/commit/0773c3ce2ff80e446cccb6f67a5af39f58373ded))
* **users:** authorize group indicator updates ([9461142](https://github.com/tutur3u/platform/commit/9461142c04b0ea84445498897cf7bf9e1d5f54db))

## [0.7.1](https://github.com/tutur3u/platform/compare/users-core-v0.7.0...users-core-v0.7.1) (2026-08-04)


### Bug Fixes

* **contacts:** improve class scheduling and attendance ([3bc9ef4](https://github.com/tutur3u/platform/commit/3bc9ef4f7af9cacefaa021d694b6f1afbf2a8e0b))

## [0.7.0](https://github.com/tutur3u/platform/compare/users-core-v0.6.0...users-core-v0.7.0) (2026-07-27)


### Features

* **contacts:** migrate reports + groups and complete the users cutover ([2ee89cd](https://github.com/tutur3u/platform/commit/2ee89cd2257c2a9824df53d4be99436416d85c13))
* **contacts:** migrate users approvals module, extracting shared parts to packages ([e66ae32](https://github.com/tutur3u/platform/commit/e66ae326f89bec7e43ef9bbd3650dbf2f8b41814))
* **contacts:** migrate users/database UI into apps/contacts ([d3aa461](https://github.com/tutur3u/platform/commit/d3aa461cea536f80428536b13be1232d277cd5c3))
* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **contacts:** refine report review experience ([0dd3247](https://github.com/tutur3u/platform/commit/0dd3247f5c9e170d58d5cd94a0fbb3a74d9a4f9e))
* **contacts:** serve notifications locally ([0fd7a89](https://github.com/tutur3u/platform/commit/0fd7a89f8bf15e6cd8146382d5b659cceed84751))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** resolve biome format + empty-package test failures on main ([e1520a0](https://github.com/tutur3u/platform/commit/e1520a064c7a751cb3f7fc940f78abad0b5aea73))
* **contacts:** authenticate users database requests ([54ddc74](https://github.com/tutur3u/platform/commit/54ddc741b9833ca835ce13adabb196aabff78fb8))
* **contacts:** consolidate manager profiles ([69529a3](https://github.com/tutur3u/platform/commit/69529a30cb276ea31d7fa191a823bb9949751058))
* **contacts:** own post approval APIs ([632aa32](https://github.com/tutur3u/platform/commit/632aa322fae28d43c39d63e2d033189065735376))
* **contacts:** own settings and profile APIs ([d809fe0](https://github.com/tutur3u/platform/commit/d809fe00699f7837b1ac829e5f8b92491e5f822c))
* **contacts:** own workspace user mutations ([21ab1fb](https://github.com/tutur3u/platform/commit/21ab1fbbf5cf6e2a06274dbfba2616aac1f0e481))
* **contacts:** repair approval detail dialog ([a948ea2](https://github.com/tutur3u/platform/commit/a948ea2be85906cec81e9484acc041b7b637a351))
* **contacts:** resolve group API app sessions locally ([30a8917](https://github.com/tutur3u/platform/commit/30a8917c1d2cfd6ddccbbbb44ccad8c9199fef33))
* **contacts:** restore audit log exports ([4bae50b](https://github.com/tutur3u/platform/commit/4bae50b7b560d3af5fa4b1af42c83db1d0987f02))
* **contacts:** restore coupon discovery ([cb7dfea](https://github.com/tutur3u/platform/commit/cb7dfea49da9f72e18321f60d7e95c7f056fbea4))
* **contacts:** restore group and report operations ([8760868](https://github.com/tutur3u/platform/commit/8760868f3b5a721b0e2712a964fb5ec71ec14048))
* **contacts:** restore group post mutations ([fe621e4](https://github.com/tutur3u/platform/commit/fe621e4d7e4126f705082cc3e815aafdeebe535a))
* **contacts:** restore user group and report mutations ([0f3f12d](https://github.com/tutur3u/platform/commit/0f3f12d5291b3a2d3635fc3bde193cbe5f3e8052))
* **contacts:** restore workspace posts ([df08eae](https://github.com/tutur3u/platform/commit/df08eae5334a55412bceb994a878d7c3a53d752e))
* **reports:** scale delivery maintenance and report counts ([4dd4f47](https://github.com/tutur3u/platform/commit/4dd4f47dfff4bafa1ef512311eec16a6fbadc964))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))


### Performance Improvements

* **contacts:** accelerate virtual user listing ([8d0b86c](https://github.com/tutur3u/platform/commit/8d0b86c46f7045b2e7475d2e6211dc0cc2ebb6ab))

## [0.6.0](https://github.com/tutur3u/platform/compare/users-core-v0.5.1...users-core-v0.6.0) (2026-07-27)


### Features

* **contacts:** migrate reports + groups and complete the users cutover ([2ee89cd](https://github.com/tutur3u/platform/commit/2ee89cd2257c2a9824df53d4be99436416d85c13))
* **contacts:** migrate users approvals module, extracting shared parts to packages ([e66ae32](https://github.com/tutur3u/platform/commit/e66ae326f89bec7e43ef9bbd3650dbf2f8b41814))
* **contacts:** migrate users/database UI into apps/contacts ([d3aa461](https://github.com/tutur3u/platform/commit/d3aa461cea536f80428536b13be1232d277cd5c3))
* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **contacts:** refine report review experience ([0dd3247](https://github.com/tutur3u/platform/commit/0dd3247f5c9e170d58d5cd94a0fbb3a74d9a4f9e))
* **contacts:** serve notifications locally ([0fd7a89](https://github.com/tutur3u/platform/commit/0fd7a89f8bf15e6cd8146382d5b659cceed84751))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** resolve biome format + empty-package test failures on main ([e1520a0](https://github.com/tutur3u/platform/commit/e1520a064c7a751cb3f7fc940f78abad0b5aea73))
* **contacts:** authenticate users database requests ([54ddc74](https://github.com/tutur3u/platform/commit/54ddc741b9833ca835ce13adabb196aabff78fb8))
* **contacts:** consolidate manager profiles ([69529a3](https://github.com/tutur3u/platform/commit/69529a30cb276ea31d7fa191a823bb9949751058))
* **contacts:** own post approval APIs ([632aa32](https://github.com/tutur3u/platform/commit/632aa322fae28d43c39d63e2d033189065735376))
* **contacts:** own settings and profile APIs ([d809fe0](https://github.com/tutur3u/platform/commit/d809fe00699f7837b1ac829e5f8b92491e5f822c))
* **contacts:** own workspace user mutations ([21ab1fb](https://github.com/tutur3u/platform/commit/21ab1fbbf5cf6e2a06274dbfba2616aac1f0e481))
* **contacts:** repair approval detail dialog ([a948ea2](https://github.com/tutur3u/platform/commit/a948ea2be85906cec81e9484acc041b7b637a351))
* **contacts:** resolve group API app sessions locally ([30a8917](https://github.com/tutur3u/platform/commit/30a8917c1d2cfd6ddccbbbb44ccad8c9199fef33))
* **contacts:** restore audit log exports ([4bae50b](https://github.com/tutur3u/platform/commit/4bae50b7b560d3af5fa4b1af42c83db1d0987f02))
* **contacts:** restore coupon discovery ([cb7dfea](https://github.com/tutur3u/platform/commit/cb7dfea49da9f72e18321f60d7e95c7f056fbea4))
* **contacts:** restore group and report operations ([8760868](https://github.com/tutur3u/platform/commit/8760868f3b5a721b0e2712a964fb5ec71ec14048))
* **contacts:** restore group post mutations ([fe621e4](https://github.com/tutur3u/platform/commit/fe621e4d7e4126f705082cc3e815aafdeebe535a))
* **contacts:** restore user group and report mutations ([0f3f12d](https://github.com/tutur3u/platform/commit/0f3f12d5291b3a2d3635fc3bde193cbe5f3e8052))
* **contacts:** restore workspace posts ([df08eae](https://github.com/tutur3u/platform/commit/df08eae5334a55412bceb994a878d7c3a53d752e))
* **reports:** scale delivery maintenance and report counts ([4dd4f47](https://github.com/tutur3u/platform/commit/4dd4f47dfff4bafa1ef512311eec16a6fbadc964))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))


### Performance Improvements

* **contacts:** accelerate virtual user listing ([8d0b86c](https://github.com/tutur3u/platform/commit/8d0b86c46f7045b2e7475d2e6211dc0cc2ebb6ab))

## [0.5.1](https://github.com/tutur3u/platform/compare/users-core-v0.5.0...users-core-v0.5.1) (2026-07-27)


### Bug Fixes

* **contacts:** repair approval detail dialog ([a948ea2](https://github.com/tutur3u/platform/commit/a948ea2be85906cec81e9484acc041b7b637a351))

## [0.5.0](https://github.com/tutur3u/platform/compare/users-core-v0.4.2...users-core-v0.5.0) (2026-07-25)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))

## [0.4.2](https://github.com/tutur3u/platform/compare/users-core-v0.4.1...users-core-v0.4.2) (2026-07-21)


### Bug Fixes

* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))


### Performance Improvements

* **contacts:** accelerate virtual user listing ([8d0b86c](https://github.com/tutur3u/platform/commit/8d0b86c46f7045b2e7475d2e6211dc0cc2ebb6ab))

## [0.4.1](https://github.com/tutur3u/platform/compare/users-core-v0.4.0...users-core-v0.4.1) (2026-07-18)


### Bug Fixes

* **contacts:** own post approval APIs ([632aa32](https://github.com/tutur3u/platform/commit/632aa322fae28d43c39d63e2d033189065735376))
* **contacts:** restore audit log exports ([4bae50b](https://github.com/tutur3u/platform/commit/4bae50b7b560d3af5fa4b1af42c83db1d0987f02))
* **contacts:** restore coupon discovery ([cb7dfea](https://github.com/tutur3u/platform/commit/cb7dfea49da9f72e18321f60d7e95c7f056fbea4))
* **contacts:** restore user group and report mutations ([0f3f12d](https://github.com/tutur3u/platform/commit/0f3f12d5291b3a2d3635fc3bde193cbe5f3e8052))
* **contacts:** restore workspace posts ([df08eae](https://github.com/tutur3u/platform/commit/df08eae5334a55412bceb994a878d7c3a53d752e))

## [0.4.0](https://github.com/tutur3u/platform/compare/users-core-v0.3.0...users-core-v0.4.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **contacts:** serve notifications locally ([0fd7a89](https://github.com/tutur3u/platform/commit/0fd7a89f8bf15e6cd8146382d5b659cceed84751))


### Bug Fixes

* **contacts:** authenticate users database requests ([54ddc74](https://github.com/tutur3u/platform/commit/54ddc741b9833ca835ce13adabb196aabff78fb8))
* **contacts:** consolidate manager profiles ([69529a3](https://github.com/tutur3u/platform/commit/69529a30cb276ea31d7fa191a823bb9949751058))
* **contacts:** own settings and profile APIs ([d809fe0](https://github.com/tutur3u/platform/commit/d809fe00699f7837b1ac829e5f8b92491e5f822c))
* **contacts:** own workspace user mutations ([21ab1fb](https://github.com/tutur3u/platform/commit/21ab1fbbf5cf6e2a06274dbfba2616aac1f0e481))
* **contacts:** resolve group API app sessions locally ([30a8917](https://github.com/tutur3u/platform/commit/30a8917c1d2cfd6ddccbbbb44ccad8c9199fef33))
* **contacts:** restore group and report operations ([8760868](https://github.com/tutur3u/platform/commit/8760868f3b5a721b0e2712a964fb5ec71ec14048))
* **contacts:** restore group post mutations ([fe621e4](https://github.com/tutur3u/platform/commit/fe621e4d7e4126f705082cc3e815aafdeebe535a))

## [0.3.0](https://github.com/tutur3u/platform/compare/users-core-v0.2.0...users-core-v0.3.0) (2026-07-11)


### Features

* **contacts:** migrate reports + groups and complete the users cutover ([2ee89cd](https://github.com/tutur3u/platform/commit/2ee89cd2257c2a9824df53d4be99436416d85c13))
* **contacts:** migrate users approvals module, extracting shared parts to packages ([e66ae32](https://github.com/tutur3u/platform/commit/e66ae326f89bec7e43ef9bbd3650dbf2f8b41814))
* **contacts:** migrate users/database UI into apps/contacts ([d3aa461](https://github.com/tutur3u/platform/commit/d3aa461cea536f80428536b13be1232d277cd5c3))


### Bug Fixes

* **ci:** resolve biome format + empty-package test failures on main ([e1520a0](https://github.com/tutur3u/platform/commit/e1520a064c7a751cb3f7fc940f78abad0b5aea73))

## [0.2.0](https://github.com/tutur3u/platform/compare/users-core-v0.1.0...users-core-v0.2.0) (2026-07-11)


### Features

* **contacts:** migrate reports + groups and complete the users cutover ([2ee89cd](https://github.com/tutur3u/platform/commit/2ee89cd2257c2a9824df53d4be99436416d85c13))
* **contacts:** migrate users approvals module, extracting shared parts to packages ([e66ae32](https://github.com/tutur3u/platform/commit/e66ae326f89bec7e43ef9bbd3650dbf2f8b41814))
* **contacts:** migrate users/database UI into apps/contacts ([d3aa461](https://github.com/tutur3u/platform/commit/d3aa461cea536f80428536b13be1232d277cd5c3))


### Bug Fixes

* **ci:** resolve biome format + empty-package test failures on main ([e1520a0](https://github.com/tutur3u/platform/commit/e1520a064c7a751cb3f7fc940f78abad0b5aea73))
