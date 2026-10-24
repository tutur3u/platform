# Changelog

## [0.29.0](https://github.com/tutur3u/platform/compare/sdk-v0.28.0...sdk-v0.29.0) (2026-10-24)


### Features

* **devbox:** stop whole job process groups and support remote stop ([#6446](https://github.com/tutur3u/platform/issues/6446)) ([cd4dcd0](https://github.com/tutur3u/platform/commit/cd4dcd0f52fb4396a342b32af93516891b3bcb86))
* **sdk:** add cross-project worker-token budgets to ttr resources ([9e7129d](https://github.com/tutur3u/platform/commit/9e7129d1d965a4f91227958a7d0f3f9c43edb1f2)) ([#6558](https://github.com/tutur3u/platform/issues/6558)) ([bb0b74f](https://github.com/tutur3u/platform/commit/bb0b74f78a9f5d74b5b3f67562378c0e17aeab64))
* **sdk:** add guarded global supplier rollout ([9256482](https://github.com/tutur3u/platform/commit/9256482a957f79e3e2938b0bd2cda10795e49a42))
* **sdk:** add trusted dev package channel ([f31cd78](https://github.com/tutur3u/platform/commit/f31cd78319289dea17eb99e01c4445b3e27df41b))
* **sdk:** add trusted dev packages and channel identity ([#6590](https://github.com/tutur3u/platform/issues/6590)) ([62d7dfc](https://github.com/tutur3u/platform/commit/62d7dfc7778d37691b55755c70f4c1d2a6d903b6))
* **sdk:** add weighted multi-host admission to ttr resources ([#6503](https://github.com/tutur3u/platform/issues/6503)) ([80e46a8](https://github.com/tutur3u/platform/commit/80e46a84c06f251df4488d0272ff8f08bf5d473c))
* **sdk:** automate guarded global supplier rollout and recovery ([#6591](https://github.com/tutur3u/platform/issues/6591)) ([fb1bd34](https://github.com/tutur3u/platform/commit/fb1bd34ab7c9cce1057fb850494b66de9eb00643))
* **sdk:** honour an operator host preference order in --hosts admission ([#6513](https://github.com/tutur3u/platform/issues/6513)) ([2ea0e1c](https://github.com/tutur3u/platform/commit/2ea0e1cbef093a57c943e8b1f95a115eca6e7d3d))
* **sdk:** offload saturated resource runs to trusted devbox runners ([#6454](https://github.com/tutur3u/platform/issues/6454)) ([59bce45](https://github.com/tutur3u/platform/commit/59bce451809baf5f62185d172833a99fb5ad0a7c))
* **sdk:** run an exact pushed commit on trusted devbox runners ([#6452](https://github.com/tutur3u/platform/issues/6452)) ([bd19b4e](https://github.com/tutur3u/platform/commit/bd19b4ed8b59c4648ad1300edc9444e5d1443306))
* **sdk:** separate devbox trust tiers on the runner ([#6451](https://github.com/tutur3u/platform/issues/6451)) ([c8b7297](https://github.com/tutur3u/platform/commit/c8b72976f4fb301476fbb825aea109a17f448523))


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **devbox:** cancel lost offload creates by key and page logs by run cursor ([aace86b](https://github.com/tutur3u/platform/commit/aace86bdbdef0f44ae31562c61dd2174463a384c))
* **devbox:** fence keyed creates and enforce the commit-run protocol server-side ([d0dd8c6](https://github.com/tutur3u/platform/commit/d0dd8c6b34e0270e46e595c60bd230dcb1644693))
* **devbox:** offload only to runners advertising the commit-run protocol ([72561cc](https://github.com/tutur3u/platform/commit/72561cce0da3c59c6ea52f994ac1815ff555c827))
* **resources:** fence workspace admission and preserve global upgrades ([#6568](https://github.com/tutur3u/platform/issues/6568)) ([68f0638](https://github.com/tutur3u/platform/commit/68f0638fed3bd404916bf0a966b7d163791421a2))
* **resources:** fence workspace bins and preserve global upgrades ([2b2c631](https://github.com/tutur3u/platform/commit/2b2c63171449a8896b9ff20472bfd284f771cc9d))
* **resources:** preserve ownership through protocol upgrades ([25139cf](https://github.com/tutur3u/platform/commit/25139cf6b69a1d24b9fa5a4e945a72d66473ca32))
* **resources:** reject cache takeover and orphan CLI aliases ([89a0fc3](https://github.com/tutur3u/platform/commit/89a0fc3364d4b0ad37967c7ccd30dbd6387b2f2f))
* **resources:** trust global CLI and fence cross-install setup ([8a4ef11](https://github.com/tutur3u/platform/commit/8a4ef11d2f66ba9c8c93400096616a51e0266153))
* **sdk:** admit ambiguous Node resource invocations ([f4c67b2](https://github.com/tutur3u/platform/commit/f4c67b2066318fc77221edd2522229baaab3ec13))
* **sdk:** admit and cap config-driven Node tests ([dc13a70](https://github.com/tutur3u/platform/commit/dc13a70f17f509b0869a47f284cccccc0340d8bf))
* **sdk:** cap the public Playwright test CLI entrypoint ([2b81ea5](https://github.com/tutur3u/platform/commit/2b81ea574d25e65ef53c8f761426049cd37c2cda))
* **sdk:** drain oversized budget heads and reconcile rollback ([e4f5989](https://github.com/tutur3u/platform/commit/e4f59898bf0e22d5a5a75825a643052ac8e69578))
* **sdk:** exclude shared test fixtures from the portable build ([acf283d](https://github.com/tutur3u/platform/commit/acf283dbf182a074ad4b3b8919c0b60a8b343c68)) ([#6586](https://github.com/tutur3u/platform/issues/6586)) ([a240202](https://github.com/tutur3u/platform/commit/a240202cf9a03d701902a915558566aa993839d8))
* **sdk:** fail toward admission for ambiguous Node option values ([83961be](https://github.com/tutur3u/platform/commit/83961be640281145987ac3b985a77196a4518aa9))
* **sdk:** fence upgrades atomically and cap ambiguous test workers ([3058bca](https://github.com/tutur3u/platform/commit/3058bcae38718db8a7642126c0bd9c1355a0c64c))
* **sdk:** harden rollout recovery and fleet outcome reporting ([bc98c9e](https://github.com/tutur3u/platform/commit/bc98c9e6cad9c68bed7a39f9d4ca4c27be18c821))
* **sdk:** harden ttr resources nested admission and trivial bypass ([#6492](https://github.com/tutur3u/platform/issues/6492)) ([bb5ac64](https://github.com/tutur3u/platform/commit/bb5ac64ffbff72f3a17af3a2ef09e221ff1e1a40))
* **sdk:** hoist regex test so CodeQL can parse portable-build ([8291a33](https://github.com/tutur3u/platform/commit/8291a33a7a1406d357e240a60dbb03ebec6437e4)) ([#6543](https://github.com/tutur3u/platform/issues/6543)) ([8bfff65](https://github.com/tutur3u/platform/commit/8bfff658698cd1fe79a2e15f095296bdfbee83d0))
* **sdk:** identify unmanaged launchers before budget upgrade checks ([c61ad90](https://github.com/tutur3u/platform/commit/c61ad909048fb6d1839bfc719b4350c520213bb8))
* **sdk:** isolate version probes and serialize dev publication ([dde6fec](https://github.com/tutur3u/platform/commit/dde6fec7a7b1dafb0c377da441400cef5bc6b05d))
* **sdk:** merge Node hardening and gate budget rollout ([94717f3](https://github.com/tutur3u/platform/commit/94717f37aad0cd030fa56a930e541dbc278683c7))
* **sdk:** never admit ttr through its own bun shim ([28d8d35](https://github.com/tutur3u/platform/commit/28d8d358a59b00085e5cf6f207a6344cd9c57469))
* **sdk:** preserve version contracts and recover dev packing safely ([107e5fd](https://github.com/tutur3u/platform/commit/107e5fddfd5bb588922276dcfa1da74c4e0c7bca))
* **sdk:** recognise the shipped CLI admission boundary ([ae48013](https://github.com/tutur3u/platform/commit/ae4801366b6ca72bc88dd50d5edf83fd986eb75d))
* **sdk:** reconcile resource fixtures and portable qualification ([e273523](https://github.com/tutur3u/platform/commit/e273523db0dd1fc62bff1e1ffa9e172b7e9a63fc))
* **sdk:** remove orphaned Judge containers and drop bare-pid kills ([#6461](https://github.com/tutur3u/platform/issues/6461)) ([78f2aa0](https://github.com/tutur3u/platform/commit/78f2aa01c51b5c58aef9f494fc76f0e717fde113))
* **sdk:** reserve reclaim capacity and enforce budget workers ([8e24af8](https://github.com/tutur3u/platform/commit/8e24af893bd66bf5634d535e7879ca41ed245f2b))
* **sdk:** validate trusted devbox executable input ([8319562](https://github.com/tutur3u/platform/commit/83195629745a9524fa3170bc7ddb31453fb35f20)) ([#6583](https://github.com/tutur3u/platform/issues/6583)) ([52c7c3d](https://github.com/tutur3u/platform/commit/52c7c3df008ee20b95f24e0213427dc5ad44be70))
* **security:** correct SDK atomic file typing ([87c7532](https://github.com/tutur3u/platform/commit/87c7532260f81ba8b1361919acb1c7d2107b0389))
* **security:** harden SDK file and token handling ([1a91433](https://github.com/tutur3u/platform/commit/1a91433743d4de9d5c6888e448d373acd7209eb7)) ([#6526](https://github.com/tutur3u/platform/issues/6526)) ([a9e410b](https://github.com/tutur3u/platform/commit/a9e410b8ecee04b3794a949fd47fb517b94173a5))
* **security:** repair native integrity CI and merge main ([667bfef](https://github.com/tutur3u/platform/commit/667bfef571dbb5b0e201bfa48ba3ed4000b7c522))
* **tooling:** clamp native checker threads and print concise usage ([dc5d608](https://github.com/tutur3u/platform/commit/dc5d608c72582c3c6fc64310055f396ab23a5a75))
* **tooling:** enforce validation arguments and native checker admission ([6e787d1](https://github.com/tutur3u/platform/commit/6e787d1d34ca54e5015a98b4fa4438f68de8dc5e))

## [0.28.0](https://github.com/tutur3u/platform/compare/sdk-v0.27.0...sdk-v0.28.0) (2026-10-17)


### Features

* **cli:** add offline backlog and operational memory ([1767db8](https://github.com/tutur3u/platform/commit/1767db837cd2843840ed357bb9942f5311b4912d)) ([#6251](https://github.com/tutur3u/platform/issues/6251)) ([210373e](https://github.com/tutur3u/platform/commit/210373e4e6401aea6e5c607cb2aff3cee973314d))
* **cli:** add verified local backlog search foundation ([98367b1](https://github.com/tutur3u/platform/commit/98367b16de019e9a601309cac2a7898c35b9778d)) ([#6269](https://github.com/tutur3u/platform/issues/6269)) ([45e3a93](https://github.com/tutur3u/platform/commit/45e3a93cdd444e083ba5fa5b9c4e4f3acd3c7fd3))
* **cli:** register private feedback commands ([a1d9c87](https://github.com/tutur3u/platform/commit/a1d9c875ce918be676d184e036d7210c6785c46d))
* **cli:** register staff feedback commands ([#6063](https://github.com/tutur3u/platform/issues/6063)) ([7001b99](https://github.com/tutur3u/platform/commit/7001b99e3dd228b3abdc93feecb1d79b170c944f))
* **cli:** reuse unchanged native search vectors incrementally ([84c5bc0](https://github.com/tutur3u/platform/commit/84c5bc04154a29b3b5f354a668f050854457a247))
* **cli:** route native backlog search commands ([7d7c10e](https://github.com/tutur3u/platform/commit/7d7c10ed62ce481d147e8130e07fdd3dda6f4faa)) ([#6272](https://github.com/tutur3u/platform/issues/6272)) ([ff98648](https://github.com/tutur3u/platform/commit/ff9864862eb7a4c49da8ed5ebb03307b19d27407))
* **infrastructure:** add employee creation HTTP boundary ([688a0b2](https://github.com/tutur3u/platform/commit/688a0b261d55996c8d86ff27f76f539cf42a7109))
* **infrastructure:** reconcile employee creation orchestration ([9356a36](https://github.com/tutur3u/platform/commit/9356a36872910c28552f494e75c3f89dc79cb543))
* **infrastructure:** reconcile employee restoration HTTP boundary ([7bbcb3b](https://github.com/tutur3u/platform/commit/7bbcb3bc2feab4c8f652f808a6921da92cf7d4bd))
* **infrastructure:** reconcile employee restoration orchestration ([862d22d](https://github.com/tutur3u/platform/commit/862d22dfbfb19c871bb3ecebcc2a4998902d1567))
* **lettin:** compose published collections with public links ([17a22a6](https://github.com/tutur3u/platform/commit/17a22a680b0abcb7417a304b607c126beb86823c))
* **lettin:** reconcile authored fact ordering with current editor ([dd51991](https://github.com/tutur3u/platform/commit/dd51991152131baf1431c224fae9bf9465f21280))
* **lettin:** reconcile character fact labels with current editor ([2b43a9e](https://github.com/tutur3u/platform/commit/2b43a9ef3f2c2a46837ea6f5d636af0a5028a175))
* **lettin:** reconcile private note discard review with current main ([8b19f09](https://github.com/tutur3u/platform/commit/8b19f099af02e65bdf522766f32d44146d843349))
* **lettin:** reconcile private publication preview with main ([9a64c17](https://github.com/tutur3u/platform/commit/9a64c1728e4144cc9f97bcaa4bb4ce20a6819c51))
* **lettin:** reconcile private studio artwork filtering with current main ([e01d4ae](https://github.com/tutur3u/platform/commit/e01d4ae0b933ccf4f6f62ad7bd294225003f10ae))
* **lettin:** reconcile private studio membership filters with main ([bab74a5](https://github.com/tutur3u/platform/commit/bab74a54460659e1b0f64bc42dfc5b1bd58aed6b))
* **lettin:** reconcile private Studio ordering with main ([61feb60](https://github.com/tutur3u/platform/commit/61feb600942de9087ca2f43744c3dcf2b6c3ff64))
* **lettin:** reconcile private studio tag filters with current main ([90b136c](https://github.com/tutur3u/platform/commit/90b136cf39d3ae1eed6fc0e7f4362e485e404cfb))
* **lettin:** reconcile published reading sequence with current main ([a872882](https://github.com/tutur3u/platform/commit/a8728827d0c5fcbf7c380ac637b340b483eaea2f))
* **lettin:** reconcile reviewed import browsing with current main ([cd37cc8](https://github.com/tutur3u/platform/commit/cd37cc8c32138874349be82a807fe57ae4f4e91c))
* **lettin:** reconcile scoped notebook export with main ([5971e66](https://github.com/tutur3u/platform/commit/5971e666bedf639872e58de46e4139fa00adf326))
* **mail:** reconcile connected accounts with main ([3e2eae1](https://github.com/tutur3u/platform/commit/3e2eae1e93d8f03bf6425055f51453a1061aaada))
* **platform:** reconcile public link controls with main ([c07411c](https://github.com/tutur3u/platform/commit/c07411cd829b16a0ea65368e35f8683f1d948eaa))
* reconcile local reader preferences with main ([fd3837a](https://github.com/tutur3u/platform/commit/fd3837a80309507e4eaf2029ca922977411e03a3))
* reconcile published reading statistics with main ([81d7aa3](https://github.com/tutur3u/platform/commit/81d7aa3e4efbad63c84952ef78984d27b84ba1d8))
* reconcile saved library filters and ordering with main ([7d470ba](https://github.com/tutur3u/platform/commit/7d470ba36add3db7a8392e791eac56a4e4275d41))
* **sdk:** add bounded operational assignment contracts ([8f14382](https://github.com/tutur3u/platform/commit/8f143820f2284eae29c16f50490ed1e73384b73d)) ([#6284](https://github.com/tutur3u/platform/issues/6284)) ([d24358e](https://github.com/tutur3u/platform/commit/d24358e2f9918970c7f0b595aade645035d115e9))
* **sdk:** add immutable outcome projection reader ([f1941bb](https://github.com/tutur3u/platform/commit/f1941bb6c14b06af85a8381e7fc60bc6baf81335)) ([#6263](https://github.com/tutur3u/platform/issues/6263)) ([42378ae](https://github.com/tutur3u/platform/commit/42378ae0673c707835ecaeed4b342d8165f39a56))
* **sdk:** add operational peer protocol foundation ([bd62c6c](https://github.com/tutur3u/platform/commit/bd62c6caebf6bad219d0758e7a7970ea37fe7c58)) ([#6252](https://github.com/tutur3u/platform/issues/6252)) ([f55a4b2](https://github.com/tutur3u/platform/commit/f55a4b2181f1bb65b8ab0c3bd1477385e533e3d7))
* **sdk:** add opt-in bounded resource queue lanes ([7518b8a](https://github.com/tutur3u/platform/commit/7518b8a026304a5721aa2db3572fbe6e36e11dae)) ([#6285](https://github.com/tutur3u/platform/issues/6285)) ([a819948](https://github.com/tutur3u/platform/commit/a81994896b42bf48f48b1698352ca8bd6b7fc09c))
* **sdk:** add reversible native outcome graph ([b9c9873](https://github.com/tutur3u/platform/commit/b9c987316739120d6a34b5af6b557acbc41379ec)) ([#6264](https://github.com/tutur3u/platform/issues/6264)) ([b409e6c](https://github.com/tutur3u/platform/commit/b409e6cc7f77f3118a6826ad816f30506a0bb28f))
* **sdk:** prepare private feedback CLI handler ([#6059](https://github.com/tutur3u/platform/issues/6059)) ([89b55da](https://github.com/tutur3u/platform/commit/89b55da36e41aeaad03de2bfa30a5d817d14cd48))
* **supabase:** support scoped server Auth construction ([eec9ea8](https://github.com/tutur3u/platform/commit/eec9ea87c3180c9a4b358705b0c8365e74a46a1a))


### Bug Fixes

* **ci:** provision resource shims before cold runner admission ([88bb83c](https://github.com/tutur3u/platform/commit/88bb83c25e767ced998153b221fbe9e8fd63285d))
* **cli:** admit verified Hugging Face CDN redirect ([2222b5f](https://github.com/tutur3u/platform/commit/2222b5ffe5cbce0a1685b50639cc1bec7ae51e3b))
* **cli:** explicitly disable native embedding weight cache ([f618299](https://github.com/tutur3u/platform/commit/f61829957b199a24290e139a578c65f27577ab79))
* **cli:** package local search resources for NodeNext ([2d5feba](https://github.com/tutur3u/platform/commit/2d5feba1cabbedc0e8895949262bdc4d4d91cbe1))
* **cli:** require explicit private feedback content opt-in ([32165bd](https://github.com/tutur3u/platform/commit/32165bd7b59721ee7780933f035a61c7f43a88d6))
* **cli:** retain sanitized local runtime failure diagnostics ([a97a7c0](https://github.com/tutur3u/platform/commit/a97a7c098c1c42eb660478aebc0929a9b058e1b8))
* **database:** reconcile tutoring absence identity with main ([afd5330](https://github.com/tutur3u/platform/commit/afd53306ed95d7ccc554a1bed3021c16a9a63747))
* **feedback:** qualify bounded staff operation lifetimes ([5d338b1](https://github.com/tutur3u/platform/commit/5d338b1d0417df51870e37464581a06f6a57deb0))
* **feedback:** qualify scoped staff auth transport ([1c5e796](https://github.com/tutur3u/platform/commit/1c5e79691e53eeab19279167f506d1e061e3f652))
* **journal:** reconcile context branch with updated parent ([80cf437](https://github.com/tutur3u/platform/commit/80cf437c9d494e3c0fc4ce9bb6d2fe19c655e2a0))
* **lettin:** bound private writing statistics traversal ([065908f](https://github.com/tutur3u/platform/commit/065908f355303f4da834d79c0fb051dd1bd467f1))
* **lettin:** qualify private notebook import and strip gallery media ([284bc8d](https://github.com/tutur3u/platform/commit/284bc8d57edf1d8f58b908d36fdbf9b3c3ee8d94))
* **lettin:** reconcile optional source references with current main ([bf983c2](https://github.com/tutur3u/platform/commit/bf983c20700dcd97e1ded814ea88f3231ed2ccc2))
* **lettin:** reconcile reviewed private notebook copy with main ([b91bbc8](https://github.com/tutur3u/platform/commit/b91bbc8d580aab48f5f8b74a3575f446939d8fb2))
* **lettin:** retain private progress when restoring published drafts ([ea457e5](https://github.com/tutur3u/platform/commit/ea457e5b514ecaf7cf91e80935307d4083ebe930))
* **meet:** reconcile landed Lettin adapter integration ([629cf21](https://github.com/tutur3u/platform/commit/629cf21338d7e4898cc3d512c93ea50447156306))
* **parley:** reconcile pinned cache runtime with main ([a21ed6d](https://github.com/tutur3u/platform/commit/a21ed6d81c5b68e7f1727c6b8128ee57b88f588f))
* reconcile external project storage analytics with main ([573f414](https://github.com/tutur3u/platform/commit/573f414522a1e77c657cb7b54a43331d1b06922b))
* **sdk:** add bounded opt-in Docker metadata lifecycle diagnostic ([#6329](https://github.com/tutur3u/platform/issues/6329)) ([e7cda9b](https://github.com/tutur3u/platform/commit/e7cda9b453c12dc120c1509047bad9540a2ddf89))
* **sdk:** add opt-in Docker metadata lifecycle diagnostic ([04a68e7](https://github.com/tutur3u/platform/commit/04a68e72ee3b0a4dbea925cf5091066562f847c1))
* **sdk:** bind operation receipts to original history ([ade8aac](https://github.com/tutur3u/platform/commit/ade8aac00ae6026c72bfc28738a863cf9a8f145b))
* **sdk:** index canonical outcome groups and children ([0256040](https://github.com/tutur3u/platform/commit/0256040acc5bfcd2c58dd6f1ae0c57a741ed9750))
* **sdk:** isolate portable public package dependencies ([a67d33f](https://github.com/tutur3u/platform/commit/a67d33f50b10d70c01ab7e67ea003bf4efcaa363))
* **sdk:** keep type checks from emitting build outputs ([9d1bf05](https://github.com/tutur3u/platform/commit/9d1bf0593c316bb9aa95f6fe2d83fd9d37bebf05))
* **sdk:** reconcile package qualification with main ([0bd74e7](https://github.com/tutur3u/platform/commit/0bd74e7f2a16bd46465e1514eb17269c25e9431d))
* **sdk:** reject nonregular shims before reading ([6bf2281](https://github.com/tutur3u/platform/commit/6bf228116581e1ae0a89fae0a69caf6f58fa4440))
* **sdk:** reuse resource shims without implicit provisioning ([#6330](https://github.com/tutur3u/platform/issues/6330)) ([2cb5935](https://github.com/tutur3u/platform/commit/2cb59357d94167b93895aae9186fffe28b71723f))
* **sdk:** separate resource execution from shim provisioning ([ab0cf76](https://github.com/tutur3u/platform/commit/ab0cf76c17785360b418574bbb0b7c766442cb70))
* **sdk:** stabilize resource lane admission and test fixtures ([ca28a62](https://github.com/tutur3u/platform/commit/ca28a62a0e24a3e02e779ab91cdec882a6bf3aae))

## [0.27.0](https://github.com/tutur3u/platform/compare/sdk-v0.26.0...sdk-v0.27.0) (2026-10-04)


### Features

* **devbox:** protect and maintain platform-owned runners ([2e2cb4a](https://github.com/tutur3u/platform/commit/2e2cb4ad84b8b05b94699723b4e44899cd3f249d)) ([#5772](https://github.com/tutur3u/platform/issues/5772)) ([89d289f](https://github.com/tutur3u/platform/commit/89d289f60483ae9154c71faab1f3f306cf1a9cb2))


### Bug Fixes

* **cli:** preserve optional actions in command dispatch ([27b9e20](https://github.com/tutur3u/platform/commit/27b9e20790b02df23a1bf8dad6fda4608add6a74))
* **devboxes:** reserve exact integer host shares ([d282009](https://github.com/tutur3u/platform/commit/d2820097fc84b6b814be24e2f23200dba389ff7b))
* **devbox:** harden fleet maintenance and runner policy repair ([0433d0c](https://github.com/tutur3u/platform/commit/0433d0cd83646ac7fff50d954cb91d4911f431cb))
* **devbox:** preserve service identity and reject truncated fleets ([3aadfb3](https://github.com/tutur3u/platform/commit/3aadfb3b62705050a524c1eead911461903a3b99))
* **devbox:** reject truncated runner snapshots ([8244d01](https://github.com/tutur3u/platform/commit/8244d01768a74642d1550e72fab1a1c5b2715a85))
* **devbox:** report actual host execution policy ([4653c34](https://github.com/tutur3u/platform/commit/4653c34a34cb48e0801d85ace1ce99fef7082a21))
* **devbox:** require policy support for protected services ([d378858](https://github.com/tutur3u/platform/commit/d37885841085f98fae7c2aeb585da0c3da087a93))
* **devbox:** retry shared CLI upgrade contention promptly ([d4d30a3](https://github.com/tutur3u/platform/commit/d4d30a388aaeaac80fac55ddff7675184811336f))
* **devbox:** stop failed dispatch and retain sandbox ownership ([85d1e61](https://github.com/tutur3u/platform/commit/85d1e613e65af1441fa54fc192c24ee359746723))
* **devbox:** tighten protected installer permissions ([fb395bb](https://github.com/tutur3u/platform/commit/fb395bb8d3df5947592d236c652b377ba3eb42b9))
* **devbox:** verify Judge daemon readiness and recover upgrade locks ([16a6660](https://github.com/tutur3u/platform/commit/16a66609b0418e9693725f1f7f4125887f456133))
* **devbox:** wait for admitted creation before stopping ([b1edb12](https://github.com/tutur3u/platform/commit/b1edb127f164fa9ab8cd8598d93eb51faff9b919))
* **identity:** integrate main and order unapplied creator migrations ([5512e24](https://github.com/tutur3u/platform/commit/5512e2414abaa0c78b68cbdd3186a1d4bab861e7))
* **sdk:** bound mixed judge jobs and validate playground exports ([c5efff9](https://github.com/tutur3u/platform/commit/c5efff9427dc36cae6c4212871a335f9cd4bde03))
* **sdk:** defer hosted playground adapter to canonical API ([a18e65a](https://github.com/tutur3u/platform/commit/a18e65a862ab22b664b92f615a9e35d56e123a82))
* **sdk:** fence playground eviction and failed startup ([f208dcb](https://github.com/tutur3u/platform/commit/f208dcbd7a55385f2aa62ed8a822b029d7b5bc8f))
* **sdk:** fence playground lifecycle and keep agent leases alive ([d92e437](https://github.com/tutur3u/platform/commit/d92e437af1b2e2fdefa1036d40a71d1d45be4703))
* **sdk:** probe playground tools with the managed image path ([9571f35](https://github.com/tutur3u/platform/commit/9571f353f277efdddeeb22335a81b4475c2f4461))


### Performance Improvements

* **devboxes:** parallelize bounded execution and retain warm playgrounds ([#5746](https://github.com/tutur3u/platform/issues/5746)) ([efd8ac4](https://github.com/tutur3u/platform/commit/efd8ac44b5c9f8cbf2ab5d64fbe89e1f7afe4f96))
* **devboxes:** parallelize bounded runner execution and retain warm playgrounds ([c31cbf3](https://github.com/tutur3u/platform/commit/c31cbf3a2a7cb5214d75183896791366affdc7e6))

## [0.26.0](https://github.com/tutur3u/platform/compare/sdk-v0.25.0...sdk-v0.26.0) (2026-09-29)


### Features

* **learn:** add resizable coding workspace and execution history ([c7043ff](https://github.com/tutur3u/platform/commit/c7043ff9a30b5d1c49bc44534aa8e2107d5a16ae)) ([#5637](https://github.com/tutur3u/platform/issues/5637)) ([6b82c0c](https://github.com/tutur3u/platform/commit/6b82c0c9daecb7dd7ed9eb0ac9310c02a7895c68))

## [0.25.0](https://github.com/tutur3u/platform/compare/sdk-v0.24.0...sdk-v0.25.0) (2026-09-29)


### Features

* **devbox:** add platform Judge and fleet controls ([#5608](https://github.com/tutur3u/platform/issues/5608)) ([e83b9f2](https://github.com/tutur3u/platform/commit/e83b9f2025eedf7fd63df0a751b70134216c9b0a))
* **devbox:** add sandboxed judge and runner controls ([787bbaa](https://github.com/tutur3u/platform/commit/787bbaa549b400771d34beeebcebc2a110b44c60))
* **devboxes:** route agent control through Cloudflare ([98d4580](https://github.com/tutur3u/platform/commit/98d4580b39308fdd835e1762ebad102fe6ca3f02)) ([#5614](https://github.com/tutur3u/platform/issues/5614)) ([cbd18fa](https://github.com/tutur3u/platform/commit/cbd18fa70ee2d88c8b7e607ab56631c581b723c9))


### Bug Fixes

* **cli:** run Judge doctor without login ([fe344b8](https://github.com/tutur3u/platform/commit/fe344b88a4429300d296b5063baf7b34cd41cb86)) ([#5613](https://github.com/tutur3u/platform/issues/5613)) ([176f96f](https://github.com/tutur3u/platform/commit/176f96fdabfeb37f8930478c1b8d80267c1a8489))
* **devbox:** enforce judge concurrency budgets ([f46ab79](https://github.com/tutur3u/platform/commit/f46ab798e4aae330bc6b2fe7d80de41f0f64715a))
* **devbox:** restrict maintenance and validate judge results ([884bc77](https://github.com/tutur3u/platform/commit/884bc77cb01a85953cd11e85c937db62712ddccf))

## [0.24.0](https://github.com/tutur3u/platform/compare/sdk-v0.23.0...sdk-v0.24.0) (2026-09-29)


### Features

* **devboxes:** route agent control through Cloudflare ([98d4580](https://github.com/tutur3u/platform/commit/98d4580b39308fdd835e1762ebad102fe6ca3f02)) ([#5614](https://github.com/tutur3u/platform/issues/5614)) ([cbd18fa](https://github.com/tutur3u/platform/commit/cbd18fa70ee2d88c8b7e607ab56631c581b723c9))


### Bug Fixes

* **cli:** run Judge doctor without login ([fe344b8](https://github.com/tutur3u/platform/commit/fe344b88a4429300d296b5063baf7b34cd41cb86)) ([#5613](https://github.com/tutur3u/platform/issues/5613)) ([176f96f](https://github.com/tutur3u/platform/commit/176f96fdabfeb37f8930478c1b8d80267c1a8489))

## [0.23.0](https://github.com/tutur3u/platform/compare/sdk-v0.22.2...sdk-v0.23.0) (2026-09-28)


### Features

* **devbox:** add platform Judge and fleet controls ([#5608](https://github.com/tutur3u/platform/issues/5608)) ([e83b9f2](https://github.com/tutur3u/platform/commit/e83b9f2025eedf7fd63df0a751b70134216c9b0a))
* **devbox:** add sandboxed judge and runner controls ([787bbaa](https://github.com/tutur3u/platform/commit/787bbaa549b400771d34beeebcebc2a110b44c60))


### Bug Fixes

* **devbox:** enforce judge concurrency budgets ([f46ab79](https://github.com/tutur3u/platform/commit/f46ab798e4aae330bc6b2fe7d80de41f0f64715a))
* **devbox:** restrict maintenance and validate judge results ([884bc77](https://github.com/tutur3u/platform/commit/884bc77cb01a85953cd11e85c937db62712ddccf))

## [0.22.2](https://github.com/tutur3u/platform/compare/sdk-v0.22.1...sdk-v0.22.2) (2026-09-20)


### Bug Fixes

* **ci:** recover daily release merges with verified promotion ([56fcb8c](https://github.com/tutur3u/platform/commit/56fcb8c18ce3a22d2b7067229e5d8a46afc0db41)) ([#5406](https://github.com/tutur3u/platform/issues/5406)) ([c5abc4f](https://github.com/tutur3u/platform/commit/c5abc4fbd9ce4c6a2bf0b4f830927bb8736dd879))

## [0.22.1](https://github.com/tutur3u/platform/compare/sdk-v0.22.0...sdk-v0.22.1) (2026-09-11)


### Bug Fixes

* **cli:** keep resource launchers valid after package upgrades ([e469641](https://github.com/tutur3u/platform/commit/e46964128af106a251fc2c2d5f61a98f11e4b33a))

## [0.22.0](https://github.com/tutur3u/platform/compare/sdk-v0.21.0...sdk-v0.22.0) (2026-09-11)


### Features

* **cli:** add shared local resource controls ([b34e3fd](https://github.com/tutur3u/platform/commit/b34e3fd0788865fd5310e254c63b6271dd5dd0dc))

## [0.21.0](https://github.com/tutur3u/platform/compare/sdk-v0.20.1...sdk-v0.21.0) (2026-09-07)


### Features

* **cli:** configure external apps and CMS bindings ([c68cf0e](https://github.com/tutur3u/platform/commit/c68cf0e41a361a156d29907feb72b48dc91ae969))

## [0.20.1](https://github.com/tutur3u/platform/compare/sdk-v0.20.0...sdk-v0.20.1) (2026-08-11)


### Bug Fixes

* **cli:** handle browser launch errors ([3bdcbf3](https://github.com/tutur3u/platform/commit/3bdcbf39c2eb2094e662c45eb62f3afecfef3cc9))

## [0.20.0](https://github.com/tutur3u/platform/compare/sdk-v0.19.0...sdk-v0.20.0) (2026-08-04)


### Features

* **chat:** add connected site sync bridge ([05c27f5](https://github.com/tutur3u/platform/commit/05c27f5ac4a545af366097ee2a919ec755970b9b))
* **chat:** add connected site sync bridge ([#5078](https://github.com/tutur3u/platform/issues/5078)) ([3de1a07](https://github.com/tutur3u/platform/commit/3de1a07dfa2fec96982aa0d116e003d0aa3fe47c))


### Bug Fixes

* **chat:** address external bridge review findings ([30533fc](https://github.com/tutur3u/platform/commit/30533fc64093fed4b25279bc0e45d43bdb7a6cde))
* **chat:** complete connected site hardening ([9175456](https://github.com/tutur3u/platform/commit/9175456f68bcdfad20216c7b03a59105fb55f0d5))
* **chat:** harden connected site sync ([70e8785](https://github.com/tutur3u/platform/commit/70e8785967e145a77330272e671ca58dfc38fbee))
* **chat:** harden external bridge boundaries ([2d25202](https://github.com/tutur3u/platform/commit/2d252023e5cfb1c7414ee2ed2d161e7f5de613f8))
* **chat:** harden external bridge synchronization ([63ccf91](https://github.com/tutur3u/platform/commit/63ccf9129ff8e7cf255bef8c74a3e096ab45cb7d))

## [0.19.0](https://github.com/tutur3u/platform/compare/sdk-v0.18.0...sdk-v0.19.0) (2026-07-27)


### Features

* **cms:** add relation bundles and managed assets ([fe5ef8a](https://github.com/tutur3u/platform/commit/fe5ef8a4facaacf12e119a6093535097a836303b))
* **cms:** add relation bundles and managed assets ([#4990](https://github.com/tutur3u/platform/issues/4990)) ([3148aa6](https://github.com/tutur3u/platform/commit/3148aa6292c5a706000e70fc9b05dda6b36502bc))
* **editor:** add localized external project editing ([38cae2c](https://github.com/tutur3u/platform/commit/38cae2c08d0586491c8695b671d46eaef509e693))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))

## [0.18.0](https://github.com/tutur3u/platform/compare/sdk-v0.17.0...sdk-v0.18.0) (2026-07-27)


### Features

* **cms:** add relation bundles and managed assets ([fe5ef8a](https://github.com/tutur3u/platform/commit/fe5ef8a4facaacf12e119a6093535097a836303b))
* **cms:** add relation bundles and managed assets ([#4990](https://github.com/tutur3u/platform/issues/4990)) ([3148aa6](https://github.com/tutur3u/platform/commit/3148aa6292c5a706000e70fc9b05dda6b36502bc))
* **editor:** add localized external project editing ([38cae2c](https://github.com/tutur3u/platform/commit/38cae2c08d0586491c8695b671d46eaef509e693))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))


### Bug Fixes

* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))

## [0.17.0](https://github.com/tutur3u/platform/compare/sdk-v0.16.0...sdk-v0.17.0) (2026-07-27)


### Features

* **editor:** add localized external project editing ([38cae2c](https://github.com/tutur3u/platform/commit/38cae2c08d0586491c8695b671d46eaef509e693))

## [0.16.0](https://github.com/tutur3u/platform/compare/sdk-v0.15.1...sdk-v0.16.0) (2026-07-25)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))

## [0.15.1](https://github.com/tutur3u/platform/compare/sdk-v0.15.0...sdk-v0.15.1) (2026-07-21)


### Bug Fixes

* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))

## [0.15.0](https://github.com/tutur3u/platform/compare/sdk-v0.14.0...sdk-v0.15.0) (2026-07-18)


### Features

* **cms:** add relation bundles and managed assets ([fe5ef8a](https://github.com/tutur3u/platform/commit/fe5ef8a4facaacf12e119a6093535097a836303b))
* **cms:** add relation bundles and managed assets ([#4990](https://github.com/tutur3u/platform/issues/4990)) ([3148aa6](https://github.com/tutur3u/platform/commit/3148aa6292c5a706000e70fc9b05dda6b36502bc))

## [0.14.0](https://github.com/tutur3u/platform/compare/sdk-v0.13.2...sdk-v0.14.0) (2026-07-11)


### Features

* **cli:** add task search ([b8ec86f](https://github.com/tutur3u/platform/commit/b8ec86ffd7bf401d32ac29f7c4db0ee60565b717))
* **sdk:** add external project operator commands ([729ab49](https://github.com/tutur3u/platform/commit/729ab4996b6e7e97efdecae72077986b8a6dcbce))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **cli:** preserve markdown tables in task descriptions ([9faf8ba](https://github.com/tutur3u/platform/commit/9faf8ba44b92565a9dfc2949c496654fc1fea9b3))
* **cli:** route finance and calendar APIs to app hosts ([aa5c932](https://github.com/tutur3u/platform/commit/aa5c932871bf6a08f8031884eeaf90ddddd3ba33))
* **external-apps:** allow signed asset uploads ([0d83b3b](https://github.com/tutur3u/platform/commit/0d83b3b50b235faf5894539a18c955ad0432e0b3))
* **tasks:** support personal external task moves ([83cee1f](https://github.com/tutur3u/platform/commit/83cee1ffaefe74c22e779268cdcdd8973280eaa0))
* **tasks:** support personal external terminal defaults ([50434cb](https://github.com/tutur3u/platform/commit/50434cb9849a65dd8c77f6b030b27a4bd76125e4))

## [0.13.2](https://github.com/tutur3u/platform/compare/sdk-v0.13.1...sdk-v0.13.2) (2026-07-11)


### Bug Fixes

* **tasks:** support personal external terminal defaults ([50434cb](https://github.com/tutur3u/platform/commit/50434cb9849a65dd8c77f6b030b27a4bd76125e4))

## [0.13.1](https://github.com/tutur3u/platform/compare/sdk-v0.13.0...sdk-v0.13.1) (2026-07-06)


### Bug Fixes

* **cli:** route finance and calendar APIs to app hosts ([aa5c932](https://github.com/tutur3u/platform/commit/aa5c932871bf6a08f8031884eeaf90ddddd3ba33))
* **tasks:** support personal external task moves ([83cee1f](https://github.com/tutur3u/platform/commit/83cee1ffaefe74c22e779268cdcdd8973280eaa0))

## [0.13.0](https://github.com/tutur3u/platform/compare/sdk-v0.12.1...sdk-v0.13.0) (2026-07-03)


### Features

* **sdk:** add external project operator commands ([729ab49](https://github.com/tutur3u/platform/commit/729ab4996b6e7e97efdecae72077986b8a6dcbce))

## [0.12.1](https://github.com/tutur3u/platform/compare/sdk-v0.12.0...sdk-v0.12.1) (2026-07-02)


### Bug Fixes

* **cli:** preserve markdown tables in task descriptions ([9faf8ba](https://github.com/tutur3u/platform/commit/9faf8ba44b92565a9dfc2949c496654fc1fea9b3))

## [0.12.0](https://github.com/tutur3u/platform/compare/sdk-v0.11.0...sdk-v0.12.0) (2026-06-29)


### Features

* **cli:** add task search ([b8ec86f](https://github.com/tutur3u/platform/commit/b8ec86ffd7bf401d32ac29f7c4db0ee60565b717))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **external-apps:** allow signed asset uploads ([0d83b3b](https://github.com/tutur3u/platform/commit/0d83b3b50b235faf5894539a18c955ad0432e0b3))

## [0.11.0](https://github.com/tutur3u/platform/compare/sdk-v0.10.1...sdk-v0.11.0) (2026-06-26)


### Features

* **cli:** support task description editing ([c72390b](https://github.com/tutur3u/platform/commit/c72390b909054af596ccbed8af6ded9f266dfdd4))
* **cms:** integrate exocorpse external project ([c07081b](https://github.com/tutur3u/platform/commit/c07081b0bd98379eac97c3258b483ad8e39c9b39))
* **epm:** batch external project entry mutations ([59dc436](https://github.com/tutur3u/platform/commit/59dc436c5b7485a5aaf9b82a445dc0bacd2cb1bc))

## [0.10.1](https://github.com/tutur3u/platform/compare/sdk-v0.10.0...sdk-v0.10.1) (2026-06-17)


### Bug Fixes

* **cli:** escape table control characters ([73b7c58](https://github.com/tutur3u/platform/commit/73b7c58b7d9c1168ba1ae7651131045726ce082e))
* **cli:** escape whoami metadata ([6227dd0](https://github.com/tutur3u/platform/commit/6227dd07b7399347d75a7760acfedfbae53cb214))

## [0.10.0](https://github.com/tutur3u/platform/compare/sdk-v0.9.0...sdk-v0.10.0) (2026-06-11)


### Features

* **cli:** add calendar commands ([b916c1a](https://github.com/tutur3u/platform/commit/b916c1a0eeecfae961292466de0e9b37b9512b69))
* **cli:** add finance wallet checkpoints ([4f77821](https://github.com/tutur3u/platform/commit/4f778210e753f6241a52528c64a9cb0756fb20dc))


### Bug Fixes

* **sdk:** respect timezone for finance dates ([ad5e725](https://github.com/tutur3u/platform/commit/ad5e72533f45dc2ebf3bab451bc3b98f3a68d8ef))

## [0.9.0](https://github.com/tutur3u/platform/compare/sdk-v0.8.0...sdk-v0.9.0) (2026-06-11)


### Features

* **finance:** add CLI tag CRUD ([bc60f8e](https://github.com/tutur3u/platform/commit/bc60f8eb1af2fe650a28ef44ec33466a4ce831de))

## [0.8.0](https://github.com/tutur3u/platform/compare/sdk-v0.7.0...sdk-v0.8.0) (2026-06-10)


### Features

* **devbox:** add runner service repair command ([c4ea7a1](https://github.com/tutur3u/platform/commit/c4ea7a13d5d9f3b07f98cb7de3c5612f599690fb))


### Bug Fixes

* **devbox:** export runner token in service wrapper ([c0f0cb9](https://github.com/tutur3u/platform/commit/c0f0cb9184eaacef1e37ab540d330d6f7b4f6c62))

## [0.7.0](https://github.com/tutur3u/platform/compare/sdk-v0.6.1...sdk-v0.7.0) (2026-06-10)


### Features

* **cli:** add host switching and finance transfers ([6c732c1](https://github.com/tutur3u/platform/commit/6c732c13fae9173e97cadb0b4534f37d42908a92))
* **devbox:** add infrastructure control panel ([5bfbbd0](https://github.com/tutur3u/platform/commit/5bfbbd025c8482d5ef8218d35599a9d223b5b214))
* **devbox:** add runner setup and tunnel workflows ([27c55d5](https://github.com/tutur3u/platform/commit/27c55d55899c89a7584ab7c3249c9d9a61b6a0b9))
* **devbox:** add runner shutdown and observability ([ebcae14](https://github.com/tutur3u/platform/commit/ebcae148dd4109e6a2f18f089de730dcd8d4f30e))


### Bug Fixes

* **ci:** auto-recover package release dependencies ([40b2539](https://github.com/tutur3u/platform/commit/40b25390c903194a3c85cc627c737a4acd0d6fa9))
* **devbox:** keep setup prompt tests deterministic in ci ([d65cbf4](https://github.com/tutur3u/platform/commit/d65cbf48fe3d99e617ba165f7f25d1e3085e2733))

## [0.6.1](https://github.com/tutur3u/platform/compare/sdk-v0.6.0...sdk-v0.6.1) (2026-06-09)


### Bug Fixes

* **ci:** recover releases and package tsgo builds ([d82b846](https://github.com/tutur3u/platform/commit/d82b846c6232d9fb72b7d2aa808020bc24292a19))

## [0.6.0](https://github.com/tutur3u/platform/compare/sdk-v0.5.0...sdk-v0.6.0) (2026-06-08)


### Features

* **devbox:** bootstrap platform checkout setup ([84dbff7](https://github.com/tutur3u/platform/commit/84dbff7bac9a4b2848fc6028348fbf429c7f0896))
* **devbox:** execute claimed runner jobs ([2d99e6c](https://github.com/tutur3u/platform/commit/2d99e6cb6b275f7ddf423a021cb1cfcb1d944235))


### Bug Fixes

* **ci:** stabilize package release workflows ([d6243c2](https://github.com/tutur3u/platform/commit/d6243c2d7ee7ae599d9f17fba4be9f9cc71a1722))
* **devbox:** accept CLI app-session auth ([2e1080e](https://github.com/tutur3u/platform/commit/2e1080e34285399f083a6b8c17a9ee73cb8ecd5f))

## [0.5.0](https://github.com/tutur3u/platform/compare/sdk-v0.4.9...sdk-v0.5.0) (2026-06-03)


### Features

* **devbox:** add remote devbox foundation ([88f81d2](https://github.com/tutur3u/platform/commit/88f81d2a369ba80a3ee601122ca10d9031b63b87))


### Bug Fixes

* **devbox:** honor forwarded CLI flags ([bf999fb](https://github.com/tutur3u/platform/commit/bf999fbedb7c2ca88cf6db12f72193a17b63c546))
* **sdk:** escape cli selector text ([a48e4c5](https://github.com/tutur3u/platform/commit/a48e4c540d9e5474ea40bcb80610285340154cbc))
* **sdk:** keep cli bearer tokens same-origin ([96b8757](https://github.com/tutur3u/platform/commit/96b8757097a75e8f2f0421008c38dc07d81393ea))
* **storage:** mediate external project asset uploads ([e653210](https://github.com/tutur3u/platform/commit/e6532109fc20d54f2df1c11cd2412af6ca1dc185))
