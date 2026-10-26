# Changelog

## [0.3.3](https://github.com/tutur3u/platform/compare/storage-core-v0.3.2...storage-core-v0.3.3) (2026-10-24)


### Bug Fixes

* **storage:** encode remaining client upload object keys ([c91d44f](https://github.com/tutur3u/platform/commit/c91d44fac7323b5a224ea332a8db3357c1b7e523))
* **storage:** preserve legacy URL delimiter keys ([#6512](https://github.com/tutur3u/platform/issues/6512)) ([3cccfcf](https://github.com/tutur3u/platform/commit/3cccfcf55bf490677042d399bfefae7ac42a9e73))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
* **storage:** return logical keys from encoded uploads and encode once ([72dd73e](https://github.com/tutur3u/platform/commit/72dd73e44ba5671c6cd890e666bb5a76147ba32d))

## [0.3.2](https://github.com/tutur3u/platform/compare/storage-core-v0.3.1...storage-core-v0.3.2) (2026-10-17)


### Bug Fixes

* **release:** reconcile production history before Contacts rollout ([dc017a2](https://github.com/tutur3u/platform/commit/dc017a227de6f284268b34690198972c06c52434)) ([#6241](https://github.com/tutur3u/platform/issues/6241)) ([66654a5](https://github.com/tutur3u/platform/commit/66654a5d7ad441a93070d1502f267d6d4e08a6cd))

## [0.3.1](https://github.com/tutur3u/platform/compare/storage-core-v0.3.0...storage-core-v0.3.1) (2026-10-09)


### Bug Fixes

* **storage:** allow empty playground checkpoints within quota ([889bf0d](https://github.com/tutur3u/platform/commit/889bf0d388e69c85f206d4aaf2cef82519b42097)) ([#5927](https://github.com/tutur3u/platform/issues/5927)) ([c6b9b79](https://github.com/tutur3u/platform/commit/c6b9b798edfa8b8f1a769a3b6dd8a8071265536d))

## [0.3.0](https://github.com/tutur3u/platform/compare/storage-core-v0.2.1...storage-core-v0.3.0) (2026-10-04)


### Features

* **identity:** protect creator usernames and profile media ([#5740](https://github.com/tutur3u/platform/issues/5740)) ([f8e18a4](https://github.com/tutur3u/platform/commit/f8e18a4c39d5bb65acfc5a680ccb9b2557ae4bed))
* **security:** scale abuse budgets by paid plans and memberships ([93ccf02](https://github.com/tutur3u/platform/commit/93ccf0237c79addaed3ab8b653bd8b57b27a9557))


### Bug Fixes

* **identity:** share atomic profile media ticket budgets ([82ec86e](https://github.com/tutur3u/platform/commit/82ec86efdb61449fa4dbc456db03447a73aa7e3f))
* **security:** address egress guard review findings ([1e4916a](https://github.com/tutur3u/platform/commit/1e4916a7c9216ac1d5f9beadab0e69144337db7c))
* **security:** isolate caller budgets and preserve download semantics ([de5e090](https://github.com/tutur3u/platform/commit/de5e090f57e58b94bd235c47c494264a1192f5bf))
* **storage:** bound CMS downloads and API usage without Redis ([277ffeb](https://github.com/tutur3u/platform/commit/277ffebb738fbdb787fbe465cf6400de7ae910b2)) ([#5736](https://github.com/tutur3u/platform/issues/5736)) ([bbfc428](https://github.com/tutur3u/platform/commit/bbfc42886a0953ab11d303cdcceed8968127d40b))
* **storage:** isolate profile upload error identity ([f5c3486](https://github.com/tutur3u/platform/commit/f5c34863bbcac45513ef28bf98d1636a7443424b))

## [0.2.1](https://github.com/tutur3u/platform/compare/storage-core-v0.2.0...storage-core-v0.2.1) (2026-09-20)


### Bug Fixes

* **billing:** fail closed on unknown usage and subscription capacity ([ccfcba4](https://github.com/tutur3u/platform/commit/ccfcba46f236981b1d4e59e1c389bee8472b2ca8)) ([#5333](https://github.com/tutur3u/platform/issues/5333)) ([a308a89](https://github.com/tutur3u/platform/commit/a308a8996f17a81c76c8fb0d498a14d8dbf289c3))

## [0.2.0](https://github.com/tutur3u/platform/compare/storage-core-v0.1.1...storage-core-v0.2.0) (2026-07-25)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* **ci:** build dist-only packages before the release check ([8eecae4](https://github.com/tutur3u/platform/commit/8eecae440f0bbfc99d996ecedbc26d8d93c7c11a))
* **ci:** resolve types from source in storage-core tests ([080328a](https://github.com/tutur3u/platform/commit/080328a8e94f37d121c53c547b3f99d1421c7202))

## [0.1.1](https://github.com/tutur3u/platform/compare/storage-core-v0.1.0...storage-core-v0.1.1) (2026-07-05)


### Bug Fixes

* **ci:** finish storage-core workspace integration ([ba786af](https://github.com/tutur3u/platform/commit/ba786af917d02ff65bf7d59e2c198a86f5fbc7ff))
