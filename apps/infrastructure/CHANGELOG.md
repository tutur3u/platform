# Changelog

## [0.26.0](https://github.com/tutur3u/platform/compare/infra-v0.25.0...infra-v0.26.0) (2026-09-25)


### Features

* **auth:** enforce required account MFA lifecycle ([e08f27d](https://github.com/tutur3u/platform/commit/e08f27dbc082f7d9c951bb0792357638f3dcfb0a)) ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))
* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))


### Bug Fixes

* **infrastructure:** harden vault draft inheritance ([466cbe6](https://github.com/tutur3u/platform/commit/466cbe67c7f87e1a638d96a369e800ac43746029))
* **infrastructure:** inherit encrypted mobile vault drafts safely ([9dbaadd](https://github.com/tutur3u/platform/commit/9dbaaddc53fcac4c00f6a68f554d9f92febeac8f)) ([#5446](https://github.com/tutur3u/platform/issues/5446)) ([7ba7028](https://github.com/tutur3u/platform/commit/7ba7028d9f0b001de97ae34b721eeb75b51bca69))
* **infrastructure:** log safe mobile bundle denial codes ([f09d985](https://github.com/tutur3u/platform/commit/f09d985b21f28e92490d24ba53bd3ba16d851eac)) ([#5491](https://github.com/tutur3u/platform/issues/5491)) ([58c806c](https://github.com/tutur3u/platform/commit/58c806c6cb9005badf6df4facb484f5096975b0c))
* **infrastructure:** repair vault scalar inheritance hash check ([#5453](https://github.com/tutur3u/platform/issues/5453)) ([3bf24f3](https://github.com/tutur3u/platform/commit/3bf24f3b92875568f3b5d98ba3daa18136404c1a))
* **infrastructure:** tolerate slow GitHub OIDC key fetches ([ffcd795](https://github.com/tutur3u/platform/commit/ffcd795f81b32827842ac709224e9f3d45e81061)) ([#5493](https://github.com/tutur3u/platform/issues/5493)) ([fa1e3e1](https://github.com/tutur3u/platform/commit/fa1e3e199d4ea82db16e5ec8e704d80af13f2248))
* **infrastructure:** verify vault scalar hashes in stored format ([52c26db](https://github.com/tutur3u/platform/commit/52c26db8a86d0265b4653838e5fb1efb5d5f5cb0))
* **mobile:** defer external TestFlight review while prior build is pending ([99c4cb4](https://github.com/tutur3u/platform/commit/99c4cb4e6aa413ea7df102b21c66f02aa2415291)) ([#5469](https://github.com/tutur3u/platform/issues/5469)) ([c617b62](https://github.com/tutur3u/platform/commit/c617b62a35ab7803639ac4d4309a3029f2c6a49d))

## [0.25.0](https://github.com/tutur3u/platform/compare/infra-v0.24.0...infra-v0.25.0) (2026-09-23)


### Features

* **infrastructure:** add web and mobile account recovery ([5e42191](https://github.com/tutur3u/platform/commit/5e42191a675b8edee62a62c58ae656e3a05d243f))
* **infrastructure:** add web and mobile internal account recovery ([#5440](https://github.com/tutur3u/platform/issues/5440)) ([0694318](https://github.com/tutur3u/platform/commit/06943180c538f9f294586555d5d776c2cf1ea69e))


### Bug Fixes

* **auth:** reuse completed session-bound challenges ([b63d510](https://github.com/tutur3u/platform/commit/b63d51046b427350d959137cf37058223e544788))
* **infrastructure:** accept mobile account directory page size ([a1fd6b4](https://github.com/tutur3u/platform/commit/a1fd6b48bd7b2750b2e3b7da5cdbcb8d6663ef81)) ([#5441](https://github.com/tutur3u/platform/issues/5441)) ([8258a07](https://github.com/tutur3u/platform/commit/8258a07e87d5359c82e82a97a57b39240da421e4))
* **mobile:** repair Live persistence and reuse session verification ([#5436](https://github.com/tutur3u/platform/issues/5436)) ([cb452e1](https://github.com/tutur3u/platform/commit/cb452e1908eab3db2dce9dfd1d57d721284a2e49))

## [0.24.0](https://github.com/tutur3u/platform/compare/infra-v0.23.0...infra-v0.24.0) (2026-09-20)


### Features

* **finance:** clarify category charts and add promotions management ([88f85ea](https://github.com/tutur3u/platform/commit/88f85eaadb722b42b99537be3c75fabb1715bf09)) ([#5384](https://github.com/tutur3u/platform/issues/5384)) ([b6fd666](https://github.com/tutur3u/platform/commit/b6fd666bccca6aa929166210fb1c6abdb91c1448))
* **infrastructure:** authenticate native Calendar gateway ([e225ec7](https://github.com/tutur3u/platform/commit/e225ec73f3f5dd958bbe7dacab986271e877728e))
* **lettin:** add Cloudflare worldbuilding satellite ([0c8cc22](https://github.com/tutur3u/platform/commit/0c8cc22168477440e326bdec08427daf9721d9bf)) ([#5351](https://github.com/tutur3u/platform/issues/5351)) ([2631103](https://github.com/tutur3u/platform/commit/263110318bb9bab6d26a1bdd539fc52a40b25bec))
* **pricing:** add full app comparison and evolving pitch deck ([c967e8d](https://github.com/tutur3u/platform/commit/c967e8d2db75fc65159c7dcb31ed1b27673ae924))
* **pricing:** compare every app and add an evolving pitch deck ([#5335](https://github.com/tutur3u/platform/issues/5335)) ([962ed75](https://github.com/tutur3u/platform/commit/962ed75e086eb85a06a878720a5d30b747e7ba82))


### Bug Fixes

* **billing:** fail closed on unknown usage and subscription capacity ([ccfcba4](https://github.com/tutur3u/platform/commit/ccfcba46f236981b1d4e59e1c389bee8472b2ca8)) ([#5333](https://github.com/tutur3u/platform/issues/5333)) ([a308a89](https://github.com/tutur3u/platform/commit/a308a8996f17a81c76c8fb0d498a14d8dbf289c3))
* **calendar:** admit authenticated scheduler requests through proxies ([ef00b7a](https://github.com/tutur3u/platform/commit/ef00b7ab2b2593888e05fb92010d613eeaa0614e))
* **calendar:** admit authenticated schedulers through app proxies ([#5412](https://github.com/tutur3u/platform/issues/5412)) ([cc7c82a](https://github.com/tutur3u/platform/commit/cc7c82a913d9e59e73cf9e8be0b939b1f5d0435c))
* **calendar:** restore background sync and mobile refresh ([#5402](https://github.com/tutur3u/platform/issues/5402)) ([98a6a29](https://github.com/tutur3u/platform/commit/98a6a2963f26eab0bf785829a76f04f892c05efd))
* **calendar:** route scheduled jobs through the infrastructure vault ([f6a5287](https://github.com/tutur3u/platform/commit/f6a5287c674d39975a34c1caa4f9f654f5d75471))
* **calendar:** schedule hosted sync through authenticated gateway ([522a494](https://github.com/tutur3u/platform/commit/522a49455f3d97bf9bec39c4a85727ab550abb3d)) ([#5408](https://github.com/tutur3u/platform/issues/5408)) ([96b09cd](https://github.com/tutur3u/platform/commit/96b09cd961de9cb9393b698df00a5d7428db4ffa))
* **ci:** enable and verify signed mobile beta releases ([#5387](https://github.com/tutur3u/platform/issues/5387)) ([3b34df6](https://github.com/tutur3u/platform/commit/3b34df69b5565924180b18b3a41152a8bb80366e))
* **deps:** align React types and published consumer ranges ([3612cd8](https://github.com/tutur3u/platform/commit/3612cd81723fb5a6982152688227ed21bc4095fd))
* **deps:** preserve React peer compatibility and clarify audit ([777b9ed](https://github.com/tutur3u/platform/commit/777b9ed7f42095bb9361e6bed94d989310c222de))
* **finance:** complete invoice loading recovery ([5f4cd04](https://github.com/tutur3u/platform/commit/5f4cd049ab462e774d09c7060878bdedda164d12))
* **finance:** recover stalled invoice loading ([e943337](https://github.com/tutur3u/platform/commit/e94333766ddf942f9c44347d6f7fc982f4f828a8))
* **finance:** restrict promotion forwarding and clarify chart labels ([30d3f05](https://github.com/tutur3u/platform/commit/30d3f053df12360beab94cbdcb0a9fd3a84d38f7))
* **finance:** speed up invoice audit history and improve pagination ([b6c165e](https://github.com/tutur3u/platform/commit/b6c165e88e8888facec7744ee16c1d9378bb90e5)) ([#5380](https://github.com/tutur3u/platform/issues/5380)) ([c829653](https://github.com/tutur3u/platform/commit/c8296532b5282324b28c09d3c06a64894694b46c))
* **i18n:** avoid unlimited Enterprise capacity claims ([6c513eb](https://github.com/tutur3u/platform/commit/6c513eb34fa71646b002886d9e545ee0bfc301da))
* **infrastructure:** authorize vault app sessions ([e6d0ab9](https://github.com/tutur3u/platform/commit/e6d0ab9aefd75b11609f1e4fcc357092ed4b67dc))
* **infrastructure:** distinguish Calendar auth outages ([7854d76](https://github.com/tutur3u/platform/commit/7854d764f99844cb803e7f76671095c77f8f2829))
* **mobile:** restore v0.9.2 design, responsive loading, and app access ([#5390](https://github.com/tutur3u/platform/issues/5390)) ([30987f9](https://github.com/tutur3u/platform/commit/30987f9c1706445bafc24186129f4646d0363009))
* **pricing:** align localized amounts and plan change previews ([e0e7e3d](https://github.com/tutur3u/platform/commit/e0e7e3d0a07e43e298e9adae39a5a441b0945ab9))
* **pricing:** reconcile live catalog displays and tier comparisons ([3aa65c2](https://github.com/tutur3u/platform/commit/3aa65c2221d0d099ff5bd50de0c90bb4237d1bbd))
* **tasks:** show unprioritized tasks first across paginated views ([1a5dffc](https://github.com/tutur3u/platform/commit/1a5dffccf45fc1a9c20353d19d843d3c66c22379))
* **tasks:** surface unprioritized tasks before paginating ([#5315](https://github.com/tutur3u/platform/issues/5315)) ([496627b](https://github.com/tutur3u/platform/commit/496627b85688b0030199310ad21bd21cf2a92f72))
* **ui:** repair checklist caret and status controls ([a6472ce](https://github.com/tutur3u/platform/commit/a6472ce49c557992966e31ed2e92e2d7cb65b573)) ([#5350](https://github.com/tutur3u/platform/issues/5350)) ([c534362](https://github.com/tutur3u/platform/commit/c534362b5a68965a13403056568f975852213f45))

## [0.23.0](https://github.com/tutur3u/platform/compare/infra-v0.22.6...infra-v0.23.0) (2026-09-07)


### Features

* **calendar:** add installable apps and bounded PWA caching ([f4b2a1c](https://github.com/tutur3u/platform/commit/f4b2a1cf7943783fddc45f537df73589f19594f6))
* **colab:** launch multiplayer prompt workshops on Cloudflare ([7a4a3f9](https://github.com/tutur3u/platform/commit/7a4a3f9b4a12a0d7439cdb296398a21c0cd8939f))


### Bug Fixes

* **calendar:** harden PWA lifecycle and cache retention ([14565c0](https://github.com/tutur3u/platform/commit/14565c0106e74b947e152fd8bb787de7f70bc54d))
* **calendar:** recover failed syncs and redesign calendar views ([7d22948](https://github.com/tutur3u/platform/commit/7d22948095a29d236f698d42dde362fc38311dd0))
* **calendar:** recover failed syncs and redesign calendar views ([#5230](https://github.com/tutur3u/platform/issues/5230)) ([e52605d](https://github.com/tutur3u/platform/commit/e52605d671f921b1564746afcdedf2478deee78e))
* **tasks:** preserve task and calendar drafts until saves finish ([34b4902](https://github.com/tutur3u/platform/commit/34b4902b0382a3aa9e10249a0d83205c9a530878))
* **tasks:** recover partial saves and display actionable errors ([c4887c9](https://github.com/tutur3u/platform/commit/c4887c98377fd8493f3e6ae4219763d8872e2a5b))

## [0.22.6](https://github.com/tutur3u/platform/compare/infra-v0.22.5...infra-v0.22.6) (2026-09-03)


### Bug Fixes

* **infrastructure:** authorize blocked IP management ([6015f35](https://github.com/tutur3u/platform/commit/6015f3555b39a07b3c96476d5443a90adf7cdaaa))
* **infrastructure:** authorize blocked IP management ([#5185](https://github.com/tutur3u/platform/issues/5185)) ([a5fa9b4](https://github.com/tutur3u/platform/commit/a5fa9b43ad0ed4a9525d9b0e549f21a559e40744))

## [0.22.5](https://github.com/tutur3u/platform/compare/infra-v0.22.4...infra-v0.22.5) (2026-08-31)


### Bug Fixes

* **tasks:** restore description checklist controls ([7976f78](https://github.com/tutur3u/platform/commit/7976f78292237e8047509e4243dafa14acea1b54))

## [0.22.4](https://github.com/tutur3u/platform/compare/infra-v0.22.3...infra-v0.22.4) (2026-08-29)


### Performance Improvements

* **vercel:** serve every monorepo app from one function region ([4f0bf52](https://github.com/tutur3u/platform/commit/4f0bf52450899267b4ac9cd2bdecfcf07e3ea427))
* **vercel:** serve every monorepo app from one function region ([#5172](https://github.com/tutur3u/platform/issues/5172)) ([b09d4bd](https://github.com/tutur3u/platform/commit/b09d4bd520a7543d6b88140715d8cc0b5c461711))

## [0.22.3](https://github.com/tutur3u/platform/compare/infra-v0.22.2...infra-v0.22.3) (2026-08-27)


### Performance Improvements

* **infrastructure:** stop alerting Docker recovery every minute ([e0b96b3](https://github.com/tutur3u/platform/commit/e0b96b3f9654be3921e28737b2284a4ad42639dc))
* **infrastructure:** stop alerting Docker recovery every minute ([#5167](https://github.com/tutur3u/platform/issues/5167)) ([07fa6d2](https://github.com/tutur3u/platform/commit/07fa6d2e6a5f42e54eef23d1000b64710067bf61))

## [0.22.2](https://github.com/tutur3u/platform/compare/infra-v0.22.1...infra-v0.22.2) (2026-08-25)


### Bug Fixes

* **contacts:** proxy feedbacks before dynamic users ([910b79e](https://github.com/tutur3u/platform/commit/910b79ef5a53e31b865cb1290e2f2b29d19c1702))

## [0.22.1](https://github.com/tutur3u/platform/compare/infra-v0.22.0...infra-v0.22.1) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))

## [0.22.0](https://github.com/tutur3u/platform/compare/infra-v0.21.0...infra-v0.22.0) (2026-08-20)


### Features

* **tasks:** explain sorted drag ordering ([49350ad](https://github.com/tutur3u/platform/commit/49350ad5160de432eca0d42e582f9e54816fae11))

## [0.21.0](https://github.com/tutur3u/platform/compare/infra-v0.20.2...infra-v0.21.0) (2026-08-14)


### Features

* **workspaces:** assign roles to pending invites ([#5125](https://github.com/tutur3u/platform/issues/5125)) ([d4052fd](https://github.com/tutur3u/platform/commit/d4052fd40de66bda4e9535740bbcfd5a8da19123))
* **workspaces:** revamp invitation access flow ([7ea94af](https://github.com/tutur3u/platform/commit/7ea94afc2c5e14af1c83d1478ad9c006268b13c0))
* **workspaces:** support multi-role invitations ([f6f78ba](https://github.com/tutur3u/platform/commit/f6f78bac6c2120fd70c09e85c075c4206be4f897))


### Bug Fixes

* **satellites:** harden invited workspace access ([3c60571](https://github.com/tutur3u/platform/commit/3c6057172cde3e5dc57acae164c946b405ba87cd))
* **satellites:** preserve workspace actors ([e268b8d](https://github.com/tutur3u/platform/commit/e268b8d587f3d4d3025a16c3e001ff5dbb16200b))
* **workspaces:** manage roles for pending invites ([2466f6c](https://github.com/tutur3u/platform/commit/2466f6cbbd447207d87eb0e0d78b3c713b02b739))

## [0.20.2](https://github.com/tutur3u/platform/compare/infra-v0.20.1...infra-v0.20.2) (2026-08-11)


### Bug Fixes

* **i18n:** preserve prerender locale fallback ([3a09b07](https://github.com/tutur3u/platform/commit/3a09b070abda729649f269310a70db78f9b3a1cc))

## [0.20.1](https://github.com/tutur3u/platform/compare/infra-v0.20.0...infra-v0.20.1) (2026-08-11)


### Bug Fixes

* **i18n:** keep locale roots prerenderable ([d0eb02c](https://github.com/tutur3u/platform/commit/d0eb02c452c4ad125907f4c67b24797782caf907))
* **i18n:** keep request locale build-safe ([cc575a2](https://github.com/tutur3u/platform/commit/cc575a2e951ef8fb46a4b8593d0dcfcbe03cd4e7))

## [0.20.0](https://github.com/tutur3u/platform/compare/infra-v0.19.1...infra-v0.20.0) (2026-08-09)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **ai:** decouple observability from key approval ([c1d96e1](https://github.com/tutur3u/platform/commit/c1d96e10a07094d3166978f4896ca27707f235b3))
* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **chat:** add connected site sync bridge ([05c27f5](https://github.com/tutur3u/platform/commit/05c27f5ac4a545af366097ee2a919ec755970b9b))
* **chat:** add connected site sync bridge ([#5078](https://github.com/tutur3u/platform/issues/5078)) ([3de1a07](https://github.com/tutur3u/platform/commit/3de1a07dfa2fec96982aa0d116e003d0aa3fe47c))
* **chat:** add external parity reconciliation ([953b9d6](https://github.com/tutur3u/platform/commit/953b9d6315611ef86ec2c213bbbbc5e62d5f4ad4))
* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))
* **infrastructure:** add platform account recovery ([8a0c757](https://github.com/tutur3u/platform/commit/8a0c75718abc6807468e22496ccc65a1e9e862de))
* **infrastructure:** improve AI policy workspace explorer ([2eae218](https://github.com/tutur3u/platform/commit/2eae218c3fe84dadd019eeb332563e935202d30b))
* **inventory:** allocate bundle revenue and add cash checkout ([bd465f9](https://github.com/tutur3u/platform/commit/bd465f9bb35fad16d259378fa49611a8eb5ba95b))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **meet:** revamp collaborative scheduling ([9124a5d](https://github.com/tutur3u/platform/commit/9124a5d559e071c7e6c1c713cfbca4d9f5205611))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))
* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))


### Bug Fixes

* **ai:** repair studio settings administration ([ec4c5e9](https://github.com/tutur3u/platform/commit/ec4c5e9f18099bedf7b0e1e876bf215e4dc29fd0))
* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))
* **chat:** address external bridge review findings ([30533fc](https://github.com/tutur3u/platform/commit/30533fc64093fed4b25279bc0e45d43bdb7a6cde))
* **chat:** close bridge edge cases ([db585c8](https://github.com/tutur3u/platform/commit/db585c8486064837dcbce615a30f66c38c0a3ec0))
* **chat:** complete connected site hardening ([9175456](https://github.com/tutur3u/platform/commit/9175456f68bcdfad20216c7b03a59105fb55f0d5))
* **chat:** harden bridge review edge cases ([0ecfad7](https://github.com/tutur3u/platform/commit/0ecfad7c66454fdb3bcd971f1362d3789287f086))
* **chat:** harden connected site migration ([73cccd0](https://github.com/tutur3u/platform/commit/73cccd04e9bd85a443891f3e52b443ef755570cb))
* **chat:** harden connected site sync ([70e8785](https://github.com/tutur3u/platform/commit/70e8785967e145a77330272e671ca58dfc38fbee))
* **chat:** harden external bridge boundaries ([2d25202](https://github.com/tutur3u/platform/commit/2d252023e5cfb1c7414ee2ed2d161e7f5de613f8))
* **chat:** harden external bridge synchronization ([5b7c709](https://github.com/tutur3u/platform/commit/5b7c7092260b05c8de86c2383291433f81c9eead))
* **chat:** harden external bridge synchronization ([63ccf91](https://github.com/tutur3u/platform/commit/63ccf9129ff8e7cf255bef8c74a3e096ab45cb7d))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **e2e:** follow satellite route ownership ([591190c](https://github.com/tutur3u/platform/commit/591190cd24aa15ba6cde1eb17a98409a461e0201))
* **infrastructure:** authorize external app registry sessions ([a09e8f7](https://github.com/tutur3u/platform/commit/a09e8f7a3290bdd814c0dddbbd9b6771db5f6ef0))
* **infrastructure:** freeze Vercel dependency installs ([96cd10c](https://github.com/tutur3u/platform/commit/96cd10cd0f59d32a4ed1570944d469cfb3418393))
* **infrastructure:** guard whitelist request rendering ([a84acac](https://github.com/tutur3u/platform/commit/a84acacbb1de012293f76ab2cf60fd014e89478c))
* **infrastructure:** own admin APIs and paginate models ([a73514c](https://github.com/tutur3u/platform/commit/a73514cbdac132a9bd05f69979cd48561a223ee0))
* **infrastructure:** own AI credit admin APIs ([4606857](https://github.com/tutur3u/platform/commit/46068572bb741155973a7602e21026b8e8beb02b))
* **infrastructure:** pin Vercel Bun installer ([2dcaef0](https://github.com/tutur3u/platform/commit/2dcaef0dd6d87a89ebef87b34368ba926d949b50))
* **infrastructure:** proxy workspace list ([a444f9d](https://github.com/tutur3u/platform/commit/a444f9d3ae68ec4be3b8844e7749d78863770bb0))
* **infrastructure:** proxy workspace list ([#5080](https://github.com/tutur3u/platform/issues/5080)) ([36b7b21](https://github.com/tutur3u/platform/commit/36b7b21b7005d48e1ee24d5ba8efa34e4d4f99bb))
* **infrastructure:** restore production builds ([a9adc4a](https://github.com/tutur3u/platform/commit/a9adc4adc728114d7153511e77dbfddd58714700))
* **infrastructure:** select chat canary workspace ([4832ab5](https://github.com/tutur3u/platform/commit/4832ab5e312bb40b4336f6e4571b364afaf04260))
* **infrastructure:** use satellite database runtime ([ee4044e](https://github.com/tutur3u/platform/commit/ee4044edada1b69615e2cb62765e81c51c315d2e))
* localize realtime analytics filters ([10c14fa](https://github.com/tutur3u/platform/commit/10c14faadc0e0fc6e82fabb2001038e3005e08b6))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))
* **reports:** scale delivery maintenance and report counts ([4dd4f47](https://github.com/tutur3u/platform/commit/4dd4f47dfff4bafa1ef512311eec16a6fbadc964))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* resolve remaining quality suggestions ([826aec4](https://github.com/tutur3u/platform/commit/826aec4af9e8291eb02dc8430b4adab4b110018a))
* **security:** enforce infrastructure workspace permissions ([00b469c](https://github.com/tutur3u/platform/commit/00b469c2345e9f13cf44ed27322e6536eaa90faa))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **tasks:** repair board share access and harden AI media attachments ([65b8092](https://github.com/tutur3u/platform/commit/65b809245cc01fb7a5f034f703083f329c20f1c1))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))

## [0.19.1](https://github.com/tutur3u/platform/compare/infra-v0.19.0...infra-v0.19.1) (2026-08-09)


### Bug Fixes

* **platform:** merge notification and group visibility fixes ([4fe9e97](https://github.com/tutur3u/platform/commit/4fe9e970bf61bffaee4353b1ebb83ce2f880a4c8))
* **platform:** restore notifications and group visibility ([eb570a4](https://github.com/tutur3u/platform/commit/eb570a47e7a3d38fc855fbf3e887ecbde853ece0))

## [0.19.0](https://github.com/tutur3u/platform/compare/infra-v0.18.0...infra-v0.19.0) (2026-08-07)


### Features

* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))


### Bug Fixes

* **tasks:** repair board share access and harden AI media attachments ([65b8092](https://github.com/tutur3u/platform/commit/65b809245cc01fb7a5f034f703083f329c20f1c1))

## [0.18.0](https://github.com/tutur3u/platform/compare/infra-v0.17.0...infra-v0.18.0) (2026-08-06)


### Features

* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))

## [0.17.0](https://github.com/tutur3u/platform/compare/infra-v0.16.0...infra-v0.17.0) (2026-08-04)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **ai:** decouple observability from key approval ([c1d96e1](https://github.com/tutur3u/platform/commit/c1d96e10a07094d3166978f4896ca27707f235b3))
* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **chat:** add connected site sync bridge ([05c27f5](https://github.com/tutur3u/platform/commit/05c27f5ac4a545af366097ee2a919ec755970b9b))
* **chat:** add connected site sync bridge ([#5078](https://github.com/tutur3u/platform/issues/5078)) ([3de1a07](https://github.com/tutur3u/platform/commit/3de1a07dfa2fec96982aa0d116e003d0aa3fe47c))
* **chat:** mirror Zalo history media to Drive ([b8b5d7b](https://github.com/tutur3u/platform/commit/b8b5d7bb86ccac6351d17020fec16605d8413451))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))
* **infrastructure:** add platform account recovery ([8a0c757](https://github.com/tutur3u/platform/commit/8a0c75718abc6807468e22496ccc65a1e9e862de))
* **infrastructure:** improve AI policy workspace explorer ([2eae218](https://github.com/tutur3u/platform/commit/2eae218c3fe84dadd019eeb332563e935202d30b))
* **infrastructure:** improve internal account management ([fa4e535](https://github.com/tutur3u/platform/commit/fa4e535d3193f275cfac4d808455caaab9d6b326))
* **infrastructure:** manage internal accounts ([02fd9f3](https://github.com/tutur3u/platform/commit/02fd9f3d1b4edb23c881e2dbb04bf244b36e6ed0))
* **inventory:** allocate bundle revenue and add cash checkout ([bd465f9](https://github.com/tutur3u/platform/commit/bd465f9bb35fad16d259378fa49611a8eb5ba95b))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **inventory:** support Square POS app payments ([2cd087e](https://github.com/tutur3u/platform/commit/2cd087e15abe2a43da3c21333fe8d9494564fe37))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **meet:** revamp collaborative scheduling ([9124a5d](https://github.com/tutur3u/platform/commit/9124a5d559e071c7e6c1c713cfbca4d9f5205611))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** standardize fixed app headers ([7b86c42](https://github.com/tutur3u/platform/commit/7b86c4283b39ebc5de8bec971ce3bab5fdaef422))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))


### Bug Fixes

* **ai:** repair studio settings administration ([ec4c5e9](https://github.com/tutur3u/platform/commit/ec4c5e9f18099bedf7b0e1e876bf215e4dc29fd0))
* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))
* **chat:** address external bridge review findings ([30533fc](https://github.com/tutur3u/platform/commit/30533fc64093fed4b25279bc0e45d43bdb7a6cde))
* **chat:** close bridge edge cases ([db585c8](https://github.com/tutur3u/platform/commit/db585c8486064837dcbce615a30f66c38c0a3ec0))
* **chat:** complete connected site hardening ([9175456](https://github.com/tutur3u/platform/commit/9175456f68bcdfad20216c7b03a59105fb55f0d5))
* **chat:** harden bridge review edge cases ([0ecfad7](https://github.com/tutur3u/platform/commit/0ecfad7c66454fdb3bcd971f1362d3789287f086))
* **chat:** harden connected site migration ([73cccd0](https://github.com/tutur3u/platform/commit/73cccd04e9bd85a443891f3e52b443ef755570cb))
* **chat:** harden connected site sync ([70e8785](https://github.com/tutur3u/platform/commit/70e8785967e145a77330272e671ca58dfc38fbee))
* **chat:** harden external bridge boundaries ([2d25202](https://github.com/tutur3u/platform/commit/2d252023e5cfb1c7414ee2ed2d161e7f5de613f8))
* **chat:** harden external bridge synchronization ([63ccf91](https://github.com/tutur3u/platform/commit/63ccf9129ff8e7cf255bef8c74a3e096ab45cb7d))
* **chat:** harden personal Zalo integration ([f1d12c6](https://github.com/tutur3u/platform/commit/f1d12c60fe12ab3b01a1be3f0381573d44a32226))
* **chat:** keep Zalo phone sync alive ([5cc7a0d](https://github.com/tutur3u/platform/commit/5cc7a0df42c8ad3b7a9e5785cf5d8e9a99c56b76))
* **chat:** stop Zalo phone sync spam ([b45e778](https://github.com/tutur3u/platform/commit/b45e778693f175b7bafcd00d6b3ec46f079a946c))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **e2e:** follow satellite route ownership ([591190c](https://github.com/tutur3u/platform/commit/591190cd24aa15ba6cde1eb17a98409a461e0201))
* **infrastructure:** authorize external app registry sessions ([a09e8f7](https://github.com/tutur3u/platform/commit/a09e8f7a3290bdd814c0dddbbd9b6771db5f6ef0))
* **infrastructure:** freeze Vercel dependency installs ([96cd10c](https://github.com/tutur3u/platform/commit/96cd10cd0f59d32a4ed1570944d469cfb3418393))
* **infrastructure:** guard whitelist request rendering ([a84acac](https://github.com/tutur3u/platform/commit/a84acacbb1de012293f76ab2cf60fd014e89478c))
* **infrastructure:** own admin APIs and paginate models ([a73514c](https://github.com/tutur3u/platform/commit/a73514cbdac132a9bd05f69979cd48561a223ee0))
* **infrastructure:** own AI credit admin APIs ([4606857](https://github.com/tutur3u/platform/commit/46068572bb741155973a7602e21026b8e8beb02b))
* **infrastructure:** pin Vercel Bun installer ([2dcaef0](https://github.com/tutur3u/platform/commit/2dcaef0dd6d87a89ebef87b34368ba926d949b50))
* **infrastructure:** proxy workspace list ([a444f9d](https://github.com/tutur3u/platform/commit/a444f9d3ae68ec4be3b8844e7749d78863770bb0))
* **infrastructure:** proxy workspace list ([#5080](https://github.com/tutur3u/platform/issues/5080)) ([36b7b21](https://github.com/tutur3u/platform/commit/36b7b21b7005d48e1ee24d5ba8efa34e4d4f99bb))
* **infrastructure:** restore production builds ([a9adc4a](https://github.com/tutur3u/platform/commit/a9adc4adc728114d7153511e77dbfddd58714700))
* **infrastructure:** select chat canary workspace ([4832ab5](https://github.com/tutur3u/platform/commit/4832ab5e312bb40b4336f6e4571b364afaf04260))
* **infrastructure:** use satellite database runtime ([ee4044e](https://github.com/tutur3u/platform/commit/ee4044edada1b69615e2cb62765e81c51c315d2e))
* localize realtime analytics filters ([10c14fa](https://github.com/tutur3u/platform/commit/10c14faadc0e0fc6e82fabb2001038e3005e08b6))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **reports:** scale delivery maintenance and report counts ([4dd4f47](https://github.com/tutur3u/platform/commit/4dd4f47dfff4bafa1ef512311eec16a6fbadc964))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* resolve remaining quality suggestions ([826aec4](https://github.com/tutur3u/platform/commit/826aec4af9e8291eb02dc8430b4adab4b110018a))
* **satellite:** restore mobile workspace settings ([e276f40](https://github.com/tutur3u/platform/commit/e276f4006175cfb501410b3875e661d3975c27f2))
* **security:** enforce infrastructure workspace permissions ([00b469c](https://github.com/tutur3u/platform/commit/00b469c2345e9f13cf44ed27322e6536eaa90faa))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))

## [0.16.0](https://github.com/tutur3u/platform/compare/infra-v0.15.0...infra-v0.16.0) (2026-07-29)


### Features

* **ai:** decouple observability from key approval ([c1d96e1](https://github.com/tutur3u/platform/commit/c1d96e10a07094d3166978f4896ca27707f235b3))

## [0.15.0](https://github.com/tutur3u/platform/compare/infra-v0.14.0...infra-v0.15.0) (2026-07-28)


### Features

* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))


### Bug Fixes

* **ai:** repair studio settings administration ([ec4c5e9](https://github.com/tutur3u/platform/commit/ec4c5e9f18099bedf7b0e1e876bf215e4dc29fd0))
* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))

## [0.14.0](https://github.com/tutur3u/platform/compare/infra-v0.13.0...infra-v0.14.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **chat:** mirror Zalo history media to Drive ([b8b5d7b](https://github.com/tutur3u/platform/commit/b8b5d7bb86ccac6351d17020fec16605d8413451))
* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **infrastructure:** add platform account recovery ([8a0c757](https://github.com/tutur3u/platform/commit/8a0c75718abc6807468e22496ccc65a1e9e862de))
* **infrastructure:** improve internal account management ([fa4e535](https://github.com/tutur3u/platform/commit/fa4e535d3193f275cfac4d808455caaab9d6b326))
* **infrastructure:** manage internal accounts ([02fd9f3](https://github.com/tutur3u/platform/commit/02fd9f3d1b4edb23c881e2dbb04bf244b36e6ed0))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **inventory:** support Square POS app payments ([2cd087e](https://github.com/tutur3u/platform/commit/2cd087e15abe2a43da3c21333fe8d9494564fe37))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** standardize fixed app headers ([7b86c42](https://github.com/tutur3u/platform/commit/7b86c4283b39ebc5de8bec971ce3bab5fdaef422))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **chat:** harden personal Zalo integration ([f1d12c6](https://github.com/tutur3u/platform/commit/f1d12c60fe12ab3b01a1be3f0381573d44a32226))
* **chat:** keep Zalo phone sync alive ([5cc7a0d](https://github.com/tutur3u/platform/commit/5cc7a0df42c8ad3b7a9e5785cf5d8e9a99c56b76))
* **chat:** stop Zalo phone sync spam ([b45e778](https://github.com/tutur3u/platform/commit/b45e778693f175b7bafcd00d6b3ec46f079a946c))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **e2e:** follow satellite route ownership ([591190c](https://github.com/tutur3u/platform/commit/591190cd24aa15ba6cde1eb17a98409a461e0201))
* **infrastructure:** authorize external app registry sessions ([a09e8f7](https://github.com/tutur3u/platform/commit/a09e8f7a3290bdd814c0dddbbd9b6771db5f6ef0))
* **infrastructure:** freeze Vercel dependency installs ([96cd10c](https://github.com/tutur3u/platform/commit/96cd10cd0f59d32a4ed1570944d469cfb3418393))
* **infrastructure:** guard whitelist request rendering ([a84acac](https://github.com/tutur3u/platform/commit/a84acacbb1de012293f76ab2cf60fd014e89478c))
* **infrastructure:** own admin APIs and paginate models ([a73514c](https://github.com/tutur3u/platform/commit/a73514cbdac132a9bd05f69979cd48561a223ee0))
* **infrastructure:** own AI credit admin APIs ([4606857](https://github.com/tutur3u/platform/commit/46068572bb741155973a7602e21026b8e8beb02b))
* **infrastructure:** pin Vercel Bun installer ([2dcaef0](https://github.com/tutur3u/platform/commit/2dcaef0dd6d87a89ebef87b34368ba926d949b50))
* **infrastructure:** restore production builds ([a9adc4a](https://github.com/tutur3u/platform/commit/a9adc4adc728114d7153511e77dbfddd58714700))
* **infrastructure:** use satellite database runtime ([ee4044e](https://github.com/tutur3u/platform/commit/ee4044edada1b69615e2cb62765e81c51c315d2e))
* **inventory:** clarify payment sync and settings ([cf05ed6](https://github.com/tutur3u/platform/commit/cf05ed63cfc47022a95177b661d1fa796d68d65e))
* localize realtime analytics filters ([10c14fa](https://github.com/tutur3u/platform/commit/10c14faadc0e0fc6e82fabb2001038e3005e08b6))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **reports:** scale delivery maintenance and report counts ([4dd4f47](https://github.com/tutur3u/platform/commit/4dd4f47dfff4bafa1ef512311eec16a6fbadc964))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* resolve remaining quality suggestions ([826aec4](https://github.com/tutur3u/platform/commit/826aec4af9e8291eb02dc8430b4adab4b110018a))
* **satellite:** restore mobile workspace settings ([e276f40](https://github.com/tutur3u/platform/commit/e276f4006175cfb501410b3875e661d3975c27f2))
* **security:** enforce infrastructure workspace permissions ([00b469c](https://github.com/tutur3u/platform/commit/00b469c2345e9f13cf44ed27322e6536eaa90faa))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.13.0](https://github.com/tutur3u/platform/compare/infra-v0.12.0...infra-v0.13.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **chat:** mirror Zalo history media to Drive ([b8b5d7b](https://github.com/tutur3u/platform/commit/b8b5d7bb86ccac6351d17020fec16605d8413451))
* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **infrastructure:** add platform account recovery ([8a0c757](https://github.com/tutur3u/platform/commit/8a0c75718abc6807468e22496ccc65a1e9e862de))
* **infrastructure:** improve internal account management ([fa4e535](https://github.com/tutur3u/platform/commit/fa4e535d3193f275cfac4d808455caaab9d6b326))
* **infrastructure:** manage internal accounts ([02fd9f3](https://github.com/tutur3u/platform/commit/02fd9f3d1b4edb23c881e2dbb04bf244b36e6ed0))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **inventory:** support Square POS app payments ([2cd087e](https://github.com/tutur3u/platform/commit/2cd087e15abe2a43da3c21333fe8d9494564fe37))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** standardize fixed app headers ([7b86c42](https://github.com/tutur3u/platform/commit/7b86c4283b39ebc5de8bec971ce3bab5fdaef422))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **chat:** harden personal Zalo integration ([f1d12c6](https://github.com/tutur3u/platform/commit/f1d12c60fe12ab3b01a1be3f0381573d44a32226))
* **chat:** keep Zalo phone sync alive ([5cc7a0d](https://github.com/tutur3u/platform/commit/5cc7a0df42c8ad3b7a9e5785cf5d8e9a99c56b76))
* **chat:** stop Zalo phone sync spam ([b45e778](https://github.com/tutur3u/platform/commit/b45e778693f175b7bafcd00d6b3ec46f079a946c))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **e2e:** follow satellite route ownership ([591190c](https://github.com/tutur3u/platform/commit/591190cd24aa15ba6cde1eb17a98409a461e0201))
* **infrastructure:** authorize external app registry sessions ([a09e8f7](https://github.com/tutur3u/platform/commit/a09e8f7a3290bdd814c0dddbbd9b6771db5f6ef0))
* **infrastructure:** freeze Vercel dependency installs ([96cd10c](https://github.com/tutur3u/platform/commit/96cd10cd0f59d32a4ed1570944d469cfb3418393))
* **infrastructure:** guard whitelist request rendering ([a84acac](https://github.com/tutur3u/platform/commit/a84acacbb1de012293f76ab2cf60fd014e89478c))
* **infrastructure:** own admin APIs and paginate models ([a73514c](https://github.com/tutur3u/platform/commit/a73514cbdac132a9bd05f69979cd48561a223ee0))
* **infrastructure:** own AI credit admin APIs ([4606857](https://github.com/tutur3u/platform/commit/46068572bb741155973a7602e21026b8e8beb02b))
* **infrastructure:** pin Vercel Bun installer ([2dcaef0](https://github.com/tutur3u/platform/commit/2dcaef0dd6d87a89ebef87b34368ba926d949b50))
* **infrastructure:** restore production builds ([a9adc4a](https://github.com/tutur3u/platform/commit/a9adc4adc728114d7153511e77dbfddd58714700))
* **infrastructure:** use satellite database runtime ([ee4044e](https://github.com/tutur3u/platform/commit/ee4044edada1b69615e2cb62765e81c51c315d2e))
* **inventory:** clarify payment sync and settings ([cf05ed6](https://github.com/tutur3u/platform/commit/cf05ed63cfc47022a95177b661d1fa796d68d65e))
* localize realtime analytics filters ([10c14fa](https://github.com/tutur3u/platform/commit/10c14faadc0e0fc6e82fabb2001038e3005e08b6))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **reports:** scale delivery maintenance and report counts ([4dd4f47](https://github.com/tutur3u/platform/commit/4dd4f47dfff4bafa1ef512311eec16a6fbadc964))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* resolve remaining quality suggestions ([826aec4](https://github.com/tutur3u/platform/commit/826aec4af9e8291eb02dc8430b4adab4b110018a))
* **satellite:** restore mobile workspace settings ([e276f40](https://github.com/tutur3u/platform/commit/e276f4006175cfb501410b3875e661d3975c27f2))
* **security:** enforce infrastructure workspace permissions ([00b469c](https://github.com/tutur3u/platform/commit/00b469c2345e9f13cf44ed27322e6536eaa90faa))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.12.0](https://github.com/tutur3u/platform/compare/infra-v0.11.0...infra-v0.12.0) (2026-07-27)


### Features

* **infrastructure:** add platform account recovery ([8a0c757](https://github.com/tutur3u/platform/commit/8a0c75718abc6807468e22496ccc65a1e9e862de))
* **tasks:** consolidate task dialog details into one disclosure ([bcc2219](https://github.com/tutur3u/platform/commit/bcc2219708d78e1016fdd20c8a5640b0cf205b9f))

## [0.11.0](https://github.com/tutur3u/platform/compare/infra-v0.10.0...infra-v0.11.0) (2026-07-25)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **inventory:** secure Square POS event checkout ([532b463](https://github.com/tutur3u/platform/commit/532b46372116ee0bebfd83ba2af762cc9f668c3c))
* **landing:** retile the app bento and rebuild the problem section ([c56f42a](https://github.com/tutur3u/platform/commit/c56f42adf754362a269ff08b380db1ee0cf8c6ca))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **e2e:** follow satellite route ownership ([591190c](https://github.com/tutur3u/platform/commit/591190cd24aa15ba6cde1eb17a98409a461e0201))
* **infrastructure:** authorize external app registry sessions ([a09e8f7](https://github.com/tutur3u/platform/commit/a09e8f7a3290bdd814c0dddbbd9b6771db5f6ef0))
* **infrastructure:** freeze Vercel dependency installs ([96cd10c](https://github.com/tutur3u/platform/commit/96cd10cd0f59d32a4ed1570944d469cfb3418393))
* **infrastructure:** guard whitelist request rendering ([a84acac](https://github.com/tutur3u/platform/commit/a84acacbb1de012293f76ab2cf60fd014e89478c))
* **infrastructure:** own admin APIs and paginate models ([a73514c](https://github.com/tutur3u/platform/commit/a73514cbdac132a9bd05f69979cd48561a223ee0))
* **infrastructure:** own AI credit admin APIs ([4606857](https://github.com/tutur3u/platform/commit/46068572bb741155973a7602e21026b8e8beb02b))
* **infrastructure:** pin Vercel Bun installer ([2dcaef0](https://github.com/tutur3u/platform/commit/2dcaef0dd6d87a89ebef87b34368ba926d949b50))
* **infrastructure:** restore production builds ([a9adc4a](https://github.com/tutur3u/platform/commit/a9adc4adc728114d7153511e77dbfddd58714700))
* **infrastructure:** use satellite database runtime ([ee4044e](https://github.com/tutur3u/platform/commit/ee4044edada1b69615e2cb62765e81c51c315d2e))
* **platform:** improve task details and satellite saves ([441c283](https://github.com/tutur3u/platform/commit/441c283f3003718723e4cf89d7d140e1515a6eec))
* **security:** enforce infrastructure workspace permissions ([00b469c](https://github.com/tutur3u/platform/commit/00b469c2345e9f13cf44ed27322e6536eaa90faa))
* **settings:** enable satellite profile management ([4876ae2](https://github.com/tutur3u/platform/commit/4876ae26a8e41278e34989c52650fc33ad248dde))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))

## [0.10.0](https://github.com/tutur3u/platform/compare/infra-v0.9.0...infra-v0.10.0) (2026-07-21)


### Features

* **chat:** mirror Zalo history media to Drive ([b8b5d7b](https://github.com/tutur3u/platform/commit/b8b5d7bb86ccac6351d17020fec16605d8413451))
* **infrastructure:** improve internal account management ([fa4e535](https://github.com/tutur3u/platform/commit/fa4e535d3193f275cfac4d808455caaab9d6b326))
* **infrastructure:** manage internal accounts ([02fd9f3](https://github.com/tutur3u/platform/commit/02fd9f3d1b4edb23c881e2dbb04bf244b36e6ed0))
* **inventory:** support Square POS app payments ([2cd087e](https://github.com/tutur3u/platform/commit/2cd087e15abe2a43da3c21333fe8d9494564fe37))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **satellite:** standardize fixed app headers ([7b86c42](https://github.com/tutur3u/platform/commit/7b86c4283b39ebc5de8bec971ce3bab5fdaef422))
* **satellite:** unify app switcher headers ([411a00c](https://github.com/tutur3u/platform/commit/411a00c9cbb584579e0d8f8e7fa4c2721c414ba3))


### Bug Fixes

* **chat:** harden personal Zalo integration ([f1d12c6](https://github.com/tutur3u/platform/commit/f1d12c60fe12ab3b01a1be3f0381573d44a32226))
* **chat:** keep Zalo phone sync alive ([5cc7a0d](https://github.com/tutur3u/platform/commit/5cc7a0df42c8ad3b7a9e5785cf5d8e9a99c56b76))
* **chat:** stop Zalo phone sync spam ([b45e778](https://github.com/tutur3u/platform/commit/b45e778693f175b7bafcd00d6b3ec46f079a946c))
* localize realtime analytics filters ([10c14fa](https://github.com/tutur3u/platform/commit/10c14faadc0e0fc6e82fabb2001038e3005e08b6))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* resolve remaining quality suggestions ([826aec4](https://github.com/tutur3u/platform/commit/826aec4af9e8291eb02dc8430b4adab4b110018a))
* **satellite:** restore mobile workspace settings ([e276f40](https://github.com/tutur3u/platform/commit/e276f4006175cfb501410b3875e661d3975c27f2))
* **security:** remediate code scanning findings ([023db2e](https://github.com/tutur3u/platform/commit/023db2edf4b0557be108a9d772cbc7e2223af947))
* **tasks:** repair onboarding and external metadata ([e0b62eb](https://github.com/tutur3u/platform/commit/e0b62eb7119155f6e4cad3dc4fb4d0f9820c98e8))

## [0.9.0](https://github.com/tutur3u/platform/compare/infra-v0.8.0...infra-v0.9.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))
* **tasks:** add autonomous progress intelligence ([ba35df5](https://github.com/tutur3u/platform/commit/ba35df5485fb01e709bf651cc2083b5fa877560f))
* **tasks:** make task management autonomous ([431212d](https://github.com/tutur3u/platform/commit/431212d471425aba7fcffdd37d77039d64bec643))


### Bug Fixes

* **inventory:** clarify payment sync and settings ([cf05ed6](https://github.com/tutur3u/platform/commit/cf05ed63cfc47022a95177b661d1fa796d68d65e))
* **mobile:** preserve bearer auth across satellites ([f890170](https://github.com/tutur3u/platform/commit/f89017044cf3aaaa6a1b15c31c64a81d75cfdab2))

## [0.8.0](https://github.com/tutur3u/platform/compare/infra-v0.7.0...infra-v0.8.0) (2026-07-13)


### Features

* **contacts:** reconcile managers and harden attendance ([9f0d302](https://github.com/tutur3u/platform/commit/9f0d30291f96bd22429622ea7a477d12a5678db9))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.7.0](https://github.com/tutur3u/platform/compare/infra-v0.6.0...infra-v0.7.0) (2026-07-11)


### Features

* **infrastructure:** add satellite shell parity ([d2fcaf3](https://github.com/tutur3u/platform/commit/d2fcaf35a8c2dd2ccb6b14961287c3d518c02a26))
* **inventory:** add revenue share and category bundles ([20b2e1e](https://github.com/tutur3u/platform/commit/20b2e1e5302d1db275766b7b4b92d9bdf69de04a))
* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))
* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add quick-create targeting and edge autoscroll ([f03e932](https://github.com/tutur3u/platform/commit/f03e9324b0cce18e9f9974cc8fe251bb58b686bd))
* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **ci:** allow duplicated aws smithy clients ([c29829e](https://github.com/tutur3u/platform/commit/c29829ef65ede187bc55350c52c42354da30d161))
* **ci:** normalize aws presign types ([860e209](https://github.com/tutur3u/platform/commit/860e209d5f986eca5bffc1378e82201284206a86))
* **devboxes:** gate heartbeat and split v1 dispatch ([34c7a49](https://github.com/tutur3u/platform/commit/34c7a49d015d55a3ba910b3e332be819d4528a59))
* **infrastructure:** harden internal dashboard access ([81e8f8b](https://github.com/tutur3u/platform/commit/81e8f8b2d411bbf43a2b5418ea69593ea32418c5))
* **infrastructure:** land root workspace on internal ([b3f63c2](https://github.com/tutur3u/platform/commit/b3f63c2e27dab7c5746f58e306d521f1e581b849))
* **infrastructure:** provide intl context in locale layout ([39ebbba](https://github.com/tutur3u/platform/commit/39ebbba5d2962ca1675b75d7a9e9a598c65418fb))
* **infrastructure:** replace workspace picker with logo link ([0e998eb](https://github.com/tutur3u/platform/commit/0e998eb7650cecad1d5042b59fb46af18f578160))
* **infrastructure:** restore canonical auth host access ([9f6715f](https://github.com/tutur3u/platform/commit/9f6715fb1c5a89598556cba33b16938b76995fc6))
* **infrastructure:** show dashboard error details ([70de0b7](https://github.com/tutur3u/platform/commit/70de0b7f7682805e71faa6ead445c5a62077789d))
* **infrastructure:** stop protected locale redirect loop ([d8843b5](https://github.com/tutur3u/platform/commit/d8843b593fffb577070dc2037b4636de2f7b1e6e))
* **mail:** localize post email dates ([9be736d](https://github.com/tutur3u/platform/commit/9be736dcb5d4594996bdba800aa385334ddf37e4))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))
* **web:** make login shell cache friendly ([0fcf4da](https://github.com/tutur3u/platform/commit/0fcf4da565e5e4260032247d6ee710cb6c4b7fcd))

## [0.6.0](https://github.com/tutur3u/platform/compare/infra-v0.5.0...infra-v0.6.0) (2026-07-11)


### Features

* **tasks:** consolidate tasks entry and sidebar controls ([56e80eb](https://github.com/tutur3u/platform/commit/56e80eb5c60d4b4e56f2953c7978038f1ebe9c08))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **auth:** share account preference cookies ([8c1848a](https://github.com/tutur3u/platform/commit/8c1848a941c1b3f91337104c975e4bc0d8f68fc9))
* update launchable app catalog ([cb31207](https://github.com/tutur3u/platform/commit/cb312076aee227de9a8f99105d681911d14a63ac))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))
* **web:** make login shell cache friendly ([0fcf4da](https://github.com/tutur3u/platform/commit/0fcf4da565e5e4260032247d6ee710cb6c4b7fcd))

## [0.5.0](https://github.com/tutur3u/platform/compare/infra-v0.4.0...infra-v0.5.0) (2026-07-06)


### Features

* **satellite:** improve apps launcher picker ([a3e92cb](https://github.com/tutur3u/platform/commit/a3e92cb1a54e3cb45bc1697e8e70efd0776d2a23))
* **tasks:** add quick-create targeting and edge autoscroll ([f03e932](https://github.com/tutur3u/platform/commit/f03e9324b0cce18e9f9974cc8fe251bb58b686bd))

## [0.4.0](https://github.com/tutur3u/platform/compare/infra-v0.3.0...infra-v0.4.0) (2026-07-05)


### Features

* **satellite:** add sidebar apps launcher ([b2f6fcd](https://github.com/tutur3u/platform/commit/b2f6fcd55d7cb5c100e31d36f9f329817ecfe5e9))


### Bug Fixes

* **ci:** allow duplicated aws smithy clients ([c29829e](https://github.com/tutur3u/platform/commit/c29829ef65ede187bc55350c52c42354da30d161))
* **ci:** normalize aws presign types ([860e209](https://github.com/tutur3u/platform/commit/860e209d5f986eca5bffc1378e82201284206a86))
* **devboxes:** gate heartbeat and split v1 dispatch ([34c7a49](https://github.com/tutur3u/platform/commit/34c7a49d015d55a3ba910b3e332be819d4528a59))
* **infrastructure:** replace workspace picker with logo link ([0e998eb](https://github.com/tutur3u/platform/commit/0e998eb7650cecad1d5042b59fb46af18f578160))
* **mail:** localize post email dates ([9be736d](https://github.com/tutur3u/platform/commit/9be736dcb5d4594996bdba800aa385334ddf37e4))

## [0.3.0](https://github.com/tutur3u/platform/compare/infra-v0.2.0...infra-v0.3.0) (2026-07-03)


### Features

* **infrastructure:** add satellite shell parity ([d2fcaf3](https://github.com/tutur3u/platform/commit/d2fcaf35a8c2dd2ccb6b14961287c3d518c02a26))
* **inventory:** add revenue share and category bundles ([20b2e1e](https://github.com/tutur3u/platform/commit/20b2e1e5302d1db275766b7b4b92d9bdf69de04a))


### Bug Fixes

* **build:** restore repo check ([4def830](https://github.com/tutur3u/platform/commit/4def830f463ea8a9c31af8e982eab716e9bd5f72))
* **infrastructure:** harden internal dashboard access ([81e8f8b](https://github.com/tutur3u/platform/commit/81e8f8b2d411bbf43a2b5418ea69593ea32418c5))
* **infrastructure:** land root workspace on internal ([b3f63c2](https://github.com/tutur3u/platform/commit/b3f63c2e27dab7c5746f58e306d521f1e581b849))
* **infrastructure:** provide intl context in locale layout ([39ebbba](https://github.com/tutur3u/platform/commit/39ebbba5d2962ca1675b75d7a9e9a598c65418fb))
* **infrastructure:** restore canonical auth host access ([9f6715f](https://github.com/tutur3u/platform/commit/9f6715fb1c5a89598556cba33b16938b76995fc6))
* **infrastructure:** show dashboard error details ([70de0b7](https://github.com/tutur3u/platform/commit/70de0b7f7682805e71faa6ead445c5a62077789d))
* **infrastructure:** stop protected locale redirect loop ([d8843b5](https://github.com/tutur3u/platform/commit/d8843b593fffb577070dc2037b4636de2f7b1e6e))

## [0.2.0](https://github.com/tutur3u/platform/compare/infra-v0.1.1...infra-v0.2.0) (2026-06-29)


### Features

* **tasks:** add task templates ([8d0700a](https://github.com/tutur3u/platform/commit/8d0700ad255c7b5874bfa065575df6b1cde34063))

## [0.1.1](https://github.com/tutur3u/platform/compare/infra-v0.1.0...infra-v0.1.1) (2026-06-24)


### Bug Fixes

* **ci:** support ts7 native next builds ([b0af764](https://github.com/tutur3u/platform/commit/b0af7640d3035f64301d154f86b080824885e121))
