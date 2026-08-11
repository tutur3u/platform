# Changelog

## [0.26.2](https://github.com/tutur3u/platform/compare/tasks-v0.26.1...tasks-v0.26.2) (2026-08-11)


### Bug Fixes

* **i18n:** preserve prerender locale fallback ([3a09b07](https://github.com/tutur3u/platform/commit/3a09b070abda729649f269310a70db78f9b3a1cc))

## [0.26.1](https://github.com/tutur3u/platform/compare/tasks-v0.26.0...tasks-v0.26.1) (2026-08-11)


### Bug Fixes

* **i18n:** keep locale roots prerenderable ([d0eb02c](https://github.com/tutur3u/platform/commit/d0eb02c452c4ad125907f4c67b24797782caf907))
* **i18n:** keep request locale build-safe ([cc575a2](https://github.com/tutur3u/platform/commit/cc575a2e951ef8fb46a4b8593d0dcfcbe03cd4e7))

## [0.26.0](https://github.com/tutur3u/platform/compare/tasks-v0.25.1...tasks-v0.26.0) (2026-08-09)


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
* **tasks:** add board access and capacity controls ([87456b0](https://github.com/tutur3u/platform/commit/87456b07c3ab1481caf143d88f03e79afa161e4b))
* **tasks:** add board access and capacity controls ([#5094](https://github.com/tutur3u/platform/issues/5094)) ([d9e41ee](https://github.com/tutur3u/platform/commit/d9e41ee3a8dad0410648dc5544277147d23f9d73))
* **tasks:** add task list settings shortcuts ([50031da](https://github.com/tutur3u/platform/commit/50031dac99961f35ab88aa6b286c4f11d23df7cc))
* **tasks:** add task list settings shortcuts ([#5103](https://github.com/tutur3u/platform/issues/5103)) ([9de306c](https://github.com/tutur3u/platform/commit/9de306c6e95c6dc0c7c71d058f5841c759bd91ff))
* **tasks:** consolidate list settings and capacity into one dialog ([9c3bb7c](https://github.com/tutur3u/platform/commit/9c3bb7c085430a70b74e00719983757904b3b947))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** improve board settings controls ([acc14d5](https://github.com/tutur3u/platform/commit/acc14d56c55ad463ff35e226a2bd3ee9d8fba386))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))
* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **chat:** harden external bridge synchronization ([5b7c709](https://github.com/tutur3u/platform/commit/5b7c7092260b05c8de86c2383291433f81c9eead))
* **chat:** harden external bridge synchronization ([63ccf91](https://github.com/tutur3u/platform/commit/63ccf9129ff8e7cf255bef8c74a3e096ab45cb7d))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **tasks:** allow capacity rules in app sessions ([f9f9f85](https://github.com/tutur3u/platform/commit/f9f9f85042cd8ffc4b975ce58f712ba56f24b76c))
* **tasks:** guarantee root workspace resolution ([94f674d](https://github.com/tutur3u/platform/commit/94f674d1808365f89573a10b559974856a03b434))
* **tasks:** isolate board member query cache ([#5096](https://github.com/tutur3u/platform/issues/5096)) ([687c402](https://github.com/tutur3u/platform/commit/687c402901e771872f0dbec8302c924f5b80b800))
* **tasks:** keep board settings tabs in context ([b26c6c3](https://github.com/tutur3u/platform/commit/b26c6c35f9ddb1a383bdbdd47424d6b6db942655))
* **tasks:** let members read board sharing, and surface why access is denied ([81886e8](https://github.com/tutur3u/platform/commit/81886e813942f95ddef4ab6dd881962c83f725c7))
* **tasks:** localize root proxy rewrites ([83109f9](https://github.com/tutur3u/platform/commit/83109f9fc50e6f27dc11fb5e989c6cc8081acd67))
* **tasks:** open task links that point outside the current workspace ([8f46e08](https://github.com/tutur3u/platform/commit/8f46e08e362b6eaf70e4b49d1b588adeb4e03e74))
* **tasks:** redirect roots to canonical boards ([bfc7cf2](https://github.com/tutur3u/platform/commit/bfc7cf219dc632d24158a8353fdd54b3eb6b66f9))
* **tasks:** repair board share access and harden AI media attachments ([65b8092](https://github.com/tutur3u/platform/commit/65b809245cc01fb7a5f034f703083f329c20f1c1))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))
* **tasks:** stabilize settings and list ordering ([6dc9f2e](https://github.com/tutur3u/platform/commit/6dc9f2e8fdbe3185508fe6b14fa149e69cb040ed))
* **tasks:** translate board reorder feedback ([4d355d1](https://github.com/tutur3u/platform/commit/4d355d11d9084007e2ab63fbc8f9ed8adbb30ded))
* **tasks:** unify settings navigation ([2f305e0](https://github.com/tutur3u/platform/commit/2f305e02e3936b69cca94b55e1d6ef1aa858b47e))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))
* **workspaces:** route satellite creation through setup ([754bf1b](https://github.com/tutur3u/platform/commit/754bf1b81360e4755a171819f3a8e6a7c102f351))

## [0.25.1](https://github.com/tutur3u/platform/compare/tasks-v0.25.0...tasks-v0.25.1) (2026-08-09)


### Bug Fixes

* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))

## [0.25.0](https://github.com/tutur3u/platform/compare/tasks-v0.24.0...tasks-v0.25.0) (2026-08-07)


### Features

* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))


### Bug Fixes

* **tasks:** let members read board sharing, and surface why access is denied ([81886e8](https://github.com/tutur3u/platform/commit/81886e813942f95ddef4ab6dd881962c83f725c7))
* **tasks:** repair board share access and harden AI media attachments ([65b8092](https://github.com/tutur3u/platform/commit/65b809245cc01fb7a5f034f703083f329c20f1c1))

## [0.24.0](https://github.com/tutur3u/platform/compare/tasks-v0.23.0...tasks-v0.24.0) (2026-08-06)


### Features

* **tasks:** add task list settings shortcuts ([50031da](https://github.com/tutur3u/platform/commit/50031dac99961f35ab88aa6b286c4f11d23df7cc))
* **tasks:** add task list settings shortcuts ([#5103](https://github.com/tutur3u/platform/issues/5103)) ([9de306c](https://github.com/tutur3u/platform/commit/9de306c6e95c6dc0c7c71d058f5841c759bd91ff))

## [0.23.0](https://github.com/tutur3u/platform/compare/tasks-v0.22.0...tasks-v0.23.0) (2026-08-06)


### Features

* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))
* **chat:** complete connected-site operational parity ([#5093](https://github.com/tutur3u/platform/issues/5093)) ([397e11b](https://github.com/tutur3u/platform/commit/397e11bd87d583fe1c65f83a2b8019c287650e19))
* **chat:** complete connected-site parity ([fd4061d](https://github.com/tutur3u/platform/commit/fd4061d8b2f654e521c40ea9819a348ae81575c9))
* **tasks:** add board access and capacity controls ([87456b0](https://github.com/tutur3u/platform/commit/87456b07c3ab1481caf143d88f03e79afa161e4b))
* **tasks:** add board access and capacity controls ([#5094](https://github.com/tutur3u/platform/issues/5094)) ([d9e41ee](https://github.com/tutur3u/platform/commit/d9e41ee3a8dad0410648dc5544277147d23f9d73))


### Bug Fixes

* **tasks:** allow capacity rules in app sessions ([f9f9f85](https://github.com/tutur3u/platform/commit/f9f9f85042cd8ffc4b975ce58f712ba56f24b76c))
* **tasks:** isolate board member query cache ([#5096](https://github.com/tutur3u/platform/issues/5096)) ([687c402](https://github.com/tutur3u/platform/commit/687c402901e771872f0dbec8302c924f5b80b800))

## [0.22.0](https://github.com/tutur3u/platform/compare/tasks-v0.21.0...tasks-v0.22.0) (2026-08-04)


### Features

* **chat:** add connected site sync bridge ([05c27f5](https://github.com/tutur3u/platform/commit/05c27f5ac4a545af366097ee2a919ec755970b9b))
* **chat:** add connected site sync bridge ([#5078](https://github.com/tutur3u/platform/issues/5078)) ([3de1a07](https://github.com/tutur3u/platform/commit/3de1a07dfa2fec96982aa0d116e003d0aa3fe47c))
* **meet:** revamp collaborative scheduling ([9124a5d](https://github.com/tutur3u/platform/commit/9124a5d559e071c7e6c1c713cfbca4d9f5205611))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))
* **tasks:** improve board settings controls ([acc14d5](https://github.com/tutur3u/platform/commit/acc14d56c55ad463ff35e226a2bd3ee9d8fba386))


### Bug Fixes

* **chat:** harden external bridge synchronization ([63ccf91](https://github.com/tutur3u/platform/commit/63ccf9129ff8e7cf255bef8c74a3e096ab45cb7d))
* **tasks:** keep board settings tabs in context ([b26c6c3](https://github.com/tutur3u/platform/commit/b26c6c35f9ddb1a383bdbdd47424d6b6db942655))
* **tasks:** redirect roots to canonical boards ([bfc7cf2](https://github.com/tutur3u/platform/commit/bfc7cf219dc632d24158a8353fdd54b3eb6b66f9))
* **tasks:** stabilize settings and list ordering ([6dc9f2e](https://github.com/tutur3u/platform/commit/6dc9f2e8fdbe3185508fe6b14fa149e69cb040ed))
* **tasks:** translate board reorder feedback ([4d355d1](https://github.com/tutur3u/platform/commit/4d355d11d9084007e2ab63fbc8f9ed8adbb30ded))
* **tasks:** unify settings navigation ([2f305e0](https://github.com/tutur3u/platform/commit/2f305e02e3936b69cca94b55e1d6ef1aa858b47e))
* **workspaces:** route satellite creation through setup ([754bf1b](https://github.com/tutur3u/platform/commit/754bf1b81360e4755a171819f3a8e6a7c102f351))

## [0.21.0](https://github.com/tutur3u/platform/compare/tasks-v0.20.0...tasks-v0.21.0) (2026-07-28)


### Features

* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))

## [0.20.0](https://github.com/tutur3u/platform/compare/tasks-v0.19.0...tasks-v0.20.0) (2026-07-27)


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
* **tasks:** add leaderboard leave button and per-member sparklines ([5b65238](https://github.com/tutur3u/platform/commit/5b65238c5388345acebacc6cbc612c738cdc3079))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))
* **tasks:** promote progress tracking workspace ([058503a](https://github.com/tutur3u/platform/commit/058503a96c8df10725ecd3f88738d574760fc944))
* **tasks:** resilient AI catch-up fallback and recommended-next panel ([393f47c](https://github.com/tutur3u/platform/commit/393f47c558dcf10cf4c6bd189330e052d2a72f56))
* **tasks:** revamp progress, goals, analytics & leaderboards with TrackBear parity ([d1bda0e](https://github.com/tutur3u/platform/commit/d1bda0e37a6ed45eb22aaa3bb20c4d62dc41a19f))
* **tasks:** streamline bulk selection and progress ([3bd2934](https://github.com/tutur3u/platform/commit/3bd2934b3d2dce31b0be8a55ee553069df1f5b5d))


### Bug Fixes

* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **ci:** resolve biome release failures ([77e6b68](https://github.com/tutur3u/platform/commit/77e6b685f970366148d76350df755e1d0a823f14))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))
* **mobile:** restore tasks bearer access ([2aedf84](https://github.com/tutur3u/platform/commit/2aedf8439f6d989ebf9bb69f83f74f1b25e5b06e))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **platform:** repair calendar sync and member auth ([fcf8f89](https://github.com/tutur3u/platform/commit/fcf8f89100fb9fc5de024dccb7605a3b9d197cfb))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))
* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **tasks:** compile task styles with UI globals ([bb1d600](https://github.com/tutur3u/platform/commit/bb1d600d392f78827cc9a6928a1ce0c264c2d80c))
* **tasks:** guarantee root workspace resolution ([94f674d](https://github.com/tutur3u/platform/commit/94f674d1808365f89573a10b559974856a03b434))
* **tasks:** localize root proxy rewrites ([83109f9](https://github.com/tutur3u/platform/commit/83109f9fc50e6f27dc11fb5e989c6cc8081acd67))
* **tasks:** open task links that point outside the current workspace ([8f46e08](https://github.com/tutur3u/platform/commit/8f46e08e362b6eaf70e4b49d1b588adeb4e03e74))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))
* **tasks:** repair task media permissions ([28a0bf1](https://github.com/tutur3u/platform/commit/28a0bf1f1ff11359828a335ac81bb20860062942))
* **tasks:** restore app-session history reads ([12bbc01](https://github.com/tutur3u/platform/commit/12bbc017f673a8e9c18a9b803dc180ccf2133684))
* **tasks:** restore satellite bulk mutations ([d0282a4](https://github.com/tutur3u/platform/commit/d0282a4c84aea6f86749725ed5b3fdf50ad5654d))
* **tasks:** restore task board layout styles ([29e052b](https://github.com/tutur3u/platform/commit/29e052b792af9626c5243e6f8178a4905e508a32))
* **tasks:** route progress catch-ups through AI Gateway ([780e917](https://github.com/tutur3u/platform/commit/780e917c8ae84d79507457a0ebf0a84312c727d0))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.19.0](https://github.com/tutur3u/platform/compare/tasks-v0.18.0...tasks-v0.19.0) (2026-07-27)


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
* **tasks:** add leaderboard leave button and per-member sparklines ([5b65238](https://github.com/tutur3u/platform/commit/5b65238c5388345acebacc6cbc612c738cdc3079))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))
* **tasks:** promote progress tracking workspace ([058503a](https://github.com/tutur3u/platform/commit/058503a96c8df10725ecd3f88738d574760fc944))
* **tasks:** resilient AI catch-up fallback and recommended-next panel ([393f47c](https://github.com/tutur3u/platform/commit/393f47c558dcf10cf4c6bd189330e052d2a72f56))
* **tasks:** revamp progress, goals, analytics & leaderboards with TrackBear parity ([d1bda0e](https://github.com/tutur3u/platform/commit/d1bda0e37a6ed45eb22aaa3bb20c4d62dc41a19f))
* **tasks:** streamline bulk selection and progress ([3bd2934](https://github.com/tutur3u/platform/commit/3bd2934b3d2dce31b0be8a55ee553069df1f5b5d))


### Bug Fixes

* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **ci:** resolve biome release failures ([77e6b68](https://github.com/tutur3u/platform/commit/77e6b685f970366148d76350df755e1d0a823f14))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))
* **mobile:** restore tasks bearer access ([2aedf84](https://github.com/tutur3u/platform/commit/2aedf8439f6d989ebf9bb69f83f74f1b25e5b06e))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **platform:** repair calendar sync and member auth ([fcf8f89](https://github.com/tutur3u/platform/commit/fcf8f89100fb9fc5de024dccb7605a3b9d197cfb))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))
* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **tasks:** compile task styles with UI globals ([bb1d600](https://github.com/tutur3u/platform/commit/bb1d600d392f78827cc9a6928a1ce0c264c2d80c))
* **tasks:** guarantee root workspace resolution ([94f674d](https://github.com/tutur3u/platform/commit/94f674d1808365f89573a10b559974856a03b434))
* **tasks:** localize root proxy rewrites ([83109f9](https://github.com/tutur3u/platform/commit/83109f9fc50e6f27dc11fb5e989c6cc8081acd67))
* **tasks:** open task links that point outside the current workspace ([8f46e08](https://github.com/tutur3u/platform/commit/8f46e08e362b6eaf70e4b49d1b588adeb4e03e74))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))
* **tasks:** repair task media permissions ([28a0bf1](https://github.com/tutur3u/platform/commit/28a0bf1f1ff11359828a335ac81bb20860062942))
* **tasks:** restore app-session history reads ([12bbc01](https://github.com/tutur3u/platform/commit/12bbc017f673a8e9c18a9b803dc180ccf2133684))
* **tasks:** restore satellite bulk mutations ([d0282a4](https://github.com/tutur3u/platform/commit/d0282a4c84aea6f86749725ed5b3fdf50ad5654d))
* **tasks:** restore task board layout styles ([29e052b](https://github.com/tutur3u/platform/commit/29e052b792af9626c5243e6f8178a4905e508a32))
* **tasks:** route progress catch-ups through AI Gateway ([780e917](https://github.com/tutur3u/platform/commit/780e917c8ae84d79507457a0ebf0a84312c727d0))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.18.0](https://github.com/tutur3u/platform/compare/tasks-v0.17.0...tasks-v0.18.0) (2026-07-27)


### Features

* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))


### Bug Fixes

* **apps:** stop registering a service worker the apps do not serve ([16688e9](https://github.com/tutur3u/platform/commit/16688e9fadefd5a373a318480627126eb1748650))
* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))
* **tasks:** open task links that point outside the current workspace ([8f46e08](https://github.com/tutur3u/platform/commit/8f46e08e362b6eaf70e4b49d1b588adeb4e03e74))

## [0.17.0](https://github.com/tutur3u/platform/compare/tasks-v0.16.0...tasks-v0.17.0) (2026-07-25)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **inventory:** reconcile checkout sales analytics ([b872994](https://github.com/tutur3u/platform/commit/b87299457e1abf8af51a2904818d04544aa2b785))
* **platform:** improve satellite workspace routing ([0c49c48](https://github.com/tutur3u/platform/commit/0c49c4882d26704fb16ba94ee289ab0af7deb4de))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** harden workspace role management ([0570687](https://github.com/tutur3u/platform/commit/0570687d255698e438d1eb02262ec0fa7c56240f))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **settings:** restore satellite workspace management ([be1fb5a](https://github.com/tutur3u/platform/commit/be1fb5aade1955ce0a73be29a090a3d7488aa8a6))
* **tasks:** guarantee root workspace resolution ([94f674d](https://github.com/tutur3u/platform/commit/94f674d1808365f89573a10b559974856a03b434))
* **tasks:** localize root proxy rewrites ([83109f9](https://github.com/tutur3u/platform/commit/83109f9fc50e6f27dc11fb5e989c6cc8081acd67))
* **workspaces:** repair shared member administration ([8a1515b](https://github.com/tutur3u/platform/commit/8a1515ba970adbe690b9d92f77a447adb93c339f))

## [0.16.0](https://github.com/tutur3u/platform/compare/tasks-v0.15.0...tasks-v0.16.0) (2026-07-21)


### Features

* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))


### Bug Fixes

* **platform:** repair calendar sync and member auth ([fcf8f89](https://github.com/tutur3u/platform/commit/fcf8f89100fb9fc5de024dccb7605a3b9d197cfb))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))

## [0.15.0](https://github.com/tutur3u/platform/compare/tasks-v0.14.0...tasks-v0.15.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** add leaderboard leave button and per-member sparklines ([5b65238](https://github.com/tutur3u/platform/commit/5b65238c5388345acebacc6cbc612c738cdc3079))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))
* **tasks:** resilient AI catch-up fallback and recommended-next panel ([393f47c](https://github.com/tutur3u/platform/commit/393f47c558dcf10cf4c6bd189330e052d2a72f56))
* **tasks:** revamp progress, goals, analytics & leaderboards with TrackBear parity ([d1bda0e](https://github.com/tutur3u/platform/commit/d1bda0e37a6ed45eb22aaa3bb20c4d62dc41a19f))


### Bug Fixes

* **ci:** resolve biome release failures ([77e6b68](https://github.com/tutur3u/platform/commit/77e6b685f970366148d76350df755e1d0a823f14))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))
* **mobile:** restore tasks bearer access ([2aedf84](https://github.com/tutur3u/platform/commit/2aedf8439f6d989ebf9bb69f83f74f1b25e5b06e))
* **tasks:** compile task styles with UI globals ([bb1d600](https://github.com/tutur3u/platform/commit/bb1d600d392f78827cc9a6928a1ce0c264c2d80c))
* **tasks:** repair task media permissions ([28a0bf1](https://github.com/tutur3u/platform/commit/28a0bf1f1ff11359828a335ac81bb20860062942))
* **tasks:** restore app-session history reads ([12bbc01](https://github.com/tutur3u/platform/commit/12bbc017f673a8e9c18a9b803dc180ccf2133684))
* **tasks:** restore task board layout styles ([29e052b](https://github.com/tutur3u/platform/commit/29e052b792af9626c5243e6f8178a4905e508a32))
* **tasks:** route progress catch-ups through AI Gateway ([780e917](https://github.com/tutur3u/platform/commit/780e917c8ae84d79507457a0ebf0a84312c727d0))

## [0.14.0](https://github.com/tutur3u/platform/compare/tasks-v0.13.0...tasks-v0.14.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **tasks:** promote progress tracking workspace ([058503a](https://github.com/tutur3u/platform/commit/058503a96c8df10725ecd3f88738d574760fc944))


### Bug Fixes

* **tasks:** restore satellite bulk mutations ([d0282a4](https://github.com/tutur3u/platform/commit/d0282a4c84aea6f86749725ed5b3fdf50ad5654d))

## [0.13.0](https://github.com/tutur3u/platform/compare/tasks-v0.12.0...tasks-v0.13.0) (2026-07-11)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add quick-create targeting and edge autoscroll ([f03e932](https://github.com/tutur3u/platform/commit/f03e9324b0cce18e9f9974cc8fe251bb58b686bd))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))
* **tasks:** consolidate task settings ([982e0b9](https://github.com/tutur3u/platform/commit/982e0b927358a5d566a5e33e092bd387ec0a7b50))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **inventory:** contain operator tables and translations ([5fa064e](https://github.com/tutur3u/platform/commit/5fa064e4c203f7202fc6db4ef2463001e32857a4))
* **tasks:** allow personal board external placements ([89a3fa2](https://github.com/tutur3u/platform/commit/89a3fa20117414c102ad5cdedb126ec0fab981d8))
* **tasks:** authenticate label association routes ([a3350a6](https://github.com/tutur3u/platform/commit/a3350a6deab332ac1754533e5fbaec5f6ecd62f4))
* **tasks:** authorize personal placement targets ([e617cee](https://github.com/tutur3u/platform/commit/e617cee57a817cf09cc31a79fe59f3c90ac671d9))
* **tasks:** harden satellite task route hydration ([9d51a38](https://github.com/tutur3u/platform/commit/9d51a38ad948ebb398bec794f082f2bbf8d466cc))
* **tasks:** let CLI bearer sessions reach task routes ([c8cd910](https://github.com/tutur3u/platform/commit/c8cd910b24cab9b9ec9bfb3e1236ad493c198509))
* **tasks:** let CLI bearer sessions reach task routes ([e607186](https://github.com/tutur3u/platform/commit/e6071867a3e9423c07f94ea5435e94321c1b7021))
* **tasks:** relax personal placement target access ([20dd211](https://github.com/tutur3u/platform/commit/20dd211d19d4abf944dd53f915c75ceb97ef7058))
* **tasks:** repair settings data and i18n ([0159488](https://github.com/tutur3u/platform/commit/0159488ae5de1c4d98a7d804d47bf1d479ae60c9))
* **tasks:** resolve personal placement board from list ([ed52667](https://github.com/tutur3u/platform/commit/ed5266740092e2c5fd2e7be19d5015a63705bea1))
* **tasks:** resolve personal placement board from list ([14335af](https://github.com/tutur3u/platform/commit/14335af944f77b923be66c871c31f5fea79d61a4))
* **tasks:** resolve personal placement target lists ([c98ed29](https://github.com/tutur3u/platform/commit/c98ed298a6bbb52f57cfd49f17ddba23e7c46bd4))
* **tasks:** restore personal board entrypoint ([e707bf5](https://github.com/tutur3u/platform/commit/e707bf538925545a06dea83ca8f4f48f5c057461))
* **tasks:** restore satellite resource access ([ec5e0a8](https://github.com/tutur3u/platform/commit/ec5e0a8d75398047e0151ae2ac3cd9a25a4fd675))
* **tasks:** restore task dialog app-session requests ([69f83cb](https://github.com/tutur3u/platform/commit/69f83cb8730eaeb4d39c186bbf8593c73e3deb47))
* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))
* **tasks:** route native personal task moves normally ([5bbba3c](https://github.com/tutur3u/platform/commit/5bbba3c3f193e722cc87cdfe2eb2734f61442cd0))
* **tasks:** serve config APIs from tasks app ([6d12722](https://github.com/tutur3u/platform/commit/6d12722fa54b146d69de0788624327eaa5f3f1a2))
* **tasks:** support personal external task moves ([83cee1f](https://github.com/tutur3u/platform/commit/83cee1ffaefe74c22e779268cdcdd8973280eaa0))
* **tasks:** support personal external terminal defaults ([50434cb](https://github.com/tutur3u/platform/commit/50434cb9849a65dd8c77f6b030b27a4bd76125e4))
* **tasks:** tolerate missing task settings row ([d835fe1](https://github.com/tutur3u/platform/commit/d835fe16004c057f53d018ce14ff96bd69fed618))
* **tasks:** tolerate personal count rpc auth gaps ([a31044a](https://github.com/tutur3u/platform/commit/a31044aea13e623d06c50eb086022244a2177e98))
* **tasks:** unify board loading skeleton ([eaf2b65](https://github.com/tutur3u/platform/commit/eaf2b65242201573b930d4df4695488d0a669f30))
* **tasks:** use connection for boards route ([15bc262](https://github.com/tutur3u/platform/commit/15bc2623dfe1d236d729bf65b5417fae050b455b))
* **tasks:** use connection without segment config ([e3e89e0](https://github.com/tutur3u/platform/commit/e3e89e059219f589f11ccb29313f3bda5b0624b2))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.12.0](https://github.com/tutur3u/platform/compare/tasks-v0.11.0...tasks-v0.12.0) (2026-07-11)


### Features

* **tasks:** consolidate task settings ([982e0b9](https://github.com/tutur3u/platform/commit/982e0b927358a5d566a5e33e092bd387ec0a7b50))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **tasks:** authorize personal placement targets ([e617cee](https://github.com/tutur3u/platform/commit/e617cee57a817cf09cc31a79fe59f3c90ac671d9))
* **tasks:** let CLI bearer sessions reach task routes ([c8cd910](https://github.com/tutur3u/platform/commit/c8cd910b24cab9b9ec9bfb3e1236ad493c198509))
* **tasks:** let CLI bearer sessions reach task routes ([e607186](https://github.com/tutur3u/platform/commit/e6071867a3e9423c07f94ea5435e94321c1b7021))
* **tasks:** relax personal placement target access ([20dd211](https://github.com/tutur3u/platform/commit/20dd211d19d4abf944dd53f915c75ceb97ef7058))
* **tasks:** repair settings data and i18n ([0159488](https://github.com/tutur3u/platform/commit/0159488ae5de1c4d98a7d804d47bf1d479ae60c9))
* **tasks:** resolve personal placement board from list ([ed52667](https://github.com/tutur3u/platform/commit/ed5266740092e2c5fd2e7be19d5015a63705bea1))
* **tasks:** resolve personal placement board from list ([14335af](https://github.com/tutur3u/platform/commit/14335af944f77b923be66c871c31f5fea79d61a4))
* **tasks:** restore task dialog app-session requests ([69f83cb](https://github.com/tutur3u/platform/commit/69f83cb8730eaeb4d39c186bbf8593c73e3deb47))
* **tasks:** support personal external terminal defaults ([50434cb](https://github.com/tutur3u/platform/commit/50434cb9849a65dd8c77f6b030b27a4bd76125e4))
* **tasks:** tolerate missing task settings row ([d835fe1](https://github.com/tutur3u/platform/commit/d835fe16004c057f53d018ce14ff96bd69fed618))
* **tasks:** unify board loading skeleton ([eaf2b65](https://github.com/tutur3u/platform/commit/eaf2b65242201573b930d4df4695488d0a669f30))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.11.0](https://github.com/tutur3u/platform/compare/tasks-v0.10.0...tasks-v0.11.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add quick-create targeting and edge autoscroll ([f03e932](https://github.com/tutur3u/platform/commit/f03e9324b0cce18e9f9974cc8fe251bb58b686bd))


### Bug Fixes

* **tasks:** allow personal board external placements ([89a3fa2](https://github.com/tutur3u/platform/commit/89a3fa20117414c102ad5cdedb126ec0fab981d8))
* **tasks:** support personal external task moves ([83cee1f](https://github.com/tutur3u/platform/commit/83cee1ffaefe74c22e779268cdcdd8973280eaa0))

## [0.10.0](https://github.com/tutur3u/platform/compare/tasks-v0.9.1...tasks-v0.10.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))


### Bug Fixes

* **inventory:** contain operator tables and translations ([5fa064e](https://github.com/tutur3u/platform/commit/5fa064e4c203f7202fc6db4ef2463001e32857a4))
* **tasks:** authenticate label association routes ([a3350a6](https://github.com/tutur3u/platform/commit/a3350a6deab332ac1754533e5fbaec5f6ecd62f4))
* **tasks:** harden satellite task route hydration ([9d51a38](https://github.com/tutur3u/platform/commit/9d51a38ad948ebb398bec794f082f2bbf8d466cc))
* **tasks:** restore personal board entrypoint ([e707bf5](https://github.com/tutur3u/platform/commit/e707bf538925545a06dea83ca8f4f48f5c057461))
* **tasks:** restore satellite resource access ([ec5e0a8](https://github.com/tutur3u/platform/commit/ec5e0a8d75398047e0151ae2ac3cd9a25a4fd675))
* **tasks:** route native personal task moves normally ([5bbba3c](https://github.com/tutur3u/platform/commit/5bbba3c3f193e722cc87cdfe2eb2734f61442cd0))
* **tasks:** serve config APIs from tasks app ([6d12722](https://github.com/tutur3u/platform/commit/6d12722fa54b146d69de0788624327eaa5f3f1a2))
* **tasks:** tolerate personal count rpc auth gaps ([a31044a](https://github.com/tutur3u/platform/commit/a31044aea13e623d06c50eb086022244a2177e98))
* **tasks:** use connection for boards route ([15bc262](https://github.com/tutur3u/platform/commit/15bc2623dfe1d236d729bf65b5417fae050b455b))
* **tasks:** use connection without segment config ([e3e89e0](https://github.com/tutur3u/platform/commit/e3e89e059219f589f11ccb29313f3bda5b0624b2))

## [0.9.1](https://github.com/tutur3u/platform/compare/tasks-v0.9.0...tasks-v0.9.1) (2026-07-03)


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))

## [0.9.0](https://github.com/tutur3u/platform/compare/tasks-v0.8.1...tasks-v0.9.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))

## [0.8.1](https://github.com/tutur3u/platform/compare/tasks-v0.8.0...tasks-v0.8.1) (2026-06-26)


### Bug Fixes

* **tasks:** improve shared board collaboration ([fa4ca4d](https://github.com/tutur3u/platform/commit/fa4ca4d412c8f8f533ab87639b314fefc70f9107))

## [0.8.0](https://github.com/tutur3u/platform/compare/tasks-v0.7.0...tasks-v0.8.0) (2026-06-24)


### Features

* **tasks:** add shareable kanban task plans ([2de4e58](https://github.com/tutur3u/platform/commit/2de4e5819673e11b01cdc1f21c317f33dc196f56))
* **tasks:** consolidate board task settings ([b1d720a](https://github.com/tutur3u/platform/commit/b1d720ac865406d6dd0b2477c5ba04e336de9929))


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
* **i18n:** add calendar sync status key ([0c0f503](https://github.com/tutur3u/platform/commit/0c0f503af9413925f2de8f90b2f335d36b5de4fd))
* **i18n:** sync task planner keys ([fea50fd](https://github.com/tutur3u/platform/commit/fea50fddfb3019d9dfeeb834ec5444f2dbe01554))

## [0.7.0](https://github.com/tutur3u/platform/compare/tasks-v0.6.0...tasks-v0.7.0) (2026-06-13)


### Features

* **tasks:** add compact task dialog AI suggestions ([99058e9](https://github.com/tutur3u/platform/commit/99058e90a4f81153f664eb92fdbacade1e2188c6))


### Bug Fixes

* **sidebar:** persist collapsed state across refresh ([cb0eb6d](https://github.com/tutur3u/platform/commit/cb0eb6d0d30ecc8b3f3231255f9906e60a895f04))
* **tasks:** sync task realtime with broadcasts ([8c56154](https://github.com/tutur3u/platform/commit/8c56154e517797dcac0ec0971d8a474b50292706))

## [0.6.0](https://github.com/tutur3u/platform/compare/tasks-v0.5.1...tasks-v0.6.0) (2026-06-11)


### Features

* **tasks:** add task sound effects ([7c4cb06](https://github.com/tutur3u/platform/commit/7c4cb06f8f134db201f54294c3c2641ae9ae5d07))

## [0.5.1](https://github.com/tutur3u/platform/compare/tasks-v0.5.0...tasks-v0.5.1) (2026-06-11)


### Bug Fixes

* **chat:** throttle Zalo phone sync and group mirrored chats ([51f3ab5](https://github.com/tutur3u/platform/commit/51f3ab5cec4a7a0c7403100045a6d7500975caf3))
* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.5.0](https://github.com/tutur3u/platform/compare/tasks-v0.4.0...tasks-v0.5.0) (2026-06-10)


### Features

* **chat:** add personal channels and root integrations ([fb5e753](https://github.com/tutur3u/platform/commit/fb5e7534588c7015449313fc4a752b70732f227e))
* **chat:** add Zalo QR personal sync ([f86e710](https://github.com/tutur3u/platform/commit/f86e710a39a790c44ba35c5a43f785dc1f66e27e))
* **chat:** merge personal channels and root integrations ([22d50ce](https://github.com/tutur3u/platform/commit/22d50ce0d75e36e0beaa973ef59cbd296e22dc35))

## [0.4.0](https://github.com/tutur3u/platform/compare/tasks-v0.3.0...tasks-v0.4.0) (2026-06-08)


### Features

* **platform:** add calendar sources and personal Zalo agents ([2746e72](https://github.com/tutur3u/platform/commit/2746e7297a43def06c3c2f12b7751dea94074113))
* **settings:** add fullscreen settings sheet ([809c78e](https://github.com/tutur3u/platform/commit/809c78e6a38ce1623249540e846c63d26cd8d3b9))


### Bug Fixes

* **auth:** stabilize satellite Supabase sessions ([231c4fa](https://github.com/tutur3u/platform/commit/231c4fac3238b94c96ad8e7a853b03ad97d166e4))
* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))
* **tasks:** reconcile review dates and drag state ([176dcd3](https://github.com/tutur3u/platform/commit/176dcd305d8292e5cf1a2178bfe759b1074bcb54))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))

## [0.3.0](https://github.com/tutur3u/platform/compare/tasks-v0.2.0...tasks-v0.3.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))


### Bug Fixes

* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))

## [0.2.0](https://github.com/tutur3u/platform/compare/tasks-v0.1.0...tasks-v0.2.0) (2026-06-02)


### Features

* **chat:** add ai agent operations controls ([2429279](https://github.com/tutur3u/platform/commit/2429279777e74014abb80699a7359038eb751460))
