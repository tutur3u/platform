# Changelog

## [0.10.0](https://github.com/tutur3u/platform/compare/mobile-v0.9.2...mobile-v0.10.0) (2026-09-19)


### Features

* **infrastructure:** authenticate native Calendar gateway ([e225ec7](https://github.com/tutur3u/platform/commit/e225ec73f3f5dd958bbe7dacab986271e877728e))
* **mobile:** add workspace Mail client ([6b1054b](https://github.com/tutur3u/platform/commit/6b1054bf37479570118ee70c5301ca452a5d03ee))
* **mobile:** add workspace Mail client ([#5388](https://github.com/tutur3u/platform/issues/5388)) ([ebfed37](https://github.com/tutur3u/platform/commit/ebfed377ce643a48c470553b40bff6ca8def5fd8))
* **mobile:** compact Mail and render isolated HTML ([7d0e4f8](https://github.com/tutur3u/platform/commit/7d0e4f8cf800ad8fd588002279b3d5ecdb6d40b6))
* **mobile:** compact Mail and render isolated HTML ([#5396](https://github.com/tutur3u/platform/issues/5396)) ([9545e89](https://github.com/tutur3u/platform/commit/9545e89822ee4f71563a2be9ee491ff3c9d484b6))
* **mobile:** simplify navigation and keep cached screens responsive ([583bec6](https://github.com/tutur3u/platform/commit/583bec69a1a5fcce050a0950bedfd5919a9807ee))


### Bug Fixes

* **ci:** enable and verify signed mobile beta releases ([#5387](https://github.com/tutur3u/platform/issues/5387)) ([3b34df6](https://github.com/tutur3u/platform/commit/3b34df69b5565924180b18b3a41152a8bb80366e))
* **ci:** verify signed mobile beta releases ([f6985a6](https://github.com/tutur3u/platform/commit/f6985a6fb462c40629c7a719ef135f7aecd8c476))
* **lettin:** address review and integrate current main ([8844716](https://github.com/tutur3u/platform/commit/88447164f0e557cf0992c2d2f7fdd6a965619390))
* **mobile:** accommodate larger navigation labels ([d49e0b0](https://github.com/tutur3u/platform/commit/d49e0b00543be6d31ca95d7171cb3f3bb42f645c))
* **mobile:** adapt shell and boards to tablet windows ([1990cb6](https://github.com/tutur3u/platform/commit/1990cb625bfc318a47af2343ad364b40fb4ebcc5))
* **mobile:** adapt shell and boards to tablet windows ([#5395](https://github.com/tutur3u/platform/issues/5395)) ([9be8a79](https://github.com/tutur3u/platform/commit/9be8a79eae646c08dc596a65839a258c08739546))
* **mobile:** avoid duplicate Chat composer dock clearance ([d3ffd80](https://github.com/tutur3u/platform/commit/d3ffd8021092b525f5216e98e9f30ffaa2abe2b6))
* **mobile:** bound cache keys by encoded size ([1b7dcea](https://github.com/tutur3u/platform/commit/1b7dcea320401cb5288df27a9a127ea3320562d8))
* **mobile:** clear deleted Mail filters after metadata refresh ([b2497b5](https://github.com/tutur3u/platform/commit/b2497b5f71eb2852df8cddbdc4b186b4405ad340))
* **mobile:** clear inbox actions for nested Mail routes ([701bf18](https://github.com/tutur3u/platform/commit/701bf182c4245fa59f68ecdfa38abc9b431d1a14))
* **mobile:** coalesce scoped cache refreshes safely ([09f1ee1](https://github.com/tutur3u/platform/commit/09f1ee19d9fb8a8811a8c21dfbd65d4904613249))
* **mobile:** coalesce scoped cache refreshes safely ([#5389](https://github.com/tutur3u/platform/issues/5389)) ([fdb8077](https://github.com/tutur3u/platform/commit/fdb80779737a45ebbd67dbbcc2ea6ba35c8ada75))
* **mobile:** correct nested Mail spacing and search controls ([e444e01](https://github.com/tutur3u/platform/commit/e444e01d586920a9260e31b7c075507341710e40))
* **mobile:** expand Chat panes on tablet screens ([28a237d](https://github.com/tutur3u/platform/commit/28a237dd37f9093e79ab241c0bb962b4f3ee0c28))
* **mobile:** fill tablet work surfaces without empty rows ([57468b0](https://github.com/tutur3u/platform/commit/57468b03143048e9e66cd9c11473d4ad86a67442))
* **mobile:** finish tablet layouts and Meet caching ([#5397](https://github.com/tutur3u/platform/issues/5397)) ([1f37e59](https://github.com/tutur3u/platform/commit/1f37e59f86d8cf6258bdacbf81cec5a39dd45256))
* **mobile:** keep Chat usable in short landscape windows ([1b351de](https://github.com/tutur3u/platform/commit/1b351de31b18b727a0a834c3eb25101df095231b))
* **mobile:** keep Meet editor reachable in landscape ([d6f1c0d](https://github.com/tutur3u/platform/commit/d6f1c0daa96b2aa24e7381302b5e098c472ec540))
* **mobile:** move conversation navigation into Chat toolbar ([77bef52](https://github.com/tutur3u/platform/commit/77bef52a435aacdc1dea0bbcd6232d4493095656))
* **mobile:** preserve cache expiry during invalidation ([7c04655](https://github.com/tutur3u/platform/commit/7c04655d71cda2dd34ccb07c24b44c4d5c84c1e0))
* **mobile:** preserve Mail drafts during back and save ([18796f8](https://github.com/tutur3u/platform/commit/18796f89b1082354a3576cd673d8135b00d8ffa1))
* **mobile:** preserve network results across cache failures ([f883098](https://github.com/tutur3u/platform/commit/f883098367837774704750b097bdd54a2296f828))
* **mobile:** preserve scoped mail cache and background metadata ([40d64f6](https://github.com/tutur3u/platform/commit/40d64f61c7940834929b845c6a00e58e65303197))
* **mobile:** reject invalidated cache responses ([cc19910](https://github.com/tutur3u/platform/commit/cc19910349e02c7b968b279e0a1960123f09b754))
* **mobile:** restore colorful design and repair app access ([a5b6ea3](https://github.com/tutur3u/platform/commit/a5b6ea3012e6f9d6a45de51c9a5c792747d6b9ff))
* **mobile:** restore v0.9.2 design, responsive loading, and app access ([#5390](https://github.com/tutur3u/platform/issues/5390)) ([30987f9](https://github.com/tutur3u/platform/commit/30987f9c1706445bafc24186129f4646d0363009))
* **mobile:** scope cache mutation generations ([761f3a3](https://github.com/tutur3u/platform/commit/761f3a3c3a99b6e9ec8bd90ba9c49a1377254146))
* **mobile:** scroll Chat filters with conversation lists ([741ab8f](https://github.com/tutur3u/platform/commit/741ab8fc23a86da151091f6e7f384e88aa6f5fb6))
* **mobile:** use compact navigation in short windows ([82d0422](https://github.com/tutur3u/platform/commit/82d0422c8fda0c1c2a14ed6414c1a145dd4b1c5c))


### Performance Improvements

* **mobile:** cache Meet pages and adapt meeting layouts ([f7483c1](https://github.com/tutur3u/platform/commit/f7483c162f67dbb47cac533c320e108e3bf17e07))

## [0.9.2](https://github.com/tutur3u/platform/compare/mobile-v0.9.1...mobile-v0.9.2) (2026-09-03)


### Bug Fixes

* **mobile:** remove redundant bridge imports ([3319a48](https://github.com/tutur3u/platform/commit/3319a485f112e946efb3ed31b44226955815f44c))

## [0.9.1](https://github.com/tutur3u/platform/compare/mobile-v0.9.0...mobile-v0.9.1) (2026-08-25)


### Bug Fixes

* **mobile:** preserve analyzer compatibility ([946f705](https://github.com/tutur3u/platform/commit/946f705bbe33c61a1835edc2bd23b9f249a1c420))
* **mobile:** refresh Firebase iOS pods ([d30bc35](https://github.com/tutur3u/platform/commit/d30bc352fb9fadc7c83f0b2ef89a4f878e1e5a0e))

## [0.9.0](https://github.com/tutur3u/platform/compare/mobile-v0.8.1...mobile-v0.9.0) (2026-08-04)


### Features

* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))

## [0.8.1](https://github.com/tutur3u/platform/compare/mobile-v0.8.0...mobile-v0.8.1) (2026-07-21)


### Bug Fixes

* **quality:** address AI findings ([c24f827](https://github.com/tutur3u/platform/commit/c24f8278ac03c927683c5a3af193ce77c736f3ec))

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
