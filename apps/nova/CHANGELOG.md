# Changelog

## [0.23.0](https://github.com/tutur3u/platform/compare/nova-v0.22.0...nova-v0.23.0) (2026-07-11)


### Features

* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.22.0](https://github.com/tutur3u/platform/compare/nova-v0.21.0...nova-v0.22.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))

## [0.21.0](https://github.com/tutur3u/platform/compare/nova-v0.20.1...nova-v0.21.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))

## [0.20.1](https://github.com/tutur3u/platform/compare/nova-v0.20.0...nova-v0.20.1) (2026-07-03)


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))

## [0.20.0](https://github.com/tutur3u/platform/compare/nova-v0.19.0...nova-v0.20.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))

## [0.19.0](https://github.com/tutur3u/platform/compare/nova-v0.18.3...nova-v0.19.0) (2026-06-24)


### Features

* **tasks:** add shareable kanban task plans ([2de4e58](https://github.com/tutur3u/platform/commit/2de4e5819673e11b01cdc1f21c317f33dc196f56))


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
* **i18n:** sync task planner keys ([fea50fd](https://github.com/tutur3u/platform/commit/fea50fddfb3019d9dfeeb834ec5444f2dbe01554))
* **tasks:** polish board activity and history diffs ([cdc1c2c](https://github.com/tutur3u/platform/commit/cdc1c2cbdcc283ee30e959435b70f03e84b999de))

## [0.18.3](https://github.com/tutur3u/platform/compare/nova-v0.18.2...nova-v0.18.3) (2026-06-17)


### Bug Fixes

* **deps:** keep lodash on latest reviewed artifact ([19909b3](https://github.com/tutur3u/platform/commit/19909b334581d3b58cdcd19e9b2fde553f7ad60a))
* **deps:** pin reviewed lodash artifact ([dfcf585](https://github.com/tutur3u/platform/commit/dfcf585fab9cc0b425cac5d60c5bccc997340be5))

## [0.18.2](https://github.com/tutur3u/platform/compare/nova-v0.18.1...nova-v0.18.2) (2026-06-13)


### Bug Fixes

* **tasks:** sync task realtime with broadcasts ([8c56154](https://github.com/tutur3u/platform/commit/8c56154e517797dcac0ec0971d8a474b50292706))

## [0.18.1](https://github.com/tutur3u/platform/compare/nova-v0.18.0...nova-v0.18.1) (2026-06-11)


### Bug Fixes

* **chat:** throttle Zalo phone sync and group mirrored chats ([51f3ab5](https://github.com/tutur3u/platform/commit/51f3ab5cec4a7a0c7403100045a6d7500975caf3))
* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.18.0](https://github.com/tutur3u/platform/compare/nova-v0.17.0...nova-v0.18.0) (2026-06-10)


### Features

* **chat:** add personal channels and root integrations ([fb5e753](https://github.com/tutur3u/platform/commit/fb5e7534588c7015449313fc4a752b70732f227e))
* **chat:** add Zalo QR personal sync ([f86e710](https://github.com/tutur3u/platform/commit/f86e710a39a790c44ba35c5a43f785dc1f66e27e))
* **chat:** merge personal channels and root integrations ([22d50ce](https://github.com/tutur3u/platform/commit/22d50ce0d75e36e0beaa973ef59cbd296e22dc35))

## [0.17.0](https://github.com/tutur3u/platform/compare/nova-v0.16.0...nova-v0.17.0) (2026-06-08)


### Features

* **web:** add UI component showcase ([8fcbc6b](https://github.com/tutur3u/platform/commit/8fcbc6b4b64c3f9e9da5eb2ddd6d504a83dd2ec4))
* **web:** merge UI component showcase ([5f4e840](https://github.com/tutur3u/platform/commit/5f4e840960a114952d728b88caf914d2e05959b3))


### Bug Fixes

* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))

## [0.16.0](https://github.com/tutur3u/platform/compare/nova-v0.15.0...nova-v0.16.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))


### Bug Fixes

* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))

## [0.15.0](https://github.com/tutur3u/platform/compare/nova-v0.14.0...nova-v0.15.0) (2026-06-02)


### Features

* **chat:** add ai agent operations controls ([2429279](https://github.com/tutur3u/platform/commit/2429279777e74014abb80699a7359038eb751460))
