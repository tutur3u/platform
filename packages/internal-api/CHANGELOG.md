# Changelog

## [0.9.0](https://github.com/tutur3u/platform/compare/internal-api-v0.8.0...internal-api-v0.9.0) (2026-06-17)


### Features

* add tests ([1bd19e0](https://github.com/tutur3u/platform/commit/1bd19e0402a78084095dd523603aca6ee52418fc))
* create test ([c225f9d](https://github.com/tutur3u/platform/commit/c225f9d636a701397c43249131f35fbb36e284e4))
* create test page ([618fffa](https://github.com/tutur3u/platform/commit/618fffabeeedfa09d72cd877e2bfd9e806a05090))
* create test view for student ([40bdd08](https://github.com/tutur3u/platform/commit/40bdd08ca449c7e151b0beae6d27d60fb913fe51))
* **inventory:** fix Polar checkout currency, add 2-way product sync, cache + redesign storefront ([de2f6fd](https://github.com/tutur3u/platform/commit/de2f6fd6e06ce5242a150a35d3989798f52b9ee9))
* **inventory:** per-storefront Polar environment + clearer checkout errors ([b30c2ed](https://github.com/tutur3u/platform/commit/b30c2eddced0d63ce47c857e8da4578fcf6151d1))
* **inventory:** per-variant SKUs + storefront cart, dialog & instant checkout ([9662b85](https://github.com/tutur3u/platform/commit/9662b8501bcab51033edde79b44991c8ba648a37))
* **inventory:** per-workspace Polar webhook ingestion + signature verification ([862b25a](https://github.com/tutur3u/platform/commit/862b25af444a56ef85c6a4e3dab7b91ae71438fe))
* **inventory:** Polar product sync-health card in the hub ([5552285](https://github.com/tutur3u/platform/commit/5552285621ce5353ef3bf83344a3d0b0648b403b))
* **inventory:** storefront analytics funnel ([312fc6d](https://github.com/tutur3u/platform/commit/312fc6d9dafe4300ddcbddbc953b35dba6f418f6))
* **mobile-deployment:** add field dropdowns and non-secret value readback ([a3a27d1](https://github.com/tutur3u/platform/commit/a3a27d1d9e4e2b25fcfd8a930cdc63c6e47d3224))
* **tasks:** add per-board default list for new tasks ([2d1d308](https://github.com/tutur3u/platform/commit/2d1d3082422bdd4813accb258fee79b322ce647b))
* **users:** add no-auth mode for profile-completion links ([c97daee](https://github.com/tutur3u/platform/commit/c97daee7ee04a6d2585213c510dc3943943257d8))
* **web:** extend profile completion links ([e8585a3](https://github.com/tutur3u/platform/commit/e8585a390b4cc8ae44cd0a15e667ae0f94a52494))
* **web:** rate limits admin center ([fe61dc9](https://github.com/tutur3u/platform/commit/fe61dc933615466f6169a3db3a4a1840f705e80b))


### Bug Fixes

* **auth:** consume external app refresh tokens ([7f5a4ab](https://github.com/tutur3u/platform/commit/7f5a4ab250214018ca34e61b7084fd55865c17bc))
* build checks ([3b9c3e9](https://github.com/tutur3u/platform/commit/3b9c3e9904bf2122b247a38c313e8622637910b7))
* **ci:** stabilize platform check gates ([81c7cc9](https://github.com/tutur3u/platform/commit/81c7cc9b97ec12c7406ba63a330ecd7f062714fc))
* **external:** verify media asset upload sizes ([388d65c](https://github.com/tutur3u/platform/commit/388d65c039042deac06371093a1e21c300ac05f6))
* **inventory:** match promotion update response ([a1a3450](https://github.com/tutur3u/platform/commit/a1a34503d5868e06d85d2d4bd9dd0cca94d0d47b))
* **inventory:** use resolved workspace id in Polar webhook URL ([6395708](https://github.com/tutur3u/platform/commit/639570850fb21d90647c73fc2aff1fe127e2f5a1))
* **members:** omit profile emails from updates ([4cdce52](https://github.com/tutur3u/platform/commit/4cdce52848ecc772b4f2cc1c54f6db673475ea81))
* ording question ([f0c32a4](https://github.com/tutur3u/platform/commit/f0c32a4e3b7634c73b0b7cc9b9b05af83468549a))
* **reports:** surface dashboard error codes ([db894c2](https://github.com/tutur3u/platform/commit/db894c2e978725c15ac38f2169bfd6511b37057d))
* **tasks:** hydrate task workspace metadata from server ([ebbcecb](https://github.com/tutur3u/platform/commit/ebbcecbd88e3215c6f91d7fc0719ce5bb6f23eee))
* **tulearn:** restore quiz answer feedback ([f462b57](https://github.com/tutur3u/platform/commit/f462b576d2b41889135c89a183c6bad09d410e92))
* **tulearn:** secure learner quiz submissions ([94afe79](https://github.com/tutur3u/platform/commit/94afe79e8b5c36bba8bd6d5c423faaf487d412d9))
* UI inconsistence and quiz sumission ([e9e360e](https://github.com/tutur3u/platform/commit/e9e360ef76c3f0513cf54a34a718e895c222de36))

## [0.8.0](https://github.com/tutur3u/platform/compare/internal-api-v0.7.1...internal-api-v0.8.0) (2026-06-15)


### Features

* **infrastructure:** edit mobile deployment env keys ([d3ad001](https://github.com/tutur3u/platform/commit/d3ad001bc503d21b3e495b47de6b277e8dc93c4f))
* **infrastructure:** protect mobile deployment vault ([bea31f2](https://github.com/tutur3u/platform/commit/bea31f2f71de509c5bc5e1b154ba62928ecea9c6))
* **internal-api:** add inventory promotion create/update/delete helpers ([27ea765](https://github.com/tutur3u/platform/commit/27ea76577712fcc958185a6fd2652a6fae918e52))
* **inventory:** add per-product actual P&L to the sales tab ([4dcdb29](https://github.com/tutur3u/platform/commit/4dcdb297e5dcce3adacdd2531e698068eecf4e6b))
* **inventory:** improve dialog lifecycle audit ux ([6d7814c](https://github.com/tutur3u/platform/commit/6d7814c80415bb14680746613e96d03387708df1))
* **inventory:** upgrade storefront commerce ([ac43942](https://github.com/tutur3u/platform/commit/ac439426ec6d7abc25efbf7ef88468e32be3a46e))
* **web:** add external user profile-completion links ([0effeb8](https://github.com/tutur3u/platform/commit/0effeb860f999227f673a55212d2cfd0c822105a))


### Bug Fixes

* **inventory:** route catalog product creation ([5887ef5](https://github.com/tutur3u/platform/commit/5887ef5bdf361b0c664063cbccb85cd51b437d4b))
* **tasks:** persist large task descriptions in chunks ([457744a](https://github.com/tutur3u/platform/commit/457744aa051d06baccc5df5aa4d4cb509534ea8b))
* **web:** handle processing topic announcements ([7462fb4](https://github.com/tutur3u/platform/commit/7462fb4a0d86ae26e54564c18281bc97407b31c4))

## [0.7.1](https://github.com/tutur3u/platform/compare/internal-api-v0.7.0...internal-api-v0.7.1) (2026-06-13)


### Bug Fixes

* **inventory:** route setup references through inventory APIs ([ae465ee](https://github.com/tutur3u/platform/commit/ae465ee90b202de02176c52037fa3f20b017a758))

## [0.7.0](https://github.com/tutur3u/platform/compare/internal-api-v0.6.0...internal-api-v0.7.0) (2026-06-13)


### Features

* **inventory:** add command center dashboard ([37ea5c5](https://github.com/tutur3u/platform/commit/37ea5c5e32c8be149a077269f246f4a369739f84))

## [0.6.0](https://github.com/tutur3u/platform/compare/internal-api-v0.5.0...internal-api-v0.6.0) (2026-06-13)


### Features

* **ci:** add GitHub bot check auto-pickup ([9e62daa](https://github.com/tutur3u/platform/commit/9e62daa5267b29ca5e55ed85c7d560415cef3b77))
* **finance:** add infinite wallet loading ([76eba7a](https://github.com/tutur3u/platform/commit/76eba7a849c3a6b948e231a1e83e1e2faa10bb16))
* **finance:** add reconciliation defaults and audited balances ([206f941](https://github.com/tutur3u/platform/commit/206f9416351ade0cfbd1ed822595d44843efbaeb))
* **finance:** add wallet checkpoint audit history ([11139c7](https://github.com/tutur3u/platform/commit/11139c7e354a8f29e83187748711f6ae39c48e70))
* **inventory:** add costing and simulated storefront checkout ([7fcdabb](https://github.com/tutur3u/platform/commit/7fcdabb145e6fa9cc899b563b117e65f7772643a))
* **inventory:** improve operator form workflows ([aa853a6](https://github.com/tutur3u/platform/commit/aa853a69c5d0166a55d2111ac962d0676bf91a56))
* **inventory:** revamp storefront commerce experience ([72a2bde](https://github.com/tutur3u/platform/commit/72a2bde46a1e6c2815d0b2111fc743373c7bec9b))
* **tasks:** add compact task dialog AI suggestions ([99058e9](https://github.com/tutur3u/platform/commit/99058e90a4f81153f664eb92fdbacade1e2188c6))


### Bug Fixes

* **infrastructure:** retire watcher production promotion ([df87579](https://github.com/tutur3u/platform/commit/df8757987459fd40661e988774ba0a46642376b4))
* **inventory:** consolidate commerce setup flows ([447cc3d](https://github.com/tutur3u/platform/commit/447cc3dbd64c864bda2d6cf88c2245cf16a1eac2))
* **inventory:** restore operator CRUD and commerce APIs ([dd38d43](https://github.com/tutur3u/platform/commit/dd38d43bea0e812e48ccc989c7204d1212ae4649))
* **tasks:** hydrate external dialogs from source workspace ([95a7a23](https://github.com/tutur3u/platform/commit/95a7a23ec8957918cffc81698e8fdc8951adf400))

## [0.5.0](https://github.com/tutur3u/platform/compare/internal-api-v0.4.1...internal-api-v0.5.0) (2026-06-11)


### Features

* **cli:** add calendar commands ([b916c1a](https://github.com/tutur3u/platform/commit/b916c1a0eeecfae961292466de0e9b37b9512b69))
* **finance:** add wallet checkpoints ([54f9f29](https://github.com/tutur3u/platform/commit/54f9f29446ff9991e09a68abb258ce66c640b086))
* **infrastructure:** improve log observability and redis defaults ([566724d](https://github.com/tutur3u/platform/commit/566724d691c0703038373d811ac41c709efa9544))


### Bug Fixes

* **learn:** secure learner quiz practice ([352183b](https://github.com/tutur3u/platform/commit/352183b0c67798867628adddc8fb5d18d262de40))
* **learn:** type learner quiz data ([f98ec7c](https://github.com/tutur3u/platform/commit/f98ec7cf0cf2f2e93faa8b57577dfff58a555a63))

## [0.4.1](https://github.com/tutur3u/platform/compare/internal-api-v0.4.0...internal-api-v0.4.1) (2026-06-11)


### Bug Fixes

* **ci:** isolate production promotion prebuilds ([d044288](https://github.com/tutur3u/platform/commit/d044288fdba58e4d1535b6eb41b992ec412a69de))

## [0.4.0](https://github.com/tutur3u/platform/compare/internal-api-v0.3.0...internal-api-v0.4.0) (2026-06-10)


### Features

* **chat:** add personal channels and root integrations ([fb5e753](https://github.com/tutur3u/platform/commit/fb5e7534588c7015449313fc4a752b70732f227e))
* **chat:** merge personal channels and root integrations ([22d50ce](https://github.com/tutur3u/platform/commit/22d50ce0d75e36e0beaa973ef59cbd296e22dc35))
* **infrastructure:** automate production promotion ([6b6a368](https://github.com/tutur3u/platform/commit/6b6a3685615c9aca9d957564cae46e9ea81e44a0))
* **inventory:** add storefront checkout app ([8a9f9b4](https://github.com/tutur3u/platform/commit/8a9f9b4bbe576af34a4db0956308b5b51fa1f099))
* **mobile:** add deployment vault CI flow ([b1d21eb](https://github.com/tutur3u/platform/commit/b1d21eb1e30d74b412e4687b095004c21cf03dd1))
* **web:** store multi-account sessions server-side ([2359f35](https://github.com/tutur3u/platform/commit/2359f35a849488f5b6c4070b87dbff8de2d8c9c4))


### Bug Fixes

* **chat:** harden production auth handoff ([8d2ba61](https://github.com/tutur3u/platform/commit/8d2ba61d817bb98f8b4b5880ea8ac802006e4a51))
* **web:** isolate login otp settings ([f8299aa](https://github.com/tutur3u/platform/commit/f8299aa5e8156910229a77540fb166eeb4a9d538))

## [0.3.0](https://github.com/tutur3u/platform/compare/internal-api-v0.2.1...internal-api-v0.3.0) (2026-06-10)


### Features

* **cli:** add host switching and finance transfers ([6c732c1](https://github.com/tutur3u/platform/commit/6c732c13fae9173e97cadb0b4534f37d42908a92))


### Bug Fixes

* **ci:** auto-recover package release dependencies ([40b2539](https://github.com/tutur3u/platform/commit/40b25390c903194a3c85cc627c737a4acd0d6fa9))
* **web:** harden task search and command launcher ([e4f8fd2](https://github.com/tutur3u/platform/commit/e4f8fd28bd78eabb0aa38182af2a32b85b5bf3e0))

## [0.2.1](https://github.com/tutur3u/platform/compare/internal-api-v0.2.0...internal-api-v0.2.1) (2026-06-09)


### Bug Fixes

* **ci:** recover releases and package tsgo builds ([d82b846](https://github.com/tutur3u/platform/commit/d82b846c6232d9fb72b7d2aa808020bc24292a19))

## [0.2.0](https://github.com/tutur3u/platform/compare/internal-api-v0.1.0...internal-api-v0.2.0) (2026-06-08)


### Features

* **auth:** share Supabase cookies across apps ([f72ec8e](https://github.com/tutur3u/platform/commit/f72ec8e7a35f13a301b95b2aa916aefbc5848e6e))
* **infrastructure:** add stress test observability ([41d8ab3](https://github.com/tutur3u/platform/commit/41d8ab3b0306c96569f0428d6efbc78ccecf9d1a))
* **platform:** add calendar sources and personal Zalo agents ([2746e72](https://github.com/tutur3u/platform/commit/2746e7297a43def06c3c2f12b7751dea94074113))
* **tasks:** show duration and quick scheduling menu ([9443183](https://github.com/tutur3u/platform/commit/944318327515269a5dce8b1c1ececb28823b0767))


### Bug Fixes

* **auth:** split shared-ip login rate limits ([1cbbd2f](https://github.com/tutur3u/platform/commit/1cbbd2f1f37512204640b4d309395786243f05de))
* **ci:** align package provenance metadata ([0f7ef88](https://github.com/tutur3u/platform/commit/0f7ef8834c0054b020c3eaa1042bfcf10145ab1a))
* **ci:** stabilize package release workflows ([d6243c2](https://github.com/tutur3u/platform/commit/d6243c2d7ee7ae599d9f17fba4be9f9cc71a1722))
* **tasks:** save scheduling settings through user route ([c282def](https://github.com/tutur3u/platform/commit/c282def601c1fc28ccc48f2d60a9313094dd6acc))
* **users:** restore referral search updates ([1703c46](https://github.com/tutur3u/platform/commit/1703c4603f95bfb266dac2f121825c056781d8fa))
* **web:** route login through auth APIs ([221e83c](https://github.com/tutur3u/platform/commit/221e83cbb14302c6fae4d0548b5023887a19c3e5))


### Performance Improvements

* **tasks:** filter task boards through server RPCs ([657f445](https://github.com/tutur3u/platform/commit/657f4458cd40c2e31774c7d9ef0628f986af1838))
* **web:** narrow workspace shell compile graph ([7544319](https://github.com/tutur3u/platform/commit/754431996d594961f4d279be522e043fe5ff3d62))

## [0.1.0](https://github.com/tutur3u/platform/compare/internal-api-v0.0.2...internal-api-v0.1.0) (2026-06-03)


### Features

* **chat:** add generated titles and personal sections ([10234b4](https://github.com/tutur3u/platform/commit/10234b4b8d48eb44828b89f86b7fcf59d587432e))


### Bug Fixes

* **chat:** support ai-agent title and gateway verification ([296cd07](https://github.com/tutur3u/platform/commit/296cd0727b56b8b2440e6877932c74fcad07e800))
* **infrastructure:** bind observability cursors before caps ([62d0826](https://github.com/tutur3u/platform/commit/62d0826a1ae8dc75921563fde332303d27c5e6a5))
* **storage:** mediate external project asset uploads ([e653210](https://github.com/tutur3u/platform/commit/e6532109fc20d54f2df1c11cd2412af6ca1dc185))
* **storage:** mediate group storage uploads ([df4a52d](https://github.com/tutur3u/platform/commit/df4a52ddbde12c72563aa771592268a5640d6bf9))
* **web:** enforce learner course assignments ([1d4795c](https://github.com/tutur3u/platform/commit/1d4795c1ce696613fc1b8df222c013767ba0ad6b))
