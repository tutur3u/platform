# Changelog

## [0.19.1](https://github.com/tutur3u/platform/compare/mail-v0.19.0...mail-v0.19.1) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))

## [0.19.0](https://github.com/tutur3u/platform/compare/mail-v0.18.2...mail-v0.19.0) (2026-08-20)


### Features

* **tasks:** explain sorted drag ordering ([49350ad](https://github.com/tutur3u/platform/commit/49350ad5160de432eca0d42e582f9e54816fae11))

## [0.18.2](https://github.com/tutur3u/platform/compare/mail-v0.18.1...mail-v0.18.2) (2026-08-16)


### Bug Fixes

* **tasks:** preserve rich paste and responsive dialogs ([0a6c5a3](https://github.com/tutur3u/platform/commit/0a6c5a362f51b475c2e8fe984eb3569a46a878ee))

## [0.18.1](https://github.com/tutur3u/platform/compare/mail-v0.18.0...mail-v0.18.1) (2026-08-15)


### Bug Fixes

* **e2e:** start satellites for invite coverage ([6400dac](https://github.com/tutur3u/platform/commit/6400dac14ed4a87acd39a9639ace741d157893c6))

## [0.18.0](https://github.com/tutur3u/platform/compare/mail-v0.17.2...mail-v0.18.0) (2026-08-14)


### Features

* **workspaces:** revamp invitation access flow ([7ea94af](https://github.com/tutur3u/platform/commit/7ea94afc2c5e14af1c83d1478ad9c006268b13c0))
* **workspaces:** support multi-role invitations ([f6f78ba](https://github.com/tutur3u/platform/commit/f6f78bac6c2120fd70c09e85c075c4206be4f897))


### Bug Fixes

* **satellites:** harden invited workspace access ([3c60571](https://github.com/tutur3u/platform/commit/3c6057172cde3e5dc57acae164c946b405ba87cd))
* **satellites:** preserve workspace actors ([e268b8d](https://github.com/tutur3u/platform/commit/e268b8d587f3d4d3025a16c3e001ff5dbb16200b))
* **workspaces:** manage roles for pending invites ([2466f6c](https://github.com/tutur3u/platform/commit/2466f6cbbd447207d87eb0e0d78b3c713b02b739))

## [0.17.2](https://github.com/tutur3u/platform/compare/mail-v0.17.1...mail-v0.17.2) (2026-08-11)


### Bug Fixes

* **i18n:** preserve prerender locale fallback ([3a09b07](https://github.com/tutur3u/platform/commit/3a09b070abda729649f269310a70db78f9b3a1cc))

## [0.17.1](https://github.com/tutur3u/platform/compare/mail-v0.17.0...mail-v0.17.1) (2026-08-11)


### Bug Fixes

* **i18n:** keep locale roots prerenderable ([d0eb02c](https://github.com/tutur3u/platform/commit/d0eb02c452c4ad125907f4c67b24797782caf907))
* **i18n:** keep request locale build-safe ([cc575a2](https://github.com/tutur3u/platform/commit/cc575a2e951ef8fb46a4b8593d0dcfcbe03cd4e7))

## [0.17.0](https://github.com/tutur3u/platform/compare/mail-v0.16.1...mail-v0.17.0) (2026-08-09)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **chat:** add external parity reconciliation ([953b9d6](https://github.com/tutur3u/platform/commit/953b9d6315611ef86ec2c213bbbbc5e62d5f4ad4))
* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))
* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))
* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))

## [0.16.1](https://github.com/tutur3u/platform/compare/mail-v0.16.0...mail-v0.16.1) (2026-08-09)


### Bug Fixes

* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))

## [0.16.0](https://github.com/tutur3u/platform/compare/mail-v0.15.0...mail-v0.16.0) (2026-08-07)


### Features

* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))

## [0.15.0](https://github.com/tutur3u/platform/compare/mail-v0.14.0...mail-v0.15.0) (2026-08-06)


### Features

* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))

## [0.14.0](https://github.com/tutur3u/platform/compare/mail-v0.13.0...mail-v0.14.0) (2026-08-04)


### Features

* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))

## [0.13.0](https://github.com/tutur3u/platform/compare/mail-v0.12.0...mail-v0.13.0) (2026-07-28)


### Features

* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))

## [0.12.0](https://github.com/tutur3u/platform/compare/mail-v0.11.0...mail-v0.12.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **mail:** add advanced mailbox APIs and shadow ingestion ([2543fc5](https://github.com/tutur3u/platform/commit/2543fc5e1fc8ff586692cff07e4eaa42f28d3315))
* **mail:** add catch-all delivery and revamp client ([8d4cb12](https://github.com/tutur3u/platform/commit/8d4cb128275eb42ccd4e2745c7e02983d46f2c66))
* **mail:** add smart labels and assisted composing ([8ccd2fa](https://github.com/tutur3u/platform/commit/8ccd2fac0dcf4c67f6eff062dc52e3fc01a2c6ef))
* **mail:** focus mailbox shell ([4c2604d](https://github.com/tutur3u/platform/commit/4c2604d38e34f9e201902daa2434da1359e5d093))
* **mail:** refine composer and reading experience ([926a28c](https://github.com/tutur3u/platform/commit/926a28c38038e455cd98730c4d31e3633204be35))
* **mail:** streamline instant navigation and AI drafting ([76bd964](https://github.com/tutur3u/platform/commit/76bd96456c5ca22492b27b8598b8b158f478e916))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** standardize fixed app headers ([7b86c42](https://github.com/tutur3u/platform/commit/7b86c4283b39ebc5de8bec971ce3bab5fdaef422))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))


### Bug Fixes

* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **mail:** add settings translations ([da50201](https://github.com/tutur3u/platform/commit/da502012a40010ec129ebe2fbef1bcba9f03fd03))
* **mail:** allow signed provider webhooks ([adbbb87](https://github.com/tutur3u/platform/commit/adbbb875f728233f0a2fcc06a1ce6a717ce5567f))
* **mail:** restore production inbox rendering ([e03a782](https://github.com/tutur3u/platform/commit/e03a7826cf4cc361b3b1077275b7517db343f35d))
* **mail:** stabilize layout and managed sender identity ([a22205e](https://github.com/tutur3u/platform/commit/a22205e98a8671ffb628586107de09a7ba8dd1c4))
* **mail:** use managed SES credentials ([9ffb3a1](https://github.com/tutur3u/platform/commit/9ffb3a183552670d7f334d379db2043f4e4e9078))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.11.0](https://github.com/tutur3u/platform/compare/mail-v0.10.1...mail-v0.11.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **mail:** add advanced mailbox APIs and shadow ingestion ([2543fc5](https://github.com/tutur3u/platform/commit/2543fc5e1fc8ff586692cff07e4eaa42f28d3315))
* **mail:** add catch-all delivery and revamp client ([8d4cb12](https://github.com/tutur3u/platform/commit/8d4cb128275eb42ccd4e2745c7e02983d46f2c66))
* **mail:** add Cloudflare-native mail foundation ([7c755b7](https://github.com/tutur3u/platform/commit/7c755b79274146f2c4987450f99678107242e2f7))
* **mail:** add smart labels and assisted composing ([8ccd2fa](https://github.com/tutur3u/platform/commit/8ccd2fac0dcf4c67f6eff062dc52e3fc01a2c6ef))
* **mail:** focus mailbox shell ([4c2604d](https://github.com/tutur3u/platform/commit/4c2604d38e34f9e201902daa2434da1359e5d093))
* **mail:** refine composer and reading experience ([926a28c](https://github.com/tutur3u/platform/commit/926a28c38038e455cd98730c4d31e3633204be35))
* **mail:** streamline instant navigation and AI drafting ([76bd964](https://github.com/tutur3u/platform/commit/76bd96456c5ca22492b27b8598b8b158f478e916))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** standardize fixed app headers ([7b86c42](https://github.com/tutur3u/platform/commit/7b86c4283b39ebc5de8bec971ce3bab5fdaef422))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))


### Bug Fixes

* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **mail:** add settings translations ([da50201](https://github.com/tutur3u/platform/commit/da502012a40010ec129ebe2fbef1bcba9f03fd03))
* **mail:** allow signed provider webhooks ([adbbb87](https://github.com/tutur3u/platform/commit/adbbb875f728233f0a2fcc06a1ce6a717ce5567f))
* **mail:** restore production inbox rendering ([e03a782](https://github.com/tutur3u/platform/commit/e03a7826cf4cc361b3b1077275b7517db343f35d))
* **mail:** stabilize layout and managed sender identity ([a22205e](https://github.com/tutur3u/platform/commit/a22205e98a8671ffb628586107de09a7ba8dd1c4))
* **mail:** use managed SES credentials ([9ffb3a1](https://github.com/tutur3u/platform/commit/9ffb3a183552670d7f334d379db2043f4e4e9078))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.10.1](https://github.com/tutur3u/platform/compare/mail-v0.10.0...mail-v0.10.1) (2026-07-27)


### Bug Fixes

* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))

## [0.10.0](https://github.com/tutur3u/platform/compare/mail-v0.9.0...mail-v0.10.0) (2026-07-25)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))

## [0.9.0](https://github.com/tutur3u/platform/compare/mail-v0.8.0...mail-v0.9.0) (2026-07-21)


### Features

* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** standardize fixed app headers ([7b86c42](https://github.com/tutur3u/platform/commit/7b86c4283b39ebc5de8bec971ce3bab5fdaef422))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))


### Bug Fixes

* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))

## [0.8.0](https://github.com/tutur3u/platform/compare/mail-v0.7.0...mail-v0.8.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))

## [0.7.0](https://github.com/tutur3u/platform/compare/mail-v0.6.0...mail-v0.7.0) (2026-07-13)


### Features

* **mail:** add smart labels and assisted composing ([8ccd2fa](https://github.com/tutur3u/platform/commit/8ccd2fac0dcf4c67f6eff062dc52e3fc01a2c6ef))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.6.0](https://github.com/tutur3u/platform/compare/mail-v0.5.0...mail-v0.6.0) (2026-07-11)


### Features

* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **mail:** add advanced mailbox APIs and shadow ingestion ([2543fc5](https://github.com/tutur3u/platform/commit/2543fc5e1fc8ff586692cff07e4eaa42f28d3315))
* **mail:** add catch-all delivery and revamp client ([8d4cb12](https://github.com/tutur3u/platform/commit/8d4cb128275eb42ccd4e2745c7e02983d46f2c66))
* **mail:** add Cloudflare-native mail foundation ([7c755b7](https://github.com/tutur3u/platform/commit/7c755b79274146f2c4987450f99678107242e2f7))
* **mail:** focus mailbox shell ([4c2604d](https://github.com/tutur3u/platform/commit/4c2604d38e34f9e201902daa2434da1359e5d093))
* **mail:** refine composer and reading experience ([926a28c](https://github.com/tutur3u/platform/commit/926a28c38038e455cd98730c4d31e3633204be35))
* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **mail:** add settings translations ([da50201](https://github.com/tutur3u/platform/commit/da502012a40010ec129ebe2fbef1bcba9f03fd03))
* **mail:** allow signed provider webhooks ([adbbb87](https://github.com/tutur3u/platform/commit/adbbb875f728233f0a2fcc06a1ce6a717ce5567f))
* **mail:** restore production inbox rendering ([e03a782](https://github.com/tutur3u/platform/commit/e03a7826cf4cc361b3b1077275b7517db343f35d))
* **mail:** stabilize layout and managed sender identity ([a22205e](https://github.com/tutur3u/platform/commit/a22205e98a8671ffb628586107de09a7ba8dd1c4))
* **mail:** use managed SES credentials ([9ffb3a1](https://github.com/tutur3u/platform/commit/9ffb3a183552670d7f334d379db2043f4e4e9078))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.5.0](https://github.com/tutur3u/platform/compare/mail-v0.4.0...mail-v0.5.0) (2026-07-11)


### Features

* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **mail:** add advanced mailbox APIs and shadow ingestion ([2543fc5](https://github.com/tutur3u/platform/commit/2543fc5e1fc8ff586692cff07e4eaa42f28d3315))
* **mail:** add catch-all delivery and revamp client ([8d4cb12](https://github.com/tutur3u/platform/commit/8d4cb128275eb42ccd4e2745c7e02983d46f2c66))
* **mail:** add Cloudflare-native mail foundation ([7c755b7](https://github.com/tutur3u/platform/commit/7c755b79274146f2c4987450f99678107242e2f7))
* **mail:** focus mailbox shell ([4c2604d](https://github.com/tutur3u/platform/commit/4c2604d38e34f9e201902daa2434da1359e5d093))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **mail:** add settings translations ([da50201](https://github.com/tutur3u/platform/commit/da502012a40010ec129ebe2fbef1bcba9f03fd03))
* **mail:** allow signed provider webhooks ([adbbb87](https://github.com/tutur3u/platform/commit/adbbb875f728233f0a2fcc06a1ce6a717ce5567f))
* **mail:** restore production inbox rendering ([e03a782](https://github.com/tutur3u/platform/commit/e03a7826cf4cc361b3b1077275b7517db343f35d))
* **mail:** stabilize layout and managed sender identity ([a22205e](https://github.com/tutur3u/platform/commit/a22205e98a8671ffb628586107de09a7ba8dd1c4))
* **mail:** use managed SES credentials ([9ffb3a1](https://github.com/tutur3u/platform/commit/9ffb3a183552670d7f334d379db2043f4e4e9078))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.4.0](https://github.com/tutur3u/platform/compare/mail-v0.3.0...mail-v0.4.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))

## [0.3.0](https://github.com/tutur3u/platform/compare/mail-v0.2.1...mail-v0.3.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))

## [0.2.1](https://github.com/tutur3u/platform/compare/mail-v0.2.0...mail-v0.2.1) (2026-07-03)


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))

## [0.2.0](https://github.com/tutur3u/platform/compare/mail-v0.1.4...mail-v0.2.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))

## [0.1.4](https://github.com/tutur3u/platform/compare/mail-v0.1.3...mail-v0.1.4) (2026-06-24)


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))

## [0.1.3](https://github.com/tutur3u/platform/compare/mail-v0.1.2...mail-v0.1.3) (2026-06-13)


### Bug Fixes

* **sidebar:** persist collapsed state across refresh ([cb0eb6d](https://github.com/tutur3u/platform/commit/cb0eb6d0d30ecc8b3f3231255f9906e60a895f04))

## [0.1.2](https://github.com/tutur3u/platform/compare/mail-v0.1.1...mail-v0.1.2) (2026-06-11)


### Bug Fixes

* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.1.1](https://github.com/tutur3u/platform/compare/mail-v0.1.0...mail-v0.1.1) (2026-06-08)


### Bug Fixes

* **auth:** support supabase-first satellite sessions ([b014fcf](https://github.com/tutur3u/platform/commit/b014fcf6db8218a1b54fd79f5e13629f66cad090))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))
