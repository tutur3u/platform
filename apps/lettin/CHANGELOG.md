# Changelog

## [1.4.0](https://github.com/tutur3u/platform/compare/lettin-v1.3.0...lettin-v1.4.0) (2026-10-09)


### Features

* **docs:** expand platform guides and enforce app SEO and runtime pause ([e79cb7e](https://github.com/tutur3u/platform/commit/e79cb7e96c7db4d1baedb09b7420ca41b75e367f))
* **docs:** expand platform guides, enforce SEO, and pause inactive runtimes ([#6085](https://github.com/tutur3u/platform/issues/6085)) ([df7a159](https://github.com/tutur3u/platform/commit/df7a159e9c657fee4f6e0b593c776d6887b2ae11))
* **lettin:** add guided wiki entry starters ([e1d1fb5](https://github.com/tutur3u/platform/commit/e1d1fb5a991891ca256faecf06dfd32ea603d964)) ([#6102](https://github.com/tutur3u/platform/issues/6102)) ([ff0e909](https://github.com/tutur3u/platform/commit/ff0e90901c95388c645e3ed9ee243fefd0663327))


### Bug Fixes

* **ci:** integrate approval tests and Lettin upload transport ([#6065](https://github.com/tutur3u/platform/issues/6065)) ([e18cede](https://github.com/tutur3u/platform/commit/e18cedecadbb2b4044a4545a9b0acf75b9565635))
* **finance:** bound subscription schedules and block invalid inventory ([f4163bf](https://github.com/tutur3u/platform/commit/f4163bf6697316a06a8b2d3922d9664937dd6940)) ([#5990](https://github.com/tutur3u/platform/issues/5990)) ([f2096f6](https://github.com/tutur3u/platform/commit/f2096f6e20d27dd998a03d11c7b0769d7f06bb2e))
* **finance:** expose safe invoice history recovery ([8a53d36](https://github.com/tutur3u/platform/commit/8a53d367d6888e592a0d64f760d47234d858bd73)) ([#6034](https://github.com/tutur3u/platform/issues/6034)) ([fd65a3d](https://github.com/tutur3u/platform/commit/fd65a3db6f7472771374192ab07f5a97c6fcaee8))
* **finance:** reconcile attendance summary with current main ([fb00e6e](https://github.com/tutur3u/platform/commit/fb00e6ef4373adc1b6b9107f9bba883c101c3438))
* **lettin:** add safe deployment verifier diagnostics ([242d341](https://github.com/tutur3u/platform/commit/242d341bf78d42477c0a923778e63ecc8dc29bc4)) ([#6091](https://github.com/tutur3u/platform/issues/6091)) ([d9fe807](https://github.com/tutur3u/platform/commit/d9fe8072136908fd9f9f5fda9bcf22b5c02d29f5))
* **lettin:** align verifier fixtures with Vitest ([dc46a1b](https://github.com/tutur3u/platform/commit/dc46a1b1002f9ca8a967d063f0481b42353a2028))
* **lettin:** finalize banner uploads before updating profile ([c02388f](https://github.com/tutur3u/platform/commit/c02388fa493d9844f6cdfda8b16c9dcc2414655b))
* **lettin:** restore accessible identity field labels ([#5947](https://github.com/tutur3u/platform/issues/5947)) ([c0bdec5](https://github.com/tutur3u/platform/commit/c0bdec52f1557faa16b9e98212f1604330290ef5))
* **lettin:** restore exact profile upload labels ([b838502](https://github.com/tutur3u/platform/commit/b8385022fcb936bd0598f3286246abc1ca0406f0))
* **lettin:** restore exact upload labels and bound import preview ([#6027](https://github.com/tutur3u/platform/issues/6027)) ([d374e50](https://github.com/tutur3u/platform/commit/d374e50650e1a75579bcbd601e3d855350d16e64))
* **lettin:** separate identity labels from policy descriptions ([477a315](https://github.com/tutur3u/platform/commit/477a315b2c7d27f8f320ac066c33c51636180791))

## [1.3.0](https://github.com/tutur3u/platform/compare/lettin-v1.2.0...lettin-v1.3.0) (2026-10-04)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **lettin:** create a relaxed home and dedicated creative spaces ([54a2a38](https://github.com/tutur3u/platform/commit/54a2a38f12753044d4082398f7c8f8bde75a139d)) ([#5733](https://github.com/tutur3u/platform/issues/5733)) ([d1c03e5](https://github.com/tutur3u/platform/commit/d1c03e587a5f93309f6e8e237d818b175004ed73))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
* **lettin:** preserve creator context and resolve review findings ([d9d3697](https://github.com/tutur3u/platform/commit/d9d3697bc3a653c4bdafebb457725bd78692baa2))
* **lettin:** use canonical invitation destinations ([cdebac2](https://github.com/tutur3u/platform/commit/cdebac239b4c6ddbf401eed17be8e9fd2aa9e3bc))

## [1.2.0](https://github.com/tutur3u/platform/compare/lettin-v1.1.0...lettin-v1.2.0) (2026-09-25)


### Features

* **auth:** enforce required account MFA lifecycle ([e08f27d](https://github.com/tutur3u/platform/commit/e08f27dbc082f7d9c951bb0792357638f3dcfb0a)) ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))
* **finance:** add granular invoice audit trail and recovery review ([#5376](https://github.com/tutur3u/platform/issues/5376)) ([b8df666](https://github.com/tutur3u/platform/commit/b8df666804848d96d35ba693d126fe611a3ebf2b))
* **finance:** add invoice history and recoverable deletion ([3d6dea5](https://github.com/tutur3u/platform/commit/3d6dea5bdbb055073b9b5d5680e391d094874ad2))
* **finance:** expand invoice audit review and filters ([c346cac](https://github.com/tutur3u/platform/commit/c346cac5a2dfcdcd944d1fcdfa72f40ec27aa720))
* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))


### Bug Fixes

* **finance:** retain actors across invoice audit writes ([75e1139](https://github.com/tutur3u/platform/commit/75e11390aa30493ee1f83f95660cfaf7547e13c0)) ([#5383](https://github.com/tutur3u/platform/issues/5383)) ([a1fbb54](https://github.com/tutur3u/platform/commit/a1fbb54532f652116064ab7d7b8d11b217b2b9d4))
* **finance:** speed up invoice audit history and improve pagination ([b6c165e](https://github.com/tutur3u/platform/commit/b6c165e88e8888facec7744ee16c1d9378bb90e5)) ([#5380](https://github.com/tutur3u/platform/issues/5380)) ([c829653](https://github.com/tutur3u/platform/commit/c8296532b5282324b28c09d3c06a64894694b46c))

## [1.1.0](https://github.com/tutur3u/platform/compare/lettin-v1.0.0...lettin-v1.1.0) (2026-09-25)


### Features

* **auth:** enforce required account MFA lifecycle ([e08f27d](https://github.com/tutur3u/platform/commit/e08f27dbc082f7d9c951bb0792357638f3dcfb0a)) ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))
* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))

## 1.0.0 (2026-09-20)


### Features

* **finance:** add granular invoice audit trail and recovery review ([#5376](https://github.com/tutur3u/platform/issues/5376)) ([b8df666](https://github.com/tutur3u/platform/commit/b8df666804848d96d35ba693d126fe611a3ebf2b))
* **finance:** add invoice history and recoverable deletion ([3d6dea5](https://github.com/tutur3u/platform/commit/3d6dea5bdbb055073b9b5d5680e391d094874ad2))
* **finance:** expand invoice audit review and filters ([c346cac](https://github.com/tutur3u/platform/commit/c346cac5a2dfcdcd944d1fcdfa72f40ec27aa720))
* **lettin:** add Cloudflare worldbuilding satellite ([0c8cc22](https://github.com/tutur3u/platform/commit/0c8cc22168477440e326bdec08427daf9721d9bf)) ([#5351](https://github.com/tutur3u/platform/issues/5351)) ([2631103](https://github.com/tutur3u/platform/commit/263110318bb9bab6d26a1bdd539fc52a40b25bec))


### Bug Fixes

* **finance:** retain actors across invoice audit writes ([75e1139](https://github.com/tutur3u/platform/commit/75e11390aa30493ee1f83f95660cfaf7547e13c0)) ([#5383](https://github.com/tutur3u/platform/issues/5383)) ([a1fbb54](https://github.com/tutur3u/platform/commit/a1fbb54532f652116064ab7d7b8d11b217b2b9d4))
* **finance:** speed up invoice audit history and improve pagination ([b6c165e](https://github.com/tutur3u/platform/commit/b6c165e88e8888facec7744ee16c1d9378bb90e5)) ([#5380](https://github.com/tutur3u/platform/issues/5380)) ([c829653](https://github.com/tutur3u/platform/commit/c8296532b5282324b28c09d3c06a64894694b46c))
* **lettin:** align access label font weight ([a305904](https://github.com/tutur3u/platform/commit/a305904405b14a91722cabdc91bacd112b21b304))
* **lettin:** honor sticky and reduced-motion layout ([b6cc6b5](https://github.com/tutur3u/platform/commit/b6cc6b59963b4995e27b6094f133654ece5639f2))
* **lettin:** localize editorial annotations ([7e5cec5](https://github.com/tutur3u/platform/commit/7e5cec5cf5a42b144961d55a397c1469308f42b9))
* **lettin:** rebuild editorial visual system ([9db7e3b](https://github.com/tutur3u/platform/commit/9db7e3b2310f3042c0ead9a5da16be4065087a59)) ([#5353](https://github.com/tutur3u/platform/issues/5353)) ([153dba0](https://github.com/tutur3u/platform/commit/153dba0015a8355ff07b6b9654fbbb5ac1890e57))
* **lettin:** refine accessible editorial details ([6eeb437](https://github.com/tutur3u/platform/commit/6eeb4372a339328b450356237f1ebfc92d2f2337))
* **lettin:** satisfy external lint checks ([f37e3e8](https://github.com/tutur3u/platform/commit/f37e3e864c34fa436710924f6eb3ba1c32f87354))
