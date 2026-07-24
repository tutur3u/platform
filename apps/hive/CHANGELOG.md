# Changelog

## [0.12.0](https://github.com/tutur3u/platform/compare/hive-v0.11.0...hive-v0.12.0) (2026-07-24)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))

## [0.11.0](https://github.com/tutur3u/platform/compare/hive-v0.10.0...hive-v0.11.0) (2026-07-21)


### Features

* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))


### Bug Fixes

* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))

## [0.10.0](https://github.com/tutur3u/platform/compare/hive-v0.9.0...hive-v0.10.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))

## [0.9.0](https://github.com/tutur3u/platform/compare/hive-v0.8.0...hive-v0.9.0) (2026-07-13)


### Features

* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.8.0](https://github.com/tutur3u/platform/compare/hive-v0.7.0...hive-v0.8.0) (2026-07-11)


### Features

* **contacts:** scaffold contacts.tuturuuu.com satellite shell + monorepo registration ([7e335fc](https://github.com/tutur3u/platform/commit/7e335fc036c4a45ed189095ecd10a43ee002294b))
* **education:** extract shared education libs into @tuturuuu/education-core and ready learn/teach for API hosting ([dd77db3](https://github.com/tutur3u/platform/commit/dd77db3590786cad51ce76c4d18b30240173ef7e))
* **finance:** extract shared finance route-auth + storage libs into @tuturuuu/finance-core ([79140d2](https://github.com/tutur3u/platform/commit/79140d2ddb5be4b6fb1d52532ff75aaa1aa3ea22))
* **hive:** migrate hive module from web to apps/hive (incl. APIs) ([689085a](https://github.com/tutur3u/platform/commit/689085a942da0f589701c074e9278550cce5f4eb))
* **pay:** scaffold apps/pay satellite (pay.tuturuuu.com, port 7826) ([3d6e45c](https://github.com/tutur3u/platform/commit/3d6e45cca6a315fe67213e438144b73103bae2f5))
* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **ci:** finish storage-core workspace integration ([ba786af](https://github.com/tutur3u/platform/commit/ba786af917d02ff65bf7d59e2c198a86f5fbc7ff))
* **docker:** stabilize native blue-green deploy ([f41fbed](https://github.com/tutur3u/platform/commit/f41fbedc07a5a5effa3ef1d4226fa11742cb7de4))
* **infrastructure:** default docker web to native builds ([7d89f00](https://github.com/tutur3u/platform/commit/7d89f004f75ab12eddc3cb92df5a1e6a7255fe0d))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))
* **tooling:** improve service build caches ([1a7a5bf](https://github.com/tutur3u/platform/commit/1a7a5bf55c81450914283efed653a72c7b491c2a))

## [0.7.0](https://github.com/tutur3u/platform/compare/hive-v0.6.0...hive-v0.7.0) (2026-07-11)


### Features

* **contacts:** scaffold contacts.tuturuuu.com satellite shell + monorepo registration ([7e335fc](https://github.com/tutur3u/platform/commit/7e335fc036c4a45ed189095ecd10a43ee002294b))
* **education:** extract shared education libs into @tuturuuu/education-core and ready learn/teach for API hosting ([dd77db3](https://github.com/tutur3u/platform/commit/dd77db3590786cad51ce76c4d18b30240173ef7e))
* **finance:** extract shared finance route-auth + storage libs into @tuturuuu/finance-core ([79140d2](https://github.com/tutur3u/platform/commit/79140d2ddb5be4b6fb1d52532ff75aaa1aa3ea22))
* **pay:** scaffold apps/pay satellite (pay.tuturuuu.com, port 7826) ([3d6e45c](https://github.com/tutur3u/platform/commit/3d6e45cca6a315fe67213e438144b73103bae2f5))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.6.0](https://github.com/tutur3u/platform/compare/hive-v0.5.0...hive-v0.6.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))

## [0.5.0](https://github.com/tutur3u/platform/compare/hive-v0.4.1...hive-v0.5.0) (2026-07-05)


### Features

* **hive:** migrate hive module from web to apps/hive (incl. APIs) ([689085a](https://github.com/tutur3u/platform/commit/689085a942da0f589701c074e9278550cce5f4eb))
* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))


### Bug Fixes

* **ci:** finish storage-core workspace integration ([ba786af](https://github.com/tutur3u/platform/commit/ba786af917d02ff65bf7d59e2c198a86f5fbc7ff))

## [0.4.1](https://github.com/tutur3u/platform/compare/hive-v0.4.0...hive-v0.4.1) (2026-07-02)


### Bug Fixes

* **docker:** stabilize native blue-green deploy ([f41fbed](https://github.com/tutur3u/platform/commit/f41fbedc07a5a5effa3ef1d4226fa11742cb7de4))
* **infrastructure:** default docker web to native builds ([7d89f00](https://github.com/tutur3u/platform/commit/7d89f004f75ab12eddc3cb92df5a1e6a7255fe0d))


### Performance Improvements

* **tooling:** improve service build caches ([1a7a5bf](https://github.com/tutur3u/platform/commit/1a7a5bf55c81450914283efed653a72c7b491c2a))

## [0.4.0](https://github.com/tutur3u/platform/compare/hive-v0.3.1...hive-v0.4.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))

## [0.3.1](https://github.com/tutur3u/platform/compare/hive-v0.3.0...hive-v0.3.1) (2026-06-26)


### Bug Fixes

* **ci:** build supabase before internal api ([810a63d](https://github.com/tutur3u/platform/commit/810a63dfdf8c1b173b8ea7e52b96b9d1779377fc))

## [0.3.0](https://github.com/tutur3u/platform/compare/hive-v0.2.4...hive-v0.3.0) (2026-06-24)


### Features

* add tanstack rust migration foundation ([da7e58a](https://github.com/tutur3u/platform/commit/da7e58a2a6c7eefff5df74859e991872b5195132))


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))

## [0.2.4](https://github.com/tutur3u/platform/compare/hive-v0.2.3...hive-v0.2.4) (2026-06-17)


### Bug Fixes

* **hive:** require post for logout ([cd9b8bd](https://github.com/tutur3u/platform/commit/cd9b8bd06f8fc0d50e508fd9cfb91a9ed3c05e20))

## [0.2.3](https://github.com/tutur3u/platform/compare/hive-v0.2.2...hive-v0.2.3) (2026-06-11)


### Bug Fixes

* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.2.2](https://github.com/tutur3u/platform/compare/hive-v0.2.1...hive-v0.2.2) (2026-06-10)


### Bug Fixes

* **docker:** copy storefront workspace manifest ([36b64da](https://github.com/tutur3u/platform/commit/36b64da16be15ab917d2af06947c5fc29bbcb0ab))

## [0.2.1](https://github.com/tutur3u/platform/compare/hive-v0.2.0...hive-v0.2.1) (2026-06-08)


### Bug Fixes

* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))
* **auth:** support supabase-first satellite sessions ([b014fcf](https://github.com/tutur3u/platform/commit/b014fcf6db8218a1b54fd79f5e13629f66cad090))
* **ci:** stabilize docker e2e setup ([b280958](https://github.com/tutur3u/platform/commit/b2809587c06ca571c804d9ad43424decc1786b73))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))

## [0.2.0](https://github.com/tutur3u/platform/compare/hive-v0.1.0...hive-v0.2.0) (2026-06-03)


### Features

* **devbox:** add remote devbox foundation ([88f81d2](https://github.com/tutur3u/platform/commit/88f81d2a369ba80a3ee601122ca10d9031b63b87))


### Bug Fixes

* **hive:** bind trades to server npcs ([fa99b97](https://github.com/tutur3u/platform/commit/fa99b9702204c4062d7cfe46d8688f69ae49f861))
* **hive:** narrow browser recovery clearing ([4f06d9e](https://github.com/tutur3u/platform/commit/4f06d9efd8577f2c884586deda0daa3f50e9d419))
