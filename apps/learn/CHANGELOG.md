# Changelog

## [0.10.0](https://github.com/tutur3u/platform/compare/learn-v0.9.0...learn-v0.10.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** improve discovery metadata ([a574409](https://github.com/tutur3u/platform/commit/a57440984df45086c4989db07b02d402dd93c828))
* **seo:** improve discovery metadata ([8e2420d](https://github.com/tutur3u/platform/commit/8e2420d49e7b94c462d92222ea8f239ab92564f6))
* **seo:** improve page metadata ([0c621cb](https://github.com/tutur3u/platform/commit/0c621cb7fc1253b0a11ea21992503274052c6be0))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))

## [0.9.0](https://github.com/tutur3u/platform/compare/learn-v0.8.0...learn-v0.9.0) (2026-07-13)


### Features

* **education:** align teach and learn navigation ([48896cd](https://github.com/tutur3u/platform/commit/48896cd9eaee11a8efae58f46901f2c60d7cf637))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.8.0](https://github.com/tutur3u/platform/compare/learn-v0.7.0...learn-v0.8.0) (2026-07-11)


### Features

* add quiz deadline functionality to modules and update database schema and types ([8748efe](https://github.com/tutur3u/platform/commit/8748efe164c004395b08af7054208e2929eca631))
* add quiz mode to vocabulary practice with multiple-choice questions ([db8fe9e](https://github.com/tutur3u/platform/commit/db8fe9eb65c3e02b064fc8103a93bf7479141db1))
* add text-to-speech API endpoint and integrate speech synthesis into vocabulary learning components ([4f452e7](https://github.com/tutur3u/platform/commit/4f452e70322ea7165731f02a0daa712aa05d24f5))
* add vocabulary tab to course modules with dynamic UI injection and API endpoint ([8f3ba0e](https://github.com/tutur3u/platform/commit/8f3ba0e2cae1ae1857eebb64f5dca394f2b5bd9e))
* **edu:** add quiz management flow & dashboard improvements ([#4933](https://github.com/tutur3u/platform/issues/4933)) ([9dafc17](https://github.com/tutur3u/platform/commit/9dafc173b1c9e22cfa8731e4383779583f25acbc))
* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **education:** extract shared education libs into @tuturuuu/education-core and ready learn/teach for API hosting ([dd77db3](https://github.com/tutur3u/platform/commit/dd77db3590786cad51ce76c4d18b30240173ef7e))
* implement AI-powered feedback generation for quiz submissions and integrate into the teach interface ([0f5c7cf](https://github.com/tutur3u/platform/commit/0f5c7cf1a1a7a20f7f6e861dc0abb0c30e5c1ea8))
* implement pronunciation practice mode with audio recording and analysis API integration ([248bf3d](https://github.com/tutur3u/platform/commit/248bf3db24571cf7dd2b6a7ddc655d3ac8297323))
* implement quiz score visibility toggle and manual review status for learners ([300909c](https://github.com/tutur3u/platform/commit/300909cdbcd15ad79f6a471a3070985a6b382258))
* imrpove matching question UI ([d085214](https://github.com/tutur3u/platform/commit/d0852145b63b750ee9802e1610dd61c55fa2a387))
* **learn:** move tulearn + guest course API routes from apps/web to apps/learn ([ee1aa7b](https://github.com/tutur3u/platform/commit/ee1aa7b7685403c43aca94f3d97dc64a32374f25))
* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **edu:** address follow-up review feedback ([f183d8f](https://github.com/tutur3u/platform/commit/f183d8f92b5b5d01e587e56bd8f236064941fcc3))
* **edu:** address follow-up vocabulary review ([c21565f](https://github.com/tutur3u/platform/commit/c21565f28eb2872d342b65fe7332f9ce7227fa20))
* **edu:** address quiz review feedback ([ec77bd8](https://github.com/tutur3u/platform/commit/ec77bd83f2e1ec716ea28db83a55930a7ca60df3))
* **edu:** address vocabulary review comments ([815699a](https://github.com/tutur3u/platform/commit/815699ae30b54f59525078f9ef23b9e7fbd2aed5))
* **edu:** harden vocabulary api checks ([1819c15](https://github.com/tutur3u/platform/commit/1819c150bda15648354e1fe09df7a6aae47ff896))
* **edu:** resolve vocabulary journey review feedback ([46e4180](https://github.com/tutur3u/platform/commit/46e4180994add3417b84779433a5cd2f21737bf7))
* **edu:** satisfy vocabulary ci checks ([61b011e](https://github.com/tutur3u/platform/commit/61b011e865ba8a2345662e5450e9f4f4c90c3a59))
* **inventory:** contain operator tables and translations ([5fa064e](https://github.com/tutur3u/platform/commit/5fa064e4c203f7202fc6db4ef2463001e32857a4))
* **learn:** allow blocking dashboard entry ([e01b16b](https://github.com/tutur3u/platform/commit/e01b16b841616633428ad037aae7f1dc2e68861a))
* **learn:** clarify vocabulary practice requirement ([44b5000](https://github.com/tutur3u/platform/commit/44b5000ec3f8dc4c78688e174e36bac0b4ac6b16))
* **learn:** stabilize dashboard dev entry ([e6ced1e](https://github.com/tutur3u/platform/commit/e6ced1ed08e03bc2f91a2c746575adf95b8c7ce8))
* paragraph question without text box ([aac0439](https://github.com/tutur3u/platform/commit/aac0439a0a7418d5e4b683f78a55ecf4e3b682d0))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.7.0](https://github.com/tutur3u/platform/compare/learn-v0.6.0...learn-v0.7.0) (2026-07-11)


### Features

* add quiz deadline functionality to modules and update database schema and types ([8748efe](https://github.com/tutur3u/platform/commit/8748efe164c004395b08af7054208e2929eca631))
* add quiz mode to vocabulary practice with multiple-choice questions ([db8fe9e](https://github.com/tutur3u/platform/commit/db8fe9eb65c3e02b064fc8103a93bf7479141db1))
* add text-to-speech API endpoint and integrate speech synthesis into vocabulary learning components ([4f452e7](https://github.com/tutur3u/platform/commit/4f452e70322ea7165731f02a0daa712aa05d24f5))
* add vocabulary tab to course modules with dynamic UI injection and API endpoint ([8f3ba0e](https://github.com/tutur3u/platform/commit/8f3ba0e2cae1ae1857eebb64f5dca394f2b5bd9e))
* **edu:** add quiz management flow & dashboard improvements ([#4933](https://github.com/tutur3u/platform/issues/4933)) ([9dafc17](https://github.com/tutur3u/platform/commit/9dafc173b1c9e22cfa8731e4383779583f25acbc))
* **edu:** add vocabulary journey ([#4946](https://github.com/tutur3u/platform/issues/4946)) ([06535d2](https://github.com/tutur3u/platform/commit/06535d2766e46206d311e971f6d37ef351fe667b))
* **education:** extract shared education libs into @tuturuuu/education-core and ready learn/teach for API hosting ([dd77db3](https://github.com/tutur3u/platform/commit/dd77db3590786cad51ce76c4d18b30240173ef7e))
* implement AI-powered feedback generation for quiz submissions and integrate into the teach interface ([0f5c7cf](https://github.com/tutur3u/platform/commit/0f5c7cf1a1a7a20f7f6e861dc0abb0c30e5c1ea8))
* implement pronunciation practice mode with audio recording and analysis API integration ([248bf3d](https://github.com/tutur3u/platform/commit/248bf3db24571cf7dd2b6a7ddc655d3ac8297323))
* implement quiz score visibility toggle and manual review status for learners ([300909c](https://github.com/tutur3u/platform/commit/300909cdbcd15ad79f6a471a3070985a6b382258))
* imrpove matching question UI ([d085214](https://github.com/tutur3u/platform/commit/d0852145b63b750ee9802e1610dd61c55fa2a387))
* **learn:** move tulearn + guest course API routes from apps/web to apps/learn ([ee1aa7b](https://github.com/tutur3u/platform/commit/ee1aa7b7685403c43aca94f3d97dc64a32374f25))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **edu:** address follow-up review feedback ([f183d8f](https://github.com/tutur3u/platform/commit/f183d8f92b5b5d01e587e56bd8f236064941fcc3))
* **edu:** address follow-up vocabulary review ([c21565f](https://github.com/tutur3u/platform/commit/c21565f28eb2872d342b65fe7332f9ce7227fa20))
* **edu:** address quiz review feedback ([ec77bd8](https://github.com/tutur3u/platform/commit/ec77bd83f2e1ec716ea28db83a55930a7ca60df3))
* **edu:** address vocabulary review comments ([815699a](https://github.com/tutur3u/platform/commit/815699ae30b54f59525078f9ef23b9e7fbd2aed5))
* **edu:** harden vocabulary api checks ([1819c15](https://github.com/tutur3u/platform/commit/1819c150bda15648354e1fe09df7a6aae47ff896))
* **edu:** resolve vocabulary journey review feedback ([46e4180](https://github.com/tutur3u/platform/commit/46e4180994add3417b84779433a5cd2f21737bf7))
* **edu:** satisfy vocabulary ci checks ([61b011e](https://github.com/tutur3u/platform/commit/61b011e865ba8a2345662e5450e9f4f4c90c3a59))
* **learn:** allow blocking dashboard entry ([e01b16b](https://github.com/tutur3u/platform/commit/e01b16b841616633428ad037aae7f1dc2e68861a))
* **learn:** clarify vocabulary practice requirement ([44b5000](https://github.com/tutur3u/platform/commit/44b5000ec3f8dc4c78688e174e36bac0b4ac6b16))
* **learn:** stabilize dashboard dev entry ([e6ced1e](https://github.com/tutur3u/platform/commit/e6ced1ed08e03bc2f91a2c746575adf95b8c7ce8))
* paragraph question without text box ([aac0439](https://github.com/tutur3u/platform/commit/aac0439a0a7418d5e4b683f78a55ecf4e3b682d0))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.6.0](https://github.com/tutur3u/platform/compare/learn-v0.5.0...learn-v0.6.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))

## [0.5.0](https://github.com/tutur3u/platform/compare/learn-v0.4.1...learn-v0.5.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))


### Bug Fixes

* **inventory:** contain operator tables and translations ([5fa064e](https://github.com/tutur3u/platform/commit/5fa064e4c203f7202fc6db4ef2463001e32857a4))

## [0.4.1](https://github.com/tutur3u/platform/compare/learn-v0.4.0...learn-v0.4.1) (2026-07-03)


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))

## [0.4.0](https://github.com/tutur3u/platform/compare/learn-v0.3.0...learn-v0.4.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))

## [0.3.0](https://github.com/tutur3u/platform/compare/learn-v0.2.0...learn-v0.3.0) (2026-06-24)


### Features

* add confirmation prompt to prevent accidental navigation during active tests ([5285a1c](https://github.com/tutur3u/platform/commit/5285a1c5776fe153b4e5768af794ac606cfa07e1))
* add test apge ([2d62fc8](https://github.com/tutur3u/platform/commit/2d62fc883379ad54e800e8555e40168de5327295))
* add test for user ([e14c981](https://github.com/tutur3u/platform/commit/e14c98116c1ea07f4bf1af578e08e280cefc9bb5))
* implement teach test submission review and student question feedback ([11cb373](https://github.com/tutur3u/platform/commit/11cb3736d3c35c18f0ed341f807f5df5a5775c31))
* implement test score visibility control and add submission review functionality ([2ce0416](https://github.com/tutur3u/platform/commit/2ce0416d6f192f539a859e5b66d7b8333dbe7b63))
* **learn:** disable start test button if test has not started yet ([e9ad136](https://github.com/tutur3u/platform/commit/e9ad136f80c8fa33b39d3579aa121df5b9513f5d))
* replace static score display with marking progress animation on test detail page ([91da83d](https://github.com/tutur3u/platform/commit/91da83dfce7d29f7ed70bb4e0090c73324825173))


### Bug Fixes

* **ci:** satisfy CodeFactor and lockfile checks ([bc29c3d](https://github.com/tutur3u/platform/commit/bc29c3d15e0951545818005335f673282fafdc80))
* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
* **learn:** add explicit type props for buttons in student test page ([6a7c86e](https://github.com/tutur3u/platform/commit/6a7c86e1a0dc246b8132bbd358207a1098c07300))
* **learn:** render multiple choice options and matching choices for AI-generated quizzes ([f95e1c0](https://github.com/tutur3u/platform/commit/f95e1c078c1fa75dccda3fc12ab1696803366332))
* send null for selectedOptionId when saving content-based quiz answers to handle non-UUID identifiers ([b0d522d](https://github.com/tutur3u/platform/commit/b0d522d9a833cf26fe9c5bc4aa074d649c1567ae))
* **teach:** address follow-up review comments ([8cdb9c0](https://github.com/tutur3u/platform/commit/8cdb9c0385fe0fd374cba3b6a30463ce94f4f340))
* **teach:** address test review follow-ups ([bfc6c12](https://github.com/tutur3u/platform/commit/bfc6c12eade212bf8775b78cc2853fd8b14601e7))

## [0.2.0](https://github.com/tutur3u/platform/compare/learn-v0.1.4...learn-v0.2.0) (2026-06-17)


### Features

* add test page in student view ([e9d3e3c](https://github.com/tutur3u/platform/commit/e9d3e3cfa90d631709fe246a66daaeb5e0b2a29a))
* create test view for student ([40bdd08](https://github.com/tutur3u/platform/commit/40bdd08ca449c7e151b0beae6d27d60fb913fe51))


### Bug Fixes

* incorrect multiple choice display ([07cc9e4](https://github.com/tutur3u/platform/commit/07cc9e4e3d1cdb4d86d959dc36a389aea214687c))
* ording question ([f0c32a4](https://github.com/tutur3u/platform/commit/f0c32a4e3b7634c73b0b7cc9b9b05af83468549a))
* **tulearn:** address course test review feedback ([52800c3](https://github.com/tutur3u/platform/commit/52800c389ddb190dad6d96789f293fd47a2ce118))
* **tulearn:** restore quiz answer feedback ([f462b57](https://github.com/tutur3u/platform/commit/f462b576d2b41889135c89a183c6bad09d410e92))
* **tulearn:** secure learner quiz submissions ([94afe79](https://github.com/tutur3u/platform/commit/94afe79e8b5c36bba8bd6d5c423faaf487d412d9))
* UI inconsistence and quiz sumission ([e9e360e](https://github.com/tutur3u/platform/commit/e9e360ef76c3f0513cf54a34a718e895c222de36))

## [0.1.4](https://github.com/tutur3u/platform/compare/learn-v0.1.3...learn-v0.1.4) (2026-06-11)


### Bug Fixes

* **learn:** address quiz review comments ([441fe7e](https://github.com/tutur3u/platform/commit/441fe7eabe7ac7c4a3dd05d014dd52e1f6339129))
* **learn:** secure learner quiz practice ([352183b](https://github.com/tutur3u/platform/commit/352183b0c67798867628adddc8fb5d18d262de40))
* **learn:** type learner quiz data ([f98ec7c](https://github.com/tutur3u/platform/commit/f98ec7cf0cf2f2e93faa8b57577dfff58a555a63))

## [0.1.3](https://github.com/tutur3u/platform/compare/learn-v0.1.2...learn-v0.1.3) (2026-06-11)


### Bug Fixes

* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.1.2](https://github.com/tutur3u/platform/compare/learn-v0.1.1...learn-v0.1.2) (2026-06-08)


### Bug Fixes

* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))

## [0.1.1](https://github.com/tutur3u/platform/compare/learn-v0.1.0...learn-v0.1.1) (2026-06-03)


### Bug Fixes

* **auth:** normalize satellite login redirects ([fbf45da](https://github.com/tutur3u/platform/commit/fbf45dab3dc03397aa5eb225e1ba913905e94d9f))
* **learn:** require durable ai chat ids ([a30f4cd](https://github.com/tutur3u/platform/commit/a30f4cdf0182a1a095c06f0e8dea14298dcc1377))
* **learn:** use learner course access ([2134e91](https://github.com/tutur3u/platform/commit/2134e91f009bb0ea5f7d3de8d6dbec71e9b67438))
