# Changelog

## [0.2.0](https://github.com/tutur3u/platform/compare/marketing-v0.1.0...marketing-v0.2.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **marketing:** mount the privacy consent banner ([#8045](https://github.com/tutur3u/platform/issues/8045)) ([c6656c9](https://github.com/tutur3u/platform/commit/c6656c9c0bc2f250191e0cbe61ad99cb1a195c9b))
* **marketing:** native Start app for anonymous marketing pages ([#7934](https://github.com/tutur3u/platform/issues/7934)) ([296dbb3](https://github.com/tutur3u/platform/commit/296dbb35e7403364405305466a16ae330c79b41a))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))


### Bug Fixes

* close [#8157](https://github.com/tutur3u/platform/issues/8157) route-registry, inventory and policy gates on main ([#8166](https://github.com/tutur3u/platform/issues/8166)) ([ab9dbab](https://github.com/tutur3u/platform/commit/ab9dbabcd592b58002ed7cb9f79dde87351b8fda))
* **gateway:** evaluate marketing robots on the public request URL ([#8284](https://github.com/tutur3u/platform/issues/8284)) ([c1efb58](https://github.com/tutur3u/platform/commit/c1efb582c8214c56183a45c062048a880888b432))
* **legal:** hide internal review and upcoming-changes notices on production legal pages ([#8288](https://github.com/tutur3u/platform/issues/8288)) ([9c62d49](https://github.com/tutur3u/platform/commit/9c62d49c2f4204db2b2e1beaf8baa87357aff057))
* **marketing:** run /api through the shared API guard (proxy-guard-parity) ([#8114](https://github.com/tutur3u/platform/issues/8114)) ([47561bd](https://github.com/tutur3u/platform/commit/47561bd8afdeeed1be4cd0928e241a851dfccda3))
* **marketing:** run vitest without the Cloudflare worker ([#8020](https://github.com/tutur3u/platform/issues/8020)) ([874f31d](https://github.com/tutur3u/platform/commit/874f31df102654a25c570f98ff943a07696baef9))
* **marketing:** serve the landing pages as indexable on tuturuuu.com ([#8178](https://github.com/tutur3u/platform/issues/8178)) ([767dc4d](https://github.com/tutur3u/platform/commit/767dc4d2ce9e77ab5e5e0c76a5fc0b7c7bbeaa1c))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **seo:** register the marketing app and generate the new robots.txt files ([#8038](https://github.com/tutur3u/platform/issues/8038)) ([d830cec](https://github.com/tutur3u/platform/commit/d830cec3dbcebe696713ad7b4308e85b2308cf57))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tooling:** register marketing and workspace with portless and declare TS7 native preview for marketing ([#8117](https://github.com/tutur3u/platform/issues/8117)) ([8668ca0](https://github.com/tutur3u/platform/commit/8668ca0a3edf162cae451b517dd439f6422c62ec))


### Performance Improvements

* **marketing:** adopt shared shell and streamline landing ([#8129](https://github.com/tutur3u/platform/issues/8129)) ([5f510d6](https://github.com/tutur3u/platform/commit/5f510d6db991bd3792e697cc2ee3ff7d543295a1))
* **marketing:** prioritize landing CSS and server-render the poster ([#8260](https://github.com/tutur3u/platform/issues/8260)) ([4ed7896](https://github.com/tutur3u/platform/commit/4ed7896421aa3c6dc03f5cdf6c34058055662198))
* **marketing:** reduce landing render delay and hydration ([#8188](https://github.com/tutur3u/platform/issues/8188)) ([3306953](https://github.com/tutur3u/platform/commit/33069539b7a181cd74542ac6d53b9f80d34de92b))
