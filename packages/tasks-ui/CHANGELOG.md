# Changelog

## [0.15.2](https://github.com/tutur3u/platform/compare/tasks-ui-v0.15.1...tasks-ui-v0.15.2) (2026-09-04)


### Performance Improvements

* **tasks:** defer My Tasks filter catalogs ([#5200](https://github.com/tutur3u/platform/issues/5200)) ([ac8afdc](https://github.com/tutur3u/platform/commit/ac8afdc52883c8eded24a06296cb1dedb44eaa2d))

## [0.15.1](https://github.com/tutur3u/platform/compare/tasks-ui-v0.15.0...tasks-ui-v0.15.1) (2026-08-31)


### Bug Fixes

* **tasks:** restore description checklist controls ([7976f78](https://github.com/tutur3u/platform/commit/7976f78292237e8047509e4243dafa14acea1b54))

## [0.15.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.14.0...tasks-ui-v0.15.0) (2026-08-26)


### Features

* **tu-do:** search board tasks by ticket identifier ([e81891c](https://github.com/tutur3u/platform/commit/e81891c7424b530322e3250d917636a988e278fe))
* **tu-do:** search board tasks by ticket identifier ([#5142](https://github.com/tutur3u/platform/issues/5142)) ([18c0e3e](https://github.com/tutur3u/platform/commit/18c0e3ea6a20522959a0b66ed8dfd5a5699daec4))


### Bug Fixes

* **review:** address PR feedback ([05580b9](https://github.com/tutur3u/platform/commit/05580b95d257e23df5d8fac98e1b7b319d83671e))
* **tu-do:** keep board search within source limits ([4c5d8e3](https://github.com/tutur3u/platform/commit/4c5d8e3d3c284679bcbd2e222f3ea9b94eda4690))

## [0.14.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.13.2...tasks-ui-v0.14.0) (2026-08-25)


### Features

* **tasks:** restore task history versions ([695afac](https://github.com/tutur3u/platform/commit/695afac81a6937c4dbe8148173b151a4654cd271))


### Bug Fixes

* **tasks:** clarify activity history previews ([e64b54d](https://github.com/tutur3u/platform/commit/e64b54d6fca953fe4369ddf2c72981cc5a421e3c))
* **tasks:** guard loading task snapshots ([eb86521](https://github.com/tutur3u/platform/commit/eb8652137d1e9c2fde792cdc415ddae8d1e78b98))
* **tasks:** restore cross-workspace task context ([0a8c6fa](https://github.com/tutur3u/platform/commit/0a8c6fa2c893da1fdbbc5e2421bbad3fa9513642))
* **tasks:** stabilize quick view and terminal actions ([380e7ea](https://github.com/tutur3u/platform/commit/380e7eafda2d7717a9356fc5f1f252e0aaddbdcf))

## [0.13.2](https://github.com/tutur3u/platform/compare/tasks-ui-v0.13.1...tasks-ui-v0.13.2) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))
* **tasks:** repair resource CRUD and sorting ([de345a4](https://github.com/tutur3u/platform/commit/de345a40e2948415eaec6f2965dfd83154d83935))
* **tasks:** use board-local assignment context ([1f20216](https://github.com/tutur3u/platform/commit/1f202168f2ba50acb5a941a697b6cd1f2323e3ad))

## [0.13.1](https://github.com/tutur3u/platform/compare/tasks-ui-v0.13.0...tasks-ui-v0.13.1) (2026-08-20)


### Bug Fixes

* **tasks:** refine task card hover glow ([37ad336](https://github.com/tutur3u/platform/commit/37ad336209156e897752708af2683e0b0c7a235f))
* **tasks:** remove hover hotkey ring ([523223a](https://github.com/tutur3u/platform/commit/523223a323939b4f0685c59f2af6c579dcd40555))

## [0.13.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.12.1...tasks-ui-v0.13.0) (2026-08-20)


### Features

* **editor:** add copy format menu ([389a6f0](https://github.com/tutur3u/platform/commit/389a6f02d822feef271409a9ab31e8fcbb6ef18e))
* **tasks:** add numeric shortcuts and cached board hydration ([97857ed](https://github.com/tutur3u/platform/commit/97857ed8543d0bc0c0779378fff41e61be40e00b))
* **tasks:** add searchable quick assignment menus ([5bfb7fb](https://github.com/tutur3u/platform/commit/5bfb7fbe87feff9759688dbd196efacb8d3702f5))
* **tasks:** add task card hotkeys and resilient resume ([a764c4b](https://github.com/tutur3u/platform/commit/a764c4bb204e5f6a8e1d55af7a67c8f2746b1dfc))
* **tasks:** explain sorted drag ordering ([49350ad](https://github.com/tutur3u/platform/commit/49350ad5160de432eca0d42e582f9e54816fae11))
* **tasks:** improve resource picker keyboard UX ([ff10cdd](https://github.com/tutur3u/platform/commit/ff10cddb6a49e17bac8fd8e1a671ca70d5498529))
* **tasks:** stream board content into view ([a6e6952](https://github.com/tutur3u/platform/commit/a6e695257c0854e61f6b12578d1f47101cf14a20))


### Bug Fixes

* **editor:** contain toolbar overflow ([6bda614](https://github.com/tutur3u/platform/commit/6bda61416cbd2e4d4d4af7c7337d7b4e905274ef))
* **tasks:** align create ordering and hover focus ([053546c](https://github.com/tutur3u/platform/commit/053546c5287e28bb28840167569e044aff02f3dd))
* **tasks:** animate board switches and restore avatars ([0dba090](https://github.com/tutur3u/platform/commit/0dba0909af692ede2806e6f2c407197bbcd7b2e9))
* **tasks:** animate cached board switches ([cc61f98](https://github.com/tutur3u/platform/commit/cc61f985697a5a8562d2dcd2fe6c968e7a771b96))
* **tasks:** avoid cache hydration mismatch ([33a9b87](https://github.com/tutur3u/platform/commit/33a9b873c1b5dd8158ea31c670ea3444a506f1ed))
* **tasks:** clear resource search before closing ([b9b4fd7](https://github.com/tutur3u/platform/commit/b9b4fd7144141addf7d6a1767f05b705772be176))
* **tasks:** compact description usage ([d8ece8b](https://github.com/tutur3u/platform/commit/d8ece8bdf5208f422c8a6274aeae8b14124ac6fd))
* **tasks:** keep submenu search focus current ([3e47720](https://github.com/tutur3u/platform/commit/3e47720c88c3bdf92d0d38f3f844b8ccd432f4a7))
* **tasks:** preserve cached ticket prefixes ([59a4b31](https://github.com/tutur3u/platform/commit/59a4b3109046f910bd586aee8af3200afffcd65f))
* **tasks:** preserve list collapse preferences ([cec15d0](https://github.com/tutur3u/platform/commit/cec15d09608fda552bfc616a16a9e86ea8761496))
* **tasks:** preserve searched resource menus on escape ([126eca6](https://github.com/tutur3u/platform/commit/126eca61f7f5a93e1e5ca3d58e8f1d8bec2ce4a6))
* **tasks:** preserve virtualized drag ordering ([b6643da](https://github.com/tutur3u/platform/commit/b6643da9bf21541296b5c8645788edfabda817ae))
* **tasks:** refine board loading motion ([4d93dd0](https://github.com/tutur3u/platform/commit/4d93dd061236a8bf44e2fc014024b509149e152d))
* **tasks:** restore kanban layout state ([4a30bee](https://github.com/tutur3u/platform/commit/4a30bee56e4419e95cabb635c784103e720647ae))
* **tasks:** retain settled kanban position ([66f08c2](https://github.com/tutur3u/platform/commit/66f08c2682064d3135f43294a569e0ab939d35bf))
* **tasks:** retain submenu search focus ([2576778](https://github.com/tutur3u/platform/commit/2576778ffd4bfdc1ee3158b8fa6364183bc44078))
* **tasks:** stabilize kanban initial layout ([3d8ccf1](https://github.com/tutur3u/platform/commit/3d8ccf181deba8f0e6bce435d8b6d0cb24cf2166))
* **tasks:** stabilize kanban restoration ([5307df9](https://github.com/tutur3u/platform/commit/5307df90cebbbf70bb79ad87e3eb4e5086271a36))
* **tasks:** stabilize reopened task interactions ([9947da2](https://github.com/tutur3u/platform/commit/9947da26424979fd24b1340adbfc25a860184bf3))
* **tasks:** stabilize submenu search focus ([b0b10cf](https://github.com/tutur3u/platform/commit/b0b10cf8eb9a227e00de6aded070212b8fdb990f))

## [0.12.1](https://github.com/tutur3u/platform/compare/tasks-ui-v0.12.0...tasks-ui-v0.12.1) (2026-08-16)


### Bug Fixes

* **tasks:** preserve rich paste and responsive dialogs ([0a6c5a3](https://github.com/tutur3u/platform/commit/0a6c5a362f51b475c2e8fe984eb3569a46a878ee))
* **tasks:** reconcile external task ordering ([2ebeefa](https://github.com/tutur3u/platform/commit/2ebeefa4c13ea9d0b62c33e50cf4f6fed7fac76a))

## [0.12.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.11.0...tasks-ui-v0.12.0) (2026-08-15)


### Features

* **tasks:** add toggle blocks and repair editor indentation ([c0805c8](https://github.com/tutur3u/platform/commit/c0805c8cc0e26c172eb6f46582e267b084289501))
* **tasks:** centralize board and dialog preferences ([50d7ff7](https://github.com/tutur3u/platform/commit/50d7ff75a984627f8c200c67c707914d88e46f6c))
* **tasks:** improve task timer controls ([eb58df9](https://github.com/tutur3u/platform/commit/eb58df943a1e224bb864921eea43db4ed6d3dccf))


### Bug Fixes

* **tasks:** make metadata updates optimistic ([598bd40](https://github.com/tutur3u/platform/commit/598bd40a98c504ac877b2c1d3f2c41945a40b7b4))
* **tasks:** make task time tracking immediate ([ad2aae1](https://github.com/tutur3u/platform/commit/ad2aae1ab54eb1f4ac3b01d5414eb5693d488b35))
* **tasks:** prevent optimistic metadata flashback ([3507318](https://github.com/tutur3u/platform/commit/3507318f4d21a98c87a1da75cc1233cdb4b59c7d))
* **time-tracking:** preserve task board context ([f83781a](https://github.com/tutur3u/platform/commit/f83781aa7fd426d53eec9d75daa6da5a04c2f3db))
* **time-tracking:** unify task timer sidebars ([828f65d](https://github.com/tutur3u/platform/commit/828f65dd0174f803e10026ccadc56eca04e22254))
* **track:** sync management and timer state ([d0f9aa6](https://github.com/tutur3u/platform/commit/d0f9aa6c9e897c52c6fe4fc627b02bc4cdb2d0b8))

## [0.11.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.10.1...tasks-ui-v0.11.0) (2026-08-14)


### Features

* **tasks:** add board lifecycle actions ([3295657](https://github.com/tutur3u/platform/commit/329565797b8bb3cefdf8f3812e6f5391576bf394))
* **tasks:** add board lifecycle settings ([dc9dc4b](https://github.com/tutur3u/platform/commit/dc9dc4b87adb32aa47bc1123222154b142daf53e))


### Bug Fixes

* **tasks:** complete external tasks on personal board ([40d14e2](https://github.com/tutur3u/platform/commit/40d14e2b01cb4dbb4763ef17a697da920c855eb4))
* **tasks:** derive completion control from list status ([a42411e](https://github.com/tutur3u/platform/commit/a42411ee410f316530de9f2d21aae91e2cd9f7ac))
* **tasks:** keep dropped cards in destination ([de9353b](https://github.com/tutur3u/platform/commit/de9353b0b3574b240c0caa478ba52935d3ad00bb))
* **tasks:** keep review completion control unchecked ([3b8d69a](https://github.com/tutur3u/platform/commit/3b8d69ada0c23fd009a279fe07c38073f5503efd))
* **tasks:** make terminal actions immediately optimistic ([f5111f7](https://github.com/tutur3u/platform/commit/f5111f7967eafbb38cf1e2b9d77ba12557d8621b))
* **tasks:** preserve deadline tasks after bulk updates ([cddb069](https://github.com/tutur3u/platform/commit/cddb06995315ff6ae04268de62c8e801dfdedb32))
* **tasks:** recover external task completion ([a0a8b94](https://github.com/tutur3u/platform/commit/a0a8b9456f01d2fe8e7bcf22ac6e654eca92ab36))
* **tasks:** render dropped tasks immediately ([1dcdb65](https://github.com/tutur3u/platform/commit/1dcdb655ff960c59f91b93b7f13622d1b65f6f48))
* **tasks:** stabilize optimistic task dragging ([84874a6](https://github.com/tutur3u/platform/commit/84874a6e265c609a9e33d64923f1ce88c20f9ede))
* **tasks:** type optimistic drag state safely ([a2731f4](https://github.com/tutur3u/platform/commit/a2731f47fe9148943dd8fca455a084b5378c4d46))

## [0.10.1](https://github.com/tutur3u/platform/compare/tasks-ui-v0.10.0...tasks-ui-v0.10.1) (2026-08-12)


### Bug Fixes

* **tasks:** preserve bulk optimistic task caches ([8bfcb3e](https://github.com/tutur3u/platform/commit/8bfcb3efa24d36fdfdc0854890e240627b194eb1))

## [0.10.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.9.0...tasks-ui-v0.10.0) (2026-08-07)


### Features

* **tasks:** compact board share access and tidy list settings ([7102179](https://github.com/tutur3u/platform/commit/71021798d67e0308c0a7790569521bd7b949d3c6))


### Bug Fixes

* **tasks:** let members read board sharing, and surface why access is denied ([81886e8](https://github.com/tutur3u/platform/commit/81886e813942f95ddef4ab6dd881962c83f725c7))

## [0.9.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.8.0...tasks-ui-v0.9.0) (2026-08-06)


### Features

* **tasks:** add task list settings shortcuts ([50031da](https://github.com/tutur3u/platform/commit/50031dac99961f35ab88aa6b286c4f11d23df7cc))
* **tasks:** add task list settings shortcuts ([#5103](https://github.com/tutur3u/platform/issues/5103)) ([9de306c](https://github.com/tutur3u/platform/commit/9de306c6e95c6dc0c7c71d058f5841c759bd91ff))

## [0.8.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.7.0...tasks-ui-v0.8.0) (2026-08-06)


### Features

* **tasks:** add board access and capacity controls ([87456b0](https://github.com/tutur3u/platform/commit/87456b07c3ab1481caf143d88f03e79afa161e4b))
* **tasks:** add board access and capacity controls ([#5094](https://github.com/tutur3u/platform/issues/5094)) ([d9e41ee](https://github.com/tutur3u/platform/commit/d9e41ee3a8dad0410648dc5544277147d23f9d73))


### Bug Fixes

* **tasks:** isolate board member query cache ([31760be](https://github.com/tutur3u/platform/commit/31760be3d857cd4b55ee9ed89e18e8fa13f8e940))
* **tasks:** isolate board member query cache ([#5096](https://github.com/tutur3u/platform/issues/5096)) ([687c402](https://github.com/tutur3u/platform/commit/687c402901e771872f0dbec8302c924f5b80b800))

## [0.7.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.6.0...tasks-ui-v0.7.0) (2026-08-04)


### Features

* **tasks:** improve board settings controls ([acc14d5](https://github.com/tutur3u/platform/commit/acc14d56c55ad463ff35e226a2bd3ee9d8fba386))


### Bug Fixes

* **tasks:** stabilize settings and list ordering ([6dc9f2e](https://github.com/tutur3u/platform/commit/6dc9f2e8fdbe3185508fe6b14fa149e69cb040ed))

## [0.6.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.5.0...tasks-ui-v0.6.0) (2026-07-27)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **tasks:** add leaderboard leave button and per-member sparklines ([5b65238](https://github.com/tutur3u/platform/commit/5b65238c5388345acebacc6cbc612c738cdc3079))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** keep realtime on deep-linked cross-workspace tasks ([5a29e78](https://github.com/tutur3u/platform/commit/5a29e78d9d1aec736bb77f9ee35f8dee73e62e7e))
* **tasks:** resilient AI catch-up fallback and recommended-next panel ([393f47c](https://github.com/tutur3u/platform/commit/393f47c558dcf10cf4c6bd189330e052d2a72f56))
* **tasks:** revamp progress, goals, analytics & leaderboards with TrackBear parity ([d1bda0e](https://github.com/tutur3u/platform/commit/d1bda0e37a6ed45eb22aaa3bb20c4d62dc41a19f))


### Bug Fixes

* **ci:** keep task helper collection source-only ([7355a05](https://github.com/tutur3u/platform/commit/7355a05385ccd8d1e2d1bcf6ac15ae5297e057ad))
* **ci:** resolve shared task helper during e2e collection ([0319a3b](https://github.com/tutur3u/platform/commit/0319a3bd0df12592b823b7cebdff38cea3e50836))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **tasks:** align selected checkbox icon ([805f7d9](https://github.com/tutur3u/platform/commit/805f7d97c9422ba59298f8b19db56b2b2d64af42))
* **tasks:** compile task styles with UI globals ([bb1d600](https://github.com/tutur3u/platform/commit/bb1d600d392f78827cc9a6928a1ce0c264c2d80c))
* **tasks:** isolate selection state from tooltips ([d91670e](https://github.com/tutur3u/platform/commit/d91670e304332220bc6c952c8ae9432b10844e04))
* **tasks:** make board settings dialog singleton ([f6e9093](https://github.com/tutur3u/platform/commit/f6e9093724b90246060cf7151ba749b36fc43629))
* **tasks:** open the dialog on Properties and settle it in one step ([2780950](https://github.com/tutur3u/platform/commit/2780950d7aa3ca7f3f3d382bc3675a23201408f5))
* **tasks:** quiet the description toolbar and name the compact action honestly ([51838a0](https://github.com/tutur3u/platform/commit/51838a08a1875a44cd4c7f539b35203f890e1a39))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))
* **tasks:** restore scrolling in the focused task dialog ([ee2d312](https://github.com/tutur3u/platform/commit/ee2d31292ff44b7a725c2f7520b7f47cf3e467c8))
* **tasks:** restore task board layout styles ([29e052b](https://github.com/tutur3u/platform/commit/29e052b792af9626c5243e6f8178a4905e508a32))
* **tasks:** restore task description on deep-link opens ([56d4efa](https://github.com/tutur3u/platform/commit/56d4efabd2f036e7dae39588d8aed7b129fa9a11))
* **tasks:** show one skeleton per task dialog open ([944288b](https://github.com/tutur3u/platform/commit/944288bdc869ee80b3cdf537ee10feb17fdada22))
* **tasks:** stop the task dialog remounting after it opens ([9a423da](https://github.com/tutur3u/platform/commit/9a423daf7e7c1e901a63ddcc1a8a94ddff9192c9))
* **tasks:** widen focused task dialog ([e9fd624](https://github.com/tutur3u/platform/commit/e9fd624358cfff87b1692162c6df499bb821d5c2))

## [0.5.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.4.0...tasks-ui-v0.5.0) (2026-07-27)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **tasks:** add leaderboard leave button and per-member sparklines ([5b65238](https://github.com/tutur3u/platform/commit/5b65238c5388345acebacc6cbc612c738cdc3079))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** keep realtime on deep-linked cross-workspace tasks ([5a29e78](https://github.com/tutur3u/platform/commit/5a29e78d9d1aec736bb77f9ee35f8dee73e62e7e))
* **tasks:** resilient AI catch-up fallback and recommended-next panel ([393f47c](https://github.com/tutur3u/platform/commit/393f47c558dcf10cf4c6bd189330e052d2a72f56))
* **tasks:** revamp progress, goals, analytics & leaderboards with TrackBear parity ([d1bda0e](https://github.com/tutur3u/platform/commit/d1bda0e37a6ed45eb22aaa3bb20c4d62dc41a19f))


### Bug Fixes

* **ci:** keep task helper collection source-only ([7355a05](https://github.com/tutur3u/platform/commit/7355a05385ccd8d1e2d1bcf6ac15ae5297e057ad))
* **ci:** resolve shared task helper during e2e collection ([0319a3b](https://github.com/tutur3u/platform/commit/0319a3bd0df12592b823b7cebdff38cea3e50836))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **tasks:** align selected checkbox icon ([805f7d9](https://github.com/tutur3u/platform/commit/805f7d97c9422ba59298f8b19db56b2b2d64af42))
* **tasks:** compile task styles with UI globals ([bb1d600](https://github.com/tutur3u/platform/commit/bb1d600d392f78827cc9a6928a1ce0c264c2d80c))
* **tasks:** isolate selection state from tooltips ([d91670e](https://github.com/tutur3u/platform/commit/d91670e304332220bc6c952c8ae9432b10844e04))
* **tasks:** make board settings dialog singleton ([f6e9093](https://github.com/tutur3u/platform/commit/f6e9093724b90246060cf7151ba749b36fc43629))
* **tasks:** open the dialog on Properties and settle it in one step ([2780950](https://github.com/tutur3u/platform/commit/2780950d7aa3ca7f3f3d382bc3675a23201408f5))
* **tasks:** quiet the description toolbar and name the compact action honestly ([51838a0](https://github.com/tutur3u/platform/commit/51838a08a1875a44cd4c7f539b35203f890e1a39))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))
* **tasks:** restore scrolling in the focused task dialog ([ee2d312](https://github.com/tutur3u/platform/commit/ee2d31292ff44b7a725c2f7520b7f47cf3e467c8))
* **tasks:** restore task board layout styles ([29e052b](https://github.com/tutur3u/platform/commit/29e052b792af9626c5243e6f8178a4905e508a32))
* **tasks:** restore task description on deep-link opens ([56d4efa](https://github.com/tutur3u/platform/commit/56d4efabd2f036e7dae39588d8aed7b129fa9a11))
* **tasks:** show one skeleton per task dialog open ([944288b](https://github.com/tutur3u/platform/commit/944288bdc869ee80b3cdf537ee10feb17fdada22))
* **tasks:** stop the task dialog remounting after it opens ([9a423da](https://github.com/tutur3u/platform/commit/9a423daf7e7c1e901a63ddcc1a8a94ddff9192c9))
* **tasks:** widen focused task dialog ([e9fd624](https://github.com/tutur3u/platform/commit/e9fd624358cfff87b1692162c6df499bb821d5c2))

## [0.4.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.3.0...tasks-ui-v0.4.0) (2026-07-27)


### Features

* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** keep realtime on deep-linked cross-workspace tasks ([5a29e78](https://github.com/tutur3u/platform/commit/5a29e78d9d1aec736bb77f9ee35f8dee73e62e7e))


### Bug Fixes

* **tasks:** open the dialog on Properties and settle it in one step ([2780950](https://github.com/tutur3u/platform/commit/2780950d7aa3ca7f3f3d382bc3675a23201408f5))
* **tasks:** quiet the description toolbar and name the compact action honestly ([51838a0](https://github.com/tutur3u/platform/commit/51838a08a1875a44cd4c7f539b35203f890e1a39))
* **tasks:** restore scrolling in the focused task dialog ([ee2d312](https://github.com/tutur3u/platform/commit/ee2d31292ff44b7a725c2f7520b7f47cf3e467c8))
* **tasks:** show one skeleton per task dialog open ([944288b](https://github.com/tutur3u/platform/commit/944288bdc869ee80b3cdf537ee10feb17fdada22))
* **tasks:** stop the task dialog remounting after it opens ([9a423da](https://github.com/tutur3u/platform/commit/9a423daf7e7c1e901a63ddcc1a8a94ddff9192c9))

## [0.3.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.2.1...tasks-ui-v0.3.0) (2026-07-25)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** persist settings dialog state ([04d2128](https://github.com/tutur3u/platform/commit/04d212807b6fabf33f43743c0b779ba9499334ba))
* **tasks:** restore task description on deep-link opens ([56d4efa](https://github.com/tutur3u/platform/commit/56d4efabd2f036e7dae39588d8aed7b129fa9a11))
* **tasks:** widen focused task dialog ([e9fd624](https://github.com/tutur3u/platform/commit/e9fd624358cfff87b1692162c6df499bb821d5c2))

## [0.2.1](https://github.com/tutur3u/platform/compare/tasks-ui-v0.2.0...tasks-ui-v0.2.1) (2026-07-21)


### Bug Fixes

* **ci:** keep task helper collection source-only ([7355a05](https://github.com/tutur3u/platform/commit/7355a05385ccd8d1e2d1bcf6ac15ae5297e057ad))
* **ci:** resolve shared task helper during e2e collection ([0319a3b](https://github.com/tutur3u/platform/commit/0319a3bd0df12592b823b7cebdff38cea3e50836))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **tasks:** make board settings dialog singleton ([f6e9093](https://github.com/tutur3u/platform/commit/f6e9093724b90246060cf7151ba749b36fc43629))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))

## [0.2.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.1.0...tasks-ui-v0.2.0) (2026-07-18)


### Features

* **tasks:** add leaderboard leave button and per-member sparklines ([5b65238](https://github.com/tutur3u/platform/commit/5b65238c5388345acebacc6cbc612c738cdc3079))
* **tasks:** resilient AI catch-up fallback and recommended-next panel ([393f47c](https://github.com/tutur3u/platform/commit/393f47c558dcf10cf4c6bd189330e052d2a72f56))
* **tasks:** revamp progress, goals, analytics & leaderboards with TrackBear parity ([d1bda0e](https://github.com/tutur3u/platform/commit/d1bda0e37a6ed45eb22aaa3bb20c4d62dc41a19f))


### Bug Fixes

* **tasks:** align selected checkbox icon ([805f7d9](https://github.com/tutur3u/platform/commit/805f7d97c9422ba59298f8b19db56b2b2d64af42))
* **tasks:** compile task styles with UI globals ([bb1d600](https://github.com/tutur3u/platform/commit/bb1d600d392f78827cc9a6928a1ce0c264c2d80c))
* **tasks:** isolate selection state from tooltips ([d91670e](https://github.com/tutur3u/platform/commit/d91670e304332220bc6c952c8ae9432b10844e04))
* **tasks:** restore task board layout styles ([29e052b](https://github.com/tutur3u/platform/commit/29e052b792af9626c5243e6f8178a4905e508a32))
