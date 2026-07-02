# Changelog

## [0.12.1](https://github.com/tutur3u/platform/compare/sdk-v0.12.0...sdk-v0.12.1) (2026-07-02)


### Bug Fixes

* **cli:** preserve markdown tables in task descriptions ([9faf8ba](https://github.com/tutur3u/platform/commit/9faf8ba44b92565a9dfc2949c496654fc1fea9b3))

## [0.12.0](https://github.com/tutur3u/platform/compare/sdk-v0.11.0...sdk-v0.12.0) (2026-06-29)


### Features

* **cli:** add task search ([b8ec86f](https://github.com/tutur3u/platform/commit/b8ec86ffd7bf401d32ac29f7c4db0ee60565b717))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **external-apps:** allow signed asset uploads ([0d83b3b](https://github.com/tutur3u/platform/commit/0d83b3b50b235faf5894539a18c955ad0432e0b3))

## [0.11.0](https://github.com/tutur3u/platform/compare/sdk-v0.10.1...sdk-v0.11.0) (2026-06-26)


### Features

* **cli:** support task description editing ([c72390b](https://github.com/tutur3u/platform/commit/c72390b909054af596ccbed8af6ded9f266dfdd4))
* **cms:** integrate exocorpse external project ([c07081b](https://github.com/tutur3u/platform/commit/c07081b0bd98379eac97c3258b483ad8e39c9b39))
* **epm:** batch external project entry mutations ([59dc436](https://github.com/tutur3u/platform/commit/59dc436c5b7485a5aaf9b82a445dc0bacd2cb1bc))

## [0.10.1](https://github.com/tutur3u/platform/compare/sdk-v0.10.0...sdk-v0.10.1) (2026-06-17)


### Bug Fixes

* **cli:** escape table control characters ([73b7c58](https://github.com/tutur3u/platform/commit/73b7c58b7d9c1168ba1ae7651131045726ce082e))
* **cli:** escape whoami metadata ([6227dd0](https://github.com/tutur3u/platform/commit/6227dd07b7399347d75a7760acfedfbae53cb214))

## [0.10.0](https://github.com/tutur3u/platform/compare/sdk-v0.9.0...sdk-v0.10.0) (2026-06-11)


### Features

* **cli:** add calendar commands ([b916c1a](https://github.com/tutur3u/platform/commit/b916c1a0eeecfae961292466de0e9b37b9512b69))
* **cli:** add finance wallet checkpoints ([4f77821](https://github.com/tutur3u/platform/commit/4f778210e753f6241a52528c64a9cb0756fb20dc))


### Bug Fixes

* **sdk:** respect timezone for finance dates ([ad5e725](https://github.com/tutur3u/platform/commit/ad5e72533f45dc2ebf3bab451bc3b98f3a68d8ef))

## [0.9.0](https://github.com/tutur3u/platform/compare/sdk-v0.8.0...sdk-v0.9.0) (2026-06-11)


### Features

* **finance:** add CLI tag CRUD ([bc60f8e](https://github.com/tutur3u/platform/commit/bc60f8eb1af2fe650a28ef44ec33466a4ce831de))

## [0.8.0](https://github.com/tutur3u/platform/compare/sdk-v0.7.0...sdk-v0.8.0) (2026-06-10)


### Features

* **devbox:** add runner service repair command ([c4ea7a1](https://github.com/tutur3u/platform/commit/c4ea7a13d5d9f3b07f98cb7de3c5612f599690fb))


### Bug Fixes

* **devbox:** export runner token in service wrapper ([c0f0cb9](https://github.com/tutur3u/platform/commit/c0f0cb9184eaacef1e37ab540d330d6f7b4f6c62))

## [0.7.0](https://github.com/tutur3u/platform/compare/sdk-v0.6.1...sdk-v0.7.0) (2026-06-10)


### Features

* **cli:** add host switching and finance transfers ([6c732c1](https://github.com/tutur3u/platform/commit/6c732c13fae9173e97cadb0b4534f37d42908a92))
* **devbox:** add infrastructure control panel ([5bfbbd0](https://github.com/tutur3u/platform/commit/5bfbbd025c8482d5ef8218d35599a9d223b5b214))
* **devbox:** add runner setup and tunnel workflows ([27c55d5](https://github.com/tutur3u/platform/commit/27c55d55899c89a7584ab7c3249c9d9a61b6a0b9))
* **devbox:** add runner shutdown and observability ([ebcae14](https://github.com/tutur3u/platform/commit/ebcae148dd4109e6a2f18f089de730dcd8d4f30e))


### Bug Fixes

* **ci:** auto-recover package release dependencies ([40b2539](https://github.com/tutur3u/platform/commit/40b25390c903194a3c85cc627c737a4acd0d6fa9))
* **devbox:** keep setup prompt tests deterministic in ci ([d65cbf4](https://github.com/tutur3u/platform/commit/d65cbf48fe3d99e617ba165f7f25d1e3085e2733))

## [0.6.1](https://github.com/tutur3u/platform/compare/sdk-v0.6.0...sdk-v0.6.1) (2026-06-09)


### Bug Fixes

* **ci:** recover releases and package tsgo builds ([d82b846](https://github.com/tutur3u/platform/commit/d82b846c6232d9fb72b7d2aa808020bc24292a19))

## [0.6.0](https://github.com/tutur3u/platform/compare/sdk-v0.5.0...sdk-v0.6.0) (2026-06-08)


### Features

* **devbox:** bootstrap platform checkout setup ([84dbff7](https://github.com/tutur3u/platform/commit/84dbff7bac9a4b2848fc6028348fbf429c7f0896))
* **devbox:** execute claimed runner jobs ([2d99e6c](https://github.com/tutur3u/platform/commit/2d99e6cb6b275f7ddf423a021cb1cfcb1d944235))


### Bug Fixes

* **ci:** stabilize package release workflows ([d6243c2](https://github.com/tutur3u/platform/commit/d6243c2d7ee7ae599d9f17fba4be9f9cc71a1722))
* **devbox:** accept CLI app-session auth ([2e1080e](https://github.com/tutur3u/platform/commit/2e1080e34285399f083a6b8c17a9ee73cb8ecd5f))

## [0.5.0](https://github.com/tutur3u/platform/compare/sdk-v0.4.9...sdk-v0.5.0) (2026-06-03)


### Features

* **devbox:** add remote devbox foundation ([88f81d2](https://github.com/tutur3u/platform/commit/88f81d2a369ba80a3ee601122ca10d9031b63b87))


### Bug Fixes

* **devbox:** honor forwarded CLI flags ([bf999fb](https://github.com/tutur3u/platform/commit/bf999fbedb7c2ca88cf6db12f72193a17b63c546))
* **sdk:** escape cli selector text ([a48e4c5](https://github.com/tutur3u/platform/commit/a48e4c540d9e5474ea40bcb80610285340154cbc))
* **sdk:** keep cli bearer tokens same-origin ([96b8757](https://github.com/tutur3u/platform/commit/96b8757097a75e8f2f0421008c38dc07d81393ea))
* **storage:** mediate external project asset uploads ([e653210](https://github.com/tutur3u/platform/commit/e6532109fc20d54f2df1c11cd2412af6ca1dc185))
