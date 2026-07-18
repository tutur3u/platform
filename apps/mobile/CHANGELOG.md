# Changelog

## [0.8.0](https://github.com/tutur3u/platform/compare/mobile-v0.7.0...mobile-v0.8.0) (2026-07-18)


### Features

* **inventory:** add sales periods and mobile commerce ([fa442c9](https://github.com/tutur3u/platform/commit/fa442c9eb06321d91f76b33ee111907d10c85eb7))
* **inventory:** unify commerce currency and sales periods ([2042bc5](https://github.com/tutur3u/platform/commit/2042bc5a7d4f347d1f610432f379da42f3aa2b8b))
* **mobile:** revamp app lock experience ([22b300b](https://github.com/tutur3u/platform/commit/22b300b73a94fdf44cd334dcdbfd0760ab46ed71))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))


### Bug Fixes

* **inventory:** improve sales period workflows ([2a7cad5](https://github.com/tutur3u/platform/commit/2a7cad54b5af7bdcdcaf4233508eed91d5cd6832))
* **mobile:** compact navigation and biometric lock ([5fa1589](https://github.com/tutur3u/platform/commit/5fa15898dd6b6798154abacab636c035b2f7e13c))
* **mobile:** harden finance and inventory experiences ([0f1e7a0](https://github.com/tutur3u/platform/commit/0f1e7a061aa46ff7019dd3e1cae3877a7e4d863a))
* **mobile:** refine compact navigation and page hierarchy ([e422c19](https://github.com/tutur3u/platform/commit/e422c19ded312575f63ab3560397c8fba8d73c77))
* **mobile:** require signed native release builds ([55cedc3](https://github.com/tutur3u/platform/commit/55cedc3ca8bc189030f8b0f514926fed472ffd12))
* **mobile:** restore tasks bearer access ([2aedf84](https://github.com/tutur3u/platform/commit/2aedf8439f6d989ebf9bb69f83f74f1b25e5b06e))
* **mobile:** route APIs to satellite owners ([2f2222f](https://github.com/tutur3u/platform/commit/2f2222f342c484d062cecc3a481bf5995a8c2217))
* **mobile:** simplify dense navigation and calendar events ([dca28dd](https://github.com/tutur3u/platform/commit/dca28dd2c3b7f7ae623b9355a09178eb76d82184))
* **mobile:** stabilize navigation and QR login ([4e208a1](https://github.com/tutur3u/platform/commit/4e208a1dabbd69d5c641a19a12e47d7691c26a9c))
* **mobile:** stabilize workspace selection and inventory cache ([229af0d](https://github.com/tutur3u/platform/commit/229af0d85f7bfe72c25c4fddda34bdde27d5e2e1))

## [0.7.0](https://github.com/tutur3u/platform/compare/mobile-v0.6.1...mobile-v0.7.0) (2026-06-17)


### Features

* **mobile:** add finance wallet checkpoints ([b7a1fef](https://github.com/tutur3u/platform/commit/b7a1fefd12ac136b76ac66254af1a22176f23ef1))


### Bug Fixes

* **mobile:** block app during lock state load ([0a62d57](https://github.com/tutur3u/platform/commit/0a62d578c71f6b8922145faef3fcc61aa7dfa4d0))
* **mobile:** block startup before version check ([22485a2](https://github.com/tutur3u/platform/commit/22485a2be78d1424e75d041adb528893247835d0))
* **mobile:** bound task timeline date span ([df2775e](https://github.com/tutur3u/platform/commit/df2775e20e66dcff6238c118739b7baa52b0b647))
* **mobile:** bound time tracker history dates ([0d2f97e](https://github.com/tutur3u/platform/commit/0d2f97e831a192755cc8cec189af609ef93940d2))
* **mobile:** defer task video playback ([4bcee60](https://github.com/tutur3u/platform/commit/4bcee6013e885fbfbe6f1a0144e6bebf74cf36c4))
* **mobile:** encrypt offline cache boxes ([62a2e63](https://github.com/tutur3u/platform/commit/62a2e63cb561e9351e6014a33779527bd9cfbefc))
* **mobile:** harden task description converters ([01018f2](https://github.com/tutur3u/platform/commit/01018f2c3cbf980fddbe89da1942d9ae800bc8e2))
* **mobile:** ignore forged notification payloads ([056f900](https://github.com/tutur3u/platform/commit/056f9006636122c6a5f5ed275ba89bf13181b3c1))
* **mobile:** lazy build portfolio items ([7e08dc8](https://github.com/tutur3u/platform/commit/7e08dc862b0e5c3b97124e49efe683476fb08478))
* **mobile:** preserve malformed task descriptions ([0702c3d](https://github.com/tutur3u/platform/commit/0702c3daa472df793fd944556d309d1b4f79cabd))
* **mobile:** prevent app-link opt-out loops ([6feffd6](https://github.com/tutur3u/platform/commit/6feffd638eab096003e54a994f4224b286df5fcb))
* **mobile:** refresh shell action callbacks ([eeb38e3](https://github.com/tutur3u/platform/commit/eeb38e39a91fca0904d447b7b37781302571a611))
* **mobile:** require native Apple sign-in ([fdef606](https://github.com/tutur3u/platform/commit/fdef606bef37f031cd10ff29464e795760ee0e04))
* **mobile:** scope calendar cache by workspace ([54ec332](https://github.com/tutur3u/platform/commit/54ec332957d75b258fc422ccd5e27920bbb4e44b))
* **mobile:** tolerate malformed task tables ([26a4cfe](https://github.com/tutur3u/platform/commit/26a4cfe15584785c1513a2d62dc0eee677291a84))
* **mobile:** validate request deep links ([c6c201c](https://github.com/tutur3u/platform/commit/c6c201c80eb6ca57c86ebfc4a7b17a5799a26b2a))
* **tasks:** secure realtime task channels ([6d98d16](https://github.com/tutur3u/platform/commit/6d98d16baa9ecf68bdd47ce3ce6dc1ff2e2bca84))
* **tasks:** secure realtime task channels ([03dc6d6](https://github.com/tutur3u/platform/commit/03dc6d66666d1d3ae422f91cb94285367a8c1071))

## [0.6.1](https://github.com/tutur3u/platform/compare/mobile-v0.6.0...mobile-v0.6.1) (2026-06-13)


### Bug Fixes

* **ci:** restore mobile and auth callback jobs ([65f0b0a](https://github.com/tutur3u/platform/commit/65f0b0af0d054129198b894155d0feefb4a941b0))
* **mobile:** restore windows ci build ([cb4ae6d](https://github.com/tutur3u/platform/commit/cb4ae6ddd02f4a6d41cd73d7c490500a1c1757ab))
* **tasks:** sync task realtime with broadcasts ([8c56154](https://github.com/tutur3u/platform/commit/8c56154e517797dcac0ec0971d8a474b50292706))

## [0.6.0](https://github.com/tutur3u/platform/compare/mobile-v0.5.2...mobile-v0.6.0) (2026-06-10)


### Features

* **mobile:** add deployment vault CI flow ([b1d21eb](https://github.com/tutur3u/platform/commit/b1d21eb1e30d74b412e4687b095004c21cf03dd1))

## [0.5.2](https://github.com/tutur3u/platform/compare/mobile-v0.5.1...mobile-v0.5.2) (2026-06-10)


### Bug Fixes

* **mobile:** pin connectivity for Apple CI ([6ff00bb](https://github.com/tutur3u/platform/commit/6ff00bbeacf59ef8f26eb1910d4650bea8ba12e9))
* **mobile:** pin device info for Apple CI ([5219ee1](https://github.com/tutur3u/platform/commit/5219ee18aedb9feeabb955676443d9a4b80ede86))

## [0.5.1](https://github.com/tutur3u/platform/compare/mobile-v0.5.0...mobile-v0.5.1) (2026-06-03)


### Bug Fixes

* **mobile:** fail closed on logout errors ([27a89d8](https://github.com/tutur3u/platform/commit/27a89d89ad6ab0fffbfc0faaa815bb01ba037d42))
* **mobile:** keep workspace secrets off disk ([bf0a7e4](https://github.com/tutur3u/platform/commit/bf0a7e4867b623749781dac854937228316091eb))
* **mobile:** neutralize crm csv formulas ([5290f81](https://github.com/tutur3u/platform/commit/5290f81efb0a2c495ebcce98056f9264e0543695))
* **mobile:** redact auth account secrets ([eb1c03c](https://github.com/tutur3u/platform/commit/eb1c03c1b8405f410e7770873ac5c271789ec936))
