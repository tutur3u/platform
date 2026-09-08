# Changelog

## [0.25.0](https://github.com/tutur3u/platform/compare/meet-v0.24.2...meet-v0.25.0) (2026-09-07)


### Features

* **calendar:** add installable apps and bounded PWA caching ([f4b2a1c](https://github.com/tutur3u/platform/commit/f4b2a1cf7943783fddc45f537df73589f19594f6))
* **colab:** launch multiplayer prompt workshops on Cloudflare ([7a4a3f9](https://github.com/tutur3u/platform/commit/7a4a3f9b4a12a0d7439cdb296398a21c0cd8939f))
* **meet:** add Gemini transcripts notes and usage statistics ([9b0cb67](https://github.com/tutur3u/platform/commit/9b0cb6785e9463e6b60770deffdc32ac82e293b5))
* **meet:** add live Gemini transcripts, notes, and cost statistics ([#5232](https://github.com/tutur3u/platform/issues/5232)) ([c8c262a](https://github.com/tutur3u/platform/commit/c8c262a3f10e397dca7930d8c9442aba0b1293ec))
* **meet:** expose safe connection checks and media reconnect ([2dbd822](https://github.com/tutur3u/platform/commit/2dbd8229f9e93215cd94448d67b13d821bce2aa3))
* **meet:** host frontend and realtime on Cloudflare ([0dbdbed](https://github.com/tutur3u/platform/commit/0dbdbed731333ff4cd82b85f95e79049ef59600f))
* **meet:** host on Cloudflare and restrict meeting creation ([#5223](https://github.com/tutur3u/platform/issues/5223)) ([dff093b](https://github.com/tutur3u/platform/commit/dff093b4b6ade986ffd54f3c756d08589e47ad8e))
* **meet:** improve call controls and persistent room permissions ([a4e9a3c](https://github.com/tutur3u/platform/commit/a4e9a3cf729f5e39a92db56b360b0f223306663e))
* **meet:** improve call experience and persistent room controls ([#5247](https://github.com/tutur3u/platform/issues/5247)) ([efae606](https://github.com/tutur3u/platform/commit/efae606f9023fcb080fe795ef13933cfb34d8167))
* **meet:** integrate instant rooms with Calendar ([9631fd1](https://github.com/tutur3u/platform/commit/9631fd1373615f3e8be55dd028d54b441e78a023))
* **meet:** integrate instant rooms with Calendar ([#5248](https://github.com/tutur3u/platform/issues/5248)) ([5f3e77d](https://github.com/tutur3u/platform/commit/5f3e77df20e636fe270cdc7d1b1d88817a3f00bd))
* **meet:** simplify meeting actions ([9f5621e](https://github.com/tutur3u/platform/commit/9f5621eb014d8e9346cde13407dd2dede34aadac))


### Bug Fixes

* **calendar:** fail closed on linked event access ([9071075](https://github.com/tutur3u/platform/commit/90710750398ff0143f2a71f2b19c8631469018e9))
* **calendar:** harden PWA lifecycle and cache retention ([14565c0](https://github.com/tutur3u/platform/commit/14565c0106e74b947e152fd8bb787de7f70bc54d))
* **calendar:** recover failed syncs and redesign calendar views ([7d22948](https://github.com/tutur3u/platform/commit/7d22948095a29d236f698d42dde362fc38311dd0))
* **calendar:** recover failed syncs and redesign calendar views ([#5230](https://github.com/tutur3u/platform/issues/5230)) ([e52605d](https://github.com/tutur3u/platform/commit/e52605d671f921b1564746afcdedf2478deee78e))
* **mail:** harden Takeout imports and simplify Meet actions ([#5245](https://github.com/tutur3u/platform/issues/5245)) ([6244be3](https://github.com/tutur3u/platform/commit/6244be33cee9620c67c74e944aa62b74376b4260))
* **meet:** align meeting detail times with viewer timezone ([91085ff](https://github.com/tutur3u/platform/commit/91085ff851032201c3fdf0e8cc9dcfbb95a8574f))
* **meet:** bound retired publication history ([fb33179](https://github.com/tutur3u/platform/commit/fb3317967b092fc6e294362309e5bbbb5b58b706))
* **meet:** build workspace dependencies for Workers ([ff24894](https://github.com/tutur3u/platform/commit/ff2489472568fd90e83a17d234ddf93eaba239be))
* **meet:** clean up failed media startup and verify multiparty calls ([f0f9567](https://github.com/tutur3u/platform/commit/f0f9567cbe608f27d5b143065aaed422be88479b))
* **meet:** complete production playback and UI cleanup ([726fd7e](https://github.com/tutur3u/platform/commit/726fd7e46ada9366f11e318a17b4a7fde970decf))
* **meet:** complete production playback and UI cleanup ([#5228](https://github.com/tutur3u/platform/issues/5228)) ([5c7299e](https://github.com/tutur3u/platform/commit/5c7299efa88a6f4c58c70a77582d430f2bbb1a83))
* **meet:** confirm media transitions and finalize call resources ([dae1c06](https://github.com/tutur3u/platform/commit/dae1c06b72ea064b57436d7592eda1d834adb95a))
* **meet:** confirm missing profile display names once ([508e6f7](https://github.com/tutur3u/platform/commit/508e6f778a3ba90ea71cfc9b77a9a9d44e3361c8))
* **meet:** correct Cloudflare browser integrations and API access ([#5240](https://github.com/tutur3u/platform/issues/5240)) ([17c5341](https://github.com/tutur3u/platform/commit/17c5341abc85b517b93aab18be3edeec5377f339))
* **meet:** diagnose provider failures safely ([3f1bfbf](https://github.com/tutur3u/platform/commit/3f1bfbf35bd8e3cc4a7e6911462652d28049dfdf))
* **meet:** discard stale sender synchronization ([cf9ef24](https://github.com/tutur3u/platform/commit/cf9ef240772e5c0c69d796c81bfcfb96d5db1aaf))
* **meet:** explain missing devices and media activation failures ([b93d3bf](https://github.com/tutur3u/platform/commit/b93d3bf61a0f75a1f37141daad0d84ebbd3e38fb))
* **meet:** explain missing devices and media activation failures ([#5233](https://github.com/tutur3u/platform/issues/5233)) ([be066c3](https://github.com/tutur3u/platform/commit/be066c32be5df4b14ad400bfd87f018f39771bff))
* **meet:** guard publisher ledger after SDP awaits ([87eea9e](https://github.com/tutur3u/platform/commit/87eea9e0d28943f66f26619fd50b190c4021a6e4))
* **meet:** handle duplicate Calendar links ([f40c569](https://github.com/tutur3u/platform/commit/f40c56975ec38172e5a6417408b0598901e75dd2))
* **meet:** harden AI capture lifecycle and usage accounting ([e237fdb](https://github.com/tutur3u/platform/commit/e237fdbf7f0938e94d2d1a5d4a94e9c1d54a1de4))
* **meet:** harden remote playback and Worker validation ([2bf5e1b](https://github.com/tutur3u/platform/commit/2bf5e1bf04c3bc8531a0cbd1b987fa506f0113d6))
* **meet:** identify media publishing failures safely ([c3c6bdb](https://github.com/tutur3u/platform/commit/c3c6bdbcf8226d37a73c9a81550d9f61d9d2f7dd))
* **meet:** identify media publishing failures safely ([#5236](https://github.com/tutur3u/platform/issues/5236)) ([70454fe](https://github.com/tutur3u/platform/commit/70454fed6c6ed87f2dcbcb5118006914229c991e))
* **meet:** ignore obsolete playback events ([6e89441](https://github.com/tutur3u/platform/commit/6e89441e8c04105ce082ffc801045032383bb69f))
* **meet:** ignore superseded connection diagnostics ([bbe24e5](https://github.com/tutur3u/platform/commit/bbe24e54710292ee078ee75a66a79c95fb069522))
* **meet:** invalidate closed in-flight subscriptions ([ad9e5ee](https://github.com/tutur3u/platform/commit/ad9e5ee68498a9ce52e4d3184a5f4bbcf2f67b6b))
* **meet:** keep chat indicators current and clarify connection status ([91d2677](https://github.com/tutur3u/platform/commit/91d26776128f37e888a619c637db804135e82592))
* **meet:** keep reconnect replacements authoritative ([58307ef](https://github.com/tutur3u/platform/commit/58307efce6f762711950bbfde35cbdff06df714f))
* **meet:** keep unknown media errors actionable ([1b67bd4](https://github.com/tutur3u/platform/commit/1b67bd40e31d2f68cdf5294ab6ba4391cb4f78ea))
* **meet:** localize guest identity and keep archive access scoped ([d2a5a6c](https://github.com/tutur3u/platform/commit/d2a5a6cb59fcddc3d81ecccc87259e9604762836))
* **meet:** make Calendar scheduling atomic ([aa3a4cc](https://github.com/tutur3u/platform/commit/aa3a4cc46ccdfccfa7648923bcd8207a7a91467f))
* **meet:** make Calendar scheduling atomic ([#5249](https://github.com/tutur3u/platform/issues/5249)) ([a2914ca](https://github.com/tutur3u/platform/commit/a2914cabde82b4f9a5549801807f73e9d2c728b0))
* **meet:** normalize suggested participant names ([26dd289](https://github.com/tutur3u/platform/commit/26dd2896672236c1f2f541997088f8039599bb74))
* **meet:** place Gemini requests in a supported region ([3e5aea7](https://github.com/tutur3u/platform/commit/3e5aea7b2229aedb0664ba607b7c8e1822f7f27a))
* **meet:** preserve camera when effects supersede startup ([e0a5ef6](https://github.com/tutur3u/platform/commit/e0a5ef6b0d7954a99f23e3763c7e519ce93e16d3))
* **meet:** preserve collaborator admission and call identity ([9d3da4a](https://github.com/tutur3u/platform/commit/9d3da4a9c1043964e6b452ad259b1fe220563f03))
* **meet:** preserve invite access for external guests ([0546e4e](https://github.com/tutur3u/platform/commit/0546e4e4f1520eaf80a7f52861e845050232e0ae))
* **meet:** preserve invite access for external guests ([#5234](https://github.com/tutur3u/platform/issues/5234)) ([5d25d9e](https://github.com/tutur3u/platform/commit/5d25d9e37dc443534e53846b74578c8954459166))
* **meet:** preserve muted tracks and recover media peers ([4dc823a](https://github.com/tutur3u/platform/commit/4dc823af551c9b9e22137bd6143cb7210bc62432))
* **meet:** preserve muted tracks and recover media peers ([#5244](https://github.com/tutur3u/platform/issues/5244)) ([7249f42](https://github.com/tutur3u/platform/commit/7249f42104439cfe2ffabb8857fd480f8a139aec))
* **meet:** preserve quiet speech and notes refresh during finalization ([14756b8](https://github.com/tutur3u/platform/commit/14756b8712deb79c7c80e3d5e5e2453a3a1a1018))
* **meet:** preserve safe AI failure classifications ([0046adc](https://github.com/tutur3u/platform/commit/0046adcfc73704018a2ac50339a225f3e7faf23b))
* **meet:** preserve scheduled time and recover transient presence ([a49ef93](https://github.com/tutur3u/platform/commit/a49ef93b911f5f2642e52bba679e7e954519e03c))
* **meet:** preserve unrelated playback when peers leave ([3cf5c37](https://github.com/tutur3u/platform/commit/3cf5c37a64675b1d91769dc937080d6c52ce3312))
* **meet:** recover ended subscriptions and harden CI ([366e316](https://github.com/tutur3u/platform/commit/366e3162e4b775aa9244eac1756c01866ea3fb36))
* **meet:** recover uncertain publication state ([d6f7c5a](https://github.com/tutur3u/platform/commit/d6f7c5a36ea5c308a31420253dc44c3a44cde55e))
* **meet:** reject retired track publications ([6a1104e](https://github.com/tutur3u/platform/commit/6a1104e69e957d7ec712424df07662f091601e1b))
* **meet:** replace recovered publisher registrations ([fb98dcc](https://github.com/tutur3u/platform/commit/fb98dccdc064585d449974e170eb704514d174e2))
* **meet:** replace recovered publisher registrations ([#5246](https://github.com/tutur3u/platform/issues/5246)) ([229fa05](https://github.com/tutur3u/platform/commit/229fa0520c44d94bc5645adc07785801f4b71256))
* **meet:** report profile lookup fallback ([de4bee2](https://github.com/tutur3u/platform/commit/de4bee2bac09cb6c2132fcf00f0098144f55bf02))
* **meet:** restrict meeting hosts and restore reliable call media ([2a8a533](https://github.com/tutur3u/platform/commit/2a8a53355181fc8d429653506f7c845c02cf7ae9))
* **meet:** retire subscriber negotiation when tracks close ([1989132](https://github.com/tutur3u/platform/commit/198913244984d0f7cb1277a6165facce9e1e3fd2))
* **meet:** reuse device notifications when joining ([d781a2a](https://github.com/tutur3u/platform/commit/d781a2a2eed3f34bcec10cb4c00dd3170290bb78))
* **meet:** run Gemini requests from a supported region ([#5235](https://github.com/tutur3u/platform/issues/5235)) ([e2c9c44](https://github.com/tutur3u/platform/commit/e2c9c44b41b9961801fbbcce01180266c7b57209))
* **meet:** simplify admission and remember participant names ([#5243](https://github.com/tutur3u/platform/issues/5243)) ([f29491a](https://github.com/tutur3u/platform/commit/f29491a6b3fb7bd2abeef1c08726f268b6bd0bd3))
* **meet:** simplify admission and save participant names ([cc57ce5](https://github.com/tutur3u/platform/commit/cc57ce50b27ba071d346e78821bbd89ef05bd723))
* **meet:** verify authenticated Cloudflare deployments ([6dc9fef](https://github.com/tutur3u/platform/commit/6dc9fefba0eea446d2fad124c16c4ca934488564))
* **meet:** verify creator identity and recover blocked playback ([1242f71](https://github.com/tutur3u/platform/commit/1242f716c233f4c9fd20e4c931f16680117a2660))
* **meet:** wait for SFU connectivity and attach reused receivers ([#5241](https://github.com/tutur3u/platform/issues/5241)) ([76881f7](https://github.com/tutur3u/platform/commit/76881f70c5f6705efe46522347368161c0707cb4))
* **tasks:** preserve task and calendar drafts until saves finish ([34b4902](https://github.com/tutur3u/platform/commit/34b4902b0382a3aa9e10249a0d83205c9a530878))
* **tasks:** recover partial saves and display actionable errors ([c4887c9](https://github.com/tutur3u/platform/commit/c4887c98377fd8493f3e6ae4219763d8872e2a5b))

## [0.24.2](https://github.com/tutur3u/platform/compare/meet-v0.24.1...meet-v0.24.2) (2026-08-29)


### Performance Improvements

* **vercel:** serve every monorepo app from one function region ([4f0bf52](https://github.com/tutur3u/platform/commit/4f0bf52450899267b4ac9cd2bdecfcf07e3ea427))
* **vercel:** serve every monorepo app from one function region ([#5172](https://github.com/tutur3u/platform/issues/5172)) ([b09d4bd](https://github.com/tutur3u/platform/commit/b09d4bd520a7543d6b88140715d8cc0b5c461711))

## [0.24.1](https://github.com/tutur3u/platform/compare/meet-v0.24.0...meet-v0.24.1) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))

## [0.24.0](https://github.com/tutur3u/platform/compare/meet-v0.23.0...meet-v0.24.0) (2026-08-20)


### Features

* **tasks:** explain sorted drag ordering ([49350ad](https://github.com/tutur3u/platform/commit/49350ad5160de432eca0d42e582f9e54816fae11))

## [0.23.0](https://github.com/tutur3u/platform/compare/meet-v0.22.2...meet-v0.23.0) (2026-08-14)


### Features

* **workspaces:** revamp invitation access flow ([7ea94af](https://github.com/tutur3u/platform/commit/7ea94afc2c5e14af1c83d1478ad9c006268b13c0))
* **workspaces:** support multi-role invitations ([f6f78ba](https://github.com/tutur3u/platform/commit/f6f78bac6c2120fd70c09e85c075c4206be4f897))


### Bug Fixes

* **satellites:** harden invited workspace access ([3c60571](https://github.com/tutur3u/platform/commit/3c6057172cde3e5dc57acae164c946b405ba87cd))
* **satellites:** preserve workspace actors ([e268b8d](https://github.com/tutur3u/platform/commit/e268b8d587f3d4d3025a16c3e001ff5dbb16200b))
* **workspaces:** manage roles for pending invites ([2466f6c](https://github.com/tutur3u/platform/commit/2466f6cbbd447207d87eb0e0d78b3c713b02b739))

## [0.22.2](https://github.com/tutur3u/platform/compare/meet-v0.22.1...meet-v0.22.2) (2026-08-11)


### Bug Fixes

* **i18n:** preserve prerender locale fallback ([3a09b07](https://github.com/tutur3u/platform/commit/3a09b070abda729649f269310a70db78f9b3a1cc))

## [0.22.1](https://github.com/tutur3u/platform/compare/meet-v0.22.0...meet-v0.22.1) (2026-08-11)


### Bug Fixes

* **i18n:** keep locale roots prerenderable ([d0eb02c](https://github.com/tutur3u/platform/commit/d0eb02c452c4ad125907f4c67b24797782caf907))
* **i18n:** keep request locale build-safe ([cc575a2](https://github.com/tutur3u/platform/commit/cc575a2e951ef8fb46a4b8593d0dcfcbe03cd4e7))
* **meet:** narrow prerender suspense boundary ([e82cda6](https://github.com/tutur3u/platform/commit/e82cda698a4e8f028eaee0cd57ca46186765b36d))
* **meet:** nest runtime work under suspense ([8da544d](https://github.com/tutur3u/platform/commit/8da544d5e98ec69adde9fa8e10225ae1ae59925b))
* **meet:** nest runtime work under suspense ([#5119](https://github.com/tutur3u/platform/issues/5119)) ([83006f0](https://github.com/tutur3u/platform/commit/83006f034643f5dd759800e9fcaa9de50262b277))
* **meet:** render authenticated root at request time ([0ba1e3d](https://github.com/tutur3u/platform/commit/0ba1e3d78010b18452dabcb95c06769ee3c16445))
* **meet:** render authenticated root at request time ([#5118](https://github.com/tutur3u/platform/issues/5118)) ([ab10722](https://github.com/tutur3u/platform/commit/ab10722a8112b21bb4acb6076456abc99f66b2ad))
* **meet:** restore prerender suspense boundary ([902c444](https://github.com/tutur3u/platform/commit/902c444e3527e07fea3297ac3b04a79b85d9c7fe))
* **meet:** restore prerender suspense boundary ([#5117](https://github.com/tutur3u/platform/issues/5117)) ([9fb158f](https://github.com/tutur3u/platform/commit/9fb158f7a094724209679ad13b321ed14d6d6ca1))

## [0.22.0](https://github.com/tutur3u/platform/compare/meet-v0.21.1...meet-v0.22.0) (2026-08-09)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **chat:** add connected site sync bridge ([05c27f5](https://github.com/tutur3u/platform/commit/05c27f5ac4a545af366097ee2a919ec755970b9b))
* **chat:** add connected site sync bridge ([#5078](https://github.com/tutur3u/platform/issues/5078)) ([3de1a07](https://github.com/tutur3u/platform/commit/3de1a07dfa2fec96982aa0d116e003d0aa3fe47c))
* **chat:** add external parity reconciliation ([953b9d6](https://github.com/tutur3u/platform/commit/953b9d6315611ef86ec2c213bbbbc5e62d5f4ad4))
* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))
* **chat:** complete connected-site operational parity ([#5093](https://github.com/tutur3u/platform/issues/5093)) ([397e11b](https://github.com/tutur3u/platform/commit/397e11bd87d583fe1c65f83a2b8019c287650e19))
* **chat:** complete connected-site parity ([fd4061d](https://github.com/tutur3u/platform/commit/fd4061d8b2f654e521c40ea9819a348ae81575c9))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **meet:** add Google-Meet-style calls on Cloudflare Realtime SFU ([a32dd52](https://github.com/tutur3u/platform/commit/a32dd522cdb1a176f9e1312fe52a85e9516870f5))
* **meet:** drop the /workspace prefix and move rooms to /r ([9e370e9](https://github.com/tutur3u/platform/commit/9e370e9fe7072b26e48ed5a1fd04e67d74eb2921))
* **meet:** revamp collaborative scheduling ([9124a5d](https://github.com/tutur3u/platform/commit/9124a5d559e071c7e6c1c713cfbca4d9f5205611))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))
* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))
* **web:** refine marketing experience ([c7f1cec](https://github.com/tutur3u/platform/commit/c7f1cec0dd667e6d5f59aaf0bab82069b79c7376))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **meet:** attribute remote tracks to their publisher ([7f206bc](https://github.com/tutur3u/platform/commit/7f206bc5a6ca847d62a817585bd66c7498c76f88))
* **meet:** authorise meeting edit and delete from the satellite ([00524ab](https://github.com/tutur3u/platform/commit/00524ab615a028963fc3bb2a12df098cf3ce6f8a))
* **meet:** mount the nuqs adapter in the root layout ([3931063](https://github.com/tutur3u/platform/commit/3931063fd5d82c5bd26d66d47cf13e249b88aa85))
* **meet:** reconnect dropped call signaling with a fresh join token ([3c6cb41](https://github.com/tutur3u/platform/commit/3c6cb4102b8ec9b9a96248e57fcd17ff763b0981))
* **meet:** restore the notifications namespace so Plans stops erroring ([675611d](https://github.com/tutur3u/platform/commit/675611d273cf602cab366e173600497c5754c917))
* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **tasks:** repair board share access and harden AI media attachments ([65b8092](https://github.com/tutur3u/platform/commit/65b809245cc01fb7a5f034f703083f329c20f1c1))
* **workspaces:** harden invitation interactions ([b7f8f6c](https://github.com/tutur3u/platform/commit/b7f8f6cf52ceec1b67d36b11513eae7806284f5d))
* **workspaces:** restore invitation access across apps ([#5099](https://github.com/tutur3u/platform/issues/5099)) ([c7032c3](https://github.com/tutur3u/platform/commit/c7032c310639c2783b60ac560e83a84d65a5c7f5))
* **workspaces:** route satellite creation through setup ([754bf1b](https://github.com/tutur3u/platform/commit/754bf1b81360e4755a171819f3a8e6a7c102f351))

## [0.21.1](https://github.com/tutur3u/platform/compare/meet-v0.21.0...meet-v0.21.1) (2026-08-09)


### Bug Fixes

* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))

## [0.21.0](https://github.com/tutur3u/platform/compare/meet-v0.20.1...meet-v0.21.0) (2026-08-07)


### Features

* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))


### Bug Fixes

* **tasks:** repair board share access and harden AI media attachments ([65b8092](https://github.com/tutur3u/platform/commit/65b809245cc01fb7a5f034f703083f329c20f1c1))

## [0.20.1](https://github.com/tutur3u/platform/compare/meet-v0.20.0...meet-v0.20.1) (2026-08-06)


### Bug Fixes

* **workspaces:** harden invitation interactions ([b7f8f6c](https://github.com/tutur3u/platform/commit/b7f8f6cf52ceec1b67d36b11513eae7806284f5d))
* **workspaces:** restore invitation access across apps ([#5099](https://github.com/tutur3u/platform/issues/5099)) ([c7032c3](https://github.com/tutur3u/platform/commit/c7032c310639c2783b60ac560e83a84d65a5c7f5))

## [0.20.0](https://github.com/tutur3u/platform/compare/meet-v0.19.0...meet-v0.20.0) (2026-08-06)


### Features

* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))
* **chat:** complete connected-site operational parity ([#5093](https://github.com/tutur3u/platform/issues/5093)) ([397e11b](https://github.com/tutur3u/platform/commit/397e11bd87d583fe1c65f83a2b8019c287650e19))
* **chat:** complete connected-site parity ([fd4061d](https://github.com/tutur3u/platform/commit/fd4061d8b2f654e521c40ea9819a348ae81575c9))

## [0.19.0](https://github.com/tutur3u/platform/compare/meet-v0.18.0...meet-v0.19.0) (2026-08-04)


### Features

* **chat:** add connected site sync bridge ([05c27f5](https://github.com/tutur3u/platform/commit/05c27f5ac4a545af366097ee2a919ec755970b9b))
* **chat:** add connected site sync bridge ([#5078](https://github.com/tutur3u/platform/issues/5078)) ([3de1a07](https://github.com/tutur3u/platform/commit/3de1a07dfa2fec96982aa0d116e003d0aa3fe47c))
* **meet:** add Google-Meet-style calls on Cloudflare Realtime SFU ([a32dd52](https://github.com/tutur3u/platform/commit/a32dd522cdb1a176f9e1312fe52a85e9516870f5))
* **meet:** drop the /workspace prefix and move rooms to /r ([9e370e9](https://github.com/tutur3u/platform/commit/9e370e9fe7072b26e48ed5a1fd04e67d74eb2921))
* **meet:** revamp collaborative scheduling ([9124a5d](https://github.com/tutur3u/platform/commit/9124a5d559e071c7e6c1c713cfbca4d9f5205611))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))


### Bug Fixes

* **meet:** attribute remote tracks to their publisher ([7f206bc](https://github.com/tutur3u/platform/commit/7f206bc5a6ca847d62a817585bd66c7498c76f88))
* **meet:** authorise meeting edit and delete from the satellite ([00524ab](https://github.com/tutur3u/platform/commit/00524ab615a028963fc3bb2a12df098cf3ce6f8a))
* **meet:** mount the nuqs adapter in the root layout ([3931063](https://github.com/tutur3u/platform/commit/3931063fd5d82c5bd26d66d47cf13e249b88aa85))
* **meet:** reconnect dropped call signaling with a fresh join token ([3c6cb41](https://github.com/tutur3u/platform/commit/3c6cb4102b8ec9b9a96248e57fcd17ff763b0981))
* **meet:** restore the notifications namespace so Plans stops erroring ([675611d](https://github.com/tutur3u/platform/commit/675611d273cf602cab366e173600497c5754c917))
* **workspaces:** route satellite creation through setup ([754bf1b](https://github.com/tutur3u/platform/commit/754bf1b81360e4755a171819f3a8e6a7c102f351))

## [0.18.0](https://github.com/tutur3u/platform/compare/meet-v0.17.0...meet-v0.18.0) (2026-07-28)


### Features

* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))

## [0.17.0](https://github.com/tutur3u/platform/compare/meet-v0.16.0...meet-v0.17.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))
* **web:** refine marketing experience ([c7f1cec](https://github.com/tutur3u/platform/commit/c7f1cec0dd667e6d5f59aaf0bab82069b79c7376))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.16.0](https://github.com/tutur3u/platform/compare/meet-v0.15.0...meet-v0.16.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))

## [0.15.0](https://github.com/tutur3u/platform/compare/meet-v0.14.0...meet-v0.15.0) (2026-07-25)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **ui:** align landing and locale experience ([aa6e47f](https://github.com/tutur3u/platform/commit/aa6e47f17356ce74111ccf130e8b17071cc7aadf))
* **web:** refine marketing experience ([c7f1cec](https://github.com/tutur3u/platform/commit/c7f1cec0dd667e6d5f59aaf0bab82069b79c7376))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))

## [0.14.0](https://github.com/tutur3u/platform/compare/meet-v0.13.0...meet-v0.14.0) (2026-07-21)


### Features

* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))


### Bug Fixes

* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellite:** harden workspace settings translations ([7315a2d](https://github.com/tutur3u/platform/commit/7315a2da7b75fd1d66c1c89885aaebc857a44a19))

## [0.13.0](https://github.com/tutur3u/platform/compare/meet-v0.12.0...meet-v0.13.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))

## [0.12.0](https://github.com/tutur3u/platform/compare/meet-v0.11.0...meet-v0.12.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.11.0](https://github.com/tutur3u/platform/compare/meet-v0.10.0...meet-v0.11.0) (2026-07-11)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.10.0](https://github.com/tutur3u/platform/compare/meet-v0.9.0...meet-v0.10.0) (2026-07-11)


### Features

* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.9.0](https://github.com/tutur3u/platform/compare/meet-v0.8.0...meet-v0.9.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))

## [0.8.0](https://github.com/tutur3u/platform/compare/meet-v0.7.1...meet-v0.8.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))

## [0.7.1](https://github.com/tutur3u/platform/compare/meet-v0.7.0...meet-v0.7.1) (2026-07-03)


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))

## [0.7.0](https://github.com/tutur3u/platform/compare/meet-v0.6.0...meet-v0.7.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))


### Bug Fixes

* **tasks:** restore tracked task descriptions ([f892ae2](https://github.com/tutur3u/platform/commit/f892ae23dfec41c2d25649b97a628d8cdcd1fa5d))

## [0.6.0](https://github.com/tutur3u/platform/compare/meet-v0.5.2...meet-v0.6.0) (2026-06-24)


### Features

* **tasks:** add shareable kanban task plans ([2de4e58](https://github.com/tutur3u/platform/commit/2de4e5819673e11b01cdc1f21c317f33dc196f56))


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
* **i18n:** sync task planner keys ([fea50fd](https://github.com/tutur3u/platform/commit/fea50fddfb3019d9dfeeb834ec5444f2dbe01554))

## [0.5.2](https://github.com/tutur3u/platform/compare/meet-v0.5.1...meet-v0.5.2) (2026-06-13)


### Bug Fixes

* **sidebar:** persist collapsed state across refresh ([cb0eb6d](https://github.com/tutur3u/platform/commit/cb0eb6d0d30ecc8b3f3231255f9906e60a895f04))
* **tasks:** sync task realtime with broadcasts ([8c56154](https://github.com/tutur3u/platform/commit/8c56154e517797dcac0ec0971d8a474b50292706))

## [0.5.1](https://github.com/tutur3u/platform/compare/meet-v0.5.0...meet-v0.5.1) (2026-06-11)


### Bug Fixes

* **chat:** throttle Zalo phone sync and group mirrored chats ([51f3ab5](https://github.com/tutur3u/platform/commit/51f3ab5cec4a7a0c7403100045a6d7500975caf3))
* **tooling:** repair stale portless aliases ([43eb916](https://github.com/tutur3u/platform/commit/43eb916741b78affaf0478157ca8f3630586786d))

## [0.5.0](https://github.com/tutur3u/platform/compare/meet-v0.4.0...meet-v0.5.0) (2026-06-10)


### Features

* **chat:** add personal channels and root integrations ([fb5e753](https://github.com/tutur3u/platform/commit/fb5e7534588c7015449313fc4a752b70732f227e))
* **chat:** add Zalo QR personal sync ([f86e710](https://github.com/tutur3u/platform/commit/f86e710a39a790c44ba35c5a43f785dc1f66e27e))
* **chat:** merge personal channels and root integrations ([22d50ce](https://github.com/tutur3u/platform/commit/22d50ce0d75e36e0beaa973ef59cbd296e22dc35))

## [0.4.0](https://github.com/tutur3u/platform/compare/meet-v0.3.0...meet-v0.4.0) (2026-06-08)


### Features

* **web:** add UI component showcase ([8fcbc6b](https://github.com/tutur3u/platform/commit/8fcbc6b4b64c3f9e9da5eb2ddd6d504a83dd2ec4))
* **web:** merge UI component showcase ([5f4e840](https://github.com/tutur3u/platform/commit/5f4e840960a114952d728b88caf914d2e05959b3))


### Bug Fixes

* **auth:** support supabase-first satellite sessions ([b014fcf](https://github.com/tutur3u/platform/commit/b014fcf6db8218a1b54fd79f5e13629f66cad090))
* **ci:** stabilize production deployment checks ([1973c9e](https://github.com/tutur3u/platform/commit/1973c9e18dd2d63d7bd3a93dbd0cf35413548c1f))


### Performance Improvements

* **next:** centralize app dev config defaults ([669a578](https://github.com/tutur3u/platform/commit/669a578163336dc6fd6399e753328598b03c1f2a))

## [0.3.0](https://github.com/tutur3u/platform/compare/meet-v0.2.0...meet-v0.3.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))


### Bug Fixes

* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))
* **meet:** protect workspace plan detail pages ([2574e45](https://github.com/tutur3u/platform/commit/2574e45d5a44db3425438233794bd620abfec778))

## [0.2.0](https://github.com/tutur3u/platform/compare/meet-v0.1.0...meet-v0.2.0) (2026-06-02)


### Features

* **chat:** add ai agent operations controls ([2429279](https://github.com/tutur3u/platform/commit/2429279777e74014abb80699a7359038eb751460))
