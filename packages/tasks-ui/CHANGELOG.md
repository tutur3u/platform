# Changelog

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
