:robot: I have created a release *beep* *boop*
---


<details><summary>platform: 0.72.0</summary>

## [0.72.0](https://github.com/tutur3u/platform/compare/platform-v0.71.0...platform-v0.72.0) (2026-10-24)


### Features

* **agent-quota:** add local quota routing ([#6449](https://github.com/tutur3u/platform/issues/6449)) ([ec634b5](https://github.com/tutur3u/platform/commit/ec634b5054eae5ad0d43023bc7dd94729a3d31b7))
* **agent-quota:** add shared-pool admission and safe recovery hooks ([4c4c8aa](https://github.com/tutur3u/platform/commit/4c4c8aa360e688017e3ad377420a1d1d0e917d5e))
* **agent-quota:** add shared-pool admission and safe recovery hooks ([#6498](https://github.com/tutur3u/platform/issues/6498)) ([c29f74b](https://github.com/tutur3u/platform/commit/c29f74bfcb40256e623b3beee667265afd3c52c3))
* **agent-quota:** add turn-boundary watch and checkpoint gate ([64274eb](https://github.com/tutur3u/platform/commit/64274eba9843d7514bab698134441e5961f5a17b))
* **agent-quota:** enforce observed blocks before delegation ([f50b15b](https://github.com/tutur3u/platform/commit/f50b15b831834ac51fddb0bb420a9bb615cd5ff8))
* **agent-quota:** include Antigravity, freshness and active reservations ([#6482](https://github.com/tutur3u/platform/issues/6482)) ([1e83777](https://github.com/tutur3u/platform/commit/1e83777f6d1549daff673a67219bd533b5513ced))
* **agent-quota:** prefer healthy Claude for main roles ([95c4382](https://github.com/tutur3u/platform/commit/95c438264663ff5b34e29eca3762c5e07158b268))
* **agent-quota:** route fresh provider pools with active reservations ([a9dbe17](https://github.com/tutur3u/platform/commit/a9dbe175ea34ec546414a3c9e8dda6afefcea14c))
* **ci:** add the trusted CodeQL new-alert gate to main ([0d1daff](https://github.com/tutur3u/platform/commit/0d1dafffe61e91b6ee93a71b822faa71de1e47fe))
* **ci:** add the trusted CodeQL, dependency-audit and secret-scan gates to main ([#6516](https://github.com/tutur3u/platform/issues/6516)) ([a7f0e2d](https://github.com/tutur3u/platform/commit/a7f0e2dfbe56fd1e0e82e704bf4da0e4957700c6))
* **ci:** add the trusted dependency-audit and secret-scan differ to main ([e2015a7](https://github.com/tutur3u/platform/commit/e2015a71eda0295a0c9bf2e75de7255b444624d3))
* **ci:** propose a pending risk acceptance for node-forge GHSA-86w9-cpqp-85rv ([47857b0](https://github.com/tutur3u/platform/commit/47857b0375719408d15f4ed516e15fd7a968927a))
* **ci:** restore CodeQL and add a security review cadence ([#6456](https://github.com/tutur3u/platform/issues/6456)) ([10d839a](https://github.com/tutur3u/platform/commit/10d839adb6cfbb11ec7259b965dd4b0167d60719))
* **devbox:** separate runner trust pools and add an observable drain ([#6450](https://github.com/tutur3u/platform/issues/6450)) ([64401ab](https://github.com/tutur3u/platform/commit/64401abf6f74b9c008d020ed0428ec043d23fc6d))
* **devbox:** stop whole job process groups and support remote stop ([#6446](https://github.com/tutur3u/platform/issues/6446)) ([cd4dcd0](https://github.com/tutur3u/platform/commit/cd4dcd0f52fb4396a342b32af93516891b3bcb86))
* **mobile:** add core/ui design tokens, icons and components ([e924582](https://github.com/tutur3u/platform/commit/e9245822efa2e13eb33c53f35441dbf9a0904c88))
* **mobile:** add core/ui design tokens, icons and components ([#6577](https://github.com/tutur3u/platform/issues/6577)) ([43bf1b8](https://github.com/tutur3u/platform/commit/43bf1b8f218751034db1862ae881d5f0066f6fb7))
* **mobile:** add design foundation for consistent padding and responsive shell ([4c83120](https://github.com/tutur3u/platform/commit/4c83120b43e2c0a249fdf7a663ad4f5674c6125d))
* **mobile:** add design foundation for consistent padding and responsive shell ([#6530](https://github.com/tutur3u/platform/issues/6530)) ([aaac144](https://github.com/tutur3u/platform/commit/aaac1440f195868787303dd0caa0e29572b9dd6c))
* **mobile:** add unified sheet and dialog host with modal Back ([31e4712](https://github.com/tutur3u/platform/commit/31e4712077406d6aaef65b5743644ba6b3c90362))
* **mobile:** add unified sheet and dialog host with modal Back ([#6578](https://github.com/tutur3u/platform/issues/6578)) ([c3b280b](https://github.com/tutur3u/platform/commit/c3b280bf21fc4d78e53d05afa5c080235100dea8))
* **mobile:** centralize app settings under Settings &gt; Apps ([83fbfab](https://github.com/tutur3u/platform/commit/83fbfab65b45746be4bcb159931539a6d4ce74a4))
* **mobile:** centralize app settings under Settings &gt; Apps ([#6546](https://github.com/tutur3u/platform/issues/6546)) ([8f59398](https://github.com/tutur3u/platform/commit/8f593986ca7ba85ae7621a7788e33cbc3ead429e))
* **mobile:** consolidate profile and account settings in Edit profile ([29ac9cd](https://github.com/tutur3u/platform/commit/29ac9cdc3b2e194abf65eb558e9e2694d8973153))
* **mobile:** consolidate profile settings in Edit profile ([#6548](https://github.com/tutur3u/platform/issues/6548)) ([b50d7d7](https://github.com/tutur3u/platform/commit/b50d7d7e63cfefe8a1210ac48af07d9ab0e064df))
* **mobile:** generate web-parity Lucide and Lucide Lab icon fonts ([d11306c](https://github.com/tutur3u/platform/commit/d11306cfa506e137e1014ff3f811f3fd1adc7c52))
* **mobile:** generate web-parity Lucide and Lucide Lab icon fonts ([#6593](https://github.com/tutur3u/platform/issues/6593)) ([4b00846](https://github.com/tutur3u/platform/commit/4b0084665af9def60263c1a9f420a695cc4bdfde))
* **mobile:** migrate apps, assistant, auth and account screens to page primitives ([bd4b7f8](https://github.com/tutur3u/platform/commit/bd4b7f86ca031faccc50d43c6276b23bb25594eb))
* **mobile:** migrate apps, assistant, auth and account screens to page primitives ([#6539](https://github.com/tutur3u/platform/issues/6539)) ([1477217](https://github.com/tutur3u/platform/commit/1477217c9d2bb8a62020be7f984815f71a488b63))
* **mobile:** migrate drive, mail, meet, chat, notes and calendar screens to page primitives ([b950947](https://github.com/tutur3u/platform/commit/b95094764fbb230d30c7637320630b545e170b72))
* **mobile:** migrate drive, mail, meet, chat, notes and calendar screens to page primitives ([#6538](https://github.com/tutur3u/platform/issues/6538)) ([a80f5c8](https://github.com/tutur3u/platform/commit/a80f5c8e8b18b84e6bbc4f3fcac4ce6a8aab0a01))
* **mobile:** migrate education, CMS and CRM screens to page primitives ([15af7b3](https://github.com/tutur3u/platform/commit/15af7b30c4210780ec9e5df8f54b31f76b8e0486))
* **mobile:** migrate education, CMS and CRM screens to page primitives ([#6537](https://github.com/tutur3u/platform/issues/6537)) ([7e7fb10](https://github.com/tutur3u/platform/commit/7e7fb10681715e5579490d4f0cfc0d35292977c3))
* **mobile:** migrate finance, inventory and storefront screens to page primitives ([c3db770](https://github.com/tutur3u/platform/commit/c3db770a3e6f1fc3e51bcfc61cb29c820b5d5053))
* **mobile:** migrate finance, inventory and storefront screens to page primitives ([#6536](https://github.com/tutur3u/platform/issues/6536)) ([ef5292c](https://github.com/tutur3u/platform/commit/ef5292c7782ff13d127d5ad33433e2c316b9c387))
* **mobile:** migrate task and time tracker screens to page primitives ([bb1ccd0](https://github.com/tutur3u/platform/commit/bb1ccd0292533563f7e9273847b10c9adbc7a41d))
* **mobile:** migrate task and time tracker screens to page primitives ([#6535](https://github.com/tutur3u/platform/issues/6535)) ([2385749](https://github.com/tutur3u/platform/commit/23857493d285212092a247b37eabc35a0017d708))
* **mobile:** open the approval threshold editor from the Requests gear ([c5ed9d7](https://github.com/tutur3u/platform/commit/c5ed9d75426e6ba254cb77ddf1ee15f2877bb346))
* **mobile:** polish Edit profile rows and document the review follow-ups ([4c42b91](https://github.com/tutur3u/platform/commit/4c42b91f8883aafd85ed8afcda3179e0bf49092a))
* **mobile:** rebuild timezone pickers on the sheet host ([3c968dd](https://github.com/tutur3u/platform/commit/3c968ddaa600c7c0c66ad22459ee27ad2684015e))
* **mobile:** rebuild timezone pickers on the sheet host ([#6579](https://github.com/tutur3u/platform/issues/6579)) ([07dcbc3](https://github.com/tutur3u/platform/commit/07dcbc3df20df1833330fc6f2d1bdecc72dc17d8))
* **mobile:** redesign settings and add customizable appearance themes ([8c603fc](https://github.com/tutur3u/platform/commit/8c603fc93cff648f175eca9c94e5627150db4d23))
* **mobile:** redesign settings and add customizable appearance themes ([#6534](https://github.com/tutur3u/platform/issues/6534)) ([613b517](https://github.com/tutur3u/platform/commit/613b5176a08e8270788f6d58b55d29aecfe5fc22))
* **mobile:** route Timer gear actions to central Timer settings ([1d5ab36](https://github.com/tutur3u/platform/commit/1d5ab36eab6f242ddb082d29c194cad390749297))
* **mobile:** route Timer gear actions to central Timer settings ([#6547](https://github.com/tutur3u/platform/issues/6547)) ([0ffa154](https://github.com/tutur3u/platform/commit/0ffa1543443b3b3cf54c7cfbf6dbd4ac9c210e27))
* **sdk:** add cross-project worker-token budgets to ttr resources ([9e7129d](https://github.com/tutur3u/platform/commit/9e7129d1d965a4f91227958a7d0f3f9c43edb1f2))
* **sdk:** add cross-project worker-token budgets to ttr resources ([#6558](https://github.com/tutur3u/platform/issues/6558)) ([bb0b74f](https://github.com/tutur3u/platform/commit/bb0b74f78a9f5d74b5b3f67562378c0e17aeab64))
* **sdk:** add guarded global supplier rollout ([9256482](https://github.com/tutur3u/platform/commit/9256482a957f79e3e2938b0bd2cda10795e49a42))
* **sdk:** add trusted dev package channel ([f31cd78](https://github.com/tutur3u/platform/commit/f31cd78319289dea17eb99e01c4445b3e27df41b))
* **sdk:** add trusted dev packages and channel identity ([#6590](https://github.com/tutur3u/platform/issues/6590)) ([62d7dfc](https://github.com/tutur3u/platform/commit/62d7dfc7778d37691b55755c70f4c1d2a6d903b6))
* **sdk:** add weighted multi-host admission to ttr resources ([#6503](https://github.com/tutur3u/platform/issues/6503)) ([80e46a8](https://github.com/tutur3u/platform/commit/80e46a84c06f251df4488d0272ff8f08bf5d473c))
* **sdk:** automate guarded global supplier rollout and recovery ([#6591](https://github.com/tutur3u/platform/issues/6591)) ([fb1bd34](https://github.com/tutur3u/platform/commit/fb1bd34ab7c9cce1057fb850494b66de9eb00643))
* **sdk:** honour an operator host preference order in --hosts admission ([#6513](https://github.com/tutur3u/platform/issues/6513)) ([2ea0e1c](https://github.com/tutur3u/platform/commit/2ea0e1cbef093a57c943e8b1f95a115eca6e7d3d))
* **sdk:** offload saturated resource runs to trusted devbox runners ([#6454](https://github.com/tutur3u/platform/issues/6454)) ([59bce45](https://github.com/tutur3u/platform/commit/59bce451809baf5f62185d172833a99fb5ad0a7c))
* **sdk:** run an exact pushed commit on trusted devbox runners ([#6452](https://github.com/tutur3u/platform/issues/6452)) ([bd19b4e](https://github.com/tutur3u/platform/commit/bd19b4ed8b59c4648ad1300edc9444e5d1443306))
* **sdk:** separate devbox trust tiers on the runner ([#6451](https://github.com/tutur3u/platform/issues/6451)) ([c8b7297](https://github.com/tutur3u/platform/commit/c8b72976f4fb301476fbb825aea109a17f448523))
* **security:** add staged native integrity verification ([b9155e4](https://github.com/tutur3u/platform/commit/b9155e45bba5486b9943a4dc3e9cb9b2aedb8b14))
* **security:** add staged native integrity verification ([#6575](https://github.com/tutur3u/platform/issues/6575)) ([332368d](https://github.com/tutur3u/platform/commit/332368dd35586096f314355eb6bc8f7904ed0868))


### Bug Fixes

* **agent-quota:** align usage parity and execution evidence ([91faf7f](https://github.com/tutur3u/platform/commit/91faf7f39f487924c453c12bac25c03ce1109b42))
* **agent-quota:** align usage parity and execution evidence ([#6559](https://github.com/tutur3u/platform/issues/6559)) ([3855326](https://github.com/tutur3u/platform/commit/3855326c61dc118424a12b4c4c3d45258258928b))
* **agent-quota:** block stale exhausted pools in admission ([b11d75e](https://github.com/tutur3u/platform/commit/b11d75e75586fdf29a28f850d639406761282e7e))
* **agent-quota:** bound admission transactions and expire resets ([2a749e9](https://github.com/tutur3u/platform/commit/2a749e9510be471d6217077b8c344925c02378f1))
* **agent-quota:** bound concurrent admissions and stale observations ([cc683fd](https://github.com/tutur3u/platform/commit/cc683fd41fc4cf9f944dcb106865a0c74eabcaf9))
* **agent-quota:** bound future and concurrent admissions ([7d7a526](https://github.com/tutur3u/platform/commit/7d7a526af8f83876c2fdb005d3f543c537bf623f))
* **agent-quota:** close concurrent admission review findings ([572e11f](https://github.com/tutur3u/platform/commit/572e11f3cfc3afeb452a3c48ddf8862b2a55d82d))
* **agent-quota:** close quota parity fail-open gaps ([d1fa232](https://github.com/tutur3u/platform/commit/d1fa23263a7d56748bc49b4e00227904dcb7911d))
* **agent-quota:** close r6 quota routing findings ([a872b24](https://github.com/tutur3u/platform/commit/a872b244538d8ea044bac7743aa32f342db94c2a))
* **agent-quota:** close watch and checkpoint review gaps ([c2f8a0d](https://github.com/tutur3u/platform/commit/c2f8a0d643ec58804945e44da3c20f1be668cd4a))
* **agent-quota:** decouple quarantine retention ([b4bb020](https://github.com/tutur3u/platform/commit/b4bb0202c0f7b4ba6117021cbe40415f7c2fe39c))
* **agent-quota:** expose model options in lower catalog ([ad95ab8](https://github.com/tutur3u/platform/commit/ad95ab8f10759b849b991820ac629c285e6a2e74))
* **agent-quota:** fail closed when T3 activity is unknown ([2a8dbc4](https://github.com/tutur3u/platform/commit/2a8dbc42edc5abe78b21f6db0d3f0ac57860a52c))
* **agent-quota:** harden state and usage ordering ([#6562](https://github.com/tutur3u/platform/issues/6562)) ([b096e15](https://github.com/tutur3u/platform/commit/b096e15070212e0a47aedde05961def76cac028a))
* **agent-quota:** honor scoped usage and completed limit receipts ([c857df7](https://github.com/tutur3u/platform/commit/c857df7adc39f83430c4202de4346aa53919751e))
* **agent-quota:** preserve Codex quota sample freshness ([08ecc52](https://github.com/tutur3u/platform/commit/08ecc527bf44100faeb28cd17d54550d4c749ba7))
* **agent-quota:** preserve safe state and usage ordering ([ad4306e](https://github.com/tutur3u/platform/commit/ad4306e6c89985b49d632300f339758383faf54d))
* **agent-quota:** preserve scoped future quarantines ([061e671](https://github.com/tutur3u/platform/commit/061e67131491a663aeb7e0a99b67f329c8d419ce))
* **agent-quota:** preserve scoped future quarantines ([#6525](https://github.com/tutur3u/platform/issues/6525)) ([a93da99](https://github.com/tutur3u/platform/commit/a93da9986a60a2f843a1df18aa79d9d4103f8a41))
* **agent-quota:** quarantine future receipts per pool ([d65b960](https://github.com/tutur3u/platform/commit/d65b96048dc78d7ccdc025a8897eb15f65cae3c2))
* **agent-quota:** reconcile shared usage and scoped receipts ([7fe096f](https://github.com/tutur3u/platform/commit/7fe096fcea1f5d3e4ff41e90a071bf4043c4dcdf))
* **agent-quota:** reject mismatched usage snapshots ([092a88e](https://github.com/tutur3u/platform/commit/092a88ebb5bfd485670a89cee60a224dfcceb0f1))
* **agent-quota:** reject undated Claude limit events ([126af89](https://github.com/tutur3u/platform/commit/126af898c3d1f45bef9090a42f90b4e81f170478))
* **agent-quota:** retain expired imported reset windows ([440d197](https://github.com/tutur3u/platform/commit/440d1971ab26b05e0abadef42a9edc1be6ddb30b))
* **agent-quota:** retain expired imported reset windows ([#6606](https://github.com/tutur3u/platform/issues/6606)) ([4546627](https://github.com/tutur3u/platform/commit/454662732ff7d7794db358736ba501f3d506d5a9))
* **agent-quota:** scan only terminal provider receipts ([f859de1](https://github.com/tutur3u/platform/commit/f859de1be6e30c928a2c460354b2516baa013e98))
* **agent-quota:** scope capacity cooldowns to selected models ([dc2ed3f](https://github.com/tutur3u/platform/commit/dc2ed3f4eadd27c5e6622f49be1d19d03a7d172f))
* **agent-quota:** skip invalid manual observations ([a9fce4f](https://github.com/tutur3u/platform/commit/a9fce4f9a5bfc63305c53f86087da6575896ac10))
* **agent-quota:** validate bounded future quarantines ([1681459](https://github.com/tutur3u/platform/commit/1681459e04e38784095079d0db7d2084d34423ee))
* **ai:** keep playground key handoff out of web storage ([04662e2](https://github.com/tutur3u/platform/commit/04662e2a9fc01864cf3a679f87d7dc0146926f93))
* **auth:** add per-account MFA verification limits ([95205fe](https://github.com/tutur3u/platform/commit/95205fe35733b55c9eb1d6cf03f47ec3ba2318f0))
* **auth:** add per-account MFA verification limits ([#6555](https://github.com/tutur3u/platform/issues/6555)) ([b4d67f0](https://github.com/tutur3u/platform/commit/b4d67f008ac7f9a2e103d4f35d039175acc0bf5b))
* **auth:** grant MFA hook caller schema usage ([c324497](https://github.com/tutur3u/platform/commit/c324497909ada7e3be34147da61ef02ebde95548))
* **auth:** repair account switching and notification access ([ab4b75e](https://github.com/tutur3u/platform/commit/ab4b75ee65bc942e3d113243d8c9a48a8af4b0aa))
* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **auth:** reserve MFA attempts atomically and restrict the hook ([0c945d5](https://github.com/tutur3u/platform/commit/0c945d5c528c64d3842033bb8bc6eaa262f44bb6))
* **calendar:** bind provider OAuth state to user and workspace ([f171b5d](https://github.com/tutur3u/platform/commit/f171b5d94dbd1775db7ca770e221e9f5c2e41f95))
* **calendar:** bind provider OAuth state to user and workspace ([#6520](https://github.com/tutur3u/platform/issues/6520)) ([f1685c6](https://github.com/tutur3u/platform/commit/f1685c68630ca83a94125cdc5aceb0874565f80f))
* **calendar:** DB-backed single-use OAuth state and BASE_URL redirects ([4f203fe](https://github.com/tutur3u/platform/commit/4f203fe6586cbe450c0dac1d1b17059c4fde1d80))
* **calendar:** fail closed on missing OAuth runtime config in production ([c17943a](https://github.com/tutur3u/platform/commit/c17943a310d3ee7e406c0658e48facb165581ce7))
* **calendar:** preserve native quota diagnostics and reuse verified actors ([88c464c](https://github.com/tutur3u/platform/commit/88c464c75ca1a51014e360ee92aabea0b16d919c))
* **calendar:** serve native timezone preferences from Web ([ec94bc2](https://github.com/tutur3u/platform/commit/ec94bc262c9ef7e89339309de1d23ff4045224db))
* **calendar:** serve native timezone preferences from Web ([#6573](https://github.com/tutur3u/platform/issues/6573)) ([a1bcec6](https://github.com/tutur3u/platform/commit/a1bcec69510d4efaaee91737a563c00ffc253dd4))
* **calendar:** single-use OAuth state, Google PKCE, canonical redirects ([ea618ba](https://github.com/tutur3u/platform/commit/ea618ba9bff4674045c94ba3aebe23b983090368))
* **ci:** admit security config filename classification references ([d0e7f79](https://github.com/tutur3u/platform/commit/d0e7f7901f98bfed3612495606b50bc1e832e27d))
* **ci:** align tsrs shadow with the merged Bun 1.4.4 pin ([45dfac1](https://github.com/tutur3u/platform/commit/45dfac1864d9fa2abf60baa67abd7a0f1a5fe7e8))
* **ci:** apply reviewed risk acceptances within their 90-day window ([d94e49e](https://github.com/tutur3u/platform/commit/d94e49e75070eaca59bd3d337a1e18aaeced3ea6))
* **ci:** bound E2E cache seeding and expose config errors ([2fb0ca6](https://github.com/tutur3u/platform/commit/2fb0ca601d72a7ccdfd67e00dca542af49f7b4f1))
* **ci:** bound E2E cache seeding and expose config errors ([#6570](https://github.com/tutur3u/platform/issues/6570)) ([a3106fa](https://github.com/tutur3u/platform/commit/a3106facbfa6a9a1a25d70bbef2deedf92a58a6f))
* **ci:** classify *-auth modules and devbox libraries for security review ([0fe37f4](https://github.com/tutur3u/platform/commit/0fe37f486a88d47de3ebec3418dd0045065e194d))
* **ci:** complete cache budget safeguards ([15481fd](https://github.com/tutur3u/platform/commit/15481fdc0b5cc91458be0720512d47a514d63834))
* **ci:** complete cache budget safeguards ([#6567](https://github.com/tutur3u/platform/issues/6567)) ([bd7367f](https://github.com/tutur3u/platform/commit/bd7367f658e80791a4a5e3a51925dbb48b66c147))
* **ci:** drop the node-forge risk acceptance in favour of removal ([0114f61](https://github.com/tutur3u/platform/commit/0114f6117e6e999b39b5f8806c48aeed4913d777))
* **ci:** exempt PR screenshot images from security review ([74d8e81](https://github.com/tutur3u/platform/commit/74d8e81047dcabb36f0277cf9dbb235a2173a88d))
* **ci:** exempt PR screenshot images from security review ([#6604](https://github.com/tutur3u/platform/issues/6604)) ([dedb0c2](https://github.com/tutur3u/platform/commit/dedb0c257d6ba9d22e7381ef4ebc0f9ac032139e))
* **ci:** fail the bun.lock guard on a missing file or git error ([326c22d](https://github.com/tutur3u/platform/commit/326c22db730f4f8a32d521efe3c2af10148906c0))
* **ci:** fail the CodeQL gate when the analysis produced no SARIF ([4349f67](https://github.com/tutur3u/platform/commit/4349f67a7a7bc98702ab24bc833961c55bc1c408))
* **ci:** fail the CodeQL gate when the analysis produced no SARIF ([b5d77a6](https://github.com/tutur3u/platform/commit/b5d77a632305b3e146d50692267515d85581704b))
* **ci:** fail the dependency audit diff without a valid head report ([6a663e2](https://github.com/tutur3u/platform/commit/6a663e21029ae49e0643c4eb8a2c778bce67eefe))
* **ci:** fail Type Check when bun.lock is not canonical ([c477a0d](https://github.com/tutur3u/platform/commit/c477a0df742053e95e84438a2a34f4d2c9dd5eec))
* **ci:** fail Type Check when bun.lock is not canonical ([#6542](https://github.com/tutur3u/platform/issues/6542)) ([fd45bbf](https://github.com/tutur3u/platform/commit/fd45bbf4eccc3731649c037d5d14568f79192ac3))
* **ci:** guard heavyweight cache writes ([36901a4](https://github.com/tutur3u/platform/commit/36901a4f7c9c8c5159579f89e016c1e5e1e15dfd))
* **ci:** guard heavyweight cache writes ([#6565](https://github.com/tutur3u/platform/issues/6565)) ([70926a6](https://github.com/tutur3u/platform/commit/70926a60bdeb54d9082f27c1751cac96e5c25023))
* **ci:** include qualification file dependencies ([27c237a](https://github.com/tutur3u/platform/commit/27c237a4eadabe3900da5d2988af1db16e507e45))
* **ci:** install WebKitGTK 4.1 for Linux Flutter builds ([4712f44](https://github.com/tutur3u/platform/commit/4712f445583ef2f75cc1a6e7ceac10ca8fd37e36))
* **ci:** install WebKitGTK 4.1 for Linux Flutter builds ([#6603](https://github.com/tutur3u/platform/issues/6603)) ([e23c307](https://github.com/tutur3u/platform/commit/e23c30730414a04402dff1f29f520105ee03b169))
* **ci:** keep CodeQL findings out of public logs and artifacts ([0c6403c](https://github.com/tutur3u/platform/commit/0c6403ca6b345dc3c932182db30896fb6b31159f))
* **ci:** let a renewed risk acceptance apply after a lapsed entry ([abfeae8](https://github.com/tutur3u/platform/commit/abfeae8186e7a59548621ce69fe6faac7b9a1ed9))
* **ci:** log dependency-audit counts only, mirroring [#6516](https://github.com/tutur3u/platform/issues/6516)'s differ ([2cd1c81](https://github.com/tutur3u/platform/commit/2cd1c812a46fb7994700dfd578550b01b2335729))
* **ci:** never let a dispatch input select code in a privileged cache scope ([ff48a7a](https://github.com/tutur3u/platform/commit/ff48a7ac6ad378821e6c94f7d7bd841259f155e6))
* **ci:** never read a failed dependency audit as clean ([30e6158](https://github.com/tutur3u/platform/commit/30e615868d1300070ebbab65317fd92ec715353d))
* **ci:** page main's CodeQL analyses for the new-alert baseline ([abe1c74](https://github.com/tutur3u/platform/commit/abe1c74da155a01bb735805d82bc7c819bb80ecd))
* **ci:** pair the Bun audit version with its release checksum ([16e53f6](https://github.com/tutur3u/platform/commit/16e53f663c674a2873185653eeb83e4e77bc1ef1))
* **ci:** qualify GHCR fallback for all Supabase seed images ([29644c4](https://github.com/tutur3u/platform/commit/29644c41e7751c6e178add84f68465b6225cb2d3))
* **ci:** qualify GHCR fallback for all Supabase seed images ([#6572](https://github.com/tutur3u/platform/issues/6572)) ([f173576](https://github.com/tutur3u/platform/commit/f173576563bdcc258ee4e785367a79255d1eb7ec))
* **ci:** record staging markers for SHAs a descendant already migrated ([459bee1](https://github.com/tutur3u/platform/commit/459bee107401d59ec648843d5e01c54c247cac4f))
* **ci:** record staging markers for SHAs a descendant already migrated ([#6518](https://github.com/tutur3u/platform/issues/6518)) ([3255e2d](https://github.com/tutur3u/platform/commit/3255e2d9baa9f5e67c80b5022a0445ae02b42463))
* **ci:** recover trusted Supabase image seeds ([#6514](https://github.com/tutur3u/platform/issues/6514)) ([675d244](https://github.com/tutur3u/platform/commit/675d2446fc48e094daf2d5675520124c815fd78d))
* **ci:** require a tracked bun.lock in the canonical-lockfile guard ([6aa8345](https://github.com/tutur3u/platform/commit/6aa83457250ec43b81b6350c5f3d76235b9fd125))
* **ci:** retain heavyweight Flutter caches on main ([#6515](https://github.com/tutur3u/platform/issues/6515)) ([b7b3176](https://github.com/tutur3u/platform/commit/b7b3176236ab387518f39cc4733f10c8d32d3924))
* **ci:** retain SDK drain errors and scope final-kill EPERM ([#6566](https://github.com/tutur3u/platform/issues/6566)) ([cbd5d75](https://github.com/tutur3u/platform/commit/cbd5d7535a5f3b3187c8a0e9aa2d422661d34da6))
* **ci:** retain SDK drain errors and scope the final kill race ([048f9aa](https://github.com/tutur3u/platform/commit/048f9aa3882316f1a9e83831d8356a6d4babd7b6))
* **ci:** rotate the sweep partition start by UTC day ([0154146](https://github.com/tutur3u/platform/commit/015414683460380c610023fae59cd67af076baae))
* **ci:** show each blocking CodeQL result and keep the SARIF for triage ([62b960f](https://github.com/tutur3u/platform/commit/62b960f2b38f3a19c77936d978df956275058395))
* **ci:** stabilize runtime cache and preserve E2E fallback ([0a15365](https://github.com/tutur3u/platform/commit/0a153650d27cdfe81fff71f4d29078bf011cf7c7))
* **ci:** tighten SDK artifact verification ([#6533](https://github.com/tutur3u/platform/issues/6533)) ([8ed8f75](https://github.com/tutur3u/platform/commit/8ed8f7562715c4c31d7658088b9406878a63d8ce))
* **ci:** tighten workflow_run follow-ups for staging and Discord ([#6459](https://github.com/tutur3u/platform/issues/6459)) ([54d41fa](https://github.com/tutur3u/platform/commit/54d41fa18797d4802c85f33036688adade3a7a62))
* **ci:** trust migration prerequisite tooling and identify CodeQL findings ([e8f76e0](https://github.com/tutur3u/platform/commit/e8f76e0e952bbb7b930a627ff7d325f5991238dd))
* **ci:** verify SDK publish artifact descriptors ([9794d63](https://github.com/tutur3u/platform/commit/9794d63d5d9db8b816dd5dd6b1f0e3b93a0f25a0))
* **ci:** wait through transient SDK group probe errors ([fe29a20](https://github.com/tutur3u/platform/commit/fe29a20ad9b820fec1ffd0431398d3786046fea5))
* **ci:** wait through transient SDK process group probe errors ([#6564](https://github.com/tutur3u/platform/issues/6564)) ([3b9d9b9](https://github.com/tutur3u/platform/commit/3b9d9b9b6e7e2ca42539cde02ced6fd723a07113))
* **database:** date calendar OAuth nonce migration in the past ([16e8f57](https://github.com/tutur3u/platform/commit/16e8f57a6c9ddce6a795c1315fe4e117400461f9))
* **database:** enforce trusted definer search paths across exposed schemas ([04efff7](https://github.com/tutur3u/platform/commit/04efff7fc30354221dfbcad3c5d78707fa3c8669))
* **database:** harden remaining legacy chat read policies ([497d419](https://github.com/tutur3u/platform/commit/497d419ac2ca9b11c022cc09d1ab2eea8c4e9243))
* **database:** narrow notification cleanup and extend access tests ([9b223b5](https://github.com/tutur3u/platform/commit/9b223b5e739e6e92c95f565219cc819f57e050db))
* **database:** preserve atomic lifecycle metadata replacement ([94b5e42](https://github.com/tutur3u/platform/commit/94b5e42ac796ee8cc758a788223d0f7ce012d467))
* **database:** preserve server task access and exercise storage catalog ([e206f1d](https://github.com/tutur3u/platform/commit/e206f1db9c945547deb1d939d4e4d100eac5b5fc))
* **database:** repair hardened file operation tests ([a457fda](https://github.com/tutur3u/platform/commit/a457fdaf63137b39a9a5d5fc29af0dd29bf61ed0))
* **database:** restrict internal definer functions and add caller checks ([cda8a16](https://github.com/tutur3u/platform/commit/cda8a16687bf0a95e00fabedb7a3fabd5a7ecfda))
* **database:** restrict internal definer functions and add caller checks ([#6557](https://github.com/tutur3u/platform/issues/6557)) ([0c665ae](https://github.com/tutur3u/platform/commit/0c665ae14a97455872e0fa05b3a8c31f229e789c))
* **database:** scope email helper to the current caller ([cf7f104](https://github.com/tutur3u/platform/commit/cf7f10431776bb03389439c4698c87cb6269b586))
* **database:** scope email helper to the current caller ([#6550](https://github.com/tutur3u/platform/issues/6550)) ([f261aa0](https://github.com/tutur3u/platform/commit/f261aa03faa17c834a649f6d2cccb5dc9f84bdd8))
* **database:** scope list-less tasks to their creator ([bfb22e1](https://github.com/tutur3u/platform/commit/bfb22e1e37979f51261dfd84819ebb6ad65eea60))
* **database:** tighten notification email access ([4b4e13b](https://github.com/tutur3u/platform/commit/4b4e13bb352c1b370bfcda02836be563b7cf05a5))
* **database:** tighten notification email access ([#6552](https://github.com/tutur3u/platform/issues/6552)) ([d9161cc](https://github.com/tutur3u/platform/commit/d9161ccb52569144418f18a7afc11a19ef6eb4c7))
* **database:** verify final definer callers and server chat boundary ([7a6dcf6](https://github.com/tutur3u/platform/commit/7a6dcf6f8212c9357e2f5b00ce0c4cbf187c81ce))
* **deps:** patch high-severity advisories ([f263ae6](https://github.com/tutur3u/platform/commit/f263ae6e96baa799d43aaa7e3f4cbb2e9010b4ce))
* **deps:** patch high-severity advisories ([#6569](https://github.com/tutur3u/platform/issues/6569)) ([a67ca56](https://github.com/tutur3u/platform/commit/a67ca56759b100a61a0bec792b40c049a2c44681))
* **deps:** patch Teams transitive MSAL security vulnerability ([9727bd0](https://github.com/tutur3u/platform/commit/9727bd07e498eaa92b1c658729e421758ad1e4c3))
* **deps:** patch Teams transitive MSAL security vulnerability ([#6582](https://github.com/tutur3u/platform/issues/6582)) ([bb2b181](https://github.com/tutur3u/platform/commit/bb2b1818e23ed2474914ae73fee8c85bf5db1532))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **devbox-control:** require a string heartbeat execution mode ([#6462](https://github.com/tutur3u/platform/issues/6462)) ([2450643](https://github.com/tutur3u/platform/commit/24506431a478a15525bdfce16870457c9965eb09))
* **devbox:** cancel lost offload creates by key and page logs by run cursor ([aace86b](https://github.com/tutur3u/platform/commit/aace86bdbdef0f44ae31562c61dd2174463a384c))
* **devbox:** fence keyed creates and enforce the commit-run protocol server-side ([d0dd8c6](https://github.com/tutur3u/platform/commit/d0dd8c6b34e0270e46e595c60bd230dcb1644693))
* **devbox:** offload only to runners advertising the commit-run protocol ([72561cc](https://github.com/tutur3u/platform/commit/72561cce0da3c59c6ea52f994ac1815ff555c827))
* **devbox:** rate limit keyed creates and stop-by-key per actor ([ed1882d](https://github.com/tutur3u/platform/commit/ed1882da1bc329cb5ab4fe5d6e69547a766f8ea4))
* **devbox:** roll out the run log cursor without a long table lock ([6b6b09e](https://github.com/tutur3u/platform/commit/6b6b09e2bda26e6ea5596b4a62877a82b66df3cc))
* **discord:** harden signed URL paths and cancellation cleanup ([905c01c](https://github.com/tutur3u/platform/commit/905c01c759d533d501b2eb312a87fff17e144862))
* **discord:** log reported errors through a module logger ([e603873](https://github.com/tutur3u/platform/commit/e6038735f8c1a380c4be6dd2d4a265634e8cc95b))
* **discord:** pass handled exceptions only as the error= keyword ([e53147b](https://github.com/tutur3u/platform/commit/e53147b27fb7fe1f0836925384171ceec4623b7e))
* **discord:** replace exception text in replies and logs with correlation IDs ([56e9489](https://github.com/tutur3u/platform/commit/56e9489cbbc4d3d557b5968921727f4bf850f942))
* **discord:** restrict markitdown signed URL fetches to configured storage origin ([37845a7](https://github.com/tutur3u/platform/commit/37845a7ec4ac79f097d16577bc695fdfdf474f2e))
* **discord:** restrict markitdown signed URL fetches to the configured storage host ([#6517](https://github.com/tutur3u/platform/issues/6517)) ([dfa56e8](https://github.com/tutur3u/platform/commit/dfa56e80d1156bcad846dbfa218947351dbf2a40))
* **discord:** ship error_reporting in the Modal image and harden the exposure guard ([73f6cc0](https://github.com/tutur3u/platform/commit/73f6cc08d7b11ed7bc5a62ae5d5c0d7ce419cee7))
* **discord:** stop echoing internal exception text in interaction replies ([623b1ac](https://github.com/tutur3u/platform/commit/623b1ac73e46a1886a00a7e8162c5312d1c0074d))
* **discord:** stop echoing internal exception text in interaction replies ([#6532](https://github.com/tutur3u/platform/issues/6532)) ([5d57151](https://github.com/tutur3u/platform/commit/5d57151e20878dc5a34365317cf413b6baeddae6))
* **meet:** clarify join states and repair theme initialization ([#6506](https://github.com/tutur3u/platform/issues/6506)) ([f641b5b](https://github.com/tutur3u/platform/commit/f641b5b7def874eeeb4f8562429bd2584aa7eb07))
* **mobile:** address settings appearance review findings ([032cedd](https://github.com/tutur3u/platform/commit/032cedddcd74fe0f7c6d3d17023a888f9738b104))
* **mobile:** address settings appearance review r2 ([fe4883e](https://github.com/tutur3u/platform/commit/fe4883e775d74ac2ea79786f3323f1198c352c0d))
* **mobile:** address settings appearance review r3 ([c8c74e3](https://github.com/tutur3u/platform/commit/c8c74e3b9b2d684379f8558e1734e940429bf2de))
* **mobile:** align Assistant chat UX with web and shell ([#6424](https://github.com/tutur3u/platform/issues/6424)) ([158188b](https://github.com/tutur3u/platform/commit/158188ba2ad94c6a45d4bd9483388c4fd3cff886))
* **mobile:** apply Dart's leading-newline rule to directive URIs ([5585d39](https://github.com/tutur3u/platform/commit/5585d398036e50ddc019a1b36772e214f8398f7a))
* **mobile:** avoid repeating the offset on fixed-offset timezone rows ([04f0acc](https://github.com/tutur3u/platform/commit/04f0accc1a5d888a3b3e858b169d9b88abf7ea1c))
* **mobile:** choose chat panes from the body width ([ca4a13d](https://github.com/tutur3u/platform/commit/ca4a13d97bb79701e34b9f3ce5b930685d907fa5))
* **mobile:** close shadcn ratchet bypasses and enforce shrink-only ([29b1a7d](https://github.com/tutur3u/platform/commit/29b1a7d4f2157f0eca3030095ee03796642bd376))
* **mobile:** correct timezone quotas and rejection diagnostics ([#6430](https://github.com/tutur3u/platform/issues/6430)) ([8d36fa7](https://github.com/tutur3u/platform/commit/8d36fa73d757b6f66aeb697c57f7dc6cfc721a61))
* **mobile:** decode Dart escapes in ratchet URIs and fail closed ([62ac2eb](https://github.com/tutur3u/platform/commit/62ac2ebe2afac5a4472070d425168220852d56cb))
* **mobile:** gate every serialized Lucide glyph and keep holes open ([2645e02](https://github.com/tutur3u/platform/commit/2645e024caa4ef84715f45409f4ecfdb9d4aeb25))
* **mobile:** harden sheet host Back, search placement and Android exit ([00605a7](https://github.com/tutur3u/platform/commit/00605a797af7c2d7d59e0e52700af2863f1b7949))
* **mobile:** keep codemod imports in the package import block ([782e16d](https://github.com/tutur3u/platform/commit/782e16d14dfa4a06df998a174a1fd7ff995bc3fb))
* **mobile:** keep incoming constraints for tap-target visuals ([f073278](https://github.com/tutur3u/platform/commit/f073278b695ab61d8d577ec4dfda3f32bf06c59d))
* **mobile:** keep queued threshold saves visible and polish Settings &gt; Apps ([b5a17db](https://github.com/tutur3u/platform/commit/b5a17db204b21c92876c4cd41a43bbe6b7e18d0a))
* **mobile:** keep shell body mounted across rail and dock switches ([946273b](https://github.com/tutur3u/platform/commit/946273bf537add2d6904f52f256bdc9410a37f4d))
* **mobile:** keep the calendar month grid above the dock ([f00d1e9](https://github.com/tutur3u/platform/commit/f00d1e9300dfed422557ed6bb1e4304c45ae8033))
* **mobile:** move the portfolio project title and Back into the shell ([7ae91f4](https://github.com/tutur3u/platform/commit/7ae91f4f6e2f701af973a450bfbef436cde998ff))
* **mobile:** nest Lucide contours by the true curve and test what users see ([539df0a](https://github.com/tutur3u/platform/commit/539df0ac0eee936ee8be6ef978d682c39c412da4))
* **mobile:** pad design-system buttons to 48dp tap targets ([b5202ca](https://github.com/tutur3u/platform/commit/b5202cad9d4097e1646012aa5663d424e9fb1d63))
* **mobile:** prevent agenda crashes from native timezone aliases ([#6598](https://github.com/tutur3u/platform/issues/6598)) ([ee8789b](https://github.com/tutur3u/platform/commit/ee8789b74011d127822e33af9a9559b039bb21c7))
* **mobile:** refresh saved request threshold and reach far search jumps ([ea552e0](https://github.com/tutur3u/platform/commit/ea552e01154cf4432e05d9c2fdd5a0cf332fd3a0))
* **mobile:** resolve native timezone aliases with complete data ([5ca3926](https://github.com/tutur3u/platform/commit/5ca39268bfc7a9c9816cbb4c307389b72f9602c1))
* **mobile:** reuse shell test app within shadcn ratchet ([8762b2d](https://github.com/tutur3u/platform/commit/8762b2d94d6af88a5b3e592648c8a17366d585e9))
* **mobile:** reuse shell test app within shadcn ratchet ([#6600](https://github.com/tutur3u/platform/issues/6600)) ([cfcaf87](https://github.com/tutur3u/platform/commit/cfcaf87ce06330484f235582a7f97a08a2d52bba))
* **mobile:** serialize Android exit Back and stop swallowing overlay Back ([92fc232](https://github.com/tutur3u/platform/commit/92fc2329f252c854ec94703c614c640e2be1caa4))
* **mobile:** share complete timezone data across app consumers ([2e4b108](https://github.com/tutur3u/platform/commit/2e4b1085c85e0d78083f9758ffd106e0c9a8b7df))
* **mobile:** share complete timezone data across app consumers ([#6601](https://github.com/tutur3u/platform/issues/6601)) ([c4aa21c](https://github.com/tutur3u/platform/commit/c4aa21cb43ded03feb5edb322d7332707a78dda9))
* **mobile:** shell chrome for project detail, body-width chat panes and month grid clearance ([#6544](https://github.com/tutur3u/platform/issues/6544)) ([e3f67e2](https://github.com/tutur3u/platform/commit/e3f67e254a6607f94594f7c62b2a710cc1743d76))
* **mobile:** show one friendly value line on Time zone rows ([178d2eb](https://github.com/tutur3u/platform/commit/178d2eb6c12b2e65ce20dc382403ce2debf68ccd))
* **mobile:** show one friendly value line on Time zone rows ([#6589](https://github.com/tutur3u/platform/issues/6589)) ([a2b7bb4](https://github.com/tutur3u/platform/commit/a2b7bb4d47a0d40651f9a494a95c3f20b6c728a5))
* **mobile:** stamp Android Back queries with a route generation ([c2b3624](https://github.com/tutur3u/platform/commit/c2b3624472caec853daccaf8a8521b2499608991))
* **mobile:** tokenize Dart directives and fail closed without a base ([167e9d9](https://github.com/tutur3u/platform/commit/167e9d959b16797e99ece4287340f50671c572e0))
* **mobile:** validate calendar timezone resolution ([0beebae](https://github.com/tutur3u/platform/commit/0beebaea403f83de85e90a24262c093793405ea4))
* **notifications:** guard wildcard invite email filters ([c9f8ac8](https://github.com/tutur3u/platform/commit/c9f8ac8d227e9d2d9adc95753dbacc7448a09d99))
* **notifications:** match unclaimed email invites ([0106ff5](https://github.com/tutur3u/platform/commit/0106ff5cec660bafd6dac35b66d0a88939830777))
* **resources:** fence workspace admission and preserve global upgrades ([#6568](https://github.com/tutur3u/platform/issues/6568)) ([68f0638](https://github.com/tutur3u/platform/commit/68f0638fed3bd404916bf0a966b7d163791421a2))
* **resources:** fence workspace bins and preserve global upgrades ([2b2c631](https://github.com/tutur3u/platform/commit/2b2c63171449a8896b9ff20472bfd284f771cc9d))
* **resources:** preserve ownership through protocol upgrades ([25139cf](https://github.com/tutur3u/platform/commit/25139cf6b69a1d24b9fa5a4e945a72d66473ca32))
* **resources:** reject cache takeover and orphan CLI aliases ([89a0fc3](https://github.com/tutur3u/platform/commit/89a0fc3364d4b0ad37967c7ccd30dbd6387b2f2f))
* **resources:** trust global CLI and fence cross-install setup ([8a4ef11](https://github.com/tutur3u/platform/commit/8a4ef11d2f66ba9c8c93400096616a51e0266153))
* **scripts:** add descriptor based filesystem helpers ([ba2fde8](https://github.com/tutur3u/platform/commit/ba2fde82940faca8d2cce3ff0d7288113e7cce73))
* **scripts:** add descriptor based filesystem helpers ([#6522](https://github.com/tutur3u/platform/issues/6522)) ([749cdb1](https://github.com/tutur3u/platform/commit/749cdb13268a69e8d110d4da9dce8fa96e74fd61))
* **scripts:** address review integration regressions ([a5f36bd](https://github.com/tutur3u/platform/commit/a5f36bd4198dce3fc2210914e91bbeb0b20a0549))
* **scripts:** harden file operations and input checks ([a83a4ee](https://github.com/tutur3u/platform/commit/a83a4ee1a7a58015f0c9a5bf94a27d7bb5e235a6))
* **scripts:** harden file operations and input checks ([#6523](https://github.com/tutur3u/platform/issues/6523)) ([3f55222](https://github.com/tutur3u/platform/commit/3f552224c125a4916e6dd02a98d1a4d64107c5a4))
* **scripts:** preserve filesystem error contracts ([3a982cd](https://github.com/tutur3u/platform/commit/3a982cd6ba7baa4250627b9c955a6de8d54af39e))
* **scripts:** read translation inputs through descriptors ([b6d5284](https://github.com/tutur3u/platform/commit/b6d52847208a58f121a91630dcf20d600f24bba4))
* **sdk:** admit ambiguous Node resource invocations ([f4c67b2](https://github.com/tutur3u/platform/commit/f4c67b2066318fc77221edd2522229baaab3ec13))
* **sdk:** admit and cap config-driven Node tests ([dc13a70](https://github.com/tutur3u/platform/commit/dc13a70f17f509b0869a47f284cccccc0340d8bf))
* **sdk:** cap the public Playwright test CLI entrypoint ([2b81ea5](https://github.com/tutur3u/platform/commit/2b81ea574d25e65ef53c8f761426049cd37c2cda))
* **sdk:** drain oversized budget heads and reconcile rollback ([e4f5989](https://github.com/tutur3u/platform/commit/e4f59898bf0e22d5a5a75825a643052ac8e69578))
* **sdk:** exclude shared test fixtures from the portable build ([acf283d](https://github.com/tutur3u/platform/commit/acf283dbf182a074ad4b3b8919c0b60a8b343c68))
* **sdk:** exclude shared test fixtures from the portable build ([#6586](https://github.com/tutur3u/platform/issues/6586)) ([a240202](https://github.com/tutur3u/platform/commit/a240202cf9a03d701902a915558566aa993839d8))
* **sdk:** fail toward admission for ambiguous Node option values ([83961be](https://github.com/tutur3u/platform/commit/83961be640281145987ac3b985a77196a4518aa9))
* **sdk:** fence upgrades atomically and cap ambiguous test workers ([3058bca](https://github.com/tutur3u/platform/commit/3058bcae38718db8a7642126c0bd9c1355a0c64c))
* **sdk:** harden rollout recovery and fleet outcome reporting ([bc98c9e](https://github.com/tutur3u/platform/commit/bc98c9e6cad9c68bed7a39f9d4ca4c27be18c821))
* **sdk:** harden ttr resources nested admission and trivial bypass ([#6492](https://github.com/tutur3u/platform/issues/6492)) ([bb5ac64](https://github.com/tutur3u/platform/commit/bb5ac64ffbff72f3a17af3a2ef09e221ff1e1a40))
* **sdk:** hoist regex test so CodeQL can parse portable-build ([8291a33](https://github.com/tutur3u/platform/commit/8291a33a7a1406d357e240a60dbb03ebec6437e4))
* **sdk:** hoist regex test so CodeQL can parse portable-build ([#6543](https://github.com/tutur3u/platform/issues/6543)) ([8bfff65](https://github.com/tutur3u/platform/commit/8bfff658698cd1fe79a2e15f095296bdfbee83d0))
* **sdk:** identify unmanaged launchers before budget upgrade checks ([c61ad90](https://github.com/tutur3u/platform/commit/c61ad909048fb6d1839bfc719b4350c520213bb8))
* **sdk:** isolate version probes and serialize dev publication ([dde6fec](https://github.com/tutur3u/platform/commit/dde6fec7a7b1dafb0c377da441400cef5bc6b05d))
* **sdk:** merge Node hardening and gate budget rollout ([94717f3](https://github.com/tutur3u/platform/commit/94717f37aad0cd030fa56a930e541dbc278683c7))
* **sdk:** never admit ttr through its own bun shim ([28d8d35](https://github.com/tutur3u/platform/commit/28d8d358a59b00085e5cf6f207a6344cd9c57469))
* **sdk:** preserve non-error process probe failures ([d94b033](https://github.com/tutur3u/platform/commit/d94b033278cb6798066e483c031a9dd1e0b99e2d))
* **sdk:** preserve version contracts and recover dev packing safely ([107e5fd](https://github.com/tutur3u/platform/commit/107e5fddfd5bb588922276dcfa1da74c4e0c7bca))
* **sdk:** recognise the shipped CLI admission boundary ([ae48013](https://github.com/tutur3u/platform/commit/ae4801366b6ca72bc88dd50d5edf83fd986eb75d))
* **sdk:** reconcile resource fixtures and portable qualification ([e273523](https://github.com/tutur3u/platform/commit/e273523db0dd1fc62bff1e1ffa9e172b7e9a63fc))
* **sdk:** remove orphaned Judge containers and drop bare-pid kills ([#6461](https://github.com/tutur3u/platform/issues/6461)) ([78f2aa0](https://github.com/tutur3u/platform/commit/78f2aa01c51b5c58aef9f494fc76f0e717fde113))
* **sdk:** reserve reclaim capacity and enforce budget workers ([8e24af8](https://github.com/tutur3u/platform/commit/8e24af893bd66bf5634d535e7879ca41ed245f2b))
* **sdk:** retain the installed supplier archive ([43a59ec](https://github.com/tutur3u/platform/commit/43a59ec44a605834cd4b7e9025cf3d15ffe94a3b))
* **sdk:** separate rollout cleanup failures from rollback outcomes ([69d9dc9](https://github.com/tutur3u/platform/commit/69d9dc91a2466c9dc4d8d1fcb149a835b8ad1fcf))
* **sdk:** separate rollout cleanup failures from rollback outcomes ([#6597](https://github.com/tutur3u/platform/issues/6597)) ([a04b10b](https://github.com/tutur3u/platform/commit/a04b10bb943eac7e03fc80cf856e1f2063aa7918))
* **sdk:** validate trusted devbox executable input ([8319562](https://github.com/tutur3u/platform/commit/83195629745a9524fa3170bc7ddb31453fb35f20))
* **sdk:** validate trusted devbox executable input ([#6583](https://github.com/tutur3u/platform/issues/6583)) ([52c7c3d](https://github.com/tutur3u/platform/commit/52c7c3df008ee20b95f24e0213427dc5ad44be70))
* **security:** build request-keyed records without prototype setters ([012dbe1](https://github.com/tutur3u/platform/commit/012dbe18612f9ca5a18c15049df04d0a622ab1e2))
* **security:** correct certificate test key typing ([88e9a88](https://github.com/tutur3u/platform/commit/88e9a880023d9dab264c336a5bd7eb52f7a7c970))
* **security:** correct SDK atomic file typing ([87c7532](https://github.com/tutur3u/platform/commit/87c7532260f81ba8b1361919acb1c7d2107b0389))
* **security:** defer PKCS12 parser loading ([0de6fc2](https://github.com/tutur3u/platform/commit/0de6fc23c60edfbd5fb4d672b8a67d5c7a2389c1))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **security:** enforce API limits for unresolved client addresses ([0768eff](https://github.com/tutur3u/platform/commit/0768effc063e4c51f1173414bbc630ce1720f458))
* **security:** fence temporary types and preserve managed definers ([83623b2](https://github.com/tutur3u/platform/commit/83623b2bf287c2581bb46aa7a05652409cfe31b1))
* **security:** harden apps and offline file access ([f41dd6c](https://github.com/tutur3u/platform/commit/f41dd6cadb6f7217da984ed1df0fbc8d595972fd))
* **security:** harden apps and offline file access ([#6529](https://github.com/tutur3u/platform/issues/6529)) ([1883927](https://github.com/tutur3u/platform/commit/18839272a06409a999d9201f297a5298fc728f9b))
* **security:** harden database file operations ([2d41f91](https://github.com/tutur3u/platform/commit/2d41f91ada203e513a6b166d44d7ff6a4dc7b35a))
* **security:** harden database file operations ([#6527](https://github.com/tutur3u/platform/issues/6527)) ([521de7c](https://github.com/tutur3u/platform/commit/521de7c4557bc69f7cd084b3ab55d7204360667a))
* **security:** harden guest and challenge password verification ([6127e0d](https://github.com/tutur3u/platform/commit/6127e0d51b1da4db97a3679d758e674ee110175e))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** harden regexes, escaping and key handling in shared packages ([d518804](https://github.com/tutur3u/platform/commit/d518804d9fe811cfba3a1ff04a6f253d4fa44c1d))
* **security:** harden request-keyed records, push previews and key handoff ([#6521](https://github.com/tutur3u/platform/issues/6521)) ([1c7dfb1](https://github.com/tutur3u/platform/commit/1c7dfb13762c6da6b1935e8ea409aa29dce4c747))
* **security:** harden SDK file and token handling ([1a91433](https://github.com/tutur3u/platform/commit/1a91433743d4de9d5c6888e448d373acd7209eb7))
* **security:** harden SDK file and token handling ([#6526](https://github.com/tutur3u/platform/issues/6526)) ([a9e410b](https://github.com/tutur3u/platform/commit/a9e410b8ecee04b3794a949fd47fb517b94173a5))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** prevent native integrity fallback downgrades ([c1d5f41](https://github.com/tutur3u/platform/commit/c1d5f41c9b197dbe62e33e3cce49a7c00c5c0ebf))
* **security:** repair native integrity CI and merge main ([667bfef](https://github.com/tutur3u/platform/commit/667bfef571dbb5b0e201bfa48ba3ed4000b7c522))
* **security:** replace certificate parser dependency ([#6519](https://github.com/tutur3u/platform/issues/6519)) ([2017955](https://github.com/tutur3u/platform/commit/201795552ee36039331e29ebd869e6102b1e4d88))
* **security:** replace node-forge certificate parsing ([c81f40d](https://github.com/tutur3u/platform/commit/c81f40d244411bea4025c86fad49d6a52050c945))
* **security:** report certificate parser outages ([f7db9e2](https://github.com/tutur3u/platform/commit/f7db9e2793b74de9a070c0ae1370ffdb76d47316))
* **security:** reserve password attempts and close guest view grants ([7c1088c](https://github.com/tutur3u/platform/commit/7c1088c6a63f5e42ce6d7c5d00bbadaed1b90f29))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
* **security:** sanitize caught-error logs and widen SAML entity ID schemes ([fe834f3](https://github.com/tutur3u/platform/commit/fe834f3987d5dcb7eb81b8f59c0401bab8a7b109))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **security:** strip control characters from request-derived log values ([ba4f748](https://github.com/tutur3u/platform/commit/ba4f748d71f2cd37abd18c41796bf5a5fb171a4f))
* **security:** verify workspace avatar paths before deleting storage objects ([#6501](https://github.com/tutur3u/platform/issues/6501)) ([bc2b6c6](https://github.com/tutur3u/platform/commit/bc2b6c652138810cf5afab7464d23b073cd9dba2))
* **storage:** decode percent-encoded storage paths as UTF-8 ([b27a231](https://github.com/tutur3u/platform/commit/b27a2311d834499ae042defc878d2a7a747bb9f7))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
* **tooling:** accept dash routes and fence untracked hook inputs ([82b5a04](https://github.com/tutur3u/platform/commit/82b5a047e1efb9898b214438eca1112700109848))
* **tooling:** admit producer inventory and recognize cf type generation ([8c9cc42](https://github.com/tutur3u/platform/commit/8c9cc42a7f31dc8bc185ef06936b0bf47ebc0486))
* **tooling:** canonicalise global installs and preserve test runners ([4fa8316](https://github.com/tutur3u/platform/commit/4fa8316c7a3cd9b0177ea64a6ed80f2042baa8d2))
* **tooling:** canonicalise global installs and preserve test runners ([#6574](https://github.com/tutur3u/platform/issues/6574)) ([34640ef](https://github.com/tutur3u/platform/commit/34640ef636e4955b8c13dee9c541f410a44cb820))
* **tooling:** clamp native checker threads and print concise usage ([dc5d608](https://github.com/tutur3u/platform/commit/dc5d608c72582c3c6fc64310055f396ab23a5a75))
* **tooling:** enforce validation arguments and native checker admission ([6e787d1](https://github.com/tutur3u/platform/commit/6e787d1d34ca54e5015a98b4fa4438f68de8dc5e))
* **tooling:** fence nested script helper roots in pre-push checks ([71fff90](https://github.com/tutur3u/platform/commit/71fff905d230227895e4cb67462c24d29e271b36))
* **tooling:** fence untracked helpers for committed script tests ([43c28ad](https://github.com/tutur3u/platform/commit/43c28ad59bc896c1e829ba89943cc12895a19607))
* **tooling:** isolate checks and validate pushed branch refs ([053a5ed](https://github.com/tutur3u/platform/commit/053a5edd37fb80725627815911a356cc2f120b1c))
* **tooling:** keep tsrs shadow checks advisory and offline in hooks ([f99b207](https://github.com/tutur3u/platform/commit/f99b2070d69d7d4e47a53ba5b309e25ce10edea9))
* **tooling:** preserve changed-files gate safety and coverage ([85cdab7](https://github.com/tutur3u/platform/commit/85cdab7cbbeccb24dbca666329c730aea7bc2874))
* **tooling:** refuse broken global CLI installations ([29d4238](https://github.com/tutur3u/platform/commit/29d4238ecce43277e6c4ac9959623d085070d1df))
* **tooling:** route changed tests to their owning runner ([0accb4e](https://github.com/tutur3u/platform/commit/0accb4ee50e4e29f40fd1c6397a7d60a0fd392e3))
* **tooling:** scope tsrs shadow runs and report advisory parity ([a9387a6](https://github.com/tutur3u/platform/commit/a9387a6fb35a017f3f1567f2976381e5fbe96289))
* **tooling:** stop forwarding git remote args to the pre-push gate ([db03442](https://github.com/tutur3u/platform/commit/db034428b571f58d06b60c593287e3114a7b65f3))
* **ui:** keep markdown paste conversion from stalling on rejected list lines ([8dbd2c9](https://github.com/tutur3u/platform/commit/8dbd2c98ae4e09b6d5e270849e38d523f9b17fdf))
* **users-core:** use confirmed email for invite access ([042730e](https://github.com/tutur3u/platform/commit/042730e1624f81997edad4b6f24d9193fdc4b2b7))
* **utils:** replace empty earlier duplicates in multi-value query parsing ([b0e6152](https://github.com/tutur3u/platform/commit/b0e61521a9c0a3a5d36b6f05948b9cfcab13fd7a))
* **web:** drop residual markup delimiters from mail push previews ([e5e7993](https://github.com/tutur3u/platform/commit/e5e79930b96838d172785335aefc893bb1f85b34))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
* **workers:** reject dangling Vite metadata symlinks and keep the manifest in artifacts ([0038b83](https://github.com/tutur3u/platform/commit/0038b83c0292d264c4d73b8490a6899d067dc050))


### Performance Improvements

* **ci:** select mobile platform builds on pull requests ([157a950](https://github.com/tutur3u/platform/commit/157a950b81562a2bd44b9c4b2351586a26f6cd39))
* **ci:** select mobile platform builds on pull requests ([#6584](https://github.com/tutur3u/platform/issues/6584)) ([f1cea4b](https://github.com/tutur3u/platform/commit/f1cea4b88f2c42565122bcdab7b0d5a2a3fa21c2))
* **ci:** skip Worker workflows for lockfile edits outside their closure ([#6499](https://github.com/tutur3u/platform/issues/6499)) ([a8a9401](https://github.com/tutur3u/platform/commit/a8a9401e05a4610245682d672effc17bf7fa6c64))
* **ci:** supersede stale Worker PR validation, serialize only deploys ([#6494](https://github.com/tutur3u/platform/issues/6494)) ([0ddee00](https://github.com/tutur3u/platform/commit/0ddee00c8f7514714508ae6d50bee11f90f86323))
</details>

<details><summary>ai-studio: 0.18.2</summary>

## [0.18.2](https://github.com/tutur3u/platform/compare/ai-studio-v0.18.1...ai-studio-v0.18.2) (2026-10-24)


### Bug Fixes

* **ai:** keep playground key handoff out of web storage ([04662e2](https://github.com/tutur3u/platform/commit/04662e2a9fc01864cf3a679f87d7dc0146926f93))
* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden request-keyed records, push previews and key handoff ([#6521](https://github.com/tutur3u/platform/issues/6521)) ([1c7dfb1](https://github.com/tutur3u/platform/commit/1c7dfb13762c6da6b1935e8ea409aa29dce4c747))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>apps: 0.25.1</summary>

## [0.25.1](https://github.com/tutur3u/platform/compare/apps-v0.25.0...apps-v0.25.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden apps and offline file access ([f41dd6c](https://github.com/tutur3u/platform/commit/f41dd6cadb6f7217da984ed1df0fbc8d595972fd))
* **security:** harden apps and offline file access ([#6529](https://github.com/tutur3u/platform/issues/6529)) ([1883927](https://github.com/tutur3u/platform/commit/18839272a06409a999d9201f297a5298fc728f9b))
</details>

<details><summary>calendar: 0.35.1</summary>

## [0.35.1](https://github.com/tutur3u/platform/compare/calendar-v0.35.0...calendar-v0.35.1) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **calendar:** bind provider OAuth state to user and workspace ([f171b5d](https://github.com/tutur3u/platform/commit/f171b5d94dbd1775db7ca770e221e9f5c2e41f95))
* **calendar:** bind provider OAuth state to user and workspace ([#6520](https://github.com/tutur3u/platform/issues/6520)) ([f1685c6](https://github.com/tutur3u/platform/commit/f1685c68630ca83a94125cdc5aceb0874565f80f))
* **calendar:** DB-backed single-use OAuth state and BASE_URL redirects ([4f203fe](https://github.com/tutur3u/platform/commit/4f203fe6586cbe450c0dac1d1b17059c4fde1d80))
* **calendar:** fail closed on missing OAuth runtime config in production ([c17943a](https://github.com/tutur3u/platform/commit/c17943a310d3ee7e406c0658e48facb165581ce7))
* **calendar:** preserve native quota diagnostics and reuse verified actors ([88c464c](https://github.com/tutur3u/platform/commit/88c464c75ca1a51014e360ee92aabea0b16d919c))
* **calendar:** serve native timezone preferences from Web ([ec94bc2](https://github.com/tutur3u/platform/commit/ec94bc262c9ef7e89339309de1d23ff4045224db))
* **calendar:** serve native timezone preferences from Web ([#6573](https://github.com/tutur3u/platform/issues/6573)) ([a1bcec6](https://github.com/tutur3u/platform/commit/a1bcec69510d4efaaee91737a563c00ffc253dd4))
* **calendar:** single-use OAuth state, Google PKCE, canonical redirects ([ea618ba](https://github.com/tutur3u/platform/commit/ea618ba9bff4674045c94ba3aebe23b983090368))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **mobile:** correct timezone quotas and rejection diagnostics ([#6430](https://github.com/tutur3u/platform/issues/6430)) ([8d36fa7](https://github.com/tutur3u/platform/commit/8d36fa73d757b6f66aeb697c57f7dc6cfc721a61))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
* **security:** sanitize caught-error logs and widen SAML entity ID schemes ([fe834f3](https://github.com/tutur3u/platform/commit/fe834f3987d5dcb7eb81b8f59c0401bab8a7b109))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **security:** strip control characters from request-derived log values ([ba4f748](https://github.com/tutur3u/platform/commit/ba4f748d71f2cd37abd18c41796bf5a5fb171a4f))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>chat: 0.27.2</summary>

## [0.27.2](https://github.com/tutur3u/platform/compare/chat-v0.27.1...chat-v0.27.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>cms: 0.37.2</summary>

## [0.37.2](https://github.com/tutur3u/platform/compare/cms-v0.37.1...cms-v0.37.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>database: 1.44.0</summary>

## [1.44.0](https://github.com/tutur3u/platform/compare/database-v1.43.0...database-v1.44.0) (2026-10-24)


### Features

* **ci:** restore CodeQL and add a security review cadence ([#6456](https://github.com/tutur3u/platform/issues/6456)) ([10d839a](https://github.com/tutur3u/platform/commit/10d839adb6cfbb11ec7259b965dd4b0167d60719))
* **devbox:** separate runner trust pools and add an observable drain ([#6450](https://github.com/tutur3u/platform/issues/6450)) ([64401ab](https://github.com/tutur3u/platform/commit/64401abf6f74b9c008d020ed0428ec043d23fc6d))
* **sdk:** offload saturated resource runs to trusted devbox runners ([#6454](https://github.com/tutur3u/platform/issues/6454)) ([59bce45](https://github.com/tutur3u/platform/commit/59bce451809baf5f62185d172833a99fb5ad0a7c))


### Bug Fixes

* **auth:** add per-account MFA verification limits ([95205fe](https://github.com/tutur3u/platform/commit/95205fe35733b55c9eb1d6cf03f47ec3ba2318f0))
* **auth:** add per-account MFA verification limits ([#6555](https://github.com/tutur3u/platform/issues/6555)) ([b4d67f0](https://github.com/tutur3u/platform/commit/b4d67f008ac7f9a2e103d4f35d039175acc0bf5b))
* **auth:** grant MFA hook caller schema usage ([c324497](https://github.com/tutur3u/platform/commit/c324497909ada7e3be34147da61ef02ebde95548))
* **auth:** reserve MFA attempts atomically and restrict the hook ([0c945d5](https://github.com/tutur3u/platform/commit/0c945d5c528c64d3842033bb8bc6eaa262f44bb6))
* **calendar:** bind provider OAuth state to user and workspace ([#6520](https://github.com/tutur3u/platform/issues/6520)) ([f1685c6](https://github.com/tutur3u/platform/commit/f1685c68630ca83a94125cdc5aceb0874565f80f))
* **calendar:** DB-backed single-use OAuth state and BASE_URL redirects ([4f203fe](https://github.com/tutur3u/platform/commit/4f203fe6586cbe450c0dac1d1b17059c4fde1d80))
* **ci:** never let a dispatch input select code in a privileged cache scope ([ff48a7a](https://github.com/tutur3u/platform/commit/ff48a7ac6ad378821e6c94f7d7bd841259f155e6))
* **database:** date calendar OAuth nonce migration in the past ([16e8f57](https://github.com/tutur3u/platform/commit/16e8f57a6c9ddce6a795c1315fe4e117400461f9))
* **database:** enforce trusted definer search paths across exposed schemas ([04efff7](https://github.com/tutur3u/platform/commit/04efff7fc30354221dfbcad3c5d78707fa3c8669))
* **database:** harden remaining legacy chat read policies ([497d419](https://github.com/tutur3u/platform/commit/497d419ac2ca9b11c022cc09d1ab2eea8c4e9243))
* **database:** narrow notification cleanup and extend access tests ([9b223b5](https://github.com/tutur3u/platform/commit/9b223b5e739e6e92c95f565219cc819f57e050db))
* **database:** preserve atomic lifecycle metadata replacement ([94b5e42](https://github.com/tutur3u/platform/commit/94b5e42ac796ee8cc758a788223d0f7ce012d467))
* **database:** preserve server task access and exercise storage catalog ([e206f1d](https://github.com/tutur3u/platform/commit/e206f1db9c945547deb1d939d4e4d100eac5b5fc))
* **database:** repair hardened file operation tests ([a457fda](https://github.com/tutur3u/platform/commit/a457fdaf63137b39a9a5d5fc29af0dd29bf61ed0))
* **database:** restrict internal definer functions and add caller checks ([cda8a16](https://github.com/tutur3u/platform/commit/cda8a16687bf0a95e00fabedb7a3fabd5a7ecfda))
* **database:** restrict internal definer functions and add caller checks ([#6557](https://github.com/tutur3u/platform/issues/6557)) ([0c665ae](https://github.com/tutur3u/platform/commit/0c665ae14a97455872e0fa05b3a8c31f229e789c))
* **database:** scope email helper to the current caller ([cf7f104](https://github.com/tutur3u/platform/commit/cf7f10431776bb03389439c4698c87cb6269b586))
* **database:** scope email helper to the current caller ([#6550](https://github.com/tutur3u/platform/issues/6550)) ([f261aa0](https://github.com/tutur3u/platform/commit/f261aa03faa17c834a649f6d2cccb5dc9f84bdd8))
* **database:** scope list-less tasks to their creator ([bfb22e1](https://github.com/tutur3u/platform/commit/bfb22e1e37979f51261dfd84819ebb6ad65eea60))
* **database:** tighten notification email access ([4b4e13b](https://github.com/tutur3u/platform/commit/4b4e13bb352c1b370bfcda02836be563b7cf05a5))
* **database:** tighten notification email access ([#6552](https://github.com/tutur3u/platform/issues/6552)) ([d9161cc](https://github.com/tutur3u/platform/commit/d9161ccb52569144418f18a7afc11a19ef6eb4c7))
* **database:** verify final definer callers and server chat boundary ([7a6dcf6](https://github.com/tutur3u/platform/commit/7a6dcf6f8212c9357e2f5b00ce0c4cbf187c81ce))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **devbox:** cancel lost offload creates by key and page logs by run cursor ([aace86b](https://github.com/tutur3u/platform/commit/aace86bdbdef0f44ae31562c61dd2174463a384c))
* **devbox:** fence keyed creates and enforce the commit-run protocol server-side ([d0dd8c6](https://github.com/tutur3u/platform/commit/d0dd8c6b34e0270e46e595c60bd230dcb1644693))
* **devbox:** roll out the run log cursor without a long table lock ([6b6b09e](https://github.com/tutur3u/platform/commit/6b6b09e2bda26e6ea5596b4a62877a82b66df3cc))
* **security:** fence temporary types and preserve managed definers ([83623b2](https://github.com/tutur3u/platform/commit/83623b2bf287c2581bb46aa7a05652409cfe31b1))
* **security:** harden database file operations ([2d41f91](https://github.com/tutur3u/platform/commit/2d41f91ada203e513a6b166d44d7ff6a4dc7b35a))
* **security:** harden database file operations ([#6527](https://github.com/tutur3u/platform/issues/6527)) ([521de7c](https://github.com/tutur3u/platform/commit/521de7c4557bc69f7cd084b3ab55d7204360667a))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** reserve password attempts and close guest view grants ([7c1088c](https://github.com/tutur3u/platform/commit/7c1088c6a63f5e42ce6d7c5d00bbadaed1b90f29))
</details>

<details><summary>drive: 0.32.2</summary>

## [0.32.2](https://github.com/tutur3u/platform/compare/drive-v0.32.1...drive-v0.32.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>external: 0.6.2</summary>

## [0.6.2](https://github.com/tutur3u/platform/compare/external-v0.6.1...external-v0.6.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>finance: 0.34.2</summary>

## [0.34.2](https://github.com/tutur3u/platform/compare/finance-v0.34.1...finance-v0.34.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** build request-keyed records without prototype setters ([012dbe1](https://github.com/tutur3u/platform/commit/012dbe18612f9ca5a18c15049df04d0a622ab1e2))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** harden request-keyed records, push previews and key handoff ([#6521](https://github.com/tutur3u/platform/issues/6521)) ([1c7dfb1](https://github.com/tutur3u/platform/commit/1c7dfb13762c6da6b1935e8ea409aa29dce4c747))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **utils:** replace empty earlier duplicates in multi-value query parsing ([b0e6152](https://github.com/tutur3u/platform/commit/b0e61521a9c0a3a5d36b6f05948b9cfcab13fd7a))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>hive: 0.26.2</summary>

## [0.26.2](https://github.com/tutur3u/platform/compare/hive-v0.26.1...hive-v0.26.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
</details>

<details><summary>hive-realtime: 0.13.1</summary>

## [0.13.1](https://github.com/tutur3u/platform/compare/hive-realtime-v0.13.0...hive-realtime-v0.13.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>infra: 0.38.0</summary>

## [0.38.0](https://github.com/tutur3u/platform/compare/infra-v0.37.0...infra-v0.38.0) (2026-10-24)


### Features

* **devbox:** separate runner trust pools and add an observable drain ([#6450](https://github.com/tutur3u/platform/issues/6450)) ([64401ab](https://github.com/tutur3u/platform/commit/64401abf6f74b9c008d020ed0428ec043d23fc6d))


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **mobile:** correct timezone quotas and rejection diagnostics ([#6430](https://github.com/tutur3u/platform/issues/6430)) ([8d36fa7](https://github.com/tutur3u/platform/commit/8d36fa73d757b6f66aeb697c57f7dc6cfc721a61))
* **security:** correct certificate test key typing ([88e9a88](https://github.com/tutur3u/platform/commit/88e9a880023d9dab264c336a5bd7eb52f7a7c970))
* **security:** defer PKCS12 parser loading ([0de6fc2](https://github.com/tutur3u/platform/commit/0de6fc23c60edfbd5fb4d672b8a67d5c7a2389c1))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** replace certificate parser dependency ([#6519](https://github.com/tutur3u/platform/issues/6519)) ([2017955](https://github.com/tutur3u/platform/commit/201795552ee36039331e29ebd869e6102b1e4d88))
* **security:** replace node-forge certificate parsing ([c81f40d](https://github.com/tutur3u/platform/commit/c81f40d244411bea4025c86fad49d6a52050c945))
* **security:** report certificate parser outages ([f7db9e2](https://github.com/tutur3u/platform/commit/f7db9e2793b74de9a070c0ae1370ffdb76d47316))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>inventory: 0.36.2</summary>

## [0.36.2](https://github.com/tutur3u/platform/compare/inventory-v0.36.1...inventory-v0.36.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** build request-keyed records without prototype setters ([012dbe1](https://github.com/tutur3u/platform/commit/012dbe18612f9ca5a18c15049df04d0a622ab1e2))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **security:** harden request-keyed records, push previews and key handoff ([#6521](https://github.com/tutur3u/platform/issues/6521)) ([1c7dfb1](https://github.com/tutur3u/platform/commit/1c7dfb13762c6da6b1935e8ea409aa29dce4c747))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>storefront: 0.31.2</summary>

## [0.31.2](https://github.com/tutur3u/platform/compare/storefront-v0.31.1...storefront-v0.31.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>learn: 0.31.2</summary>

## [0.31.2](https://github.com/tutur3u/platform/compare/learn-v0.31.1...learn-v0.31.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **security:** harden regexes, escaping and key handling in shared packages ([d518804](https://github.com/tutur3u/platform/commit/d518804d9fe811cfba3a1ff04a6f253d4fa44c1d))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>mail: 0.30.1</summary>

## [0.30.1](https://github.com/tutur3u/platform/compare/mail-v0.30.0...mail-v0.30.1) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** patch high-severity advisories ([f263ae6](https://github.com/tutur3u/platform/commit/f263ae6e96baa799d43aaa7e3f4cbb2e9010b4ce))
* **deps:** patch high-severity advisories ([#6569](https://github.com/tutur3u/platform/issues/6569)) ([a67ca56](https://github.com/tutur3u/platform/commit/a67ca56759b100a61a0bec792b40c049a2c44681))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>meet: 0.34.2</summary>

## [0.34.2](https://github.com/tutur3u/platform/compare/meet-v0.34.1...meet-v0.34.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **meet:** clarify join states and repair theme initialization ([#6506](https://github.com/tutur3u/platform/issues/6506)) ([f641b5b](https://github.com/tutur3u/platform/commit/f641b5b7def874eeeb4f8562429bd2584aa7eb07))
* **security:** harden guest and challenge password verification ([6127e0d](https://github.com/tutur3u/platform/commit/6127e0d51b1da4db97a3679d758e674ee110175e))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>mind: 0.25.2</summary>

## [0.25.2](https://github.com/tutur3u/platform/compare/mind-v0.25.1...mind-v0.25.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>mobile: 0.26.0</summary>

## [0.26.0](https://github.com/tutur3u/platform/compare/mobile-v0.25.1...mobile-v0.26.0) (2026-10-24)


### Features

* **mobile:** add core/ui design tokens, icons and components ([e924582](https://github.com/tutur3u/platform/commit/e9245822efa2e13eb33c53f35441dbf9a0904c88))
* **mobile:** add core/ui design tokens, icons and components ([#6577](https://github.com/tutur3u/platform/issues/6577)) ([43bf1b8](https://github.com/tutur3u/platform/commit/43bf1b8f218751034db1862ae881d5f0066f6fb7))
* **mobile:** add design foundation for consistent padding and responsive shell ([4c83120](https://github.com/tutur3u/platform/commit/4c83120b43e2c0a249fdf7a663ad4f5674c6125d))
* **mobile:** add design foundation for consistent padding and responsive shell ([#6530](https://github.com/tutur3u/platform/issues/6530)) ([aaac144](https://github.com/tutur3u/platform/commit/aaac1440f195868787303dd0caa0e29572b9dd6c))
* **mobile:** add unified sheet and dialog host with modal Back ([31e4712](https://github.com/tutur3u/platform/commit/31e4712077406d6aaef65b5743644ba6b3c90362))
* **mobile:** add unified sheet and dialog host with modal Back ([#6578](https://github.com/tutur3u/platform/issues/6578)) ([c3b280b](https://github.com/tutur3u/platform/commit/c3b280bf21fc4d78e53d05afa5c080235100dea8))
* **mobile:** centralize app settings under Settings &gt; Apps ([83fbfab](https://github.com/tutur3u/platform/commit/83fbfab65b45746be4bcb159931539a6d4ce74a4))
* **mobile:** centralize app settings under Settings &gt; Apps ([#6546](https://github.com/tutur3u/platform/issues/6546)) ([8f59398](https://github.com/tutur3u/platform/commit/8f593986ca7ba85ae7621a7788e33cbc3ead429e))
* **mobile:** consolidate profile and account settings in Edit profile ([29ac9cd](https://github.com/tutur3u/platform/commit/29ac9cdc3b2e194abf65eb558e9e2694d8973153))
* **mobile:** consolidate profile settings in Edit profile ([#6548](https://github.com/tutur3u/platform/issues/6548)) ([b50d7d7](https://github.com/tutur3u/platform/commit/b50d7d7e63cfefe8a1210ac48af07d9ab0e064df))
* **mobile:** generate web-parity Lucide and Lucide Lab icon fonts ([d11306c](https://github.com/tutur3u/platform/commit/d11306cfa506e137e1014ff3f811f3fd1adc7c52))
* **mobile:** generate web-parity Lucide and Lucide Lab icon fonts ([#6593](https://github.com/tutur3u/platform/issues/6593)) ([4b00846](https://github.com/tutur3u/platform/commit/4b0084665af9def60263c1a9f420a695cc4bdfde))
* **mobile:** migrate apps, assistant, auth and account screens to page primitives ([bd4b7f8](https://github.com/tutur3u/platform/commit/bd4b7f86ca031faccc50d43c6276b23bb25594eb))
* **mobile:** migrate apps, assistant, auth and account screens to page primitives ([#6539](https://github.com/tutur3u/platform/issues/6539)) ([1477217](https://github.com/tutur3u/platform/commit/1477217c9d2bb8a62020be7f984815f71a488b63))
* **mobile:** migrate drive, mail, meet, chat, notes and calendar screens to page primitives ([b950947](https://github.com/tutur3u/platform/commit/b95094764fbb230d30c7637320630b545e170b72))
* **mobile:** migrate drive, mail, meet, chat, notes and calendar screens to page primitives ([#6538](https://github.com/tutur3u/platform/issues/6538)) ([a80f5c8](https://github.com/tutur3u/platform/commit/a80f5c8e8b18b84e6bbc4f3fcac4ce6a8aab0a01))
* **mobile:** migrate education, CMS and CRM screens to page primitives ([15af7b3](https://github.com/tutur3u/platform/commit/15af7b30c4210780ec9e5df8f54b31f76b8e0486))
* **mobile:** migrate education, CMS and CRM screens to page primitives ([#6537](https://github.com/tutur3u/platform/issues/6537)) ([7e7fb10](https://github.com/tutur3u/platform/commit/7e7fb10681715e5579490d4f0cfc0d35292977c3))
* **mobile:** migrate finance, inventory and storefront screens to page primitives ([c3db770](https://github.com/tutur3u/platform/commit/c3db770a3e6f1fc3e51bcfc61cb29c820b5d5053))
* **mobile:** migrate finance, inventory and storefront screens to page primitives ([#6536](https://github.com/tutur3u/platform/issues/6536)) ([ef5292c](https://github.com/tutur3u/platform/commit/ef5292c7782ff13d127d5ad33433e2c316b9c387))
* **mobile:** migrate task and time tracker screens to page primitives ([bb1ccd0](https://github.com/tutur3u/platform/commit/bb1ccd0292533563f7e9273847b10c9adbc7a41d))
* **mobile:** migrate task and time tracker screens to page primitives ([#6535](https://github.com/tutur3u/platform/issues/6535)) ([2385749](https://github.com/tutur3u/platform/commit/23857493d285212092a247b37eabc35a0017d708))
* **mobile:** open the approval threshold editor from the Requests gear ([c5ed9d7](https://github.com/tutur3u/platform/commit/c5ed9d75426e6ba254cb77ddf1ee15f2877bb346))
* **mobile:** polish Edit profile rows and document the review follow-ups ([4c42b91](https://github.com/tutur3u/platform/commit/4c42b91f8883aafd85ed8afcda3179e0bf49092a))
* **mobile:** rebuild timezone pickers on the sheet host ([3c968dd](https://github.com/tutur3u/platform/commit/3c968ddaa600c7c0c66ad22459ee27ad2684015e))
* **mobile:** rebuild timezone pickers on the sheet host ([#6579](https://github.com/tutur3u/platform/issues/6579)) ([07dcbc3](https://github.com/tutur3u/platform/commit/07dcbc3df20df1833330fc6f2d1bdecc72dc17d8))
* **mobile:** redesign settings and add customizable appearance themes ([8c603fc](https://github.com/tutur3u/platform/commit/8c603fc93cff648f175eca9c94e5627150db4d23))
* **mobile:** redesign settings and add customizable appearance themes ([#6534](https://github.com/tutur3u/platform/issues/6534)) ([613b517](https://github.com/tutur3u/platform/commit/613b5176a08e8270788f6d58b55d29aecfe5fc22))
* **mobile:** route Timer gear actions to central Timer settings ([1d5ab36](https://github.com/tutur3u/platform/commit/1d5ab36eab6f242ddb082d29c194cad390749297))
* **mobile:** route Timer gear actions to central Timer settings ([#6547](https://github.com/tutur3u/platform/issues/6547)) ([0ffa154](https://github.com/tutur3u/platform/commit/0ffa1543443b3b3cf54c7cfbf6dbd4ac9c210e27))
* **security:** add staged native integrity verification ([b9155e4](https://github.com/tutur3u/platform/commit/b9155e45bba5486b9943a4dc3e9cb9b2aedb8b14))
* **security:** add staged native integrity verification ([#6575](https://github.com/tutur3u/platform/issues/6575)) ([332368d](https://github.com/tutur3u/platform/commit/332368dd35586096f314355eb6bc8f7904ed0868))


### Bug Fixes

* **calendar:** preserve native quota diagnostics and reuse verified actors ([88c464c](https://github.com/tutur3u/platform/commit/88c464c75ca1a51014e360ee92aabea0b16d919c))
* **calendar:** serve native timezone preferences from Web ([ec94bc2](https://github.com/tutur3u/platform/commit/ec94bc262c9ef7e89339309de1d23ff4045224db))
* **calendar:** serve native timezone preferences from Web ([#6573](https://github.com/tutur3u/platform/issues/6573)) ([a1bcec6](https://github.com/tutur3u/platform/commit/a1bcec69510d4efaaee91737a563c00ffc253dd4))
* **mobile:** address settings appearance review findings ([032cedd](https://github.com/tutur3u/platform/commit/032cedddcd74fe0f7c6d3d17023a888f9738b104))
* **mobile:** address settings appearance review r2 ([fe4883e](https://github.com/tutur3u/platform/commit/fe4883e775d74ac2ea79786f3323f1198c352c0d))
* **mobile:** address settings appearance review r3 ([c8c74e3](https://github.com/tutur3u/platform/commit/c8c74e3b9b2d684379f8558e1734e940429bf2de))
* **mobile:** align Assistant chat UX with web and shell ([#6424](https://github.com/tutur3u/platform/issues/6424)) ([158188b](https://github.com/tutur3u/platform/commit/158188ba2ad94c6a45d4bd9483388c4fd3cff886))
* **mobile:** avoid repeating the offset on fixed-offset timezone rows ([04f0acc](https://github.com/tutur3u/platform/commit/04f0accc1a5d888a3b3e858b169d9b88abf7ea1c))
* **mobile:** choose chat panes from the body width ([ca4a13d](https://github.com/tutur3u/platform/commit/ca4a13d97bb79701e34b9f3ce5b930685d907fa5))
* **mobile:** correct timezone quotas and rejection diagnostics ([#6430](https://github.com/tutur3u/platform/issues/6430)) ([8d36fa7](https://github.com/tutur3u/platform/commit/8d36fa73d757b6f66aeb697c57f7dc6cfc721a61))
* **mobile:** gate every serialized Lucide glyph and keep holes open ([2645e02](https://github.com/tutur3u/platform/commit/2645e024caa4ef84715f45409f4ecfdb9d4aeb25))
* **mobile:** harden sheet host Back, search placement and Android exit ([00605a7](https://github.com/tutur3u/platform/commit/00605a797af7c2d7d59e0e52700af2863f1b7949))
* **mobile:** keep codemod imports in the package import block ([782e16d](https://github.com/tutur3u/platform/commit/782e16d14dfa4a06df998a174a1fd7ff995bc3fb))
* **mobile:** keep incoming constraints for tap-target visuals ([f073278](https://github.com/tutur3u/platform/commit/f073278b695ab61d8d577ec4dfda3f32bf06c59d))
* **mobile:** keep queued threshold saves visible and polish Settings &gt; Apps ([b5a17db](https://github.com/tutur3u/platform/commit/b5a17db204b21c92876c4cd41a43bbe6b7e18d0a))
* **mobile:** keep shell body mounted across rail and dock switches ([946273b](https://github.com/tutur3u/platform/commit/946273bf537add2d6904f52f256bdc9410a37f4d))
* **mobile:** keep the calendar month grid above the dock ([f00d1e9](https://github.com/tutur3u/platform/commit/f00d1e9300dfed422557ed6bb1e4304c45ae8033))
* **mobile:** move the portfolio project title and Back into the shell ([7ae91f4](https://github.com/tutur3u/platform/commit/7ae91f4f6e2f701af973a450bfbef436cde998ff))
* **mobile:** nest Lucide contours by the true curve and test what users see ([539df0a](https://github.com/tutur3u/platform/commit/539df0ac0eee936ee8be6ef978d682c39c412da4))
* **mobile:** pad design-system buttons to 48dp tap targets ([b5202ca](https://github.com/tutur3u/platform/commit/b5202cad9d4097e1646012aa5663d424e9fb1d63))
* **mobile:** prevent agenda crashes from native timezone aliases ([#6598](https://github.com/tutur3u/platform/issues/6598)) ([ee8789b](https://github.com/tutur3u/platform/commit/ee8789b74011d127822e33af9a9559b039bb21c7))
* **mobile:** refresh saved request threshold and reach far search jumps ([ea552e0](https://github.com/tutur3u/platform/commit/ea552e01154cf4432e05d9c2fdd5a0cf332fd3a0))
* **mobile:** resolve native timezone aliases with complete data ([5ca3926](https://github.com/tutur3u/platform/commit/5ca39268bfc7a9c9816cbb4c307389b72f9602c1))
* **mobile:** reuse shell test app within shadcn ratchet ([8762b2d](https://github.com/tutur3u/platform/commit/8762b2d94d6af88a5b3e592648c8a17366d585e9))
* **mobile:** reuse shell test app within shadcn ratchet ([#6600](https://github.com/tutur3u/platform/issues/6600)) ([cfcaf87](https://github.com/tutur3u/platform/commit/cfcaf87ce06330484f235582a7f97a08a2d52bba))
* **mobile:** serialize Android exit Back and stop swallowing overlay Back ([92fc232](https://github.com/tutur3u/platform/commit/92fc2329f252c854ec94703c614c640e2be1caa4))
* **mobile:** share complete timezone data across app consumers ([2e4b108](https://github.com/tutur3u/platform/commit/2e4b1085c85e0d78083f9758ffd106e0c9a8b7df))
* **mobile:** share complete timezone data across app consumers ([#6601](https://github.com/tutur3u/platform/issues/6601)) ([c4aa21c](https://github.com/tutur3u/platform/commit/c4aa21cb43ded03feb5edb322d7332707a78dda9))
* **mobile:** shell chrome for project detail, body-width chat panes and month grid clearance ([#6544](https://github.com/tutur3u/platform/issues/6544)) ([e3f67e2](https://github.com/tutur3u/platform/commit/e3f67e254a6607f94594f7c62b2a710cc1743d76))
* **mobile:** show one friendly value line on Time zone rows ([178d2eb](https://github.com/tutur3u/platform/commit/178d2eb6c12b2e65ce20dc382403ce2debf68ccd))
* **mobile:** show one friendly value line on Time zone rows ([#6589](https://github.com/tutur3u/platform/issues/6589)) ([a2b7bb4](https://github.com/tutur3u/platform/commit/a2b7bb4d47a0d40651f9a494a95c3f20b6c728a5))
* **mobile:** stamp Android Back queries with a route generation ([c2b3624](https://github.com/tutur3u/platform/commit/c2b3624472caec853daccaf8a8521b2499608991))
* **mobile:** validate calendar timezone resolution ([0beebae](https://github.com/tutur3u/platform/commit/0beebaea403f83de85e90a24262c093793405ea4))
* **security:** repair native integrity CI and merge main ([667bfef](https://github.com/tutur3u/platform/commit/667bfef571dbb5b0e201bfa48ba3ed4000b7c522))
</details>

<details><summary>nova: 0.42.2</summary>

## [0.42.2](https://github.com/tutur3u/platform/compare/nova-v0.42.1...nova-v0.42.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([6127e0d](https://github.com/tutur3u/platform/commit/6127e0d51b1da4db97a3679d758e674ee110175e))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** reserve password attempts and close guest view grants ([7c1088c](https://github.com/tutur3u/platform/commit/7c1088c6a63f5e42ce6d7c5d00bbadaed1b90f29))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>playground: 0.6.2</summary>

## [0.6.2](https://github.com/tutur3u/platform/compare/playground-v0.6.1...playground-v0.6.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>tools: 0.22.2</summary>

## [0.22.2](https://github.com/tutur3u/platform/compare/tools-v0.22.1...tools-v0.22.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>redis: 1.1.1</summary>

## [1.1.1](https://github.com/tutur3u/platform/compare/redis-v1.1.0...redis-v1.1.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>rewise: 0.44.2</summary>

## [0.44.2](https://github.com/tutur3u/platform/compare/rewise-v0.44.1...rewise-v0.44.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>shortener: 0.24.2</summary>

## [0.24.2](https://github.com/tutur3u/platform/compare/shortener-v0.24.1...shortener-v0.24.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>tasks: 0.39.1</summary>

## [0.39.1](https://github.com/tutur3u/platform/compare/tasks-v0.39.0...tasks-v0.39.1) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **database:** restrict internal definer functions and add caller checks ([#6557](https://github.com/tutur3u/platform/issues/6557)) ([0c665ae](https://github.com/tutur3u/platform/commit/0c665ae14a97455872e0fa05b3a8c31f229e789c))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **security:** fence temporary types and preserve managed definers ([83623b2](https://github.com/tutur3u/platform/commit/83623b2bf287c2581bb46aa7a05652409cfe31b1))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>teach: 0.27.2</summary>

## [0.27.2](https://github.com/tutur3u/platform/compare/teach-v0.27.1...teach-v0.27.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>pay: 0.21.2</summary>

## [0.21.2](https://github.com/tutur3u/platform/compare/pay-v0.21.1...pay-v0.21.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
* **security:** sanitize caught-error logs and widen SAML entity ID schemes ([fe834f3](https://github.com/tutur3u/platform/commit/fe834f3987d5dcb7eb81b8f59c0401bab8a7b109))
* **security:** strip control characters from request-derived log values ([ba4f748](https://github.com/tutur3u/platform/commit/ba4f748d71f2cd37abd18c41796bf5a5fb171a4f))
</details>

<details><summary>contacts: 0.28.3</summary>

## [0.28.3](https://github.com/tutur3u/platform/compare/contacts-v0.28.2...contacts-v0.28.3) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>forms: 0.19.2</summary>

## [0.19.2](https://github.com/tutur3u/platform/compare/forms-v0.19.1...forms-v0.19.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>git: 0.14.2</summary>

## [0.14.2](https://github.com/tutur3u/platform/compare/git-v0.14.1...git-v0.14.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>track: 0.30.2</summary>

## [0.30.2](https://github.com/tutur3u/platform/compare/track-v0.30.1...track-v0.30.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>agent-quota: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/agent-quota-v0.1.0...agent-quota-v0.2.0) (2026-10-24)


### Features

* **agent-quota:** add local quota routing ([#6449](https://github.com/tutur3u/platform/issues/6449)) ([ec634b5](https://github.com/tutur3u/platform/commit/ec634b5054eae5ad0d43023bc7dd94729a3d31b7))
* **agent-quota:** add shared-pool admission and safe recovery hooks ([4c4c8aa](https://github.com/tutur3u/platform/commit/4c4c8aa360e688017e3ad377420a1d1d0e917d5e))
* **agent-quota:** add shared-pool admission and safe recovery hooks ([#6498](https://github.com/tutur3u/platform/issues/6498)) ([c29f74b](https://github.com/tutur3u/platform/commit/c29f74bfcb40256e623b3beee667265afd3c52c3))
* **agent-quota:** add turn-boundary watch and checkpoint gate ([64274eb](https://github.com/tutur3u/platform/commit/64274eba9843d7514bab698134441e5961f5a17b))
* **agent-quota:** enforce observed blocks before delegation ([f50b15b](https://github.com/tutur3u/platform/commit/f50b15b831834ac51fddb0bb420a9bb615cd5ff8))
* **agent-quota:** include Antigravity, freshness and active reservations ([#6482](https://github.com/tutur3u/platform/issues/6482)) ([1e83777](https://github.com/tutur3u/platform/commit/1e83777f6d1549daff673a67219bd533b5513ced))
* **agent-quota:** prefer healthy Claude for main roles ([95c4382](https://github.com/tutur3u/platform/commit/95c438264663ff5b34e29eca3762c5e07158b268))
* **agent-quota:** route fresh provider pools with active reservations ([a9dbe17](https://github.com/tutur3u/platform/commit/a9dbe175ea34ec546414a3c9e8dda6afefcea14c))


### Bug Fixes

* **agent-quota:** align usage parity and execution evidence ([91faf7f](https://github.com/tutur3u/platform/commit/91faf7f39f487924c453c12bac25c03ce1109b42))
* **agent-quota:** align usage parity and execution evidence ([#6559](https://github.com/tutur3u/platform/issues/6559)) ([3855326](https://github.com/tutur3u/platform/commit/3855326c61dc118424a12b4c4c3d45258258928b))
* **agent-quota:** block stale exhausted pools in admission ([b11d75e](https://github.com/tutur3u/platform/commit/b11d75e75586fdf29a28f850d639406761282e7e))
* **agent-quota:** bound admission transactions and expire resets ([2a749e9](https://github.com/tutur3u/platform/commit/2a749e9510be471d6217077b8c344925c02378f1))
* **agent-quota:** bound concurrent admissions and stale observations ([cc683fd](https://github.com/tutur3u/platform/commit/cc683fd41fc4cf9f944dcb106865a0c74eabcaf9))
* **agent-quota:** bound future and concurrent admissions ([7d7a526](https://github.com/tutur3u/platform/commit/7d7a526af8f83876c2fdb005d3f543c537bf623f))
* **agent-quota:** close concurrent admission review findings ([572e11f](https://github.com/tutur3u/platform/commit/572e11f3cfc3afeb452a3c48ddf8862b2a55d82d))
* **agent-quota:** close quota parity fail-open gaps ([d1fa232](https://github.com/tutur3u/platform/commit/d1fa23263a7d56748bc49b4e00227904dcb7911d))
* **agent-quota:** close r6 quota routing findings ([a872b24](https://github.com/tutur3u/platform/commit/a872b244538d8ea044bac7743aa32f342db94c2a))
* **agent-quota:** close watch and checkpoint review gaps ([c2f8a0d](https://github.com/tutur3u/platform/commit/c2f8a0d643ec58804945e44da3c20f1be668cd4a))
* **agent-quota:** decouple quarantine retention ([b4bb020](https://github.com/tutur3u/platform/commit/b4bb0202c0f7b4ba6117021cbe40415f7c2fe39c))
* **agent-quota:** expose model options in lower catalog ([ad95ab8](https://github.com/tutur3u/platform/commit/ad95ab8f10759b849b991820ac629c285e6a2e74))
* **agent-quota:** fail closed when T3 activity is unknown ([2a8dbc4](https://github.com/tutur3u/platform/commit/2a8dbc42edc5abe78b21f6db0d3f0ac57860a52c))
* **agent-quota:** harden state and usage ordering ([#6562](https://github.com/tutur3u/platform/issues/6562)) ([b096e15](https://github.com/tutur3u/platform/commit/b096e15070212e0a47aedde05961def76cac028a))
* **agent-quota:** honor scoped usage and completed limit receipts ([c857df7](https://github.com/tutur3u/platform/commit/c857df7adc39f83430c4202de4346aa53919751e))
* **agent-quota:** preserve Codex quota sample freshness ([08ecc52](https://github.com/tutur3u/platform/commit/08ecc527bf44100faeb28cd17d54550d4c749ba7))
* **agent-quota:** preserve safe state and usage ordering ([ad4306e](https://github.com/tutur3u/platform/commit/ad4306e6c89985b49d632300f339758383faf54d))
* **agent-quota:** preserve scoped future quarantines ([061e671](https://github.com/tutur3u/platform/commit/061e67131491a663aeb7e0a99b67f329c8d419ce))
* **agent-quota:** preserve scoped future quarantines ([#6525](https://github.com/tutur3u/platform/issues/6525)) ([a93da99](https://github.com/tutur3u/platform/commit/a93da9986a60a2f843a1df18aa79d9d4103f8a41))
* **agent-quota:** quarantine future receipts per pool ([d65b960](https://github.com/tutur3u/platform/commit/d65b96048dc78d7ccdc025a8897eb15f65cae3c2))
* **agent-quota:** reconcile shared usage and scoped receipts ([7fe096f](https://github.com/tutur3u/platform/commit/7fe096fcea1f5d3e4ff41e90a071bf4043c4dcdf))
* **agent-quota:** reject mismatched usage snapshots ([092a88e](https://github.com/tutur3u/platform/commit/092a88ebb5bfd485670a89cee60a224dfcceb0f1))
* **agent-quota:** reject undated Claude limit events ([126af89](https://github.com/tutur3u/platform/commit/126af898c3d1f45bef9090a42f90b4e81f170478))
* **agent-quota:** retain expired imported reset windows ([440d197](https://github.com/tutur3u/platform/commit/440d1971ab26b05e0abadef42a9edc1be6ddb30b))
* **agent-quota:** retain expired imported reset windows ([#6606](https://github.com/tutur3u/platform/issues/6606)) ([4546627](https://github.com/tutur3u/platform/commit/454662732ff7d7794db358736ba501f3d506d5a9))
* **agent-quota:** scan only terminal provider receipts ([f859de1](https://github.com/tutur3u/platform/commit/f859de1be6e30c928a2c460354b2516baa013e98))
* **agent-quota:** scope capacity cooldowns to selected models ([dc2ed3f](https://github.com/tutur3u/platform/commit/dc2ed3f4eadd27c5e6622f49be1d19d03a7d172f))
* **agent-quota:** skip invalid manual observations ([a9fce4f](https://github.com/tutur3u/platform/commit/a9fce4f9a5bfc63305c53f86087da6575896ac10))
* **agent-quota:** validate bounded future quarantines ([1681459](https://github.com/tutur3u/platform/commit/1681459e04e38784095079d0db7d2084d34423ee))
</details>

<details><summary>ai: 0.18.3</summary>

## [0.18.3](https://github.com/tutur3u/platform/compare/ai-v0.18.2...ai-v0.18.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
</details>

<details><summary>apis: 0.13.1</summary>

## [0.13.1](https://github.com/tutur3u/platform/compare/apis-v0.13.0...apis-v0.13.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([6127e0d](https://github.com/tutur3u/platform/commit/6127e0d51b1da4db97a3679d758e674ee110175e))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** reserve password attempts and close guest view grants ([7c1088c](https://github.com/tutur3u/platform/commit/7c1088c6a63f5e42ce6d7c5d00bbadaed1b90f29))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
</details>

<details><summary>auth: 0.7.1</summary>

## [0.7.1](https://github.com/tutur3u/platform/compare/auth-v0.7.0...auth-v0.7.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>devbox: 0.3.3</summary>

## [0.3.3](https://github.com/tutur3u/platform/compare/devbox-v0.3.2...devbox-v0.3.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>education-core: 0.5.1</summary>

## [0.5.1](https://github.com/tutur3u/platform/compare/education-core-v0.5.0...education-core-v0.5.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>editor: 0.8.3</summary>

## [0.8.3](https://github.com/tutur3u/platform/compare/editor-v0.8.2...editor-v0.8.3) (2026-10-24)


### Bug Fixes

* **security:** harden regexes, escaping and key handling in shared packages ([d518804](https://github.com/tutur3u/platform/commit/d518804d9fe811cfba3a1ff04a6f253d4fa44c1d))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
</details>

<details><summary>finance-core: 0.4.3</summary>

## [0.4.3](https://github.com/tutur3u/platform/compare/finance-core-v0.4.2...finance-core-v0.4.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>payment-core: 0.6.1</summary>

## [0.6.1](https://github.com/tutur3u/platform/compare/payment-core-v0.6.0...payment-core-v0.6.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
* **security:** sanitize caught-error logs and widen SAML entity ID schemes ([fe834f3](https://github.com/tutur3u/platform/commit/fe834f3987d5dcb7eb81b8f59c0401bab8a7b109))
* **security:** strip control characters from request-derived log values ([ba4f748](https://github.com/tutur3u/platform/commit/ba4f748d71f2cd37abd18c41796bf5a5fb171a4f))
</details>

<details><summary>games: 0.1.3</summary>

## [0.1.3](https://github.com/tutur3u/platform/compare/games-v0.1.2...games-v0.1.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>google: 0.1.2</summary>

## [0.1.2](https://github.com/tutur3u/platform/compare/google-v0.1.1...google-v0.1.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>hive-ui: 0.2.5</summary>

## [0.2.5](https://github.com/tutur3u/platform/compare/hive-ui-v0.2.4...hive-ui-v0.2.5) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>hooks: 0.1.3</summary>

## [0.1.3](https://github.com/tutur3u/platform/compare/hooks-v0.1.2...hooks-v0.1.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>icons: 0.1.2</summary>

## [0.1.2](https://github.com/tutur3u/platform/compare/icons-v0.1.1...icons-v0.1.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>internal-api: 0.55.0</summary>

## [0.55.0](https://github.com/tutur3u/platform/compare/internal-api-v0.54.0...internal-api-v0.55.0) (2026-10-24)


### Features

* **security:** add staged native integrity verification ([b9155e4](https://github.com/tutur3u/platform/commit/b9155e45bba5486b9943a4dc3e9cb9b2aedb8b14))
* **security:** add staged native integrity verification ([#6575](https://github.com/tutur3u/platform/issues/6575)) ([332368d](https://github.com/tutur3u/platform/commit/332368dd35586096f314355eb6bc8f7904ed0868))


### Bug Fixes

* **calendar:** preserve native quota diagnostics and reuse verified actors ([88c464c](https://github.com/tutur3u/platform/commit/88c464c75ca1a51014e360ee92aabea0b16d919c))
* **calendar:** serve native timezone preferences from Web ([ec94bc2](https://github.com/tutur3u/platform/commit/ec94bc262c9ef7e89339309de1d23ff4045224db))
* **calendar:** serve native timezone preferences from Web ([#6573](https://github.com/tutur3u/platform/issues/6573)) ([a1bcec6](https://github.com/tutur3u/platform/commit/a1bcec69510d4efaaee91737a563c00ffc253dd4))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([6127e0d](https://github.com/tutur3u/platform/commit/6127e0d51b1da4db97a3679d758e674ee110175e))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** harden regexes, escaping and key handling in shared packages ([d518804](https://github.com/tutur3u/platform/commit/d518804d9fe811cfba3a1ff04a6f253d4fa44c1d))
* **security:** prevent native integrity fallback downgrades ([c1d5f41](https://github.com/tutur3u/platform/commit/c1d5f41c9b197dbe62e33e3cce49a7c00c5c0ebf))
* **security:** repair native integrity CI and merge main ([667bfef](https://github.com/tutur3u/platform/commit/667bfef571dbb5b0e201bfa48ba3ed4000b7c522))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
</details>

<details><summary>inventory-core: 0.11.1</summary>

## [0.11.1](https://github.com/tutur3u/platform/compare/inventory-core-v0.11.0...inventory-core-v0.11.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
</details>

<details><summary>legal: 0.3.2</summary>

## [0.3.2](https://github.com/tutur3u/platform/compare/legal-v0.3.1...legal-v0.3.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>masonry: 0.5.2</summary>

## [0.5.2](https://github.com/tutur3u/platform/compare/masonry-v0.5.1...masonry-v0.5.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>microsoft: 0.1.2</summary>

## [0.1.2](https://github.com/tutur3u/platform/compare/microsoft-v0.1.1...microsoft-v0.1.2) (2026-10-24)


### Bug Fixes

* **deps:** patch high-severity advisories ([f263ae6](https://github.com/tutur3u/platform/commit/f263ae6e96baa799d43aaa7e3f4cbb2e9010b4ce))
* **deps:** patch high-severity advisories ([#6569](https://github.com/tutur3u/platform/issues/6569)) ([a67ca56](https://github.com/tutur3u/platform/commit/a67ca56759b100a61a0bec792b40c049a2c44681))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>mind-core: 0.2.3</summary>

## [0.2.3](https://github.com/tutur3u/platform/compare/mind-core-v0.2.2...mind-core-v0.2.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>mind-ui: 0.3.1</summary>

## [0.3.1](https://github.com/tutur3u/platform/compare/mind-ui-v0.3.0...mind-ui-v0.3.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>offline: 0.2.2</summary>

## [0.2.2](https://github.com/tutur3u/platform/compare/offline-v0.2.1...offline-v0.2.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden apps and offline file access ([f41dd6c](https://github.com/tutur3u/platform/commit/f41dd6cadb6f7217da984ed1df0fbc8d595972fd))
* **security:** harden apps and offline file access ([#6529](https://github.com/tutur3u/platform/issues/6529)) ([1883927](https://github.com/tutur3u/platform/commit/18839272a06409a999d9201f297a5298fc728f9b))
</details>

<details><summary>payment: 0.4.3</summary>

## [0.4.3](https://github.com/tutur3u/platform/compare/payment-v0.4.2...payment-v0.4.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>realtime: 0.10.3</summary>

## [0.10.3](https://github.com/tutur3u/platform/compare/realtime-v0.10.2...realtime-v0.10.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>satellite: 0.25.1</summary>

## [0.25.1](https://github.com/tutur3u/platform/compare/satellite-v0.25.0...satellite-v0.25.1) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **meet:** clarify join states and repair theme initialization ([#6506](https://github.com/tutur3u/platform/issues/6506)) ([f641b5b](https://github.com/tutur3u/platform/commit/f641b5b7def874eeeb4f8562429bd2584aa7eb07))
* **security:** verify workspace avatar paths before deleting storage objects ([#6501](https://github.com/tutur3u/platform/issues/6501)) ([bc2b6c6](https://github.com/tutur3u/platform/commit/bc2b6c652138810cf5afab7464d23b073cd9dba2))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>sdk: 0.29.0</summary>

## [0.29.0](https://github.com/tutur3u/platform/compare/sdk-v0.28.0...sdk-v0.29.0) (2026-10-24)


### Features

* **devbox:** stop whole job process groups and support remote stop ([#6446](https://github.com/tutur3u/platform/issues/6446)) ([cd4dcd0](https://github.com/tutur3u/platform/commit/cd4dcd0f52fb4396a342b32af93516891b3bcb86))
* **sdk:** add cross-project worker-token budgets to ttr resources ([9e7129d](https://github.com/tutur3u/platform/commit/9e7129d1d965a4f91227958a7d0f3f9c43edb1f2))
* **sdk:** add cross-project worker-token budgets to ttr resources ([#6558](https://github.com/tutur3u/platform/issues/6558)) ([bb0b74f](https://github.com/tutur3u/platform/commit/bb0b74f78a9f5d74b5b3f67562378c0e17aeab64))
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
* **sdk:** exclude shared test fixtures from the portable build ([acf283d](https://github.com/tutur3u/platform/commit/acf283dbf182a074ad4b3b8919c0b60a8b343c68))
* **sdk:** exclude shared test fixtures from the portable build ([#6586](https://github.com/tutur3u/platform/issues/6586)) ([a240202](https://github.com/tutur3u/platform/commit/a240202cf9a03d701902a915558566aa993839d8))
* **sdk:** fail toward admission for ambiguous Node option values ([83961be](https://github.com/tutur3u/platform/commit/83961be640281145987ac3b985a77196a4518aa9))
* **sdk:** fence upgrades atomically and cap ambiguous test workers ([3058bca](https://github.com/tutur3u/platform/commit/3058bcae38718db8a7642126c0bd9c1355a0c64c))
* **sdk:** harden rollout recovery and fleet outcome reporting ([bc98c9e](https://github.com/tutur3u/platform/commit/bc98c9e6cad9c68bed7a39f9d4ca4c27be18c821))
* **sdk:** harden ttr resources nested admission and trivial bypass ([#6492](https://github.com/tutur3u/platform/issues/6492)) ([bb5ac64](https://github.com/tutur3u/platform/commit/bb5ac64ffbff72f3a17af3a2ef09e221ff1e1a40))
* **sdk:** hoist regex test so CodeQL can parse portable-build ([8291a33](https://github.com/tutur3u/platform/commit/8291a33a7a1406d357e240a60dbb03ebec6437e4))
* **sdk:** hoist regex test so CodeQL can parse portable-build ([#6543](https://github.com/tutur3u/platform/issues/6543)) ([8bfff65](https://github.com/tutur3u/platform/commit/8bfff658698cd1fe79a2e15f095296bdfbee83d0))
* **sdk:** identify unmanaged launchers before budget upgrade checks ([c61ad90](https://github.com/tutur3u/platform/commit/c61ad909048fb6d1839bfc719b4350c520213bb8))
* **sdk:** isolate version probes and serialize dev publication ([dde6fec](https://github.com/tutur3u/platform/commit/dde6fec7a7b1dafb0c377da441400cef5bc6b05d))
* **sdk:** merge Node hardening and gate budget rollout ([94717f3](https://github.com/tutur3u/platform/commit/94717f37aad0cd030fa56a930e541dbc278683c7))
* **sdk:** never admit ttr through its own bun shim ([28d8d35](https://github.com/tutur3u/platform/commit/28d8d358a59b00085e5cf6f207a6344cd9c57469))
* **sdk:** preserve version contracts and recover dev packing safely ([107e5fd](https://github.com/tutur3u/platform/commit/107e5fddfd5bb588922276dcfa1da74c4e0c7bca))
* **sdk:** recognise the shipped CLI admission boundary ([ae48013](https://github.com/tutur3u/platform/commit/ae4801366b6ca72bc88dd50d5edf83fd986eb75d))
* **sdk:** reconcile resource fixtures and portable qualification ([e273523](https://github.com/tutur3u/platform/commit/e273523db0dd1fc62bff1e1ffa9e172b7e9a63fc))
* **sdk:** remove orphaned Judge containers and drop bare-pid kills ([#6461](https://github.com/tutur3u/platform/issues/6461)) ([78f2aa0](https://github.com/tutur3u/platform/commit/78f2aa01c51b5c58aef9f494fc76f0e717fde113))
* **sdk:** reserve reclaim capacity and enforce budget workers ([8e24af8](https://github.com/tutur3u/platform/commit/8e24af893bd66bf5634d535e7879ca41ed245f2b))
* **sdk:** validate trusted devbox executable input ([8319562](https://github.com/tutur3u/platform/commit/83195629745a9524fa3170bc7ddb31453fb35f20))
* **sdk:** validate trusted devbox executable input ([#6583](https://github.com/tutur3u/platform/issues/6583)) ([52c7c3d](https://github.com/tutur3u/platform/commit/52c7c3df008ee20b95f24e0213427dc5ad44be70))
* **security:** correct SDK atomic file typing ([87c7532](https://github.com/tutur3u/platform/commit/87c7532260f81ba8b1361919acb1c7d2107b0389))
* **security:** harden SDK file and token handling ([1a91433](https://github.com/tutur3u/platform/commit/1a91433743d4de9d5c6888e448d373acd7209eb7))
* **security:** harden SDK file and token handling ([#6526](https://github.com/tutur3u/platform/issues/6526)) ([a9e410b](https://github.com/tutur3u/platform/commit/a9e410b8ecee04b3794a949fd47fb517b94173a5))
* **security:** repair native integrity CI and merge main ([667bfef](https://github.com/tutur3u/platform/commit/667bfef571dbb5b0e201bfa48ba3ed4000b7c522))
* **tooling:** clamp native checker threads and print concise usage ([dc5d608](https://github.com/tutur3u/platform/commit/dc5d608c72582c3c6fc64310055f396ab23a5a75))
* **tooling:** enforce validation arguments and native checker admission ([6e787d1](https://github.com/tutur3u/platform/commit/6e787d1d34ca54e5015a98b4fa4438f68de8dc5e))
</details>

<details><summary>sso: 1.0.0</summary>

## 1.0.0 (2026-10-24)


### Bug Fixes

* **security:** harden regexes, escaping and key handling in shared packages ([d518804](https://github.com/tutur3u/platform/commit/d518804d9fe811cfba3a1ff04a6f253d4fa44c1d))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
* **security:** sanitize caught-error logs and widen SAML entity ID schemes ([fe834f3](https://github.com/tutur3u/platform/commit/fe834f3987d5dcb7eb81b8f59c0401bab8a7b109))
</details>

<details><summary>storage-core: 0.3.3</summary>

## [0.3.3](https://github.com/tutur3u/platform/compare/storage-core-v0.3.2...storage-core-v0.3.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
</details>

<details><summary>supabase: 0.6.1</summary>

## [0.6.1](https://github.com/tutur3u/platform/compare/supabase-v0.6.0...supabase-v0.6.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>tasks-api: 0.5.3</summary>

## [0.5.3](https://github.com/tutur3u/platform/compare/tasks-api-v0.5.2...tasks-api-v0.5.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>tasks-ui: 0.17.3</summary>

## [0.17.3](https://github.com/tutur3u/platform/compare/tasks-ui-v0.17.2...tasks-ui-v0.17.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden regexes, escaping and key handling in shared packages ([d518804](https://github.com/tutur3u/platform/commit/d518804d9fe811cfba3a1ff04a6f253d4fa44c1d))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
</details>

<details><summary>transactional: 1.1.2</summary>

## [1.1.2](https://github.com/tutur3u/platform/compare/transactional-v1.1.1...transactional-v1.1.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>trigger: 0.4.1</summary>

## [0.4.1](https://github.com/tutur3u/platform/compare/trigger-v0.4.0...trigger-v0.4.1) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>turnstile: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/turnstile-v0.1.3...turnstile-v0.2.0) (2026-10-24)


### Features

* **security:** add staged native integrity verification ([b9155e4](https://github.com/tutur3u/platform/commit/b9155e45bba5486b9943a4dc3e9cb9b2aedb8b14))
* **security:** add staged native integrity verification ([#6575](https://github.com/tutur3u/platform/issues/6575)) ([332368d](https://github.com/tutur3u/platform/commit/332368dd35586096f314355eb6bc8f7904ed0868))


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>types: 0.37.0</summary>

## [0.37.0](https://github.com/tutur3u/platform/compare/types-v0.36.0...types-v0.37.0) (2026-10-24)


### Features

* **devbox:** separate runner trust pools and add an observable drain ([#6450](https://github.com/tutur3u/platform/issues/6450)) ([64401ab](https://github.com/tutur3u/platform/commit/64401abf6f74b9c008d020ed0428ec043d23fc6d))
* **sdk:** offload saturated resource runs to trusted devbox runners ([#6454](https://github.com/tutur3u/platform/issues/6454)) ([59bce45](https://github.com/tutur3u/platform/commit/59bce451809baf5f62185d172833a99fb5ad0a7c))


### Bug Fixes

* **auth:** add per-account MFA verification limits ([95205fe](https://github.com/tutur3u/platform/commit/95205fe35733b55c9eb1d6cf03f47ec3ba2318f0))
* **auth:** add per-account MFA verification limits ([#6555](https://github.com/tutur3u/platform/issues/6555)) ([b4d67f0](https://github.com/tutur3u/platform/commit/b4d67f008ac7f9a2e103d4f35d039175acc0bf5b))
* **database:** scope email helper to the current caller ([cf7f104](https://github.com/tutur3u/platform/commit/cf7f10431776bb03389439c4698c87cb6269b586))
* **database:** scope email helper to the current caller ([#6550](https://github.com/tutur3u/platform/issues/6550)) ([f261aa0](https://github.com/tutur3u/platform/commit/f261aa03faa17c834a649f6d2cccb5dc9f84bdd8))
* **database:** tighten notification email access ([4b4e13b](https://github.com/tutur3u/platform/commit/4b4e13bb352c1b370bfcda02836be563b7cf05a5))
* **database:** tighten notification email access ([#6552](https://github.com/tutur3u/platform/issues/6552)) ([d9161cc](https://github.com/tutur3u/platform/commit/d9161ccb52569144418f18a7afc11a19ef6eb4c7))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **devbox:** cancel lost offload creates by key and page logs by run cursor ([aace86b](https://github.com/tutur3u/platform/commit/aace86bdbdef0f44ae31562c61dd2174463a384c))
* **devbox:** roll out the run log cursor without a long table lock ([6b6b09e](https://github.com/tutur3u/platform/commit/6b6b09e2bda26e6ea5596b4a62877a82b66df3cc))
* **security:** harden guest and challenge password verification ([6127e0d](https://github.com/tutur3u/platform/commit/6127e0d51b1da4db97a3679d758e674ee110175e))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
</details>

<details><summary>typescript-config: 0.1.3</summary>

## [0.1.3](https://github.com/tutur3u/platform/compare/typescript-config-v0.1.2...typescript-config-v0.1.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>ui: 0.39.3</summary>

## [0.39.3](https://github.com/tutur3u/platform/compare/ui-v0.39.2...ui-v0.39.3) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([ab4b75e](https://github.com/tutur3u/platform/commit/ab4b75ee65bc942e3d113243d8c9a48a8af4b0aa))
* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **security:** harden guest and challenge password verification ([6127e0d](https://github.com/tutur3u/platform/commit/6127e0d51b1da4db97a3679d758e674ee110175e))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** harden regexes, escaping and key handling in shared packages ([d518804](https://github.com/tutur3u/platform/commit/d518804d9fe811cfba3a1ff04a6f253d4fa44c1d))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **ui:** keep markdown paste conversion from stalling on rejected list lines ([8dbd2c9](https://github.com/tutur3u/platform/commit/8dbd2c98ae4e09b6d5e270849e38d523f9b17fdf))
</details>

<details><summary>users-core: 0.11.2</summary>

## [0.11.2](https://github.com/tutur3u/platform/compare/users-core-v0.11.1...users-core-v0.11.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([ab4b75e](https://github.com/tutur3u/platform/commit/ab4b75ee65bc942e3d113243d8c9a48a8af4b0aa))
* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **notifications:** guard wildcard invite email filters ([c9f8ac8](https://github.com/tutur3u/platform/commit/c9f8ac8d227e9d2d9adc95753dbacc7448a09d99))
* **notifications:** match unclaimed email invites ([0106ff5](https://github.com/tutur3u/platform/commit/0106ff5cec660bafd6dac35b66d0a88939830777))
* **users-core:** use confirmed email for invite access ([042730e](https://github.com/tutur3u/platform/commit/042730e1624f81997edad4b6f24d9193fdc4b2b7))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>users-ui: 0.7.10</summary>

## [0.7.10](https://github.com/tutur3u/platform/compare/users-ui-v0.7.9...users-ui-v0.7.10) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>utils: 0.38.1</summary>

## [0.38.1](https://github.com/tutur3u/platform/compare/utils-v0.38.0...utils-v0.38.1) (2026-10-24)


### Bug Fixes

* **auth:** add per-account MFA verification limits ([95205fe](https://github.com/tutur3u/platform/commit/95205fe35733b55c9eb1d6cf03f47ec3ba2318f0))
* **auth:** add per-account MFA verification limits ([#6555](https://github.com/tutur3u/platform/issues/6555)) ([b4d67f0](https://github.com/tutur3u/platform/commit/b4d67f008ac7f9a2e103d4f35d039175acc0bf5b))
* **auth:** reserve MFA attempts atomically and restrict the hook ([0c945d5](https://github.com/tutur3u/platform/commit/0c945d5c528c64d3842033bb8bc6eaa262f44bb6))
* **calendar:** preserve native quota diagnostics and reuse verified actors ([88c464c](https://github.com/tutur3u/platform/commit/88c464c75ca1a51014e360ee92aabea0b16d919c))
* **calendar:** serve native timezone preferences from Web ([#6573](https://github.com/tutur3u/platform/issues/6573)) ([a1bcec6](https://github.com/tutur3u/platform/commit/a1bcec69510d4efaaee91737a563c00ffc253dd4))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **mobile:** correct timezone quotas and rejection diagnostics ([#6430](https://github.com/tutur3u/platform/issues/6430)) ([8d36fa7](https://github.com/tutur3u/platform/commit/8d36fa73d757b6f66aeb697c57f7dc6cfc721a61))
* **security:** build request-keyed records without prototype setters ([012dbe1](https://github.com/tutur3u/platform/commit/012dbe18612f9ca5a18c15049df04d0a622ab1e2))
* **security:** derive client IP from trusted proxy headers ([cf2caa9](https://github.com/tutur3u/platform/commit/cf2caa93418d3e2b912bd14654d3ba4ed197fad5))
* **security:** derive client IP from trusted proxy headers ([#6554](https://github.com/tutur3u/platform/issues/6554)) ([1af01f8](https://github.com/tutur3u/platform/commit/1af01f8897b1ba1f5e7d432d71df53612d61c548))
* **security:** harden guest and challenge password verification ([6127e0d](https://github.com/tutur3u/platform/commit/6127e0d51b1da4db97a3679d758e674ee110175e))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** harden request-keyed records, push previews and key handoff ([#6521](https://github.com/tutur3u/platform/issues/6521)) ([1c7dfb1](https://github.com/tutur3u/platform/commit/1c7dfb13762c6da6b1935e8ea409aa29dce4c747))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** reserve password attempts and close guest view grants ([7c1088c](https://github.com/tutur3u/platform/commit/7c1088c6a63f5e42ce6d7c5d00bbadaed1b90f29))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
* **security:** sanitize caught-error logs and widen SAML entity ID schemes ([fe834f3](https://github.com/tutur3u/platform/commit/fe834f3987d5dcb7eb81b8f59c0401bab8a7b109))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **security:** strip control characters from request-derived log values ([ba4f748](https://github.com/tutur3u/platform/commit/ba4f748d71f2cd37abd18c41796bf5a5fb171a4f))
* **security:** verify workspace avatar paths before deleting storage objects ([#6501](https://github.com/tutur3u/platform/issues/6501)) ([bc2b6c6](https://github.com/tutur3u/platform/commit/bc2b6c652138810cf5afab7464d23b073cd9dba2))
* **storage:** decode percent-encoded storage paths as UTF-8 ([b27a231](https://github.com/tutur3u/platform/commit/b27a2311d834499ae042defc878d2a7a747bb9f7))
* **storage:** reject encoded traversal paths ([#6507](https://github.com/tutur3u/platform/issues/6507)) ([b461f77](https://github.com/tutur3u/platform/commit/b461f7733b80e43036a9ae0d2e0188dd276b020e))
* **utils:** replace empty earlier duplicates in multi-value query parsing ([b0e6152](https://github.com/tutur3u/platform/commit/b0e61521a9c0a3a5d36b6f05948b9cfcab13fd7a))
</details>

<details><summary>vercel: 0.1.2</summary>

## [0.1.2](https://github.com/tutur3u/platform/compare/vercel-v0.1.1...vercel-v0.1.2) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>workflows: 0.0.3</summary>

## [0.0.3](https://github.com/tutur3u/platform/compare/workflows-v0.0.2...workflows-v0.0.3) (2026-10-24)


### Bug Fixes

* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
</details>

<details><summary>lettin: 1.5.2</summary>

## [1.5.2](https://github.com/tutur3u/platform/compare/lettin-v1.5.1...lettin-v1.5.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **deps:** pin Bun 1.4.4 for its security fixes ([#6427](https://github.com/tutur3u/platform/issues/6427)) ([4fac363](https://github.com/tutur3u/platform/commit/4fac363e43a7f17b38c2a2f63e076b2e3367f84a))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>parley: 1.4.2</summary>

## [1.4.2](https://github.com/tutur3u/platform/compare/parley-v1.4.1...parley-v1.4.2) (2026-10-24)


### Bug Fixes

* **auth:** repair account switching and notification access ([#6545](https://github.com/tutur3u/platform/issues/6545)) ([9afff45](https://github.com/tutur3u/platform/commit/9afff45a6c9113999ea750f6b452f94f184e0a11))
* **meet:** clarify join states and repair theme initialization ([#6506](https://github.com/tutur3u/platform/issues/6506)) ([f641b5b](https://github.com/tutur3u/platform/commit/f641b5b7def874eeeb4f8562429bd2584aa7eb07))
* **security:** harden guest and challenge password verification ([#6556](https://github.com/tutur3u/platform/issues/6556)) ([81253df](https://github.com/tutur3u/platform/commit/81253df6d976c47ecb33b6c1f295dc711c94e590))
* **security:** limit password attempts and enforce challenge grants ([a15d80f](https://github.com/tutur3u/platform/commit/a15d80f7026e4a7c9293a4426c842f9aee32ca5c))
* **security:** scope join budgets and refund verified attempts ([45166df](https://github.com/tutur3u/platform/commit/45166df12005b1fbfd1b6011cd64cd3e6a6981d5))
* **web:** secure notifications and account redirects ([8c597f4](https://github.com/tutur3u/platform/commit/8c597f4f5440b9c66aef93b463811696bceb17e5))
</details>

<details><summary>meet-core: 1.4.2</summary>

## [1.4.2](https://github.com/tutur3u/platform/compare/meet-core-v1.4.1...meet-core-v1.4.2) (2026-10-24)


### Bug Fixes

* **meet:** clarify join states and repair theme initialization ([#6506](https://github.com/tutur3u/platform/issues/6506)) ([f641b5b](https://github.com/tutur3u/platform/commit/f641b5b7def874eeeb4f8562429bd2584aa7eb07))
* **security:** harden regexes, escaping and key handling in shared packages ([d518804](https://github.com/tutur3u/platform/commit/d518804d9fe811cfba3a1ff04a6f253d4fa44c1d))
* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).