# Changelog

## [0.7.0](https://github.com/tutur3u/platform/compare/teach-v0.6.0...teach-v0.7.0) (2026-07-11)


### Features

* add bulk student performance report sending functionality via new API route and UI components ([4e3e52e](https://github.com/tutur3u/platform/commit/4e3e52e9e894ce581d54fde0aa03f7344e5311fc))
* add Cambridge Dictionary scraper API and integrate into vocabulary section ([30078ec](https://github.com/tutur3u/platform/commit/30078ec4d9b59d4ccb6493c339dd8c118274c1e9))
* add difficulty ([24eafbd](https://github.com/tutur3u/platform/commit/24eafbd696e67f6d5e62e1c25eb9d1ae185f9249))
* add quiz deadline editing functionality with persistent state and API support ([c17a286](https://github.com/tutur3u/platform/commit/c17a2868fc50fb91837abca3029e781b997b3121))
* add quiz deadline functionality to modules and update database schema and types ([8748efe](https://github.com/tutur3u/platform/commit/8748efe164c004395b08af7054208e2929eca631))
* add student report email service and corresponding API route for performance tracking ([22ab655](https://github.com/tutur3u/platform/commit/22ab655ac8b93f0a6dfb5d15142e63ea3fcc66c5))
* add text-to-speech API endpoint and integrate speech synthesis into vocabulary learning components ([4f452e7](https://github.com/tutur3u/platform/commit/4f452e70322ea7165731f02a0daa712aa05d24f5))
* add vocabulary tab to course modules with dynamic UI injection and API endpoint ([8f3ba0e](https://github.com/tutur3u/platform/commit/8f3ba0e2cae1ae1857eebb64f5dca394f2b5bd9e))
* **edu:** add quiz management flow & dashboard improvements ([#4933](https://github.com/tutur3u/platform/issues/4933)) ([9dafc17](https://github.com/tutur3u/platform/commit/9dafc173b1c9e22cfa8731e4383779583f25acbc))
* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **education:** extract shared education libs into @tuturuuu/education-core and ready learn/teach for API hosting ([dd77db3](https://github.com/tutur3u/platform/commit/dd77db3590786cad51ce76c4d18b30240173ef7e))
* implement AI-powered feedback generation for quiz submissions and integrate into the teach interface ([0f5c7cf](https://github.com/tutur3u/platform/commit/0f5c7cf1a1a7a20f7f6e861dc0abb0c30e5c1ea8))
* implement image search API and integrate related image suggestions into vocabulary section ([50b4926](https://github.com/tutur3u/platform/commit/50b4926b0b625f63fa3ad9967ea203bbb29538e3))
* implement module quiz submission tracking and management interface ([fa4842e](https://github.com/tutur3u/platform/commit/fa4842e669c7fd1ba222b3ebb28947784fd4a806))
* implement quiz score visibility toggle and manual review status for learners ([300909c](https://github.com/tutur3u/platform/commit/300909cdbcd15ad79f6a471a3070985a6b382258))
* implement student performance tracking and update workspace data schemas ([9235679](https://github.com/tutur3u/platform/commit/923567911d080c5bd6720692bc75457b5310b8e5))
* implement teach dashboard statistics API and UI component ([7357463](https://github.com/tutur3u/platform/commit/7357463676dd5a4ff9154bca8193f37494dfe10f))
* implement vocabulary management system for course lessons with database support ([a11daf0](https://github.com/tutur3u/platform/commit/a11daf084e68a5a43a0dccc905a1c05f54bedf92))
* implement vocabulary word autocompletion using Cambridge Dictionary API integration ([2470e8b](https://github.com/tutur3u/platform/commit/2470e8be8e510cb8e3f4321f6c1d129839abe71d))
* **learn:** move tulearn + guest course API routes from apps/web to apps/learn ([ee1aa7b](https://github.com/tutur3u/platform/commit/ee1aa7b7685403c43aca94f3d97dc64a32374f25))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))
* **teach:** move education CRUD, user-group modules, valsea, and AI routes to apps/teach ([6062756](https://github.com/tutur3u/platform/commit/606275693d6647f339042fb140fb8224e9eebdd0))
* **teach:** move teach instructor API routes from apps/web to apps/teach ([fb2cd39](https://github.com/tutur3u/platform/commit/fb2cd392ff68f89dcc2608e5952554f163e7965f))
* **teach:** move the education dashboard to apps/teach and retire the web + tanstack copies ([5c80135](https://github.com/tutur3u/platform/commit/5c801350c5ca7229a0a59b7072e2624384187a16))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **edu:** address follow-up review feedback ([f183d8f](https://github.com/tutur3u/platform/commit/f183d8f92b5b5d01e587e56bd8f236064941fcc3))
* **edu:** address follow-up vocabulary review ([c21565f](https://github.com/tutur3u/platform/commit/c21565f28eb2872d342b65fe7332f9ce7227fa20))
* **edu:** address quiz review feedback ([ec77bd8](https://github.com/tutur3u/platform/commit/ec77bd83f2e1ec716ea28db83a55930a7ca60df3))
* **edu:** address vocabulary review comments ([815699a](https://github.com/tutur3u/platform/commit/815699ae30b54f59525078f9ef23b9e7fbd2aed5))
* **edu:** enforce quiz review invariants ([992f84e](https://github.com/tutur3u/platform/commit/992f84ef534386ed3ba17de4cf093e7a3e5843ee))
* **edu:** harden vocabulary api checks ([1819c15](https://github.com/tutur3u/platform/commit/1819c150bda15648354e1fe09df7a6aae47ff896))
* **edu:** polish review follow-ups ([8309bc0](https://github.com/tutur3u/platform/commit/8309bc08dd0528a6cc83a814d6c3ea1167d03f78))
* **edu:** prefer canonical quiz answer index ([4feb158](https://github.com/tutur3u/platform/commit/4feb1583dc846c93d8df01a76bfeac947244b524))
* **edu:** resolve vocabulary journey review feedback ([46e4180](https://github.com/tutur3u/platform/commit/46e4180994add3417b84779433a5cd2f21737bf7))
* **edu:** satisfy vocabulary ci checks ([61b011e](https://github.com/tutur3u/platform/commit/61b011e865ba8a2345662e5450e9f4f4c90c3a59))
* **edu:** stabilize quiz response option mapping ([58e8915](https://github.com/tutur3u/platform/commit/58e8915c284733af28853b5b82a9ad589660655d))
* **teach:** fallback OED suggestions from search ([f0d2825](https://github.com/tutur3u/platform/commit/f0d28259d11e62357ba865087561e1edaec731f8))
* **teach:** resolve package conflict ([4d9c3d4](https://github.com/tutur3u/platform/commit/4d9c3d44183b62bca91a17abcefe9512e03150fa))
* **teach:** soften dictionary details failures ([920210b](https://github.com/tutur3u/platform/commit/920210b342707eaa74b9eadfa63bf4214974afb2))
* **teach:** soften vocabulary suggestions failures ([be1a06c](https://github.com/tutur3u/platform/commit/be1a06c066241040db4baed6f5b7c6dbecb9ce97))
* **teach:** switch vocabulary lookup to OED ([28cb8b9](https://github.com/tutur3u/platform/commit/28cb8b9b6abba14b8cac49cc64100d21e411a079))
* **teach:** tolerate empty OED suggestions ([7b2468b](https://github.com/tutur3u/platform/commit/7b2468b3c96ed0a88fb614ebf7e9b6a44513ba1a))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))
* **vocabulary:** stabilize CI and OED lookup ([0d153a7](https://github.com/tutur3u/platform/commit/0d153a74a3cccdc003c90e38fd339e5ec5081ee1))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.6.0](https://github.com/tutur3u/platform/compare/teach-v0.5.0...teach-v0.6.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))

## [0.5.0](https://github.com/tutur3u/platform/compare/teach-v0.4.1...teach-v0.5.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))

## [0.4.1](https://github.com/tutur3u/platform/compare/teach-v0.4.0...teach-v0.4.1) (2026-07-03)


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))

## [0.4.0](https://github.com/tutur3u/platform/compare/teach-v0.3.1...teach-v0.4.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))

## [0.3.1](https://github.com/tutur3u/platform/compare/teach-v0.3.0...teach-v0.3.1) (2026-06-26)


### Bug Fixes

* **teach:** harden lesson save recovery ([d56a010](https://github.com/tutur3u/platform/commit/d56a010db5d22dcfde10fc51fbcf73c7abc62268))
* **teach:** reconcile lesson editor saves ([6f2cb4f](https://github.com/tutur3u/platform/commit/6f2cb4f38c1f3b68aeadec11215066be4f7fbd78))

## [0.3.0](https://github.com/tutur3u/platform/compare/teach-v0.2.0...teach-v0.3.0) (2026-06-24)


### Features

* add paragrph type ([1a45cbf](https://github.com/tutur3u/platform/commit/1a45cbfaf4d99af39236d837ecdb58f53cb80843))
* add submissions tab and data fetching to test detail view ([0f3dfa2](https://github.com/tutur3u/platform/commit/0f3dfa2561e168464d97dc012c65a56177f00e29))
* implement teach test submission review and student question feedback ([11cb373](https://github.com/tutur3u/platform/commit/11cb3736d3c35c18f0ed341f807f5df5a5775c31))
* implement test score visibility control and add submission review functionality ([2ce0416](https://github.com/tutur3u/platform/commit/2ce0416d6f192f539a859e5b66d7b8333dbe7b63))
* **teach:** enable editing test details on test details page ([5957283](https://github.com/tutur3u/platform/commit/5957283c3437235d6e095db19289a2e70c6caf4f))


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
* inficate wrong date ([b23ef41](https://github.com/tutur3u/platform/commit/b23ef41b6f85f30ed81356a495fb1bfba212475f))
* **teach:** address assessment generation review ([54cf837](https://github.com/tutur3u/platform/commit/54cf83731bb540d4f6bd6b3acf0c55564ce165d0))
* **teach:** address follow-up review comments ([8cdb9c0](https://github.com/tutur3u/platform/commit/8cdb9c0385fe0fd374cba3b6a30463ce94f4f340))
* **teach:** address review follow-ups ([464d409](https://github.com/tutur3u/platform/commit/464d40975449868fc7002520af34ec0eed443f44))
* **teach:** address test review follow-ups ([bfc6c12](https://github.com/tutur3u/platform/commit/bfc6c12eade212bf8775b78cc2853fd8b14601e7))

## [0.2.0](https://github.com/tutur3u/platform/compare/teach-v0.1.3...teach-v0.2.0) (2026-06-17)


### Features

* add start test session ([0015379](https://github.com/tutur3u/platform/commit/00153795c1b336d57813343f172b9715dbe95156))
* add tests ([1bd19e0](https://github.com/tutur3u/platform/commit/1bd19e0402a78084095dd523603aca6ee52418fc))
* create test ([c225f9d](https://github.com/tutur3u/platform/commit/c225f9d636a701397c43249131f35fbb36e284e4))
* create test page ([618fffa](https://github.com/tutur3u/platform/commit/618fffabeeedfa09d72cd877e2bfd9e806a05090))
* create test view for student ([40bdd08](https://github.com/tutur3u/platform/commit/40bdd08ca449c7e151b0beae6d27d60fb913fe51))


### Bug Fixes

* build checks ([3b9c3e9](https://github.com/tutur3u/platform/commit/3b9c3e9904bf2122b247a38c313e8622637910b7))
* translation ([7686f93](https://github.com/tutur3u/platform/commit/7686f93921129558ee64fcab54420f21e86815cc))
* **tulearn:** address course test review feedback ([52800c3](https://github.com/tutur3u/platform/commit/52800c389ddb190dad6d96789f293fd47a2ce118))
* **tulearn:** harden course test persistence ([42b9fab](https://github.com/tutur3u/platform/commit/42b9fabc3a7bbc3ae63022e9d524901544c64d0e))

## [0.1.3](https://github.com/tutur3u/platform/compare/teach-v0.1.2...teach-v0.1.3) (2026-06-11)


### Bug Fixes

* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.1.2](https://github.com/tutur3u/platform/compare/teach-v0.1.1...teach-v0.1.2) (2026-06-08)


### Bug Fixes

* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))
* **ci:** stabilize bun setup and prerender builds ([b410173](https://github.com/tutur3u/platform/commit/b410173835688e7fff0a846b7bdfc7e5897915b9))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))

## [0.1.1](https://github.com/tutur3u/platform/compare/teach-v0.1.0...teach-v0.1.1) (2026-06-03)


### Bug Fixes

* **auth:** normalize satellite login redirects ([fbf45da](https://github.com/tutur3u/platform/commit/fbf45dab3dc03397aa5eb225e1ba913905e94d9f))
