# Changelog

## [0.38.0](https://github.com/tutur3u/platform/compare/rewise-v0.37.3...rewise-v0.38.0) (2026-09-04)


### Features

* **rewise:** build workspace assistant dashboard ([#5217](https://github.com/tutur3u/platform/issues/5217)) ([fe673b4](https://github.com/tutur3u/platform/commit/fe673b498a3890325748da47b32a8825bf576d40))


### Bug Fixes

* **rewise:** bind AI work to selected workspace ([ed07bd8](https://github.com/tutur3u/platform/commit/ed07bd807fe5bb2895e82be374494217c8461444))
* **rewise:** bind AI work to selected workspace ([#5208](https://github.com/tutur3u/platform/issues/5208)) ([5f1d8f3](https://github.com/tutur3u/platform/commit/5f1d8f3544e87e78b6555cd679c36f2878d0dab9))
* **rewise:** enforce workspace chat ownership ([3729e1c](https://github.com/tutur3u/platform/commit/3729e1c06fdc90877848ad96d3c3832c3e6f5854))

## [0.37.3](https://github.com/tutur3u/platform/compare/rewise-v0.37.2...rewise-v0.37.3) (2026-08-31)


### Bug Fixes

* **tasks:** restore description checklist controls ([7976f78](https://github.com/tutur3u/platform/commit/7976f78292237e8047509e4243dafa14acea1b54))

## [0.37.2](https://github.com/tutur3u/platform/compare/rewise-v0.37.1...rewise-v0.37.2) (2026-08-29)


### Performance Improvements

* **vercel:** serve every monorepo app from one function region ([4f0bf52](https://github.com/tutur3u/platform/commit/4f0bf52450899267b4ac9cd2bdecfcf07e3ea427))
* **vercel:** serve every monorepo app from one function region ([#5172](https://github.com/tutur3u/platform/issues/5172)) ([b09d4bd](https://github.com/tutur3u/platform/commit/b09d4bd520a7543d6b88140715d8cc0b5c461711))

## [0.37.1](https://github.com/tutur3u/platform/compare/rewise-v0.37.0...rewise-v0.37.1) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))

## [0.37.0](https://github.com/tutur3u/platform/compare/rewise-v0.36.0...rewise-v0.37.0) (2026-08-20)


### Features

* **tasks:** explain sorted drag ordering ([49350ad](https://github.com/tutur3u/platform/commit/49350ad5160de432eca0d42e582f9e54816fae11))

## [0.36.0](https://github.com/tutur3u/platform/compare/rewise-v0.35.2...rewise-v0.36.0) (2026-08-14)


### Features

* **workspaces:** revamp invitation access flow ([7ea94af](https://github.com/tutur3u/platform/commit/7ea94afc2c5e14af1c83d1478ad9c006268b13c0))
* **workspaces:** support multi-role invitations ([f6f78ba](https://github.com/tutur3u/platform/commit/f6f78bac6c2120fd70c09e85c075c4206be4f897))


### Bug Fixes

* **satellites:** preserve workspace actors ([e268b8d](https://github.com/tutur3u/platform/commit/e268b8d587f3d4d3025a16c3e001ff5dbb16200b))
* **workspaces:** manage roles for pending invites ([2466f6c](https://github.com/tutur3u/platform/commit/2466f6cbbd447207d87eb0e0d78b3c713b02b739))

## [0.35.2](https://github.com/tutur3u/platform/compare/rewise-v0.35.1...rewise-v0.35.2) (2026-08-11)


### Bug Fixes

* **i18n:** preserve prerender locale fallback ([3a09b07](https://github.com/tutur3u/platform/commit/3a09b070abda729649f269310a70db78f9b3a1cc))

## [0.35.1](https://github.com/tutur3u/platform/compare/rewise-v0.35.0...rewise-v0.35.1) (2026-08-11)


### Bug Fixes

* **i18n:** keep locale roots prerenderable ([d0eb02c](https://github.com/tutur3u/platform/commit/d0eb02c452c4ad125907f4c67b24797782caf907))
* **i18n:** keep request locale build-safe ([cc575a2](https://github.com/tutur3u/platform/commit/cc575a2e951ef8fb46a4b8593d0dcfcbe03cd4e7))

## [0.35.0](https://github.com/tutur3u/platform/compare/rewise-v0.34.1...rewise-v0.35.0) (2026-08-09)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **chat:** add connected site sync bridge ([05c27f5](https://github.com/tutur3u/platform/commit/05c27f5ac4a545af366097ee2a919ec755970b9b))
* **chat:** add connected site sync bridge ([#5078](https://github.com/tutur3u/platform/issues/5078)) ([3de1a07](https://github.com/tutur3u/platform/commit/3de1a07dfa2fec96982aa0d116e003d0aa3fe47c))
* **chat:** add external parity reconciliation ([953b9d6](https://github.com/tutur3u/platform/commit/953b9d6315611ef86ec2c213bbbbc5e62d5f4ad4))
* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))
* **chat:** complete connected-site operational parity ([#5093](https://github.com/tutur3u/platform/issues/5093)) ([397e11b](https://github.com/tutur3u/platform/commit/397e11bd87d583fe1c65f83a2b8019c287650e19))
* **chat:** complete connected-site parity ([fd4061d](https://github.com/tutur3u/platform/commit/fd4061d8b2f654e521c40ea9819a348ae81575c9))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **meet:** revamp collaborative scheduling ([9124a5d](https://github.com/tutur3u/platform/commit/9124a5d559e071c7e6c1c713cfbca4d9f5205611))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))
* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))
* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **chat:** harden external bridge synchronization ([5b7c709](https://github.com/tutur3u/platform/commit/5b7c7092260b05c8de86c2383291433f81c9eead))
* **chat:** harden external bridge synchronization ([63ccf91](https://github.com/tutur3u/platform/commit/63ccf9129ff8e7cf255bef8c74a3e096ab45cb7d))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **tasks:** repair board share access and harden AI media attachments ([65b8092](https://github.com/tutur3u/platform/commit/65b809245cc01fb7a5f034f703083f329c20f1c1))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
* **workspaces:** route satellite creation through setup ([754bf1b](https://github.com/tutur3u/platform/commit/754bf1b81360e4755a171819f3a8e6a7c102f351))

## [0.34.1](https://github.com/tutur3u/platform/compare/rewise-v0.34.0...rewise-v0.34.1) (2026-08-09)


### Bug Fixes

* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))

## [0.34.0](https://github.com/tutur3u/platform/compare/rewise-v0.33.0...rewise-v0.34.0) (2026-08-07)


### Features

* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))


### Bug Fixes

* **tasks:** repair board share access and harden AI media attachments ([65b8092](https://github.com/tutur3u/platform/commit/65b809245cc01fb7a5f034f703083f329c20f1c1))

## [0.33.0](https://github.com/tutur3u/platform/compare/rewise-v0.32.0...rewise-v0.33.0) (2026-08-06)


### Features

* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))
* **chat:** complete connected-site operational parity ([#5093](https://github.com/tutur3u/platform/issues/5093)) ([397e11b](https://github.com/tutur3u/platform/commit/397e11bd87d583fe1c65f83a2b8019c287650e19))
* **chat:** complete connected-site parity ([fd4061d](https://github.com/tutur3u/platform/commit/fd4061d8b2f654e521c40ea9819a348ae81575c9))

## [0.32.0](https://github.com/tutur3u/platform/compare/rewise-v0.31.0...rewise-v0.32.0) (2026-08-04)


### Features

* **chat:** add connected site sync bridge ([05c27f5](https://github.com/tutur3u/platform/commit/05c27f5ac4a545af366097ee2a919ec755970b9b))
* **chat:** add connected site sync bridge ([#5078](https://github.com/tutur3u/platform/issues/5078)) ([3de1a07](https://github.com/tutur3u/platform/commit/3de1a07dfa2fec96982aa0d116e003d0aa3fe47c))
* **meet:** revamp collaborative scheduling ([9124a5d](https://github.com/tutur3u/platform/commit/9124a5d559e071c7e6c1c713cfbca4d9f5205611))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))


### Bug Fixes

* **chat:** harden external bridge synchronization ([63ccf91](https://github.com/tutur3u/platform/commit/63ccf9129ff8e7cf255bef8c74a3e096ab45cb7d))
* **workspaces:** route satellite creation through setup ([754bf1b](https://github.com/tutur3u/platform/commit/754bf1b81360e4755a171819f3a8e6a7c102f351))

## [0.31.0](https://github.com/tutur3u/platform/compare/rewise-v0.30.0...rewise-v0.31.0) (2026-07-28)


### Features

* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))

## [0.30.0](https://github.com/tutur3u/platform/compare/rewise-v0.29.0...rewise-v0.30.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.29.0](https://github.com/tutur3u/platform/compare/rewise-v0.28.1...rewise-v0.29.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.28.1](https://github.com/tutur3u/platform/compare/rewise-v0.28.0...rewise-v0.28.1) (2026-07-27)


### Bug Fixes

* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))

## [0.28.0](https://github.com/tutur3u/platform/compare/rewise-v0.27.0...rewise-v0.28.0) (2026-07-25)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))

## [0.27.0](https://github.com/tutur3u/platform/compare/rewise-v0.26.0...rewise-v0.27.0) (2026-07-21)


### Features

* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))


### Bug Fixes

* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))

## [0.26.0](https://github.com/tutur3u/platform/compare/rewise-v0.25.0...rewise-v0.26.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))

## [0.25.0](https://github.com/tutur3u/platform/compare/rewise-v0.24.0...rewise-v0.25.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.24.0](https://github.com/tutur3u/platform/compare/rewise-v0.23.0...rewise-v0.24.0) (2026-07-11)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **infrastructure:** default docker web to native builds ([7d89f00](https://github.com/tutur3u/platform/commit/7d89f004f75ab12eddc3cb92df5a1e6a7255fe0d))
* **inventory:** contain operator tables and translations ([5fa064e](https://github.com/tutur3u/platform/commit/5fa064e4c203f7202fc6db4ef2463001e32857a4))
* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.23.0](https://github.com/tutur3u/platform/compare/rewise-v0.22.0...rewise-v0.23.0) (2026-07-11)


### Features

* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.22.0](https://github.com/tutur3u/platform/compare/rewise-v0.21.0...rewise-v0.22.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))

## [0.21.0](https://github.com/tutur3u/platform/compare/rewise-v0.20.1...rewise-v0.21.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))


### Bug Fixes

* **inventory:** contain operator tables and translations ([5fa064e](https://github.com/tutur3u/platform/commit/5fa064e4c203f7202fc6db4ef2463001e32857a4))

## [0.20.1](https://github.com/tutur3u/platform/compare/rewise-v0.20.0...rewise-v0.20.1) (2026-07-02)


### Bug Fixes

* **infrastructure:** default docker web to native builds ([7d89f00](https://github.com/tutur3u/platform/commit/7d89f004f75ab12eddc3cb92df5a1e6a7255fe0d))

## [0.20.0](https://github.com/tutur3u/platform/compare/rewise-v0.19.0...rewise-v0.20.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))

## [0.19.0](https://github.com/tutur3u/platform/compare/rewise-v0.18.3...rewise-v0.19.0) (2026-06-24)


### Features

* **tasks:** add shareable kanban task plans ([2de4e58](https://github.com/tutur3u/platform/commit/2de4e5819673e11b01cdc1f21c317f33dc196f56))
* **tasks:** consolidate board task settings ([b1d720a](https://github.com/tutur3u/platform/commit/b1d720ac865406d6dd0b2477c5ba04e336de9929))


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
* **i18n:** sync task planner keys ([fea50fd](https://github.com/tutur3u/platform/commit/fea50fddfb3019d9dfeeb834ec5444f2dbe01554))

## [0.18.3](https://github.com/tutur3u/platform/compare/rewise-v0.18.2...rewise-v0.18.3) (2026-06-17)


### Bug Fixes

* **deps:** keep lodash on latest reviewed artifact ([19909b3](https://github.com/tutur3u/platform/commit/19909b334581d3b58cdcd19e9b2fde553f7ad60a))
* **deps:** pin reviewed lodash artifact ([dfcf585](https://github.com/tutur3u/platform/commit/dfcf585fab9cc0b425cac5d60c5bccc997340be5))

## [0.18.2](https://github.com/tutur3u/platform/compare/rewise-v0.18.1...rewise-v0.18.2) (2026-06-13)


### Bug Fixes

* **sidebar:** persist collapsed state across refresh ([cb0eb6d](https://github.com/tutur3u/platform/commit/cb0eb6d0d30ecc8b3f3231255f9906e60a895f04))
* **tasks:** sync task realtime with broadcasts ([8c56154](https://github.com/tutur3u/platform/commit/8c56154e517797dcac0ec0971d8a474b50292706))

## [0.18.1](https://github.com/tutur3u/platform/compare/rewise-v0.18.0...rewise-v0.18.1) (2026-06-11)


### Bug Fixes

* **chat:** throttle Zalo phone sync and group mirrored chats ([51f3ab5](https://github.com/tutur3u/platform/commit/51f3ab5cec4a7a0c7403100045a6d7500975caf3))
* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.18.0](https://github.com/tutur3u/platform/compare/rewise-v0.17.0...rewise-v0.18.0) (2026-06-10)


### Features

* **chat:** add personal channels and root integrations ([fb5e753](https://github.com/tutur3u/platform/commit/fb5e7534588c7015449313fc4a752b70732f227e))
* **chat:** add Zalo QR personal sync ([f86e710](https://github.com/tutur3u/platform/commit/f86e710a39a790c44ba35c5a43f785dc1f66e27e))
* **chat:** merge personal channels and root integrations ([22d50ce](https://github.com/tutur3u/platform/commit/22d50ce0d75e36e0beaa973ef59cbd296e22dc35))

## [0.17.0](https://github.com/tutur3u/platform/compare/rewise-v0.16.0...rewise-v0.17.0) (2026-06-08)


### Features

* **settings:** add fullscreen settings sheet ([809c78e](https://github.com/tutur3u/platform/commit/809c78e6a38ce1623249540e846c63d26cd8d3b9))


### Bug Fixes

* **auth:** stabilize satellite Supabase sessions ([231c4fa](https://github.com/tutur3u/platform/commit/231c4fac3238b94c96ad8e7a853b03ad97d166e4))
* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))

## [0.16.0](https://github.com/tutur3u/platform/compare/rewise-v0.15.0...rewise-v0.16.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))


### Bug Fixes

* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))

## [0.15.0](https://github.com/tutur3u/platform/compare/rewise-v0.14.0...rewise-v0.15.0) (2026-06-02)


### Features

* **chat:** add ai agent operations controls ([2429279](https://github.com/tutur3u/platform/commit/2429279777e74014abb80699a7359038eb751460))
