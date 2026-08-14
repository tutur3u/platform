# Changelog

## [0.14.0](https://github.com/tutur3u/platform/compare/pay-v0.13.2...pay-v0.14.0) (2026-08-14)


### Features

* **workspaces:** revamp invitation access flow ([7ea94af](https://github.com/tutur3u/platform/commit/7ea94afc2c5e14af1c83d1478ad9c006268b13c0))
* **workspaces:** support multi-role invitations ([f6f78ba](https://github.com/tutur3u/platform/commit/f6f78bac6c2120fd70c09e85c075c4206be4f897))


### Bug Fixes

* **satellites:** preserve workspace actors ([e268b8d](https://github.com/tutur3u/platform/commit/e268b8d587f3d4d3025a16c3e001ff5dbb16200b))
* **workspaces:** manage roles for pending invites ([2466f6c](https://github.com/tutur3u/platform/commit/2466f6cbbd447207d87eb0e0d78b3c713b02b739))

## [0.13.2](https://github.com/tutur3u/platform/compare/pay-v0.13.1...pay-v0.13.2) (2026-08-11)


### Bug Fixes

* **i18n:** preserve prerender locale fallback ([3a09b07](https://github.com/tutur3u/platform/commit/3a09b070abda729649f269310a70db78f9b3a1cc))

## [0.13.1](https://github.com/tutur3u/platform/compare/pay-v0.13.0...pay-v0.13.1) (2026-08-11)


### Bug Fixes

* **i18n:** keep locale roots prerenderable ([d0eb02c](https://github.com/tutur3u/platform/commit/d0eb02c452c4ad125907f4c67b24797782caf907))
* **i18n:** keep request locale build-safe ([cc575a2](https://github.com/tutur3u/platform/commit/cc575a2e951ef8fb46a4b8593d0dcfcbe03cd4e7))

## [0.13.0](https://github.com/tutur3u/platform/compare/pay-v0.12.0...pay-v0.13.0) (2026-08-07)


### Features

* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))

## [0.12.0](https://github.com/tutur3u/platform/compare/pay-v0.11.0...pay-v0.12.0) (2026-08-06)


### Features

* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))

## [0.11.0](https://github.com/tutur3u/platform/compare/pay-v0.10.0...pay-v0.11.0) (2026-08-04)


### Features

* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))

## [0.10.0](https://github.com/tutur3u/platform/compare/pay-v0.9.0...pay-v0.10.0) (2026-07-28)


### Features

* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))

## [0.9.0](https://github.com/tutur3u/platform/compare/pay-v0.8.0...pay-v0.9.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **pay:** restore AI credit wallet loading ([9b3aa65](https://github.com/tutur3u/platform/commit/9b3aa65759c50cff972a72bf1cf09917d4992e19))
* **pay:** serve AI credits from Pay ([cb9a9b5](https://github.com/tutur3u/platform/commit/cb9a9b5d112c17562dea73fd259ea8a03ac08563))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.8.0](https://github.com/tutur3u/platform/compare/pay-v0.7.1...pay-v0.8.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **pay:** restore AI credit wallet loading ([9b3aa65](https://github.com/tutur3u/platform/commit/9b3aa65759c50cff972a72bf1cf09917d4992e19))
* **pay:** serve AI credits from Pay ([cb9a9b5](https://github.com/tutur3u/platform/commit/cb9a9b5d112c17562dea73fd259ea8a03ac08563))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.7.1](https://github.com/tutur3u/platform/compare/pay-v0.7.0...pay-v0.7.1) (2026-07-27)


### Bug Fixes

* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))

## [0.7.0](https://github.com/tutur3u/platform/compare/pay-v0.6.0...pay-v0.7.0) (2026-07-25)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))

## [0.6.0](https://github.com/tutur3u/platform/compare/pay-v0.5.0...pay-v0.6.0) (2026-07-21)


### Features

* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))


### Bug Fixes

* **pay:** restore AI credit wallet loading ([9b3aa65](https://github.com/tutur3u/platform/commit/9b3aa65759c50cff972a72bf1cf09917d4992e19))
* **pay:** serve AI credits from Pay ([cb9a9b5](https://github.com/tutur3u/platform/commit/cb9a9b5d112c17562dea73fd259ea8a03ac08563))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))

## [0.5.0](https://github.com/tutur3u/platform/compare/pay-v0.4.0...pay-v0.5.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))

## [0.4.0](https://github.com/tutur3u/platform/compare/pay-v0.3.0...pay-v0.4.0) (2026-07-13)


### Features

* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.3.0](https://github.com/tutur3u/platform/compare/pay-v0.2.0...pay-v0.3.0) (2026-07-11)


### Features

* **pay:** complete payment ownership migration ([e79e421](https://github.com/tutur3u/platform/commit/e79e42107fb3ee34e2cae2703ec33570da6ce950))
* **pay:** host the billing surface on pay; redirect web /billing ([5162706](https://github.com/tutur3u/platform/commit/5162706bc1de154f8dbfc2ac2aa82b4423fb8a8c))
* **pay:** move payment + billing API routes into apps/pay ([8a932e9](https://github.com/tutur3u/platform/commit/8a932e917f4a1becaa0564794a643fcd9cff7300))
* **pay:** scaffold apps/pay satellite (pay.tuturuuu.com, port 7826) ([3d6e45c](https://github.com/tutur3u/platform/commit/3d6e45cca6a315fe67213e438144b73103bae2f5))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.2.0](https://github.com/tutur3u/platform/compare/pay-v0.1.0...pay-v0.2.0) (2026-07-11)


### Features

* **pay:** complete payment ownership migration ([e79e421](https://github.com/tutur3u/platform/commit/e79e42107fb3ee34e2cae2703ec33570da6ce950))
* **pay:** host the billing surface on pay; redirect web /billing ([5162706](https://github.com/tutur3u/platform/commit/5162706bc1de154f8dbfc2ac2aa82b4423fb8a8c))
* **pay:** move payment + billing API routes into apps/pay ([8a932e9](https://github.com/tutur3u/platform/commit/8a932e917f4a1becaa0564794a643fcd9cff7300))
* **pay:** scaffold apps/pay satellite (pay.tuturuuu.com, port 7826) ([3d6e45c](https://github.com/tutur3u/platform/commit/3d6e45cca6a315fe67213e438144b73103bae2f5))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))
