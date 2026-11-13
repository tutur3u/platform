# Changelog

## [1.6.0](https://github.com/tutur3u/platform/compare/meet-core-v1.5.0...meet-core-v1.6.0) (2026-11-13)


### Features

* **meet:** add erase subject HMAC primitives (V6) ([9d08bcd](https://github.com/tutur3u/platform/commit/9d08bcda39a4200c213d6f898915d1358c7b10c5))
* **meet:** add named media scrim token for participant name bar ([#7948](https://github.com/tutur3u/platform/issues/7948)) ([dcdd4d4](https://github.com/tutur3u/platform/commit/dcdd4d41a455afa9eb364b2559b6b4389e110c2e))
* **meet:** classroom room caps and host admission ([#8141](https://github.com/tutur3u/platform/issues/8141)) ([d827c7b](https://github.com/tutur3u/platform/commit/d827c7b86a29fd1b129311a84d38bc1fca62b7ff))
* **meet:** floating self-preview and calmer ended screen ([#7924](https://github.com/tutur3u/platform/issues/7924)) ([eb8b552](https://github.com/tutur3u/platform/commit/eb8b5528e9e0aa3c2a89c204982378b1fbda540a))


### Bug Fixes

* **meet:** gate private Mira on durable participant consent ([#8274](https://github.com/tutur3u/platform/issues/8274)) ([061a566](https://github.com/tutur3u/platform/commit/061a566123e309f9004eb0793cd9a59016924c04))
* **meet:** inline the Mira mark and tighten the preparing screen ([#7922](https://github.com/tutur3u/platform/issues/7922)) ([31e74be](https://github.com/tutur3u/platform/commit/31e74be24b981b1e70ab372ee3c9f7cfafd7054b))
* **meet:** keep the name bar readable on light avatar tiles ([#7953](https://github.com/tutur3u/platform/issues/7953)) ([ce96056](https://github.com/tutur3u/platform/commit/ce96056f9b3eb0093cd282cd502ee06c25a242be))
* **meet:** make Private Mira choices, leave and denials visible ([#8287](https://github.com/tutur3u/platform/issues/8287)) ([aad395d](https://github.com/tutur3u/platform/commit/aad395d94983c82d4623086e269d53f540fbae4e))
* **meet:** make the Meet AI gate default-off (allowlist-only, EC denied in code) ([#7518](https://github.com/tutur3u/platform/issues/7518)) ([660fa01](https://github.com/tutur3u/platform/commit/660fa0199d80c1b332a652b4d37958a20c738ce3))
* **meet:** prepare transcript readers for erasure markers ([#7517](https://github.com/tutur3u/platform/issues/7517)) ([f35343e](https://github.com/tutur3u/platform/commit/f35343e88998b4748ffe459a86debf26fb6bfb2c))
* **meet:** refuse legacy transcription permanently and retire the old recorder ([#7506](https://github.com/tutur3u/platform/issues/7506)) ([5ac0f24](https://github.com/tutur3u/platform/commit/5ac0f241be51d094ca2e515015a5307a386d342e))
* **meet:** remove unused meeting AI availability bindings ([#8276](https://github.com/tutur3u/platform/issues/8276)) ([418d59e](https://github.com/tutur3u/platform/commit/418d59ef181421761aa366bbe98a2c8cf1dc0ad9))

## [1.5.0](https://github.com/tutur3u/platform/compare/meet-core-v1.4.2...meet-core-v1.5.0) (2026-11-08)


### Features

* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
* **meet:** default-allow Meet AI with a kill switch ([#7410](https://github.com/tutur3u/platform/issues/7410)) ([a96f160](https://github.com/tutur3u/platform/commit/a96f1609656bed08678af0dd1fb828711af4278a))
* **meet:** fail-closed per-user Meet AI limiter ([#7417](https://github.com/tutur3u/platform/issues/7417)) ([fca5cb0](https://github.com/tutur3u/platform/commit/fca5cb0b31a5966bab2d8fe16b9d0c8f2f7986fe))
* **meet:** gate Meet AI behind a default-deny workspace allowlist ([#7354](https://github.com/tutur3u/platform/issues/7354)) ([c1ec761](https://github.com/tutur3u/platform/commit/c1ec761dedcdd01041e4b6b82f53aa62f001655f))
* **meet:** improve transcription quality and support solo meetings ([#7267](https://github.com/tutur3u/platform/issues/7267)) ([ecc5e53](https://github.com/tutur3u/platform/commit/ecc5e53bfa6423ddbd9aaf789e6779c551064eab))
* **meet:** limit transcript and notes reads to participants and admins ([#7293](https://github.com/tutur3u/platform/issues/7293)) ([ab3216d](https://github.com/tutur3u/platform/commit/ab3216dceaaed5483fa0debd90f091cb9473d06f))
* **meet:** lobby camera and mic preview ([#7419](https://github.com/tutur3u/platform/issues/7419)) ([4c24127](https://github.com/tutur3u/platform/commit/4c24127c2021af53948b53ccd73109937cbe15b4))
* **meet:** lobby device controls ([#7418](https://github.com/tutur3u/platform/issues/7418)) ([9ecc80f](https://github.com/tutur3u/platform/commit/9ecc80fe6caadd2667213f02679ed77396bbed76))
* **meet:** lobby device store and media meter ([27193dc](https://github.com/tutur3u/platform/commit/27193dc5770335c2f44f4b10e982638930bb809a))
* **meet:** lobby media capture and device list ([#7416](https://github.com/tutur3u/platform/issues/7416)) ([2a87e7e](https://github.com/tutur3u/platform/commit/2a87e7ee514a931566e3221e6a867f1fb6a92213))
* **meet:** lobby presence and guest display names ([#7415](https://github.com/tutur3u/platform/issues/7415)) ([54661e1](https://github.com/tutur3u/platform/commit/54661e18400be851b3c4d30dbcf0db3e90721d34))
* **meet:** make the preparing-call screen minimal ([#7449](https://github.com/tutur3u/platform/issues/7449)) ([b003573](https://github.com/tutur3u/platform/commit/b003573eff405c5b3b1e03015e107621785d15c2))
* **meet:** notes and transcript tabs on the meeting page ([#7283](https://github.com/tutur3u/platform/issues/7283)) ([2f8c357](https://github.com/tutur3u/platform/commit/2f8c3579d6cb727c3cfd2b84c6f3d7645ba987db))
* **meet:** pre-join waiting room UI call integration ([cd8f37d](https://github.com/tutur3u/platform/commit/cd8f37d99f7d39914876603b6f573d80495426d9)) ([#7421](https://github.com/tutur3u/platform/issues/7421)) ([c84f02c](https://github.com/tutur3u/platform/commit/c84f02c8cbfb15bdd5149bb1f5466ada57b5416c))
* **meet:** pre-join waiting room UI controls ([e21631d](https://github.com/tutur3u/platform/commit/e21631d74a706f4cfbe8c5900dd577864f2aefc1))
* **meet:** pre-join waiting room UI preview ([4629230](https://github.com/tutur3u/platform/commit/462923074c1822ba0badf774b9e90fd495f2786e))
* **realtime:** let lobby guests set their display name ([5e64a58](https://github.com/tutur3u/platform/commit/5e64a58284c6f8ace6b03f11377af45391b4b4bd))
* **tasks:** add per-board sprint data model ([#7043](https://github.com/tutur3u/platform/issues/7043)) ([9b08aef](https://github.com/tutur3u/platform/commit/9b08aef8da70cb686870790925d68368afef4f07))


### Bug Fixes

* **ai:** require workspace access for meeting transcription ([#7357](https://github.com/tutur3u/platform/issues/7357)) ([c2763ae](https://github.com/tutur3u/platform/commit/c2763aeb66c094982c3bf8fa83d5b2da6d5cc3a5))
* **meet:** announce a blocked lobby microphone with the camera on ([f5213f7](https://github.com/tutur3u/platform/commit/f5213f7dfac697ef2f8cb71adf8c570c1d8c0202))
* **meet:** apply only the newest lobby device enumeration ([20de6bc](https://github.com/tutur3u/platform/commit/20de6bc0ea4ebd030d7209ce6778225ab7f4272f))
* **meet:** bill Meet AI to the meeting workspace's AI credits ([#7408](https://github.com/tutur3u/platform/issues/7408)) ([0f8b6dc](https://github.com/tutur3u/platform/commit/0f8b6dcac84f7b29d4c6a15e574330d7b3ad4349))
* **meet:** derive lobby picker ids from useId ([ea012b8](https://github.com/tutur3u/platform/commit/ea012b8097f445a9a9f4b50036cfcddad2de97cc))
* **meet:** disable the speaker picker when no outputs are listed ([8766a58](https://github.com/tutur3u/platform/commit/8766a58c67e24ade939d86c09ec98f52b4bbc585))
* **meet:** drop Chrome's communications pseudo-device from lobby pickers ([a407d7a](https://github.com/tutur3u/platform/commit/a407d7aaee88adaa2147e88767d0c8473ae92a24))
* **meet:** fall back to the default device when a lobby id is stale ([bb1328d](https://github.com/tutur3u/platform/commit/bb1328d3187bc85599344ca3ecbff47024984f09))
* **meet:** format the lobby roster overflow as one ICU message ([39f3079](https://github.com/tutur3u/platform/commit/39f3079213692171d356479c41660295e8758a20))
* **meet:** keep spaces and IME text while guests type their name ([768919d](https://github.com/tutur3u/platform/commit/768919d4e6ce9d5726816e944411deb24eaaa151))
* **meet:** let System default recover an unlisted lobby device ([b7fde79](https://github.com/tutur3u/platform/commit/b7fde79ba9faabcb7b2160b961a81c56d5007502))
* **meet:** lock lobby media only after Join, not while waiting or connecting ([ab34a6b](https://github.com/tutur3u/platform/commit/ab34a6bc5d781874c964cc900e62fc6938c059c7))
* **meet:** lock lobby media toggles while the join request is in flight ([9249fdd](https://github.com/tutur3u/platform/commit/9249fdddafd49dc9da44aa0591fa916f253a62f5))
* **meet:** lock lobby media while a join request waits for the host ([5ad25a2](https://github.com/tutur3u/platform/commit/5ad25a294bc2aa82e0c2ea33ab6249dc813b52db))
* **meet:** render Mira avatar without the image optimizer ([#7448](https://github.com/tutur3u/platform/issues/7448)) ([ab99463](https://github.com/tutur3u/platform/commit/ab9946399d322e65a71b18a524f241f585256d59))
* **meet:** send the lobby guest name to presence only when it changed ([2a21aac](https://github.com/tutur3u/platform/commit/2a21aacd214ea6d3d10092c072be3e661eee0e84))
* **release:** preserve cycle compatibility and publication holds ([#7779](https://github.com/tutur3u/platform/issues/7779)) ([ee6e298](https://github.com/tutur3u/platform/commit/ee6e298f623857f543dd74aa7f7d47bb9b0471bf))
* **types:** avoid deep rpc instantiation in client bindings ([8e6c343](https://github.com/tutur3u/platform/commit/8e6c34352a609ad8774502af1c716fe1c6348e39))


### Performance Improvements

* **meet:** cut sequential round trips in room and workspace loaders ([#7445](https://github.com/tutur3u/platform/issues/7445)) ([da9c301](https://github.com/tutur3u/platform/commit/da9c30151fb840c5ae2d758929c81972b46355e4))
* **meet:** keep the lobby mic meter level inside the meter ([946d031](https://github.com/tutur3u/platform/commit/946d031b80632eab0e404d5b66588552bea72de6))

## [1.4.2](https://github.com/tutur3u/platform/compare/meet-core-v1.4.1...meet-core-v1.4.2) (2026-10-24)


### Bug Fixes

* **security:** resolve code-scanning findings in shared packages and runtime logs ([#6531](https://github.com/tutur3u/platform/issues/6531)) ([5690b3d](https://github.com/tutur3u/platform/commit/5690b3dc934f358dc8afdcd74fba06ce5eb16850))

## [1.4.1](https://github.com/tutur3u/platform/compare/meet-core-v1.4.0...meet-core-v1.4.1) (2026-10-17)


### Bug Fixes

* **release:** reconcile production history before Contacts rollout ([dc017a2](https://github.com/tutur3u/platform/commit/dc017a227de6f284268b34690198972c06c52434)) ([#6241](https://github.com/tutur3u/platform/issues/6241)) ([66654a5](https://github.com/tutur3u/platform/commit/66654a5d7ad441a93070d1502f267d6d4e08a6cd))

## [1.4.0](https://github.com/tutur3u/platform/compare/meet-core-v1.3.0...meet-core-v1.4.0) (2026-10-09)


### Features

* **meet:** keep participant media visible alongside collaboration ([0f684f7](https://github.com/tutur3u/platform/commit/0f684f78f93e1b7f5f1961c8520b8f93b8e60659)) ([#5935](https://github.com/tutur3u/platform/issues/5935)) ([bcdd4da](https://github.com/tutur3u/platform/commit/bcdd4daf1f1a11d5ade99c015aca2eae69d61a63))
* **meet:** simplify the in-call document toolbar ([6020a1e](https://github.com/tutur3u/platform/commit/6020a1eddfc4f8cab9179daf1feb126f9dfc0501)) ([#5918](https://github.com/tutur3u/platform/issues/5918)) ([fa358e7](https://github.com/tutur3u/platform/commit/fa358e76517e5bc9793caf72658738d9bf2b42d6))


### Bug Fixes

* **meet:** avoid generating notes for empty saved speech ([b17cd52](https://github.com/tutur3u/platform/commit/b17cd52430f9d5849b6898ea2df0d0ab4982bc49)) ([#5940](https://github.com/tutur3u/platform/issues/5940)) ([da868c5](https://github.com/tutur3u/platform/commit/da868c5498a18bf0bbbafabb2509aed3c80d039f))
* **meet:** bind shared documents to collaboration ([cf2c962](https://github.com/tutur3u/platform/commit/cf2c962e52fa0f57f843775f4627d80fffa02563)) ([#5934](https://github.com/tutur3u/platform/issues/5934)) ([aedd877](https://github.com/tutur3u/platform/commit/aedd8774ec681ffd9711ee2b9d4988c4c4b799bf))
* **meet:** commit capture leases before admitting operations ([df452d5](https://github.com/tutur3u/platform/commit/df452d55cad587d2eea7b54ad238728972079009))
* **meet:** end empty rooms and allow owner restoration ([2d6f856](https://github.com/tutur3u/platform/commit/2d6f8562511f0264f700003fa9a2a60b0198e2b5)) ([#5924](https://github.com/tutur3u/platform/issues/5924)) ([c5f75c0](https://github.com/tutur3u/platform/commit/c5f75c0f4fa66a0933123b5580ff6bfa69914481))
* **meet:** explain unavailable assistant workspaces ([92441d5](https://github.com/tutur3u/platform/commit/92441d5115f27b572841496e962e15a8c035d4a4)) ([#5986](https://github.com/tutur3u/platform/issues/5986)) ([e3505dc](https://github.com/tutur3u/platform/commit/e3505dc9c1e2534a772c3f7a03c53dc7a3b5fad8))
* **meet:** fence automatic finalizers by capture epoch ([9a7826d](https://github.com/tutur3u/platform/commit/9a7826dcd3fb8d7eb7ec1576bfeddcd06628c864))
* **meet:** fence transcription capture by actor and room scope ([5d8257f](https://github.com/tutur3u/platform/commit/5d8257f8b8cbfd9ff1da640a9ebc4cdbdec8146a))
* **meet:** retry final notes persistence without regeneration ([eab84a6](https://github.com/tutur3u/platform/commit/eab84a64929fb722c8bbaa29087b86d763e236a0))
* **meet:** retry notes persistence without repeating generation ([#5978](https://github.com/tutur3u/platform/issues/5978)) ([d1265f2](https://github.com/tutur3u/platform/commit/d1265f222c0e0cf3d7af85eedc356bdc644d346c))
* **meet:** retry settled transcript persistence ([459bb48](https://github.com/tutur3u/platform/commit/459bb48e87dfc327dc82c011035dbee6c928e30e)) ([#5982](https://github.com/tutur3u/platform/issues/5982)) ([7cfb5d7](https://github.com/tutur3u/platform/commit/7cfb5d71b2a8763034804ffcebc576293c6b8899))
* **meet:** scope transcription capture to committed actor and room ([#5980](https://github.com/tutur3u/platform/issues/5980)) ([1f85042](https://github.com/tutur3u/platform/commit/1f85042bee9d99c9f10fe0f50b046874c3cc2557))
* **meet:** show live document collaborators in toolbar ([d26bf74](https://github.com/tutur3u/platform/commit/d26bf74add981bac864ad7142e51d5ac9f33c43c)) ([#5939](https://github.com/tutur3u/platform/issues/5939)) ([11eac0c](https://github.com/tutur3u/platform/commit/11eac0c3de1cb58fd6824acf16819ef625eae1ae))
* **meet:** stop credit recovery retries and explain AI failures ([6def199](https://github.com/tutur3u/platform/commit/6def199b12e9d2b1a86785ae5a81761604589d7f)) ([#5938](https://github.com/tutur3u/platform/issues/5938)) ([1193fa8](https://github.com/tutur3u/platform/commit/1193fa8304eb0acbd4c19f53479f499280563ddb))
* **meet:** use account identity for assistant workspace admission ([d928646](https://github.com/tutur3u/platform/commit/d928646ddebe6a456f559073a9fc50872773a43e)) ([#5937](https://github.com/tutur3u/platform/issues/5937)) ([6809ba4](https://github.com/tutur3u/platform/commit/6809ba498f045f903f0fc6d0241d8fffa49e1cb3))

## [1.3.0](https://github.com/tutur3u/platform/compare/meet-core-v1.2.1...meet-core-v1.3.0) (2026-10-04)


### Features

* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **identity:** integrate main and order unapplied creator migrations ([5512e24](https://github.com/tutur3u/platform/commit/5512e2414abaa0c78b68cbdd3186a1d4bab861e7))
* **meet:** restore mobile capture and room notifications ([#5721](https://github.com/tutur3u/platform/issues/5721)) ([d116a54](https://github.com/tutur3u/platform/commit/d116a54262fb74da780968d27ee8bbe0245d5812))

## [1.2.1](https://github.com/tutur3u/platform/compare/meet-core-v1.2.0...meet-core-v1.2.1) (2026-09-28)


### Bug Fixes

* **meet:** restore shared call styling and responsive lobby ([cc05c81](https://github.com/tutur3u/platform/commit/cc05c8154bc13c7bbee1945eb1170b4ff2283386)) ([#5591](https://github.com/tutur3u/platform/issues/5591)) ([5bdb763](https://github.com/tutur3u/platform/commit/5bdb763144391742e7dc8faa36d83df352fe868e))

## [1.2.0](https://github.com/tutur3u/platform/compare/meet-core-v1.1.0...meet-core-v1.2.0) (2026-09-26)


### Features

* **parley:** add native scenario admin and session entry points ([3351094](https://github.com/tutur3u/platform/commit/3351094d9f8c269e83b67f24dc20906649b142c1)) ([#5531](https://github.com/tutur3u/platform/issues/5531)) ([88610f7](https://github.com/tutur3u/platform/commit/88610f7834a70e30b4c4b2c5a5f26b1beae1a073))

## [1.1.0](https://github.com/tutur3u/platform/compare/meet-core-v1.0.0...meet-core-v1.1.0) (2026-09-25)


### Features

* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** adopt satellite shell and session reviews ([7746da1](https://github.com/tutur3u/platform/commit/7746da1f380a1d5761e8f813051fe48594d6e30f)) ([#5509](https://github.com/tutur3u/platform/issues/5509)) ([88f36df](https://github.com/tutur3u/platform/commit/88f36df2d1862a30b824aed9b98d880e72f59368))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))


### Bug Fixes

* **parley:** address studio review edge cases ([bddd876](https://github.com/tutur3u/platform/commit/bddd876eef70e86f10f1f070b23fe8b64ab2c5f5))
* **parley:** complete discovery empty states ([b5c962d](https://github.com/tutur3u/platform/commit/b5c962dfd4d1ed7c7f75ddf7329e44ab4d64d1cc))
* **parley:** complete workspace and deployment setup ([52e979f](https://github.com/tutur3u/platform/commit/52e979fef43a447aadf42b7ccf09e9579e0eee37))

## 1.0.0 (2026-09-25)


### Features

* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** adopt satellite shell and session reviews ([7746da1](https://github.com/tutur3u/platform/commit/7746da1f380a1d5761e8f813051fe48594d6e30f)) ([#5509](https://github.com/tutur3u/platform/issues/5509)) ([88f36df](https://github.com/tutur3u/platform/commit/88f36df2d1862a30b824aed9b98d880e72f59368))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))


### Bug Fixes

* **parley:** address studio review edge cases ([bddd876](https://github.com/tutur3u/platform/commit/bddd876eef70e86f10f1f070b23fe8b64ab2c5f5))
* **parley:** complete discovery empty states ([b5c962d](https://github.com/tutur3u/platform/commit/b5c962dfd4d1ed7c7f75ddf7329e44ab4d64d1cc))
* **parley:** complete workspace and deployment setup ([52e979f](https://github.com/tutur3u/platform/commit/52e979fef43a447aadf42b7ccf09e9579e0eee37))
