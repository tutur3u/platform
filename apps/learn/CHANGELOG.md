# Changelog

## [0.4.1](https://github.com/tutur3u/platform/compare/learn-v0.4.0...learn-v0.4.1) (2026-07-02)


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
