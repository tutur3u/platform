# Changelog

## [0.15.0](https://github.com/tutur3u/platform/compare/calendar-v0.14.0...calendar-v0.15.0) (2026-07-21)


### Features

* **calendar:** redesign workspace sidebar ([194e126](https://github.com/tutur3u/platform/commit/194e1267e573e50416f3866826e2a182b3ff8729))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))


### Bug Fixes

* **calendar:** deduplicate mirrored events ([04716f3](https://github.com/tutur3u/platform/commit/04716f3afa84664f9a7396f67bda62d388680fb3))
* **calendar:** reconcile deleted provider events ([fd0cedb](https://github.com/tutur3u/platform/commit/fd0cedba8fea7212516bf8ba4aae4c83ad2c2293))
* **calendar:** restore connection visibility controls ([a1cf05b](https://github.com/tutur3u/platform/commit/a1cf05b0c1918367a33884bdbddeb658bdc8d9a4))
* **calendar:** restore provider calendar management ([68753a8](https://github.com/tutur3u/platform/commit/68753a865dcc25a35cd53e5fc7ced1913b9a10bb))
* **platform:** repair calendar sync and member auth ([fcf8f89](https://github.com/tutur3u/platform/commit/fcf8f89100fb9fc5de024dccb7605a3b9d197cfb))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))

## [0.14.0](https://github.com/tutur3u/platform/compare/calendar-v0.13.0...calendar-v0.14.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** add leaderboard leave button and per-member sparklines ([5b65238](https://github.com/tutur3u/platform/commit/5b65238c5388345acebacc6cbc612c738cdc3079))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))
* **tasks:** resilient AI catch-up fallback and recommended-next panel ([393f47c](https://github.com/tutur3u/platform/commit/393f47c558dcf10cf4c6bd189330e052d2a72f56))
* **tasks:** revamp progress, goals, analytics & leaderboards with TrackBear parity ([d1bda0e](https://github.com/tutur3u/platform/commit/d1bda0e37a6ed45eb22aaa3bb20c4d62dc41a19f))


### Bug Fixes

* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))
* **tasks:** compile task styles with UI globals ([bb1d600](https://github.com/tutur3u/platform/commit/bb1d600d392f78827cc9a6928a1ce0c264c2d80c))
* **tasks:** restore task board layout styles ([29e052b](https://github.com/tutur3u/platform/commit/29e052b792af9626c5243e6f8178a4905e508a32))

## [0.13.0](https://github.com/tutur3u/platform/compare/calendar-v0.12.0...calendar-v0.13.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.12.0](https://github.com/tutur3u/platform/compare/calendar-v0.11.0...calendar-v0.12.0) (2026-07-11)


### Features

* **calendar:** migrate calendar module from web to dedicated calendar app ([678b949](https://github.com/tutur3u/platform/commit/678b949096e90d1c9d215fea50d0eb4ba9698a7e))
* **calendar:** port hours + colors settings into the calendar app ([fe7fa76](https://github.com/tutur3u/platform/commit/fe7fa7668137bcdd5f9f20af9bfa434b3c3037e9))
* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **calendar:** document + surface the e2ee master key requirement ([28d9db8](https://github.com/tutur3u/platform/commit/28d9db87357e678645be531cc445682823edf1c8))
* **calendar:** use GitHub-owned Vercel deploys ([946a8a5](https://github.com/tutur3u/platform/commit/946a8a589b688848d4a3da0ebf19f09e5dd41168))
* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.11.0](https://github.com/tutur3u/platform/compare/calendar-v0.10.0...calendar-v0.11.0) (2026-07-11)


### Features

* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.10.0](https://github.com/tutur3u/platform/compare/calendar-v0.9.0...calendar-v0.10.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))

## [0.9.0](https://github.com/tutur3u/platform/compare/calendar-v0.8.0...calendar-v0.9.0) (2026-07-05)


### Features

* **calendar:** port hours + colors settings into the calendar app ([fe7fa76](https://github.com/tutur3u/platform/commit/fe7fa7668137bcdd5f9f20af9bfa434b3c3037e9))
* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))


### Bug Fixes

* **calendar:** document + surface the e2ee master key requirement ([28d9db8](https://github.com/tutur3u/platform/commit/28d9db87357e678645be531cc445682823edf1c8))
* **calendar:** use GitHub-owned Vercel deploys ([946a8a5](https://github.com/tutur3u/platform/commit/946a8a589b688848d4a3da0ebf19f09e5dd41168))

## [0.8.0](https://github.com/tutur3u/platform/compare/calendar-v0.7.0...calendar-v0.8.0) (2026-07-03)


### Features

* **calendar:** migrate calendar module from web to dedicated calendar app ([678b949](https://github.com/tutur3u/platform/commit/678b949096e90d1c9d215fea50d0eb4ba9698a7e))


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))

## [0.7.0](https://github.com/tutur3u/platform/compare/calendar-v0.6.0...calendar-v0.7.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))

## [0.6.0](https://github.com/tutur3u/platform/compare/calendar-v0.5.3...calendar-v0.6.0) (2026-06-24)


### Features

* **calendar:** add configurable two-way sync ([76078d8](https://github.com/tutur3u/platform/commit/76078d865618b4970b430b08f0db7a1a8c30ffcb))
* **tasks:** add shareable kanban task plans ([2de4e58](https://github.com/tutur3u/platform/commit/2de4e5819673e11b01cdc1f21c317f33dc196f56))
* **tasks:** consolidate board task settings ([b1d720a](https://github.com/tutur3u/platform/commit/b1d720ac865406d6dd0b2477c5ba04e336de9929))


### Bug Fixes

* **ci:** address remaining PR check failures ([7eb56d5](https://github.com/tutur3u/platform/commit/7eb56d51d8d14f6e2dd22c2d4c3514a560847333))
* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
* **i18n:** sync task planner keys ([fea50fd](https://github.com/tutur3u/platform/commit/fea50fddfb3019d9dfeeb834ec5444f2dbe01554))

## [0.5.3](https://github.com/tutur3u/platform/compare/calendar-v0.5.2...calendar-v0.5.3) (2026-06-15)


### Bug Fixes

* **calendar:** preserve Google OAuth refresh tokens ([4358623](https://github.com/tutur3u/platform/commit/4358623a2dbde76fd84af59bb18e540994a5d091))

## [0.5.2](https://github.com/tutur3u/platform/compare/calendar-v0.5.1...calendar-v0.5.2) (2026-06-13)


### Bug Fixes

* **sidebar:** persist collapsed state across refresh ([cb0eb6d](https://github.com/tutur3u/platform/commit/cb0eb6d0d30ecc8b3f3231255f9906e60a895f04))
* **tasks:** sync task realtime with broadcasts ([8c56154](https://github.com/tutur3u/platform/commit/8c56154e517797dcac0ec0971d8a474b50292706))

## [0.5.1](https://github.com/tutur3u/platform/compare/calendar-v0.5.0...calendar-v0.5.1) (2026-06-11)


### Bug Fixes

* **chat:** throttle Zalo phone sync and group mirrored chats ([51f3ab5](https://github.com/tutur3u/platform/commit/51f3ab5cec4a7a0c7403100045a6d7500975caf3))
* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.5.0](https://github.com/tutur3u/platform/compare/calendar-v0.4.0...calendar-v0.5.0) (2026-06-10)


### Features

* **chat:** add personal channels and root integrations ([fb5e753](https://github.com/tutur3u/platform/commit/fb5e7534588c7015449313fc4a752b70732f227e))
* **chat:** add Zalo QR personal sync ([f86e710](https://github.com/tutur3u/platform/commit/f86e710a39a790c44ba35c5a43f785dc1f66e27e))
* **chat:** merge personal channels and root integrations ([22d50ce](https://github.com/tutur3u/platform/commit/22d50ce0d75e36e0beaa973ef59cbd296e22dc35))

## [0.4.0](https://github.com/tutur3u/platform/compare/calendar-v0.3.0...calendar-v0.4.0) (2026-06-08)


### Features

* **calendar:** unify provider sync and connections UX ([5db53aa](https://github.com/tutur3u/platform/commit/5db53aa5d5d0ce915c2357cecc89e13b0c2af614))
* **platform:** add calendar sources and personal Zalo agents ([2746e72](https://github.com/tutur3u/platform/commit/2746e7297a43def06c3c2f12b7751dea94074113))
* **settings:** add fullscreen settings sheet ([809c78e](https://github.com/tutur3u/platform/commit/809c78e6a38ce1623249540e846c63d26cd8d3b9))


### Bug Fixes

* **auth:** stabilize satellite Supabase sessions ([231c4fa](https://github.com/tutur3u/platform/commit/231c4fac3238b94c96ad8e7a853b03ad97d166e4))
* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))
* **e2e:** harden portless readiness ([ee0e373](https://github.com/tutur3u/platform/commit/ee0e373a2f37ad7d1a869a065bad4673775297ef))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))

## [0.3.0](https://github.com/tutur3u/platform/compare/calendar-v0.2.0...calendar-v0.3.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))


### Bug Fixes

* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))

## [0.2.0](https://github.com/tutur3u/platform/compare/calendar-v0.1.0...calendar-v0.2.0) (2026-06-02)


### Features

* **chat:** add ai agent operations controls ([2429279](https://github.com/tutur3u/platform/commit/2429279777e74014abb80699a7359038eb751460))
