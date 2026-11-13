:robot: I have created a release *beep* *boop*
---


<details><summary>platform: 0.74.0</summary>

## [0.74.0](https://github.com/tutur3u/platform/compare/platform-v0.73.0...platform-v0.74.0) (2026-11-13)


### Features

* **agent-skills:** vendor reviewed ui-sdk guidance ([#8247](https://github.com/tutur3u/platform/issues/8247)) ([809f850](https://github.com/tutur3u/platform/commit/809f85053785aca9c4e032686b41e66c70dbd015))
* **api:** define workspace endpoints slice 1 ([#7946](https://github.com/tutur3u/platform/issues/7946)) ([4214632](https://github.com/tutur3u/platform/commit/421463273abed86a3df1029d096abe57939f67c7))
* **api:** wire mobile version rollback route and audit slice 2 handlers ([#7942](https://github.com/tutur3u/platform/issues/7942)) ([646de8a](https://github.com/tutur3u/platform/commit/646de8a52d51db5809ea28d17f6a03c418cfc299))
* **auth:** same-origin sign-in return for apex-mounted apps ([#8095](https://github.com/tutur3u/platform/issues/8095)) ([966bad2](https://github.com/tutur3u/platform/commit/966bad2d958e3d529b7daa940f350e833c13c960))
* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **chat:** native TanStack Start + Void source for Cloudflare Workers ([#7962](https://github.com/tutur3u/platform/issues/7962)) ([1bf70ed](https://github.com/tutur3u/platform/commit/1bf70ed3aa37b363b99434faa9e72988a191f871))
* **ci:** add public merged-main qualification dispatches ([#8285](https://github.com/tutur3u/platform/issues/8285)) ([b89d98a](https://github.com/tutur3u/platform/commit/b89d98a09f926767f8699efb6d90013d0a07c1e8))
* **ci:** admit mail and apps native production publication ([#7957](https://github.com/tutur3u/platform/issues/7957)) ([44252c0](https://github.com/tutur3u/platform/commit/44252c009c109bc486635e2bbec71b99c8295bf7))
* **ci:** build cross-app cutover smoke harness for D15 checks ([#7941](https://github.com/tutur3u/platform/issues/7941)) ([26e3f87](https://github.com/tutur3u/platform/commit/26e3f87bb382703b2ee9c28bb5fb4e3d0a3c947e))
* **ci:** verify staged platform styles before promotion ([#7880](https://github.com/tutur3u/platform/issues/7880)) ([f306fb7](https://github.com/tutur3u/platform/commit/f306fb769fb14ba7913dd373deb0cc705ba4604b))
* **cms:** admit editor-only members without publish access ([#7623](https://github.com/tutur3u/platform/issues/7623)) ([0588617](https://github.com/tutur3u/platform/commit/0588617737b70c92d0117a10d0ab7c15364b9e38))
* **cms:** full-page editor layout in IEEAI styling ([#8149](https://github.com/tutur3u/platform/issues/8149)) ([1cf665b](https://github.com/tutur3u/platform/commit/1cf665b069b66af5140fb6a09c9a3dbc069b74f8))
* **cms:** package native Cloudflare cutover artifacts ([c0bf35a](https://github.com/tutur3u/platform/commit/c0bf35ac701c1a1579465255da0f4ec6c3617ee9))
* **contacts:** highlight unscheduled students in Excel ([#7823](https://github.com/tutur3u/platform/issues/7823)) ([0563e8a](https://github.com/tutur3u/platform/commit/0563e8a1671539e53e0b7d2e6f98ff107ece83bd))
* **cron-control:** schedule bounded AI Studio retention with a dry-run default ([#7524](https://github.com/tutur3u/platform/issues/7524)) ([41b40a0](https://github.com/tutur3u/platform/commit/41b40a09dfda9d7b58b59b516e5f7a6af06eee79))
* **database:** add CMS page versions and the editor permission ([6e96890](https://github.com/tutur3u/platform/commit/6e96890f084f8cb9a9df1ee44e3f95e37311a3f2))
* **database:** add workspace document parent and position ([9616c7c](https://github.com/tutur3u/platform/commit/9616c7c1759a91fbb98626a92aeb193a8dcccab6))
* **database:** add workspace document parent and position ([#7877](https://github.com/tutur3u/platform/issues/7877)) ([9616c7c](https://github.com/tutur3u/platform/commit/9616c7c1759a91fbb98626a92aeb193a8dcccab6))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **documents:** gate hierarchy API and validate writes ([325affa](https://github.com/tutur3u/platform/commit/325affa9f8fd3d570f2bfb643c7891d35e1e2274))
* **drive:** admit a separate production Start profile with sealed artifact and cutover packet ([#7928](https://github.com/tutur3u/platform/issues/7928)) ([edf2091](https://github.com/tutur3u/platform/commit/edf2091ecbb7b7171aab77046b672c80b7544915))
* **external:** rebuild the Cloudflare cutover on current main ([08e1b65](https://github.com/tutur3u/platform/commit/08e1b651ffafb0473ce362fcf222e8e49990b3a1))
* **feature-flags:** add runtime controls with revisioned audit ([#7852](https://github.com/tutur3u/platform/issues/7852)) ([5c46f91](https://github.com/tutur3u/platform/commit/5c46f91b5cd3c8d9df3db833f8add139e0f729ba))
* **fee-lock:** accept fee_lock_ref on subscription invoice create ([5ffe644](https://github.com/tutur3u/platform/commit/5ffe64410017536b848ae7a2e46b1af038b4de4c))
* **fee-lock:** discard a new linked invoice in one transaction ([bd1b2ec](https://github.com/tutur3u/platform/commit/bd1b2eccd41e096d1a6ce6b4c0262d850a0d6078))
* **fee-lock:** explain a blocked delete of a pre-filled invoice ([13ae653](https://github.com/tutur3u/platform/commit/13ae653ea4ed1de5cccabcad1348af30a4e767bd))
* **fee-lock:** PR-05 route gate and fee lock detail read API ([#7556](https://github.com/tutur3u/platform/issues/7556)) ([9428927](https://github.com/tutur3u/platform/commit/9428927d33bb84042d95207d7045bef122c87cb9))
* **fee-lock:** PR-05b fee lock month view list API ([#7557](https://github.com/tutur3u/platform/issues/7557)) ([c800bed](https://github.com/tutur3u/platform/commit/c800bedc7156f094473910cdc8088d699574d16d))
* **fee-lock:** PR-05c page the month view past max_rows ([#7566](https://github.com/tutur3u/platform/issues/7566)) ([78e4ed7](https://github.com/tutur3u/platform/commit/78e4ed709a8498dfdbbaf9502e78c544118b6e51))
* **fee-lock:** PR-06 fee lock save, lock and reopen API ([#7558](https://github.com/tutur3u/platform/issues/7558)) ([2da9f5c](https://github.com/tutur3u/platform/commit/2da9f5c3c81eb107c5d13e3a157e791e77d46efb))
* **fee-lock:** PR-06b batch lock API ([#7560](https://github.com/tutur3u/platform/issues/7560)) ([6b986d1](https://github.com/tutur3u/platform/commit/6b986d129f77b2ea59c259a0ef06d0a42bff5529))
* **fee-lock:** PR-07 (1/3) list table, month helpers and copy ([#7541](https://github.com/tutur3u/platform/issues/7541)) ([8ad8bb6](https://github.com/tutur3u/platform/commit/8ad8bb61f4a8b9151abfa49117f2c4d3e92f0f10))
* **fee-lock:** PR-07 (2/3) month view with filters ([#7542](https://github.com/tutur3u/platform/issues/7542)) ([2a57548](https://github.com/tutur3u/platform/commit/2a57548be54fe9a58666bd1c6540add9e2a646b2))
* **fee-lock:** PR-07 (3/3) flag-gated route, nav item and pending-tab button ([#7543](https://github.com/tutur3u/platform/issues/7543)) ([f53403a](https://github.com/tutur3u/platform/commit/f53403a92a9dca661734a5c6027e073754ba6880))
* **fee-lock:** PR-07 (4/4) wire the Excel export dialog into the fee-lock page ([#7570](https://github.com/tutur3u/platform/issues/7570)) ([4afcabc](https://github.com/tutur3u/platform/commit/4afcabca775240a96ef85830ab9cce13f1ede142))
* **fee-lock:** PR-07 (5/5) mount the notice template tab ([2b5f09e](https://github.com/tutur3u/platform/commit/2b5f09eefb20b8187e66e573d47170108426b364))
* **fee-lock:** PR-09 sanitizeSpreadsheetText and export workbook ([#7559](https://github.com/tutur3u/platform/issues/7559)) ([408c319](https://github.com/tutur3u/platform/commit/408c319d5558337a1053fef0c0b92cefc2cee141))
* **fee-lock:** PR-09b ws-scoped export entry loader ([#7562](https://github.com/tutur3u/platform/issues/7562)) ([f42e0bb](https://github.com/tutur3u/platform/commit/f42e0bbc563deb9fb531e0a30a1209a02cbf9907))
* **fee-lock:** PR-09c Excel export route and exported event ([#7564](https://github.com/tutur3u/platform/issues/7564)) ([620eb25](https://github.com/tutur3u/platform/commit/620eb251a23fd06b033bc4906e1f3d1f3180bf63))
* **fee-lock:** PR-09d export dialog and client helper ([#7565](https://github.com/tutur3u/platform/issues/7565)) ([808697a](https://github.com/tutur3u/platform/commit/808697ae5d75449d3b8eb65b539e9dbc5f11f0c3))
* **fee-lock:** PR-11 notice template API ([c2b2653](https://github.com/tutur3u/platform/commit/c2b2653c7e8a66d49bf2f55dd0cc0a34c1b4ef19))
* **fee-lock:** PR-11b notice preview and HTML escaping ([f144716](https://github.com/tutur3u/platform/commit/f144716d16b17cf829dcbd836dd4b9af4def611c))
* **fee-lock:** PR-11c notice text in the Excel export ([a7f4bf3](https://github.com/tutur3u/platform/commit/a7f4bf37620a9e6c3e85e4439628af7c9c37d641))
* **fee-lock:** PR-11d notice template editor tab ([4d43410](https://github.com/tutur3u/platform/commit/4d434104430aa540e84f46935167e8c4fc4cc4c2))
* **fee-lock:** PR-12a discard a new linked invoice in one transaction (M5) ([#7561](https://github.com/tutur3u/platform/issues/7561)) ([bd1b2ec](https://github.com/tutur3u/platform/commit/bd1b2eccd41e096d1a6ce6b4c0262d850a0d6078))
* **fee-lock:** PR-12b validate fee_lock_ref and write the invoice link ([#7576](https://github.com/tutur3u/platform/issues/7576)) ([fd8a6af](https://github.com/tutur3u/platform/commit/fd8a6af0fbe73524b98caa3e84fa70c1be98b311))
* **fee-lock:** PR-12b2 accept fee_lock_ref on subscription invoice create ([#7577](https://github.com/tutur3u/platform/issues/7577)) ([5ffe644](https://github.com/tutur3u/platform/commit/5ffe64410017536b848ae7a2e46b1af038b4de4c))
* **fee-lock:** PR-12b3 explain a blocked delete of a pre-filled invoice ([#7578](https://github.com/tutur3u/platform/issues/7578)) ([13ae653](https://github.com/tutur3u/platform/commit/13ae653ea4ed1de5cccabcad1348af30a4e767bd))
* **fee-lock:** PR-12c locked fee suggestion for subscription invoices ([#7579](https://github.com/tutur3u/platform/issues/7579)) ([7d6a302](https://github.com/tutur3u/platform/commit/7d6a3022739ef535282f548dc9cce77eb0bc63aa))
* **fee-lock:** suggest the locked fee for a subscription invoice ([7d6a302](https://github.com/tutur3u/platform/commit/7d6a3022739ef535282f548dc9cce77eb0bc63aa))
* **fee-lock:** validate fee_lock_ref and write the invoice link ([fd8a6af](https://github.com/tutur3u/platform/commit/fd8a6af0fbe73524b98caa3e84fa70c1be98b311))
* **fee-lock:** wire the Excel export dialog into the fee-lock page ([4afcabc](https://github.com/tutur3u/platform/commit/4afcabca775240a96ef85830ab9cce13f1ede142))
* **gateway,utils:** serve bare /&lt;app&gt;?query on mounts and redirect without trailing slash ([#8097](https://github.com/tutur3u/platform/issues/8097)) ([f1e9796](https://github.com/tutur3u/platform/commit/f1e9796bae7ec3396382f3ff60ee6c9fe8db6884))
* **gateway:** add tuturuuu.com gateway Worker with public-page cache ([#7940](https://github.com/tutur3u/platform/issues/7940)) ([c103357](https://github.com/tutur3u/platform/commit/c10335757c3eabef7075e83dd76bc7a7f6ddfa78))
* **gateway:** route marketing /assets to the marketing origin ([#7993](https://github.com/tutur3u/platform/issues/7993)) ([5fae920](https://github.com/tutur3u/platform/commit/5fae920ff40f95ddf8cbab07516c861a048aeedb))
* **gateway:** serve marketing page groups from the marketing origin behind per-group flags ([#7970](https://github.com/tutur3u/platform/issues/7970)) ([2d0b81e](https://github.com/tutur3u/platform/commit/2d0b81efb59c12db5536d6877841f3629bb0b821))
* **git:** rebuild the Cloudflare cutover on current main ([558157a](https://github.com/tutur3u/platform/commit/558157a4ac45dbef9a22becc5677ef6b1f961178))
* **hive:** native TanStack Start + Void source for Cloudflare Workers ([#7950](https://github.com/tutur3u/platform/issues/7950)) ([73926ad](https://github.com/tutur3u/platform/commit/73926ad9c4548d01bafd2f77c4e617530f7bd2c7))
* **ieeai:** free-only auto-accept for ieeai-stats invites (v1) ([#8246](https://github.com/tutur3u/platform/issues/8246)) ([585cbd1](https://github.com/tutur3u/platform/commit/585cbd13b25372da7f29b79e5e14846568490190))
* **infrastructure:** native TanStack Start + Void source for Cloudflare Workers ([#7963](https://github.com/tutur3u/platform/issues/7963)) ([a7826c1](https://github.com/tutur3u/platform/commit/a7826c1fb0931e315ef628caeb085d4110a8450f))
* **infrastructure:** staff-only sender and ledger for the 11 Nov policy notice ([#7563](https://github.com/tutur3u/platform/issues/7563)) ([6055e37](https://github.com/tutur3u/platform/commit/6055e3738a7f4acef649255888dcb321aa0299ec))
* **journal:** add a flagged mood chart and JSON export ([#7874](https://github.com/tutur3u/platform/issues/7874)) ([a230fb5](https://github.com/tutur3u/platform/commit/a230fb5f24fc511dbeb7e44a4e8960bcc3baa287))
* **learn:** native TanStack Start + Void source for Cloudflare Workers ([#7961](https://github.com/tutur3u/platform/issues/7961)) ([6be5879](https://github.com/tutur3u/platform/commit/6be5879dc1aa5284bbaec48696cc8c46307a9231))
* **marketing-shell:** one marketing layout; roadmap on the /home frame ([#8103](https://github.com/tutur3u/platform/issues/8103)) ([f3e5405](https://github.com/tutur3u/platform/commit/f3e5405b85a18cf0abab7c7823fa7f455ace133d))
* **marketing:** mount the privacy consent banner ([#8045](https://github.com/tutur3u/platform/issues/8045)) ([c6656c9](https://github.com/tutur3u/platform/commit/c6656c9c0bc2f250191e0cbe61ad99cb1a195c9b))
* **marketing:** native Start app for anonymous marketing pages ([#7934](https://github.com/tutur3u/platform/issues/7934)) ([296dbb3](https://github.com/tutur3u/platform/commit/296dbb35e7403364405305466a16ae330c79b41a))
* **mastermind:** add schedule occurrence core ([#7911](https://github.com/tutur3u/platform/issues/7911)) ([8351b37](https://github.com/tutur3u/platform/commit/8351b377a28ecd6e1a989b5b5b44e53d1270e9d7))
* **meet:** add erase subject HMAC primitives (V6) ([9d08bcd](https://github.com/tutur3u/platform/commit/9d08bcda39a4200c213d6f898915d1358c7b10c5))
* **meet:** add named media scrim token for participant name bar ([#7948](https://github.com/tutur3u/platform/issues/7948)) ([dcdd4d4](https://github.com/tutur3u/platform/commit/dcdd4d41a455afa9eb364b2559b6b4389e110c2e))
* **meet:** add self-capture session, consent and read contracts ([#7309](https://github.com/tutur3u/platform/issues/7309)) ([52c690c](https://github.com/tutur3u/platform/commit/52c690c802e60099dd3d1df8122d2ef09f922a59))
* **meet:** classroom room caps and host admission ([#8141](https://github.com/tutur3u/platform/issues/8141)) ([d827c7b](https://github.com/tutur3u/platform/commit/d827c7b86a29fd1b129311a84d38bc1fca62b7ff))
* **meet:** floating self-preview and calmer ended screen ([#7924](https://github.com/tutur3u/platform/issues/7924)) ([eb8b552](https://github.com/tutur3u/platform/commit/eb8b5528e9e0aa3c2a89c204982378b1fbda540a))
* **mind:** Cloudflare hardening: required secrets, full server-file smoke scan and smoke preconditions ([#7982](https://github.com/tutur3u/platform/issues/7982)) ([29b4527](https://github.com/tutur3u/platform/commit/29b45270223e7d6f697e4da23df69dd29c08a0fd))
* **mind:** native TanStack Start + Void source for Cloudflare Workers ([#7964](https://github.com/tutur3u/platform/issues/7964)) ([2f09b14](https://github.com/tutur3u/platform/commit/2f09b149f8a2233f847499f72bfdc5361825a43d))
* **mind:** run the abuse guard through the Cloudflare service binding ([#8001](https://github.com/tutur3u/platform/issues/8001)) ([9f703c3](https://github.com/tutur3u/platform/commit/9f703c315b74f61967e19c0b8d5fdf34b6c5494a))
* **mobile:** prepare the Drive root list for offline reading behind offline_read_drive_list ([#7474](https://github.com/tutur3u/platform/issues/7474)) ([43618a3](https://github.com/tutur3u/platform/commit/43618a314e14a9191ea3682191f9bd1dbb2e1532))
* **nova:** combine native Cloudflare worker and startup guards ([907252e](https://github.com/tutur3u/platform/commit/907252e65748c1d8ce28bfdd545297dc84616744))
* **nova:** run the abuse guard through the Cloudflare service binding ([#8002](https://github.com/tutur3u/platform/issues/8002)) ([c602004](https://github.com/tutur3u/platform/commit/c60200460f84fcf01583b390dc7532f7895fcf13))
* **rewise:** compose Cloudflare wiring onto main ([c7c7cd0](https://github.com/tutur3u/platform/commit/c7c7cd0ebd248c7ad49c14ec5f1d620a29cbb127))
* **roadmap:** add a hash-based Content-Security-Policy ([#8084](https://github.com/tutur3u/platform/issues/8084)) ([160bb2b](https://github.com/tutur3u/platform/commit/160bb2bfbfea83f0b2c3ac1ee472b4ac1d10f18d))
* **roadmap:** build-time hosting counts and the move to tuturuuu.com ([#8254](https://github.com/tutur3u/platform/issues/8254)) ([9e91cd2](https://github.com/tutur3u/platform/commit/9e91cd2b5aeee16d18f4156f3899ca54c4b09dfb))
* **roadmap:** calmer EduFest hero, honest AI toggle, cleaner FAQ, unclipped logos ([bb98577](https://github.com/tutur3u/platform/commit/bb985779fb1f92194a65eb736fcf628aeda72d2e))
* **roadmap:** calmer EduFest hero, honest AI toggle, cleaner FAQ, unclipped logos ([#8162](https://github.com/tutur3u/platform/issues/8162)) ([d7252d3](https://github.com/tutur3u/platform/commit/d7252d3c630f8dec6a290022e9d0feeda7f9e9ff))
* **roadmap:** EduFest 2026 workshop page ([9fdc6e2](https://github.com/tutur3u/platform/commit/9fdc6e242ac720115a6676cdf19797c7aade1986))
* **roadmap:** EduFest 2026 workshop page ([#8151](https://github.com/tutur3u/platform/issues/8151)) ([e72446c](https://github.com/tutur3u/platform/commit/e72446c0131f276ea90b70eb5ea1ebc7b958f8d8))
* **roadmap:** EduFest date, venue, calendar and map ([5e4dc2f](https://github.com/tutur3u/platform/commit/5e4dc2f42f85643b0cccc8749460bba0001f5d34))
* **roadmap:** gate the Mira plans card behind showPlans ([#8083](https://github.com/tutur3u/platform/issues/8083)) ([66b87d2](https://github.com/tutur3u/platform/commit/66b87d22735c784953560328c56f84161169009a))
* **roadmap:** generate release changelogs at build time ([#8270](https://github.com/tutur3u/platform/issues/8270)) ([6ffe176](https://github.com/tutur3u/platform/commit/6ffe17692bea071ea6efcec5a40a62a5af67f85c))
* **roadmap:** indexable Vietnamese pages, JSON-LD, sitemap and lighter assets ([2e20a44](https://github.com/tutur3u/platform/commit/2e20a44acd5b336b4187f78021f86917c6c2953b))
* **roadmap:** indexable Vietnamese pages, JSON-LD, sitemap, lighter assets ([#8163](https://github.com/tutur3u/platform/issues/8163)) ([e57b42f](https://github.com/tutur3u/platform/commit/e57b42f47fcb26c6a95074796b6ba6eb774918ed))
* **roadmap:** interactive shipping pulse, production updates and patch notes ([#8271](https://github.com/tutur3u/platform/issues/8271)) ([01b553c](https://github.com/tutur3u/platform/commit/01b553cf50ba3ffc687853c47dc7e9e05956db55))
* **roadmap:** redesign as a live product roadmap ([#8079](https://github.com/tutur3u/platform/issues/8079)) ([77758bb](https://github.com/tutur3u/platform/commit/77758bb3ff9ab12dad218b5e5e0f555a8dc36a1f))
* **roadmap:** redesign the roadmap and EduFest pages ([4dd3bbb](https://github.com/tutur3u/platform/commit/4dd3bbbdf1546ce00968da303e52c59abb532a0d))
* **roadmap:** redesign the roadmap and EduFest pages ([#8155](https://github.com/tutur3u/platform/issues/8155)) ([7abc9d5](https://github.com/tutur3u/platform/commit/7abc9d5bd2482a079baba544fe497e1a935955ef))
* **roadmap:** richer EduFest page ([b200fc7](https://github.com/tutur3u/platform/commit/b200fc7255e1410e0f0b8a58fbee6e15c925f227))
* **roadmap:** richer EduFest workshop page ([#8153](https://github.com/tutur3u/platform/issues/8153)) ([2a685dd](https://github.com/tutur3u/platform/commit/2a685dd2c6522d510592579d9a75d68ef4f55ea7))
* **roadmap:** serve the logo as a hashed asset and smoke-check images ([#8080](https://github.com/tutur3u/platform/issues/8080)) ([1b58b99](https://github.com/tutur3u/platform/commit/1b58b995f0a460ede49459a37fd2994858457e85))
* **roadmap:** v2 timeline with full history and expanded tracks ([#8094](https://github.com/tutur3u/platform/issues/8094)) ([65b707b](https://github.com/tutur3u/platform/commit/65b707b10a71429c192f6d6aa1a93bc06b68750d))
* **sdk:** add ttr domains commands ([c42f0a0](https://github.com/tutur3u/platform/commit/c42f0a06713956a3d9b619e574e1d564a05a27e0))
* **settings:** flatten board layout and inset the settings dialog ([#7920](https://github.com/tutur3u/platform/issues/7920)) ([e1518c1](https://github.com/tutur3u/platform/commit/e1518c1194ae6a8092056a80b6d53e4824f29a04))
* **start-bridge,cors:** enforce CSRF on mounts and tighten first-party CORS ([#8096](https://github.com/tutur3u/platform/issues/8096)) ([2abcaa0](https://github.com/tutur3u/platform/commit/2abcaa092a9ea1f50d3243c2d9f29101ac0eabf6))
* **start-bridge:** honour TTR_ONE_ORIGIN_&lt;APP&gt; in every bridged app ([#8098](https://github.com/tutur3u/platform/issues/8098)) ([5c70306](https://github.com/tutur3u/platform/commit/5c70306a0687ce9da6e3047bdb1c2b51bdb7adee))
* **start-bridge:** mounted no-writer guard for the per-app session cookie ([#8093](https://github.com/tutur3u/platform/issues/8093)) ([24e0ffe](https://github.com/tutur3u/platform/commit/24e0ffee9609b0392ab4b4c2bc3c88446f7c2f9c))
* **status-api:** rebuild the public read worker on current main ([864cefe](https://github.com/tutur3u/platform/commit/864cefe345b9ba4d2801c2cedbf3d04f9f2f6059))
* **tasks-ui:** route bare Tasks API fetches and root links through the app base (one-origin T4) ([#8113](https://github.com/tutur3u/platform/issues/8113)) ([d71e054](https://github.com/tutur3u/platform/commit/d71e054b1bf5e6d8ddfedc3179ada74c540c0be4))
* **tasks:** CSP with nonces and Trusted Types, report-only then switchable to enforce (one-origin T6) ([#8121](https://github.com/tutur3u/platform/issues/8121)) ([de3a663](https://github.com/tutur3u/platform/commit/de3a66307efa2643fe5e220d05e18d4e43f434d1))
* **tasks:** manifest and offline page relative to where they are served (one-origin T5) ([#8116](https://github.com/tutur3u/platform/issues/8116)) ([c1f1e2c](https://github.com/tutur3u/platform/commit/c1f1e2cf669d8867558327e32207cefb78bd1132))
* **tasks:** resolve Tasks-owned API calls under the app base (one-origin T2) ([#8110](https://github.com/tutur3u/platform/issues/8110)) ([52e7fcf](https://github.com/tutur3u/platform/commit/52e7fcfc1821728efe5a69607065cffd87183a01))
* **tasks:** serve the tuturuuu.com/tasks mount from the Tasks Worker (one-origin T1) ([#8109](https://github.com/tutur3u/platform/issues/8109)) ([7a9017e](https://github.com/tutur3u/platform/commit/7a9017e62a063e06c50c6418b6a50d93deb11845))
* **teach:** add inline AI review to module content ([#8167](https://github.com/tutur3u/platform/issues/8167)) ([e2b31a3](https://github.com/tutur3u/platform/commit/e2b31a39798eddce41027d4431734959918b30af))
* **teach:** native TanStack Start candidate on Vite+ and Void ([#7943](https://github.com/tutur3u/platform/issues/7943)) ([43ddad7](https://github.com/tutur3u/platform/commit/43ddad73fb63c815e9f5c0ac602d49aeb87ce294))
* **tooling:** add scoped review lint rules ([#7856](https://github.com/tutur3u/platform/issues/7856)) ([38b85b2](https://github.com/tutur3u/platform/commit/38b85b25f137d123159d05a9837c8dcebc68771a))
* **tools:** prepare native Cloudflare cutover artifact ([a39c34c](https://github.com/tutur3u/platform/commit/a39c34cfbad9ba67c930a7db7d2923707e986926))
* **tutoring:** gate parent message v2 by workspace config ([#7483](https://github.com/tutur3u/platform/issues/7483)) ([27ce3f5](https://github.com/tutur3u/platform/commit/27ce3f584ef69e340f388326763525c07e13b34c))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** add localized experimental and beta status badges ([#7879](https://github.com/tutur3u/platform/issues/7879)) ([eb67676](https://github.com/tutur3u/platform/commit/eb6767651ddaaa7cc77c6dcbd519b7372fa2dd16))
* **ui:** mount-aware Tasks app and API URLs (one-origin T3) ([#8111](https://github.com/tutur3u/platform/issues/8111)) ([d02d73b](https://github.com/tutur3u/platform/commit/d02d73b75838e3aba44c83e37f1e5b23a9194597))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **ui:** share the profile avatar editor with workspaces ([#7871](https://github.com/tutur3u/platform/issues/7871)) ([6b04c23](https://github.com/tutur3u/platform/commit/6b04c2398038a5b86dab1bf4517bb5564911fd37))
* **utils:** accept-only app coordination secret slot with promote and fallback-disable switches ([#7992](https://github.com/tutur3u/platform/issues/7992)) ([ac2b355](https://github.com/tutur3u/platform/commit/ac2b3552df633b7775cabeca5aee0b4da19030a9))
* **utils:** base-path-aware app registry, one-origin P1 ([#8092](https://github.com/tutur3u/platform/issues/8092)) ([36769f4](https://github.com/tutur3u/platform/commit/36769f4d3eeb0c8d02df6fc23de5a93cff2a1146))
* **utils:** support staged coordination-token signing secret rotation ([#8205](https://github.com/tutur3u/platform/issues/8205)) ([baaa031](https://github.com/tutur3u/platform/commit/baaa03188bc1c57b69511503efe991196bddd446))
* **web:** add CMS page version edit, preview and publish routes ([#7591](https://github.com/tutur3u/platform/issues/7591)) ([97d33b0](https://github.com/tutur3u/platform/commit/97d33b089e9f29dcce2a08ece86632710b5f87ea))
* **web:** add the edge-only published site endpoint for workspace domains ([d04696a](https://github.com/tutur3u/platform/commit/d04696a249ff40ffa3545ee9de8fa4a776509f91))
* **web:** add workspace domain service, API routes and add-on reconciliation ([ecea578](https://github.com/tutur3u/platform/commit/ecea57841dfeee52bc30fc2d9643923cf4d4d40d))
* **web:** add workspace domains settings page ([f37c0c0](https://github.com/tutur3u/platform/commit/f37c0c0fc8a2293ca9a82402155e253ca811b67d))
* **web:** list the roadmap sitemap in robots.txt ([#8173](https://github.com/tutur3u/platform/issues/8173)) ([0916e97](https://github.com/tutur3u/platform/commit/0916e97c72217a907296dd4038ef1a0aadd03f67))
* **web:** move app marketing pages under products ([#6795](https://github.com/tutur3u/platform/issues/6795)) ([3fe3bdb](https://github.com/tutur3u/platform/commit/3fe3bdbc5a6426180f26fe48ade0f6927731060a))
* **web:** record SES bounces and complaints from signed SNS notifications ([#7567](https://github.com/tutur3u/platform/issues/7567)) ([9a2ae91](https://github.com/tutur3u/platform/commit/9a2ae91f5144425aa09808053612abcf82c75602))
* **web:** show newsletter DNS verification status ([#7886](https://github.com/tutur3u/platform/issues/7886)) ([13e32d8](https://github.com/tutur3u/platform/commit/13e32d8e40f61e4921b4081414c71f69416e8f5a))
* **workers:** bind rewise and cms to the tuturuuu-abuse-guard service ([#8035](https://github.com/tutur3u/platform/issues/8035)) ([e4ac60e](https://github.com/tutur3u/platform/commit/e4ac60ed5fdc661f95eebe3726504098256a6053))
* **workspace-domains:** add edge Worker for workspace custom domains ([8cefbc9](https://github.com/tutur3u/platform/commit/8cefbc97ab9361a1a3ef5b7925d52dabdca5958f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))
* **workspace:** carve authenticated app out of web onto Start ([#7944](https://github.com/tutur3u/platform/issues/7944)) ([51d7454](https://github.com/tutur3u/platform/commit/51d7454b305abc360a3320e6e43dcb1e1aa64c6c))
* **workspace:** carve the changelog, crawlers, polls and queues groups and register page modules ([#7972](https://github.com/tutur3u/platform/issues/7972)) ([870563a](https://github.com/tutur3u/platform/commit/870563ae3b7c5bb6e6d3f4c1f219924bfa4089e8))


### Bug Fixes

* **admin:** authenticate infrastructure operations with one actor ([#8229](https://github.com/tutur3u/platform/issues/8229)) ([f83e4dd](https://github.com/tutur3u/platform/commit/f83e4ddf0d68a33f7b7b13c8ab3421de877a374d))
* **ai:** deny redirected Colab sponsorship approvals ([#7909](https://github.com/tutur3u/platform/issues/7909)) ([ac0bd8a](https://github.com/tutur3u/platform/commit/ac0bd8a1e52ee4df8198783c0ae06e3103b68738))
* **ai:** rebuild the native Cloudflare cutover on current main ([0f32384](https://github.com/tutur3u/platform/commit/0f3238454b5cbe1dd83e4a61a5a5e27a0b84731b))
* **ai:** respect IME composition in model-list field ([#8249](https://github.com/tutur3u/platform/issues/8249)) ([1098d70](https://github.com/tutur3u/platform/commit/1098d7057221d4ad7c467ffc6d1285c91891f782))
* **api:** format the client renderer and workspace routes ([#8037](https://github.com/tutur3u/platform/issues/8037)) ([a87b557](https://github.com/tutur3u/platform/commit/a87b557fc72f036c1017eeb92ee86d3e39834340))
* **api:** record the page-version retained routes ([#8025](https://github.com/tutur3u/platform/issues/8025)) ([8a205e2](https://github.com/tutur3u/platform/commit/8a205e2f9fb16fb59e7c09fe3972f6fb743d89a9))
* **api:** regenerate retained Mastermind route digest ([#7854](https://github.com/tutur3u/platform/issues/7854)) ([a8218b5](https://github.com/tutur3u/platform/commit/a8218b50af99e1e8bb00229e59fc3739e5a2e416))
* **api:** register retained newsletter routes ([#7841](https://github.com/tutur3u/platform/issues/7841)) ([dacf2ea](https://github.com/tutur3u/platform/commit/dacf2ea7ebb667ceef5e7a4911e5113820a282b5))
* **auth,cors:** mounted logout CORS fails closed ([#8102](https://github.com/tutur3u/platform/issues/8102)) ([981de50](https://github.com/tutur3u/platform/commit/981de50799a12d32afc43e1b6b3dda30cccfeb3a))
* **auth,gateway:** keep apex sign-in returns on the public host ([#8087](https://github.com/tutur3u/platform/issues/8087)) ([2c90f3b](https://github.com/tutur3u/platform/commit/2c90f3b32e62091ac988957f9d7512125ce64a9d))
* **auth:** allow ten switchable accounts and canonical avatars ([#7869](https://github.com/tutur3u/platform/issues/7869)) ([a552aa5](https://github.com/tutur3u/platform/commit/a552aa5e0df05e3912d764c26684956fe98d50af))
* **auth:** atomically guard legacy cross-app UUID redemption ([#7857](https://github.com/tutur3u/platform/issues/7857)) ([c87c857](https://github.com/tutur3u/platform/commit/c87c85785c44eb3713b16feeab0223758f74894e))
* **auth:** CSRF check no longer bypassed by a junk Bearer on mounts ([#8101](https://github.com/tutur3u/platform/issues/8101)) ([8c8d949](https://github.com/tutur3u/platform/commit/8c8d94920a43d419df8191230fdd3dd68435f8b9))
* **auth:** harden legacy token function grant contract ([32f1c38](https://github.com/tutur3u/platform/commit/32f1c384602543ec6c126f2995aaa6bb69fefbeb))
* **auth:** keep the caller user-agent on server sessions ([#7868](https://github.com/tutur3u/platform/issues/7868)) ([eff3792](https://github.com/tutur3u/platform/commit/eff3792d6baa8f8ae4450f2aa1bef93c49d2af85))
* **calendar:** bound the stored sync diagnostics and redact secrets from error messages ([#8068](https://github.com/tutur3u/platform/issues/8068)) ([c9117bc](https://github.com/tutur3u/platform/commit/c9117bc953dde3bf2456a34011cf016ad875ed89))
* **chat:** run the node:test deployment profile outside vitest ([#8049](https://github.com/tutur3u/platform/issues/8049)) ([3e6ed8b](https://github.com/tutur3u/platform/commit/3e6ed8b82b0e239afc7dbba300da8b00cfa16372))
* **chat:** seal the production Worker from the emitted config ([#7996](https://github.com/tutur3u/platform/issues/7996)) ([c75d762](https://github.com/tutur3u/platform/commit/c75d762ba667fd7a1485fa5df34e7cc6bd9a0d07))
* **chat:** unread count 401 for signed-in users ([#8071](https://github.com/tutur3u/platform/issues/8071)) ([e977e38](https://github.com/tutur3u/platform/commit/e977e38663b0ea7b2f37e09be3864f04346ed0af))
* **ci:** admit the D74 Wrangler mentions on the existing gaps ([#8031](https://github.com/tutur3u/platform/issues/8031)) ([b765d6d](https://github.com/tutur3u/platform/commit/b765d6d6e523107d93e0758e4ae0e17d1161e300))
* **ci:** admit the gateway digest and native seal fixtures in the Wrangler guard ([#8058](https://github.com/tutur3u/platform/issues/8058)) ([e835072](https://github.com/tutur3u/platform/commit/e8350724b7fb6487c414905e891ef25e6cc5d8fc))
* **ci:** align picker fixture and Pay contract fences ([#8180](https://github.com/tutur3u/platform/issues/8180)) ([b2752ac](https://github.com/tutur3u/platform/commit/b2752acdccf6fa2372e58144d0f57b1084852e27))
* **ci:** assert trusted EVENT_NAME in security workflow test ([#7921](https://github.com/tutur3u/platform/issues/7921)) ([e0117a0](https://github.com/tutur3u/platform/commit/e0117a04156b15c8ee7849dc70ecc7644d12695e))
* **ci:** authorize roadmap artifact reads with a scoped token ([#8210](https://github.com/tutur3u/platform/issues/8210)) ([b441dfd](https://github.com/tutur3u/platform/commit/b441dfdd5503cc581aba315bd0b7accfcbbb5c90))
* **ci:** await native startup refusal in AI and CMS smoke ([#7898](https://github.com/tutur3u/platform/issues/7898)) ([6b32ec5](https://github.com/tutur3u/platform/commit/6b32ec5c8211deb9266725aeb6348c768067f7c5))
* **ci:** bound authenticated staged style redirects ([#8272](https://github.com/tutur3u/platform/issues/8272)) ([9ae352c](https://github.com/tutur3u/platform/commit/9ae352ce5746641a75c056d26d5c61b8fa2efd32))
* **ci:** classify the new heavy Cloudflare workflows ([#8026](https://github.com/tutur3u/platform/issues/8026)) ([399b047](https://github.com/tutur3u/platform/commit/399b0471ca26469d25c5b205f736c829d8252353))
* **ci:** correct Turbo team step-index assertion ([#8251](https://github.com/tutur3u/platform/issues/8251)) ([2cd7590](https://github.com/tutur3u/platform/commit/2cd7590bae5bc94f1b9eb5dcb176f791223c2fc4))
* **ci:** defer Test and Type Check on draft pull requests ([67893a8](https://github.com/tutur3u/platform/commit/67893a82390aed1d9fc4ba4ed4145c8b09b23567))
* **ci:** drop the redundant .wrangler/ ignore from the roadmap app ([#8120](https://github.com/tutur3u/platform/issues/8120)) ([1b3ad12](https://github.com/tutur3u/platform/commit/1b3ad12a3b3850605f76491e77aa6bead35b19fd))
* **ci:** enforce reviewed workflow trust boundaries ([117db15](https://github.com/tutur3u/platform/commit/117db15611fb406bf69cc15069c7d3f4cba6b97b))
* **ci:** exercise shared path-map projection in fixtures ([#7858](https://github.com/tutur3u/platform/issues/7858)) ([ea192c2](https://github.com/tutur3u/platform/commit/ea192c28beeb98d9231dfe2312700d4f0e07cf43))
* **ci:** fail open when cheap-check selection is uncertain ([#8070](https://github.com/tutur3u/platform/issues/8070)) ([58cae21](https://github.com/tutur3u/platform/commit/58cae214a4326bfa16ef83e6199cb6cfd039b7ee))
* **ci:** keep Learn production normalizer fields for the seal ([#8053](https://github.com/tutur3u/platform/issues/8053)) ([b77babe](https://github.com/tutur3u/platform/commit/b77babe5fc2dc0bb631d1cc1b233281b429266c3))
* **ci:** keep SDK qualification off pull_request_target ([#8125](https://github.com/tutur3u/platform/issues/8125)) ([d40afdf](https://github.com/tutur3u/platform/commit/d40afdf2f6e74a265a09bb269eec0cb12f2e0e49))
* **ci:** keep Teach production normalizer fields for the seal ([#8042](https://github.com/tutur3u/platform/issues/8042)) ([8bd9ab1](https://github.com/tutur3u/platform/commit/8bd9ab19f62afa92122a8175cb9abad7f17556c1))
* **ci:** keep the last staged-style stage in the uploaded proof ([#8067](https://github.com/tutur3u/platform/issues/8067)) ([0b3252e](https://github.com/tutur3u/platform/commit/0b3252eb4bb7de6d70c5b8245e3aed84f8f9087f))
* **ci:** limit mobile release builds to mobile tags ([#7878](https://github.com/tutur3u/platform/issues/7878)) ([fd26885](https://github.com/tutur3u/platform/commit/fd26885350a846fbb9ac36491e4e6211f8a4670c))
* **ci:** log producer ids on the tree-equal fallback staging proof ([7a52c36](https://github.com/tutur3u/platform/commit/7a52c36b0c20f23424e567642e07d6444120bcba))
* **ci:** pin the abuse-guard service allowlist on the native seals ([#8051](https://github.com/tutur3u/platform/issues/8051)) ([0763c82](https://github.com/tutur3u/platform/commit/0763c825875bc56b5be6b43ec6686f4aaa3b7c2a))
* **ci:** record feature-flag no-grant routines as reviewed findings ([#8018](https://github.com/tutur3u/platform/issues/8018)) ([73827a0](https://github.com/tutur3u/platform/commit/73827a01ea67b723c8664d7c648f797998ed45e4))
* **ci:** record the gateway import of web SEO routes ([#8030](https://github.com/tutur3u/platform/issues/8030)) ([8cfc17b](https://github.com/tutur3u/platform/commit/8cfc17b8d12597c344e660b466393b0ae8fd3c92))
* **ci:** record the pre-seal doctor and gateway config in the Wrangler usage allowlist ([#8115](https://github.com/tutur3u/platform/issues/8115)) ([6312a70](https://github.com/tutur3u/platform/commit/6312a70e8c781e7facd31bd8616ed991d9613aa9))
* **ci:** record the reviewed O5 inherited ACL diagnostic ([#7872](https://github.com/tutur3u/platform/issues/7872)) ([4382dd3](https://github.com/tutur3u/platform/commit/4382dd3223b7ec40782ae1f7fad3b0e5837d64bf))
* **ci:** refresh retained route digest and type header fixtures ([#8135](https://github.com/tutur3u/platform/issues/8135)) ([add27f5](https://github.com/tutur3u/platform/commit/add27f5f9b25ccce060a1a0ead02b63dc7f40709))
* **ci:** refresh the retained sessions source digest ([#7882](https://github.com/tutur3u/platform/issues/7882)) ([d0d0b0a](https://github.com/tutur3u/platform/commit/d0d0b0a9dfc13f26df96a1dad7ca575339d8485d))
* **ci:** repair workflow contracts and retain main test results ([#7892](https://github.com/tutur3u/platform/issues/7892)) ([082351b](https://github.com/tutur3u/platform/commit/082351bb32a691eafbec32aeff98dd4252be93b0))
* **ci:** report why staged style verification failed ([#7954](https://github.com/tutur3u/platform/issues/7954)) ([a27075f](https://github.com/tutur3u/platform/commit/a27075f3d37c3ab16f9e51da4581af139740c758))
* **ci:** restore reviewed main contracts and feedback fixtures ([#8211](https://github.com/tutur3u/platform/issues/8211)) ([bbbf404](https://github.com/tutur3u/platform/commit/bbbf404f9192b17bc7a831f6ff7ea4c567069cbc))
* **ci:** retain root ratchet history and format Tasks manifest ([#8139](https://github.com/tutur3u/platform/issues/8139)) ([635f9c5](https://github.com/tutur3u/platform/commit/635f9c5c47b92ad708e098a19283b4031622fe86))
* **ci:** retain scrubbed staged navigation evidence ([#8268](https://github.com/tutur3u/platform/issues/8268)) ([a18258c](https://github.com/tutur3u/platform/commit/a18258caafc3d31fa4b3bb68140f1351b315919f))
* **ci:** run cutover smoke under node:test in the root script suite ([#8029](https://github.com/tutur3u/platform/issues/8029)) ([b74da81](https://github.com/tutur3u/platform/commit/b74da818d85fa8835ae5809fbdd69ec16c1870d8))
* **ci:** scope future migration dates to introduced PR paths ([#7908](https://github.com/tutur3u/platform/issues/7908)) ([aa03c4b](https://github.com/tutur3u/platform/commit/aa03c4bf8d9b5d2a872db3732e7ddb76f74d6414))
* **ci:** scope remaining app checks to dependency changes ([#7890](https://github.com/tutur3u/platform/issues/7890)) ([74181f5](https://github.com/tutur3u/platform/commit/74181f5e7bf5484dc0021efdbdde87607f69484d))
* **ci:** seal the Mind production cutover artifact end to end ([#8060](https://github.com/tutur3u/platform/issues/8060)) ([a71e906](https://github.com/tutur3u/platform/commit/a71e906194eff1a5e9e23113c5443e6273b75061))
* **ci:** seal the Nova production cutover artifact end to end ([#8061](https://github.com/tutur3u/platform/issues/8061)) ([e3a12a2](https://github.com/tutur3u/platform/commit/e3a12a23329f1b2522bc6fc3cf40ba806f4ec565))
* **ci:** separate Meet fixture and production artifact admission ([#8283](https://github.com/tutur3u/platform/issues/8283)) ([d315df4](https://github.com/tutur3u/platform/commit/d315df4211ccd3990d6efb7866d4e7a329e8bd81))
* **ci:** serialize desktop beta production and isolate label checks ([#8066](https://github.com/tutur3u/platform/issues/8066)) ([ec6b55c](https://github.com/tutur3u/platform/commit/ec6b55c85d6399b59cb64b8fca204786630dffd7))
* **ci:** serialize required R2 cache population ([#8282](https://github.com/tutur3u/platform/issues/8282)) ([d328e24](https://github.com/tutur3u/platform/commit/d328e2436f9cee0066cded996de8bdbe7c536ade))
* **ci:** skip manually disabled dependent releases ([#7863](https://github.com/tutur3u/platform/issues/7863)) ([b16383d](https://github.com/tutur3u/platform/commit/b16383d6e0f073a02a679877c63098fa0933b814))
* **ci:** split root React repair from main recovery ([17bc5bd](https://github.com/tutur3u/platform/commit/17bc5bde083acef8e848fcc78d29ff4ef35ff1d3))
* **ci:** track feature-flag database dependencies ([#7885](https://github.com/tutur3u/platform/issues/7885)) ([99d1343](https://github.com/tutur3u/platform/commit/99d1343af855f5579b43e57fd1d7d602beb6e230))
* **ci:** track marketing and workspace in Release Please ([#8028](https://github.com/tutur3u/platform/issues/8028)) ([abc8587](https://github.com/tutur3u/platform/commit/abc8587be150442b641bc9f2d033f05cdd9a5d57))
* **ci:** use an allowed host in the cutover smoke usage text ([#8003](https://github.com/tutur3u/platform/issues/8003)) ([1851c69](https://github.com/tutur3u/platform/commit/1851c696821e9c8a8931dc3c48d0435e4b8e7950))
* **ci:** use merge first parent for definer policy base ([9056295](https://github.com/tutur3u/platform/commit/9056295c61623dfcfa507f367fbbb526efb28c4a))
* **ci:** validate streamed ZIP artifacts before publication ([8d01824](https://github.com/tutur3u/platform/commit/8d018242ae6a6c0724317cb188c66d721d9da1cc))
* **ci:** wrap the Drive artifact build and retain its receipt ([#8027](https://github.com/tutur3u/platform/issues/8027)) ([5cd4bc8](https://github.com/tutur3u/platform/commit/5cd4bc8d476a078fd60cbb5c4e155eb68def0037))
* close [#8157](https://github.com/tutur3u/platform/issues/8157) route-registry, inventory and policy gates on main ([#8166](https://github.com/tutur3u/platform/issues/8166)) ([ab9dbab](https://github.com/tutur3u/platform/commit/ab9dbabcd592b58002ed7cb9f79dde87351b8fda))
* **cloudflare:** add HSTS to bespoke Worker responses ([#8238](https://github.com/tutur3u/platform/issues/8238)) ([9d38c27](https://github.com/tutur3u/platform/commit/9d38c271de6d42978d5748b1fc662356ca19db63))
* **colab:** address review nits on the Workers AI exit ([#8076](https://github.com/tutur3u/platform/issues/8076)) ([65ded69](https://github.com/tutur3u/platform/commit/65ded6979f8f5e1d662b54984a813dd86f6ad7e5))
* **colab:** move off Workers AI to Gemini ([#8075](https://github.com/tutur3u/platform/issues/8075)) ([9a6d217](https://github.com/tutur3u/platform/commit/9a6d217a938a2f5a766f4d50a5c74efcb1c23cbd))
* compose switching repair with current main ([5e0aa95](https://github.com/tutur3u/platform/commit/5e0aa956bf067d621d9553bcea104acd98503de1))
* compose switching repair with current main ([a1e0aea](https://github.com/tutur3u/platform/commit/a1e0aea03f9a3f5aea692abc3628869aecd9bcc2))
* **contacts:** filter monthly reports by report month ([#7887](https://github.com/tutur3u/platform/issues/7887)) ([d209d72](https://github.com/tutur3u/platform/commit/d209d72bfa54e4ed84b50f2a09fdb24e466a0547))
* **contacts:** guide tutoring exports to a bounded date range ([#7891](https://github.com/tutur3u/platform/issues/7891)) ([3080742](https://github.com/tutur3u/platform/commit/30807425e0d773c5062e87c64bdcaa528b655187))
* **contacts:** let tutoring viewers read full lesson content ([#7889](https://github.com/tutur3u/platform/issues/7889)) ([b5aa6f7](https://github.com/tutur3u/platform/commit/b5aa6f7020ebb4de7e11b425f055b4edeef2be35))
* **cutover:** align native artifact contracts ([#8228](https://github.com/tutur3u/platform/issues/8228)) ([c57c7fb](https://github.com/tutur3u/platform/commit/c57c7fb525e6c65989ffe130209e08cb6e8948a4))
* **cutover:** do not require a /login route for the apps and tools smoke ([#7984](https://github.com/tutur3u/platform/issues/7984)) ([eb3a907](https://github.com/tutur3u/platform/commit/eb3a9078a28d4611c7892e7c0d114a2bf47e63e5))
* **database:** count in-flight newsletter reservations toward the daily cap ([#7925](https://github.com/tutur3u/platform/issues/7925)) ([73f5b6b](https://github.com/tutur3u/platform/commit/73f5b6bc2601a3374959d032b98adbc9ad45a541))
* **database:** harden legacy cross-app token contract ([#7896](https://github.com/tutur3u/platform/issues/7896)) ([20bd1c4](https://github.com/tutur3u/platform/commit/20bd1c4396e1727132975decf8472601f4372348))
* **database:** parse newsletter domain checks on Postgres ([#7836](https://github.com/tutur3u/platform/issues/7836)) ([0142050](https://github.com/tutur3u/platform/commit/01420502bd5902a40d3ff671116ab3cc5255e4f0))
* **database:** SR-924 revoke client-role EXECUTE on private functions and note_voice_jobs ([#7960](https://github.com/tutur3u/platform/issues/7960)) ([b97b3ec](https://github.com/tutur3u/platform/commit/b97b3ecc9b0793964cda70891d79d4b3daae3c23))
* **database:** SR-924 sql-grant guard markers and non-executable rollback ([#8128](https://github.com/tutur3u/platform/issues/8128)) ([41888aa](https://github.com/tutur3u/platform/commit/41888aad837f6b701ea208a86667beb9df5468f0))
* **devbox:** bind run claims and leases to their owners ([#7130](https://github.com/tutur3u/platform/issues/7130)) ([cd92cc7](https://github.com/tutur3u/platform/commit/cd92cc7d7a6ee38069b683888ff21bd09bff0119))
* **drive:** mock the deploy gate in the Worker tests ([#8138](https://github.com/tutur3u/platform/issues/8138)) ([cc52533](https://github.com/tutur3u/platform/commit/cc52533361bd9b0be808adf41e824681c8fb7b70))
* **drive:** serve the build identity without a session refresh ([#7991](https://github.com/tutur3u/platform/issues/7991)) ([eb19858](https://github.com/tutur3u/platform/commit/eb1985872fffd5a783197475abc9bf4e31575fcc))
* **edge:** reject Calendar and Mail provider redirects ([#7907](https://github.com/tutur3u/platform/issues/7907)) ([506c1ea](https://github.com/tutur3u/platform/commit/506c1ea9abce9c3903d977e5983e3b97d37a5a07))
* **encryption:** refuse to store plaintext when no workspace key is available ([#8086](https://github.com/tutur3u/platform/issues/8086)) ([34616cf](https://github.com/tutur3u/platform/commit/34616cf49cebc206d15e9ccb4cc9813dc56e5019))
* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **fee-lock:** restore canonical 20261109161000 guard migration ([#7832](https://github.com/tutur3u/platform/issues/7832)) ([eccee1e](https://github.com/tutur3u/platform/commit/eccee1e98365420b6695586b1e6281ba44082553))
* **finance,rewise:** keep node:test files out of vitest and run them with node --test ([#8131](https://github.com/tutur3u/platform/issues/8131)) ([60d057c](https://github.com/tutur3u/platform/commit/60d057cbb6c55b340712d76d9315e5f2ea27ef86))
* **finance:** align bridge registry and startup smoke lifecycle ([#7900](https://github.com/tutur3u/platform/issues/7900)) ([4413d73](https://github.com/tutur3u/platform/commit/4413d73c98d614566013dc90d22ad0d1f00ccdcf))
* **finance:** model bounded signed SSR secret reads ([#7916](https://github.com/tutur3u/platform/issues/7916)) ([645f476](https://github.com/tutur3u/platform/commit/645f476a311680838bc7085ade80bdeb3ca5bd81))
* **finance:** resolve invoice creators with invoice permissions ([8993b82](https://github.com/tutur3u/platform/commit/8993b82f5337697c7b7c14c395cd51eb97c18442))
* **forms:** rebuild the native Cloudflare cutover on current main ([3b77902](https://github.com/tutur3u/platform/commit/3b779022f2a8b7d59fc436e340de123ccfa48a37))
* **gateway:** cache pages whose only Set-Cookie is NEXT_LOCALE ([#7965](https://github.com/tutur3u/platform/issues/7965)) ([aa31c55](https://github.com/tutur3u/platform/commit/aa31c553922d977d33bb4c04a3fa2e63fc0204a8))
* **gateway:** evaluate marketing robots on the public request URL ([#8284](https://github.com/tutur3u/platform/issues/8284)) ([c1efb58](https://github.com/tutur3u/platform/commit/c1efb582c8214c56183a45c062048a880888b432))
* **gateway:** expose the bypass reason and parse joined Set-Cookie headers ([#7967](https://github.com/tutur3u/platform/issues/7967)) ([db382b0](https://github.com/tutur3u/platform/commit/db382b08d31c92f0b7d76b945ec01a01c9db139c))
* **gateway:** keep signed-in requests on web for marketing groups and rewrite Link header hosts ([#7979](https://github.com/tutur3u/platform/issues/7979)) ([cfbbb64](https://github.com/tutur3u/platform/commit/cfbbb64bbe6cd98b1f397047640d27d8cf370046))
* **gateway:** never cache an empty or truncated asset response ([#8081](https://github.com/tutur3u/platform/issues/8081)) ([96b1c05](https://github.com/tutur3u/platform/commit/96b1c0540fb410879dba32619ef0f88ba37fcde1))
* **gateway:** remove the smoke script's false positives ([#7980](https://github.com/tutur3u/platform/issues/7980)) ([58825f1](https://github.com/tutur3u/platform/commit/58825f154b90e59af8ff93768f2601a758ae0f39))
* **git:** expect the public root on the anonymous worker ([#7855](https://github.com/tutur3u/platform/issues/7855)) ([65bc164](https://github.com/tutur3u/platform/commit/65bc164526e4d90862338a9c0282185ed83e791a))
* **git:** seal the production cutover artifact from the emitted config ([#7998](https://github.com/tutur3u/platform/issues/7998)) ([2eee6bc](https://github.com/tutur3u/platform/commit/2eee6bcc33ac4d80e8afb280f4289f4a1071f8d1))
* **guards:** allowlist the workspace copies of the browser-session surfaces ([#8044](https://github.com/tutur3u/platform/issues/8044)) ([914f8b4](https://github.com/tutur3u/platform/commit/914f8b494721524418a1ea864bab1b12fe5b8991))
* **hive:** pin the test app URL against native CI build fixtures ([#8055](https://github.com/tutur3u/platform/issues/8055)) ([628fba3](https://github.com/tutur3u/platform/commit/628fba361d994ea3656f1693ae56ffd2e7692f9e))
* **hive:** seal the production cutover artifact from the build profile ([#7999](https://github.com/tutur3u/platform/issues/7999)) ([c1bdcba](https://github.com/tutur3u/platform/commit/c1bdcba730ae5b3569699b6dce2c87813fe6599c))
* **i18n:** register the marketing and workspace apps in the namespace check ([#8050](https://github.com/tutur3u/platform/issues/8050)) ([9dafeac](https://github.com/tutur3u/platform/commit/9dafeacbfd3faa5b7ae2d1793c1ba7b960421ef8))
* **infrastructure:** register policy-notice route and follow manual-redirect transport ([#8057](https://github.com/tutur3u/platform/issues/8057)) ([fc0d557](https://github.com/tutur3u/platform/commit/fc0d5579bafd0dd50bfaafd7f0ead8b20055581c))
* **infrastructure:** use manual redirect handling in desktop status and Apple review requests ([#8032](https://github.com/tutur3u/platform/issues/8032)) ([c3c08fd](https://github.com/tutur3u/platform/commit/c3c08fdeb7d75805c0c37d3aa19799bf40a047c0))
* **internal-api,utils:** use manual redirect handling in shared infrastructure clients ([#8033](https://github.com/tutur3u/platform/issues/8033)) ([8e8a7ea](https://github.com/tutur3u/platform/commit/8e8a7eaad26a40b61e94335e9321fd3ac3855589))
* **inventory:** align offline cookie fixture with mounted session policy ([#8179](https://github.com/tutur3u/platform/issues/8179)) ([c224d55](https://github.com/tutur3u/platform/commit/c224d55f5be31bf79fc3e1379f3e6613603142c2))
* **inventory:** rebuild the native Cloudflare cutover on current main ([04ac227](https://github.com/tutur3u/platform/commit/04ac2275249b37df5058e8ffea3784711f84b327))
* **inventory:** supply required response-policy fixture bindings ([#7897](https://github.com/tutur3u/platform/issues/7897)) ([b646bb8](https://github.com/tutur3u/platform/commit/b646bb89f867491fdf70503c52baa42f05ff5dbd))
* **legal:** hide internal review and upcoming-changes notices on production legal pages ([#8288](https://github.com/tutur3u/platform/issues/8288)) ([9c62d49](https://github.com/tutur3u/platform/commit/9c62d49c2f4204db2b2e1beaf8baa87357aff057))
* **marketing-shell:** register the package with Release Please and the docs inventory ([#8124](https://github.com/tutur3u/platform/issues/8124)) ([cd71a4f](https://github.com/tutur3u/platform/commit/cd71a4fe4ddd73bf0a6289b68e561d4793341162))
* **marketing:** run /api through the shared API guard (proxy-guard-parity) ([#8114](https://github.com/tutur3u/platform/issues/8114)) ([47561bd](https://github.com/tutur3u/platform/commit/47561bd8afdeeed1be4cd0928e241a851dfccda3))
* **marketing:** run vitest without the Cloudflare worker ([#8020](https://github.com/tutur3u/platform/issues/8020)) ([874f31d](https://github.com/tutur3u/platform/commit/874f31df102654a25c570f98ff943a07696baef9))
* **marketing:** serve the landing pages as indexable on tuturuuu.com ([#8178](https://github.com/tutur3u/platform/issues/8178)) ([767dc4d](https://github.com/tutur3u/platform/commit/767dc4d2ce9e77ab5e5e0c76a5fc0b7c7bbeaa1c))
* **mastermind:** deny redirects without unsupported fetch mode ([#7901](https://github.com/tutur3u/platform/issues/7901)) ([d2217ac](https://github.com/tutur3u/platform/commit/d2217ac0e3c6d1bd7e2b5f3008851aae08981c25))
* **mastermind:** rebuild the native cutover on current main ([35e4754](https://github.com/tutur3u/platform/commit/35e4754e9b8f86a29683b79db66afc3f0fab88b2))
* **mastermind:** refuse redirects in native data clients without redirect error mode ([#7947](https://github.com/tutur3u/platform/issues/7947)) ([1dde89f](https://github.com/tutur3u/platform/commit/1dde89fcb5f755f92550051117c4de747dbe7d91))
* **meet:** gate private Mira on durable participant consent ([#8274](https://github.com/tutur3u/platform/issues/8274)) ([061a566](https://github.com/tutur3u/platform/commit/061a566123e309f9004eb0793cd9a59016924c04))
* **meet:** inline the Mira mark and tighten the preparing screen ([#7922](https://github.com/tutur3u/platform/issues/7922)) ([31e74be](https://github.com/tutur3u/platform/commit/31e74be24b981b1e70ab372ee3c9f7cfafd7054b))
* **meet:** keep the name bar readable on light avatar tiles ([#7953](https://github.com/tutur3u/platform/issues/7953)) ([ce96056](https://github.com/tutur3u/platform/commit/ce96056f9b3eb0093cd282cd502ee06c25a242be))
* **meet:** make Private Mira choices, leave and denials visible ([#8287](https://github.com/tutur3u/platform/issues/8287)) ([aad395d](https://github.com/tutur3u/platform/commit/aad395d94983c82d4623086e269d53f540fbae4e))
* **meet:** make the Meet AI gate default-off (allowlist-only, EC denied in code) ([#7518](https://github.com/tutur3u/platform/issues/7518)) ([660fa01](https://github.com/tutur3u/platform/commit/660fa0199d80c1b332a652b4d37958a20c738ce3))
* **meet:** narrow erased transcript segments before rendering ([#7904](https://github.com/tutur3u/platform/issues/7904)) ([26ee21c](https://github.com/tutur3u/platform/commit/26ee21ce0869f6696aa3df76d599b0774b696ce2))
* **meet:** pin the legal revision transcript inventory ([#8252](https://github.com/tutur3u/platform/issues/8252)) ([da15359](https://github.com/tutur3u/platform/commit/da15359153b5f9693ee4b6b0f607a1cee5db06d5))
* **meet:** prepare transcript readers for erasure markers ([#7517](https://github.com/tutur3u/platform/issues/7517)) ([f35343e](https://github.com/tutur3u/platform/commit/f35343e88998b4748ffe459a86debf26fb6bfb2c))
* **meet:** redact transcription provider errors (erase V0) ([#7512](https://github.com/tutur3u/platform/issues/7512)) ([421adb8](https://github.com/tutur3u/platform/commit/421adb88736c8317572d1915bf2bcaf8dc8df6ff))
* **meet:** refuse legacy transcription permanently and retire the old recorder ([#7506](https://github.com/tutur3u/platform/issues/7506)) ([5ac0f24](https://github.com/tutur3u/platform/commit/5ac0f241be51d094ca2e515015a5307a386d342e))
* **meet:** remove unused meeting AI availability bindings ([#8276](https://github.com/tutur3u/platform/issues/8276)) ([418d59e](https://github.com/tutur3u/platform/commit/418d59ef181421761aa366bbe98a2c8cf1dc0ad9))
* **mind:** qualify sealed-output smoke with required bindings ([#8132](https://github.com/tutur3u/platform/issues/8132)) ([102c44f](https://github.com/tutur3u/platform/commit/102c44fafa26a4d0f22cad2143e07d57be3adfe3))
* **mind:** stub the abuse guard in required-secrets tests ([#8054](https://github.com/tutur3u/platform/issues/8054)) ([da9f0e7](https://github.com/tutur3u/platform/commit/da9f0e727acf75abe5094579ee0acec35594d343))
* **notes:** follow the shared default-off Meet AI gate ([#8041](https://github.com/tutur3u/platform/issues/8041)) ([5830abd](https://github.com/tutur3u/platform/commit/5830abd62f2d202d90b7da77ce06c17d6ce46a28))
* **notes:** honour the Meet AI controls in voice jobs ([#7513](https://github.com/tutur3u/platform/issues/7513)) ([0faa44b](https://github.com/tutur3u/platform/commit/0faa44b0f4a0a43f6d72b793e4c8ce861ced1ea6))
* **nova:** serve the production host and sweep Worker root hosts ([#8064](https://github.com/tutur3u/platform/issues/8064)) ([8c552cd](https://github.com/tutur3u/platform/commit/8c552cd31a6cb59e23b026ce2d0f963f8dcf70d5))
* **nova:** supply required runtime bindings in the response-policy fixture ([#7926](https://github.com/tutur3u/platform/issues/7926)) ([a5feb72](https://github.com/tutur3u/platform/commit/a5feb72c84e58586ac1484e486a4a90ecf9b0526))
* **nova:** type optional mounts and generated runtime bindings ([#8144](https://github.com/tutur3u/platform/issues/8144)) ([54504e7](https://github.com/tutur3u/platform/commit/54504e7c35bd7a52d5412d150fdb46a4813d5411))
* **pay:** allow the generated .ts config import in the Cloudflare type-check ([#8056](https://github.com/tutur3u/platform/issues/8056)) ([461b990](https://github.com/tutur3u/platform/commit/461b99079a62fb3edf8efbc642fd31e8448ef027))
* **pay:** bind staging artifact vars to canonical native profile ([#8146](https://github.com/tutur3u/platform/issues/8146)) ([ee00334](https://github.com/tutur3u/platform/commit/ee0033424b9b650dc0a9c181148dcc5b3220e5a9))
* **pay:** never build the production artifact with staging inputs ([#7995](https://github.com/tutur3u/platform/issues/7995)) ([92d8da1](https://github.com/tutur3u/platform/commit/92d8da1cc491b3f1f610fb304456f179ff59323f))
* **pay:** scope the production artifact guard to runtime values ([#8011](https://github.com/tutur3u/platform/issues/8011)) ([94f1d1c](https://github.com/tutur3u/platform/commit/94f1d1cba17e8c3ae36a7be45a694588e3256397))
* **pay:** select the production host and cookie profile at build time ([#8006](https://github.com/tutur3u/platform/issues/8006)) ([0f3b228](https://github.com/tutur3u/platform/commit/0f3b228c6a98c8553615aa60e2261857b895efd6))
* **realtime:** deny redirected channel broadcasts ([#7913](https://github.com/tutur3u/platform/issues/7913)) ([9a64f87](https://github.com/tutur3u/platform/commit/9a64f87ea0238bedfb3639eaa7fcdc39be93409a))
* **release:** restore the Meet production publication admission ([#7923](https://github.com/tutur3u/platform/issues/7923)) ([0b398b8](https://github.com/tutur3u/platform/commit/0b398b8b13aa0de16bbad47007a9136e1776bee6))
* **reports:** block approval and sending without feedback ([#7893](https://github.com/tutur3u/platform/issues/7893)) ([e1a34a4](https://github.com/tutur3u/platform/commit/e1a34a4b38c387640a88312ce3139df30eecfefe))
* **reports:** show report totals on open and filter by the month in the title ([#8063](https://github.com/tutur3u/platform/issues/8063)) ([69c7de8](https://github.com/tutur3u/platform/commit/69c7de89353e6d54064fa9b383fdcf39b96e8894))
* **rewise:** correct artifact and login smoke assertions ([#7899](https://github.com/tutur3u/platform/issues/7899)) ([59ceb3e](https://github.com/tutur3u/platform/commit/59ceb3e357ac3436b9c68d766a22d9fe04f9f657))
* **rewise:** serve the build identity without a session check ([#8065](https://github.com/tutur3u/platform/issues/8065)) ([e795fc7](https://github.com/tutur3u/platform/commit/e795fc72e4df9a91666edb4db57b306b9c59592d))
* **roadmap:** canonical /roadmap/ redirect target and asset smoke ([#8077](https://github.com/tutur3u/platform/issues/8077)) ([8d3f02d](https://github.com/tutur3u/platform/commit/8d3f02d1ad3c57ad867a8586939c9aead928739b))
* **roadmap:** canonical https://tuturuuu.com/roadmap with no trailing slash ([#8085](https://github.com/tutur3u/platform/issues/8085)) ([3254ca2](https://github.com/tutur3u/platform/commit/3254ca2c73abcb6d94bb14fdcc6b7cc4e304d6ee))
* **roadmap:** collect CSP script hashes with HTMLRewriter (D87 A5) ([#8136](https://github.com/tutur3u/platform/issues/8136)) ([fd9fe92](https://github.com/tutur3u/platform/commit/fd9fe92acf83a5fd3a12719cb613fb29810872f3))
* **roadmap:** contain docked desktop filters ([#8134](https://github.com/tutur3u/platform/issues/8134)) ([08f54d6](https://github.com/tutur3u/platform/commit/08f54d61b914de59b1b3f4e06cab44429ac6b35c))
* **roadmap:** dock filters below the compact navbar ([#8133](https://github.com/tutur3u/platform/issues/8133)) ([9659c5f](https://github.com/tutur3u/platform/commit/9659c5feea1863eef1d98ffe23ddec686e4a76fb))
* **roadmap:** feathered full-bleed glows, clear descenders, hosting cards ([2adce0a](https://github.com/tutur3u/platform/commit/2adce0a8922ddc99a1023ae5c3e888a58192f688))
* **roadmap:** hash only real inline script elements in the CSP ([#8112](https://github.com/tutur3u/platform/issues/8112)) ([2094c80](https://github.com/tutur3u/platform/commit/2094c809cf0a1c2da8e5f5c37b40aaf631c3b3a5))
* **roadmap:** keep EduFest fact labels on one line ([8dfe9fe](https://github.com/tutur3u/platform/commit/8dfe9fea04365ac8325634ce5343edc55a27f016))
* **roadmap:** keep the deploy CLI's name out of roadmap sources ([#8108](https://github.com/tutur3u/platform/issues/8108)) ([aa2d872](https://github.com/tutur3u/platform/commit/aa2d872d09f3de97b8371cde4d18e9073735ed45))
* **roadmap:** let the EduFest hero glow span the whole hero ([ccf709c](https://github.com/tutur3u/platform/commit/ccf709c0d0a0ade3d1a845e218dbd86a396cea21))
* **roadmap:** let the EduFest hero glow span the whole hero ([#8161](https://github.com/tutur3u/platform/issues/8161)) ([19e7fee](https://github.com/tutur3u/platform/commit/19e7feefee3beb8b4053d1dadc909d4bc859fb34))
* **roadmap:** merge duplicate EduFest agenda selectors ([13d7adf](https://github.com/tutur3u/platform/commit/13d7adfc037784cf19ee70cc76a414c8329cdf44))
* **roadmap:** never let same-zone probes misread Workers apps ([#8082](https://github.com/tutur3u/platform/issues/8082)) ([e456fd2](https://github.com/tutur3u/platform/commit/e456fd2bdc0c72cad7f2ad7826b40e03fba11089))
* **roadmap:** no prefetch on a zone that answers it with 503 ([#8164](https://github.com/tutur3u/platform/issues/8164)) ([3012b86](https://github.com/tutur3u/platform/commit/3012b8605a44fe65a0f444776888a2b3ccfb4b9a))
* **roadmap:** one hosting card per row on phones ([1d3fbc6](https://github.com/tutur3u/platform/commit/1d3fbc6537e48bfae01abcc0f1321b87b735de00))
* **roadmap:** redirect old English links to canonical paths ([8b76c71](https://github.com/tutur3u/platform/commit/8b76c7156e236aa09e7cd3600fb69566f51fe63a))
* **roadmap:** serve the public roadmap and redirect the satellite host ([#8073](https://github.com/tutur3u/platform/issues/8073)) ([8ca7b75](https://github.com/tutur3u/platform/commit/8ca7b753fc51f83862d4178e5f36d91a18509d6a))
* **roadmap:** server-render on Workers again, with link previews ([508f171](https://github.com/tutur3u/platform/commit/508f171930ab33fcf63d5aaa012d91b7cd5ef5a0))
* **roadmap:** server-render on Workers again, with link previews ([#8154](https://github.com/tutur3u/platform/issues/8154)) ([0ec4f54](https://github.com/tutur3u/platform/commit/0ec4f54b3aa08c30e41a9b78a3181d681ab8ad5d))
* **roadmap:** show compact navigation in one scrolling row ([#8148](https://github.com/tutur3u/platform/issues/8148)) ([14ab975](https://github.com/tutur3u/platform/commit/14ab975a545cb283e5a376e2440ff542559cf17a))
* **roadmap:** show each host's build date instead of a stale behind-main count ([0efe726](https://github.com/tutur3u/platform/commit/0efe7265fe64ba3cf0252d9169ae89acb008df84))
* **satellites:** shared workspace picker  Web invitations routing + picker layout ([#8273](https://github.com/tutur3u/platform/issues/8273)) ([38e21e3](https://github.com/tutur3u/platform/commit/38e21e33e9daeb855c707526108fb9dcee0f0522))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **seo:** register the marketing app and generate the new robots.txt files ([#8038](https://github.com/tutur3u/platform/issues/8038)) ([d830cec](https://github.com/tutur3u/platform/commit/d830cec3dbcebe696713ad7b4308e85b2308cf57))
* **settings:** show the workspace plan name once ([#7866](https://github.com/tutur3u/platform/issues/7866)) ([8eec383](https://github.com/tutur3u/platform/commit/8eec38339dc81b0bbbfaf9702c4273b88a01a2af))
* **start-bridge:** allow type-check-only TypeScript extension imports ([#8203](https://github.com/tutur3u/platform/issues/8203)) ([61ffd00](https://github.com/tutur3u/platform/commit/61ffd0062c3dbc31dbad1404c2c383621ae540f4))
* **start-bridge:** await redirect-only root pages so the redirect reaches the router ([#8078](https://github.com/tutur3u/platform/issues/8078)) ([ff9478b](https://github.com/tutur3u/platform/commit/ff9478b15b01ea8482cade822be8e2ede6d5b12e))
* **start-bridge:** deny framing when a kept CSP sets no frame-ancestors ([#8140](https://github.com/tutur3u/platform/issues/8140)) ([7882748](https://github.com/tutur3u/platform/commit/78827486265644b81dfc073752b6551d2871e269))
* **start-bridge:** harden thrown-error response headers ([5b3fa45](https://github.com/tutur3u/platform/commit/5b3fa457ab92469c6410daeabb8c3d94572a59eb))
* **start-bridge:** install the request store everywhere except client builds ([#8123](https://github.com/tutur3u/platform/issues/8123)) ([1ad6d50](https://github.com/tutur3u/platform/commit/1ad6d507de5d2b4cedced558d3eb12716720c1d5))
* **start-bridge:** keep AsyncLocalStorage out of the client bundle ([#8069](https://github.com/tutur3u/platform/issues/8069)) ([65693de](https://github.com/tutur3u/platform/commit/65693de765829dbcfaa40cc7468fe7a182d6930d))
* **start-bridge:** mounted verify never clears the session cookie ([#8100](https://github.com/tutur3u/platform/issues/8100)) ([c2c0019](https://github.com/tutur3u/platform/commit/c2c001999475e3c10dfcc2c5a06562ee1ddf945c))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **storage-core:** deny redirects in download relay ([#7912](https://github.com/tutur3u/platform/issues/7912)) ([74d583f](https://github.com/tutur3u/platform/commit/74d583f9034c48ce6df922a79d48fbbbbb002a36))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **tasks:** CSP collector stream cap, no script samples in logs, strict CSP on the topic verification page ([#8127](https://github.com/tutur3u/platform/issues/8127)) ([7647f10](https://github.com/tutur3u/platform/commit/7647f104247befe16821cbd789df85ea4b8ea397))
* **tasks:** isolate board transitions and sanitize runtime diagnostics ([#8177](https://github.com/tutur3u/platform/issues/8177)) ([9440e98](https://github.com/tutur3u/platform/commit/9440e9866615f296c5b2ca6f932d62710a94d411))
* **tasks:** no Supabase cookie deletions from the /api proxy on the mount (one-origin T8) ([#8122](https://github.com/tutur3u/platform/issues/8122)) ([569bc55](https://github.com/tutur3u/platform/commit/569bc55c68434969860c6734510a2550879f7409))
* **tasks:** scope people filters and protect private member emails ([#7914](https://github.com/tutur3u/platform/issues/7914)) ([596f18a](https://github.com/tutur3u/platform/commit/596f18afbe8756ebdb9ed13c6b1759841ad18452))
* **tasks:** send explicit JSON for workspace discovery and page loading ([32facc1](https://github.com/tutur3u/platform/commit/32facc1f3a88f1aee12f9cd248270e0ccd8c484c))
* **tasks:** send JSON for workspace discovery and page loaders ([#8160](https://github.com/tutur3u/platform/issues/8160)) ([65430a6](https://github.com/tutur3u/platform/commit/65430a6a09efec3591a8abe7376630c1acdc56ee))
* **test:** link the HSTS fixture VM graph once ([4b9c358](https://github.com/tutur3u/platform/commit/4b9c35823353a695576d89302157bddaafb5032d))
* **tooling:** compose reviewed main test recovery fixes ([2253e83](https://github.com/tutur3u/platform/commit/2253e837508958ec2724e7143f533039baf3f4f2))
* **tooling:** declare root React test dependencies ([#8195](https://github.com/tutur3u/platform/issues/8195)) ([afdf6d9](https://github.com/tutur3u/platform/commit/afdf6d91b7ce38c31732f75ca53f08f22b864593))
* **tooling:** preserve shared auth names and legacy dependency builds ([#7719](https://github.com/tutur3u/platform/issues/7719)) ([57fc031](https://github.com/tutur3u/platform/commit/57fc031908203a752de389e500545ab2a3df9bcb))
* **tooling:** recover scoped Cloudflare safety generator ([#8206](https://github.com/tutur3u/platform/issues/8206)) ([41ddf27](https://github.com/tutur3u/platform/commit/41ddf273e9900ef879a5e052e5c932998cf1f8b8))
* **tooling:** register marketing and workspace with portless and declare TS7 native preview for marketing ([#8117](https://github.com/tutur3u/platform/issues/8117)) ([8668ca0](https://github.com/tutur3u/platform/commit/8668ca0a3edf162cae451b517dd439f6422c62ec))
* **tooling:** simplify the config filename matcher ([#7867](https://github.com/tutur3u/platform/issues/7867)) ([a73dc17](https://github.com/tutur3u/platform/commit/a73dc17e9fd161f91d36d6413ccfb9c2e2059cc8))
* **tools:** keep node:test Cloudflare checks out of vitest ([#8047](https://github.com/tutur3u/platform/issues/8047)) ([9f67afd](https://github.com/tutur3u/platform/commit/9f67afdcb50ab0f31102a30011aab9add81b929c))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
* **ui:** make the hover-expand sidebar a layout-shift-free overlay ([#8090](https://github.com/tutur3u/platform/issues/8090)) ([a1cb136](https://github.com/tutur3u/platform/commit/a1cb1360e70798b0da26f061420f29e742411d74))
* **ui:** preserve workspace choices when discovery fails ([def3b03](https://github.com/tutur3u/platform/commit/def3b0318292c36d21d48729e0fdd2b2bb49beb2))
* **ui:** retain workspace choices after discovery errors ([#8159](https://github.com/tutur3u/platform/issues/8159)) ([d928e7b](https://github.com/tutur3u/platform/commit/d928e7b3be35d187f9a984ffd37d257e208f3f78))
* **users:** authenticate API keys before privileged queries ([#8236](https://github.com/tutur3u/platform/issues/8236)) ([1cf9687](https://github.com/tutur3u/platform/commit/1cf9687b00f05f9dd460d82f9d55924a8bce7c9e))
* **utils:** cover gateway, marketing, and workspace in the inventory ([#8021](https://github.com/tutur3u/platform/issues/8021)) ([f9717e6](https://github.com/tutur3u/platform/commit/f9717e622699a5e4062c9df63c49b537408b6444))
* **utils:** deny redirects in shared edge transports ([#7910](https://github.com/tutur3u/platform/issues/7910)) ([52ef97f](https://github.com/tutur3u/platform/commit/52ef97f71ba3ecee1c3f1d5bb04d81f0c71a7684))
* **utils:** record the workspace inquiries xwf gate ([#8022](https://github.com/tutur3u/platform/issues/8022)) ([d286f2e](https://github.com/tutur3u/platform/commit/d286f2e534e270657775982721eb6a5508b7d038))
* **utils:** register workspace.tuturuuu.com for app-session refresh ([#8023](https://github.com/tutur3u/platform/issues/8023)) ([d478cdb](https://github.com/tutur3u/platform/commit/d478cdbf10fd873ea5ddfdbb2043d0b1f990c488))
* **utils:** review the workspace app-coordination token consumer ([#8017](https://github.com/tutur3u/platform/issues/8017)) ([e870069](https://github.com/tutur3u/platform/commit/e870069e0e35bf3dfbcffe8b26f0bcd92fe8d0c6))
* **web,auth:** Web logout endpoints need same-origin proof without a cookie ([#8105](https://github.com/tutur3u/platform/issues/8105)) ([4275283](https://github.com/tutur3u/platform/commit/4275283548b0b4b4f7222cbf6d9baa314165492f))
* **web,cors:** accounts API CORS uses the strict first-party allowlist ([#8106](https://github.com/tutur3u/platform/issues/8106)) ([4e5530d](https://github.com/tutur3u/platform/commit/4e5530dc077ccfee78e4420908c4d267b7483ffe))
* **web:** admit the exact public gateway server action origin ([a094ed9](https://github.com/tutur3u/platform/commit/a094ed9983c1be9ba2fe655c2fb32fee15bfe389))
* **web:** align legal changes tests with Meet revision ([6198a4f](https://github.com/tutur3u/platform/commit/6198a4f1263ad1fa2f4c8b2cfd29995fb56c1e48))
* **web:** allow the exact public gateway server action origin ([#8156](https://github.com/tutur3u/platform/issues/8156)) ([438a38e](https://github.com/tutur3u/platform/commit/438a38ef94c47b7e154669396b28cffaf0fcf20e))
* **web:** bearer headers no longer skip CSRF on cookie-bearing web mutations ([#8104](https://github.com/tutur3u/platform/issues/8104)) ([5258463](https://github.com/tutur3u/platform/commit/5258463aef2485ce333614172b34e9f060965ee3))
* **web:** cover trailing-slash logout CSRF ([#8130](https://github.com/tutur3u/platform/issues/8130)) ([9e26542](https://github.com/tutur3u/platform/commit/9e265422ed6e11d106ca763de159bce466ce7a00))
* **web:** keep every one-origin app path out of the root service worker ([#8089](https://github.com/tutur3u/platform/issues/8089)) ([e376b14](https://github.com/tutur3u/platform/commit/e376b1422895da9e9fbe26679f19b0ffe829b7a6))
* **web:** regenerate the Start route manifest ([#8046](https://github.com/tutur3u/platform/issues/8046)) ([6cf8577](https://github.com/tutur3u/platform/commit/6cf8577d46fa50f2eec722b1ee9f82e91e81a4f0))
* **web:** restack design route authentication onto main ([#8198](https://github.com/tutur3u/platform/issues/8198)) ([2b67946](https://github.com/tutur3u/platform/commit/2b67946508706eecdc627b11ddc758b9d1e5e030))
* **web:** serve public /roadmap from the roadmap worker ([#7860](https://github.com/tutur3u/platform/issues/7860)) ([0392ae2](https://github.com/tutur3u/platform/commit/0392ae25d3a434c07f3692456b374a70d04ac7d6))
* **web:** stop the /roadmap root redirect loop between Next and the roadmap worker ([#7930](https://github.com/tutur3u/platform/issues/7930)) ([1d3fb5f](https://github.com/tutur3u/platform/commit/1d3fb5fd7d0e29a864b36e4c80f95d0307768615))
* **web:** type the CSRF test header fixtures ([#8137](https://github.com/tutur3u/platform/issues/8137)) ([40d96c7](https://github.com/tutur3u/platform/commit/40d96c733d6f97cdbca405ff15e25932affe17e0))
* **web:** use manual redirect handling in Worker-reachable server requests ([#8034](https://github.com/tutur3u/platform/issues/8034)) ([f1bd2ee](https://github.com/tutur3u/platform/commit/f1bd2eede729a200c9c0a643ab158dd0fae8ef20))
* **workspace-domains:** make the resolver authoritative and read the edge site API ([749e604](https://github.com/tutur3u/platform/commit/749e60433ca977bb76b72c047e041d72d6624e4d))
* **workspace-domains:** refuse platform subdomains the zone already answers for ([76e45a8](https://github.com/tutur3u/platform/commit/76e45a8225faeb6dc3dddf55cea7c590e7646368))
* **workspace-domains:** send a User-Agent on edge origin requests ([57ee5c0](https://github.com/tutur3u/platform/commit/57ee5c07c17d62a612ea0ccc93e4b064b130a010))
* **workspace:** authorize datasets with the satellite actor ([#8024](https://github.com/tutur3u/platform/issues/8024)) ([88cf376](https://github.com/tutur3u/platform/commit/88cf3761d497ae18e7303681d7a2341467493d42))
* **workspace:** do not register an offline worker ([#8019](https://github.com/tutur3u/platform/issues/8019)) ([de5c76a](https://github.com/tutur3u/platform/commit/de5c76a8dc89c6e3772de17586d90188d9c4b553))
* **workspace:** fail closed on the API forward origin, resync Web copies, allowlist the subdomain for CSRF ([#7981](https://github.com/tutur3u/platform/issues/7981)) ([b84abea](https://github.com/tutur3u/platform/commit/b84abea571c5de1dc3ee29708a4be06d3effd682))
* **workspace:** keep the node:test profile out of vitest ([#8036](https://github.com/tutur3u/platform/issues/8036)) ([de2ad31](https://github.com/tutur3u/platform/commit/de2ad31d2821a217a478ff276674370e13ccf324))
* **workspace:** move account-switch routes out of the vault directory ([#8016](https://github.com/tutur3u/platform/issues/8016)) ([8016403](https://github.com/tutur3u/platform/commit/8016403b1afd8a8d3259462b021d8e749af75170))
* **workspace:** resync Web auth copies ([#8183](https://github.com/tutur3u/platform/issues/8183)) ([81233bd](https://github.com/tutur3u/platform/commit/81233bdf3457403a4b39af5bccef9bf8d9f3c078))
* **workspaces:** refresh accepted invitations and handle acceptance replay ([0ad899e](https://github.com/tutur3u/platform/commit/0ad899e88085ab96be49e99dea3f6b1883f8682c))
* **workspaces:** reserve app-path workspace handles ([#8088](https://github.com/tutur3u/platform/issues/8088)) ([7df0569](https://github.com/tutur3u/platform/commit/7df056971b239690bdb79b0c435ddc681cd2d0fc))


### Performance Improvements

* **ci:** lock pull-request blast radius to the changed app ([#8043](https://github.com/tutur3u/platform/issues/8043)) ([d058dd6](https://github.com/tutur3u/platform/commit/d058dd66e87c95198a93d1ba76f80eace9c04ed0))
* **ci:** remove unused Bun setup from translation sort ([#7816](https://github.com/tutur3u/platform/issues/7816)) ([9f0d505](https://github.com/tutur3u/platform/commit/9f0d505a9f0a21b5576f45c388fd945f9db194ea))
* **ci:** run the configuration check only for affected apps ([#7927](https://github.com/tutur3u/platform/issues/7927)) ([d3650a6](https://github.com/tutur3u/platform/commit/d3650a680d5ebdb02c6aff018586120d2c478bcb))
* **ci:** supersede older runs of the same pull request ([#8059](https://github.com/tutur3u/platform/issues/8059)) ([2974e28](https://github.com/tutur3u/platform/commit/2974e280ead2c22b40f7036f22c67c42c6edeed0))
* **marketing:** adopt shared shell and streamline landing ([#8129](https://github.com/tutur3u/platform/issues/8129)) ([5f510d6](https://github.com/tutur3u/platform/commit/5f510d6db991bd3792e697cc2ee3ff7d543295a1))
* **marketing:** prioritize landing CSS and server-render the poster ([#8260](https://github.com/tutur3u/platform/issues/8260)) ([4ed7896](https://github.com/tutur3u/platform/commit/4ed7896421aa3c6dc03f5cdf6c34058055662198))
* **marketing:** reduce landing render delay and hydration ([#8188](https://github.com/tutur3u/platform/issues/8188)) ([3306953](https://github.com/tutur3u/platform/commit/33069539b7a181cd74542ac6d53b9f80d34de92b))
* **mira:** create new chats without waiting for title generation ([#8281](https://github.com/tutur3u/platform/issues/8281)) ([8b3431d](https://github.com/tutur3u/platform/commit/8b3431d1d3f7e8039dd395d0a4e1348f3b278b2b))
* **mira:** send immediately and show thinking state instantly ([2401331](https://github.com/tutur3u/platform/commit/240133125b1a5f4d7359b63f80ff8a2d62be7866))
* **roadmap:** intent-first hydration, workshop split and document-size guard ([#8192](https://github.com/tutur3u/platform/issues/8192)) ([302626a](https://github.com/tutur3u/platform/commit/302626af8b0dbcca4b1ccd1d10349633393391ac))
* **roadmap:** make roadmap and EduFest fast on low-end phones ([#8190](https://github.com/tutur3u/platform/issues/8190)) ([1bb95fd](https://github.com/tutur3u/platform/commit/1bb95fddc0df955a9b1b1cc96422dfb2a38583b1))
* **roadmap:** preload the hero font weights for each language ([a4dfb8e](https://github.com/tutur3u/platform/commit/a4dfb8ebd816446134a65d166d997d40c8c85f59))
</details>

<details><summary>ai-studio: 0.21.0</summary>

## [0.21.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.20.0...ai-studio-v0.21.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **ai:** deny redirected Colab sponsorship approvals ([#7909](https://github.com/tutur3u/platform/issues/7909)) ([ac0bd8a](https://github.com/tutur3u/platform/commit/ac0bd8a1e52ee4df8198783c0ae06e3103b68738))
* **ai:** rebuild the native Cloudflare cutover on current main ([0f32384](https://github.com/tutur3u/platform/commit/0f3238454b5cbe1dd83e4a61a5a5e27a0b84731b))
* **ai:** respect IME composition in model-list field ([#8249](https://github.com/tutur3u/platform/issues/8249)) ([1098d70](https://github.com/tutur3u/platform/commit/1098d7057221d4ad7c467ffc6d1285c91891f782))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>apps: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/apps-v0.26.0...apps-v0.27.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **cloudflare:** add HSTS to bespoke Worker responses ([#8238](https://github.com/tutur3u/platform/issues/8238)) ([9d38c27](https://github.com/tutur3u/platform/commit/9d38c271de6d42978d5748b1fc662356ca19db63))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>calendar: 0.38.0</summary>

## [0.38.0](https://github.com/tutur3u/platform/compare/calendar-v0.37.0...calendar-v0.38.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **calendar:** bound the stored sync diagnostics and redact secrets from error messages ([#8068](https://github.com/tutur3u/platform/issues/8068)) ([c9117bc](https://github.com/tutur3u/platform/commit/c9117bc953dde3bf2456a34011cf016ad875ed89))
* **edge:** reject Calendar and Mail provider redirects ([#7907](https://github.com/tutur3u/platform/issues/7907)) ([506c1ea](https://github.com/tutur3u/platform/commit/506c1ea9abce9c3903d977e5983e3b97d37a5a07))
* **encryption:** refuse to store plaintext when no workspace key is available ([#8086](https://github.com/tutur3u/platform/issues/8086)) ([34616cf](https://github.com/tutur3u/platform/commit/34616cf49cebc206d15e9ccb4cc9813dc56e5019))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>chat: 0.30.0</summary>

## [0.30.0](https://github.com/tutur3u/platform/compare/chat-v0.29.0...chat-v0.30.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **chat:** native TanStack Start + Void source for Cloudflare Workers ([#7962](https://github.com/tutur3u/platform/issues/7962)) ([1bf70ed](https://github.com/tutur3u/platform/commit/1bf70ed3aa37b363b99434faa9e72988a191f871))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **chat:** run the node:test deployment profile outside vitest ([#8049](https://github.com/tutur3u/platform/issues/8049)) ([3e6ed8b](https://github.com/tutur3u/platform/commit/3e6ed8b82b0e239afc7dbba300da8b00cfa16372))
* **chat:** seal the production Worker from the emitted config ([#7996](https://github.com/tutur3u/platform/issues/7996)) ([c75d762](https://github.com/tutur3u/platform/commit/c75d762ba667fd7a1485fa5df34e7cc6bd9a0d07))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** await redirect-only root pages so the redirect reaches the router ([#8078](https://github.com/tutur3u/platform/issues/8078)) ([ff9478b](https://github.com/tutur3u/platform/commit/ff9478b15b01ea8482cade822be8e2ede6d5b12e))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>cms: 0.40.0</summary>

## [0.40.0](https://github.com/tutur3u/platform/compare/cms-v0.39.0...cms-v0.40.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **cms:** admit editor-only members without publish access ([#7623](https://github.com/tutur3u/platform/issues/7623)) ([0588617](https://github.com/tutur3u/platform/commit/0588617737b70c92d0117a10d0ab7c15364b9e38))
* **cms:** full-page editor layout in IEEAI styling ([#8149](https://github.com/tutur3u/platform/issues/8149)) ([1cf665b](https://github.com/tutur3u/platform/commit/1cf665b069b66af5140fb6a09c9a3dbc069b74f8))
* **cms:** package native Cloudflare cutover artifacts ([c0bf35a](https://github.com/tutur3u/platform/commit/c0bf35ac701c1a1579465255da0f4ec6c3617ee9))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **web:** add CMS page version edit, preview and publish routes ([#7591](https://github.com/tutur3u/platform/issues/7591)) ([97d33b0](https://github.com/tutur3u/platform/commit/97d33b089e9f29dcce2a08ece86632710b5f87ea))
* **workers:** bind rewise and cms to the tuturuuu-abuse-guard service ([#8035](https://github.com/tutur3u/platform/issues/8035)) ([e4ac60e](https://github.com/tutur3u/platform/commit/e4ac60ed5fdc661f95eebe3726504098256a6053))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>database: 1.46.0</summary>

## [1.46.0](https://github.com/tutur3u/platform/compare/database-v1.45.0...database-v1.46.0) (2026-11-13)


### Features

* **cron-control:** schedule bounded AI Studio retention with a dry-run default ([#7524](https://github.com/tutur3u/platform/issues/7524)) ([41b40a0](https://github.com/tutur3u/platform/commit/41b40a09dfda9d7b58b59b516e5f7a6af06eee79))
* **database:** add CMS page versions and the editor permission ([6e96890](https://github.com/tutur3u/platform/commit/6e96890f084f8cb9a9df1ee44e3f95e37311a3f2))
* **database:** add workspace document parent and position ([9616c7c](https://github.com/tutur3u/platform/commit/9616c7c1759a91fbb98626a92aeb193a8dcccab6))
* **database:** add workspace document parent and position ([#7877](https://github.com/tutur3u/platform/issues/7877)) ([9616c7c](https://github.com/tutur3u/platform/commit/9616c7c1759a91fbb98626a92aeb193a8dcccab6))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **feature-flags:** add runtime controls with revisioned audit ([#7852](https://github.com/tutur3u/platform/issues/7852)) ([5c46f91](https://github.com/tutur3u/platform/commit/5c46f91b5cd3c8d9df3db833f8add139e0f729ba))
* **fee-lock:** discard a new linked invoice in one transaction ([bd1b2ec](https://github.com/tutur3u/platform/commit/bd1b2eccd41e096d1a6ce6b4c0262d850a0d6078))
* **fee-lock:** PR-12a discard a new linked invoice in one transaction (M5) ([#7561](https://github.com/tutur3u/platform/issues/7561)) ([bd1b2ec](https://github.com/tutur3u/platform/commit/bd1b2eccd41e096d1a6ce6b4c0262d850a0d6078))
* **ieeai:** free-only auto-accept for ieeai-stats invites (v1) ([#8246](https://github.com/tutur3u/platform/issues/8246)) ([585cbd1](https://github.com/tutur3u/platform/commit/585cbd13b25372da7f29b79e5e14846568490190))
* **infrastructure:** staff-only sender and ledger for the 11 Nov policy notice ([#7563](https://github.com/tutur3u/platform/issues/7563)) ([6055e37](https://github.com/tutur3u/platform/commit/6055e3738a7f4acef649255888dcb321aa0299ec))
* **meet:** add self-capture session, consent and read contracts ([#7309](https://github.com/tutur3u/platform/issues/7309)) ([52c690c](https://github.com/tutur3u/platform/commit/52c690c802e60099dd3d1df8122d2ef09f922a59))
* **web:** record SES bounces and complaints from signed SNS notifications ([#7567](https://github.com/tutur3u/platform/issues/7567)) ([9a2ae91](https://github.com/tutur3u/platform/commit/9a2ae91f5144425aa09808053612abcf82c75602))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **auth:** atomically guard legacy cross-app UUID redemption ([#7857](https://github.com/tutur3u/platform/issues/7857)) ([c87c857](https://github.com/tutur3u/platform/commit/c87c85785c44eb3713b16feeab0223758f74894e))
* **auth:** harden legacy token function grant contract ([32f1c38](https://github.com/tutur3u/platform/commit/32f1c384602543ec6c126f2995aaa6bb69fefbeb))
* **database:** count in-flight newsletter reservations toward the daily cap ([#7925](https://github.com/tutur3u/platform/issues/7925)) ([73f5b6b](https://github.com/tutur3u/platform/commit/73f5b6bc2601a3374959d032b98adbc9ad45a541))
* **database:** harden legacy cross-app token contract ([#7896](https://github.com/tutur3u/platform/issues/7896)) ([20bd1c4](https://github.com/tutur3u/platform/commit/20bd1c4396e1727132975decf8472601f4372348))
* **database:** parse newsletter domain checks on Postgres ([#7836](https://github.com/tutur3u/platform/issues/7836)) ([0142050](https://github.com/tutur3u/platform/commit/01420502bd5902a40d3ff671116ab3cc5255e4f0))
* **database:** SR-924 revoke client-role EXECUTE on private functions and note_voice_jobs ([#7960](https://github.com/tutur3u/platform/issues/7960)) ([b97b3ec](https://github.com/tutur3u/platform/commit/b97b3ecc9b0793964cda70891d79d4b3daae3c23))
* **database:** SR-924 sql-grant guard markers and non-executable rollback ([#8128](https://github.com/tutur3u/platform/issues/8128)) ([41888aa](https://github.com/tutur3u/platform/commit/41888aad837f6b701ea208a86667beb9df5468f0))
* **devbox:** bind run claims and leases to their owners ([#7130](https://github.com/tutur3u/platform/issues/7130)) ([cd92cc7](https://github.com/tutur3u/platform/commit/cd92cc7d7a6ee38069b683888ff21bd09bff0119))
* **fee-lock:** restore canonical 20261109161000 guard migration ([#7832](https://github.com/tutur3u/platform/issues/7832)) ([eccee1e](https://github.com/tutur3u/platform/commit/eccee1e98365420b6695586b1e6281ba44082553))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
* **utils:** register workspace.tuturuuu.com for app-session refresh ([#8023](https://github.com/tutur3u/platform/issues/8023)) ([d478cdb](https://github.com/tutur3u/platform/commit/d478cdbf10fd873ea5ddfdbb2043d0b1f990c488))
* **workspace-domains:** refuse platform subdomains the zone already answers for ([76e45a8](https://github.com/tutur3u/platform/commit/76e45a8225faeb6dc3dddf55cea7c590e7646368))
</details>

<details><summary>drive: 0.35.0</summary>

## [0.35.0](https://github.com/tutur3u/platform/compare/drive-v0.34.0...drive-v0.35.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **drive:** admit a separate production Start profile with sealed artifact and cutover packet ([#7928](https://github.com/tutur3u/platform/issues/7928)) ([edf2091](https://github.com/tutur3u/platform/commit/edf2091ecbb7b7171aab77046b672c80b7544915))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **cloudflare:** add HSTS to bespoke Worker responses ([#8238](https://github.com/tutur3u/platform/issues/8238)) ([9d38c27](https://github.com/tutur3u/platform/commit/9d38c271de6d42978d5748b1fc662356ca19db63))
* **drive:** mock the deploy gate in the Worker tests ([#8138](https://github.com/tutur3u/platform/issues/8138)) ([cc52533](https://github.com/tutur3u/platform/commit/cc52533361bd9b0be808adf41e824681c8fb7b70))
* **drive:** serve the build identity without a session refresh ([#7991](https://github.com/tutur3u/platform/issues/7991)) ([eb19858](https://github.com/tutur3u/platform/commit/eb1985872fffd5a783197475abc9bf4e31575fcc))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>external: 0.7.0</summary>

## [0.7.0](https://github.com/tutur3u/platform/compare/external-v0.6.1...external-v0.7.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **external:** rebuild the Cloudflare cutover on current main ([08e1b65](https://github.com/tutur3u/platform/commit/08e1b651ffafb0473ce362fcf222e8e49990b3a1))


### Bug Fixes

* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
</details>

<details><summary>finance: 0.37.0</summary>

## [0.37.0](https://github.com/tutur3u/platform/compare/finance-v0.36.0...finance-v0.37.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **fee-lock:** accept fee_lock_ref on subscription invoice create ([5ffe644](https://github.com/tutur3u/platform/commit/5ffe64410017536b848ae7a2e46b1af038b4de4c))
* **fee-lock:** explain a blocked delete of a pre-filled invoice ([13ae653](https://github.com/tutur3u/platform/commit/13ae653ea4ed1de5cccabcad1348af30a4e767bd))
* **fee-lock:** PR-05 route gate and fee lock detail read API ([#7556](https://github.com/tutur3u/platform/issues/7556)) ([9428927](https://github.com/tutur3u/platform/commit/9428927d33bb84042d95207d7045bef122c87cb9))
* **fee-lock:** PR-05b fee lock month view list API ([#7557](https://github.com/tutur3u/platform/issues/7557)) ([c800bed](https://github.com/tutur3u/platform/commit/c800bedc7156f094473910cdc8088d699574d16d))
* **fee-lock:** PR-05c page the month view past max_rows ([#7566](https://github.com/tutur3u/platform/issues/7566)) ([78e4ed7](https://github.com/tutur3u/platform/commit/78e4ed709a8498dfdbbaf9502e78c544118b6e51))
* **fee-lock:** PR-06 fee lock save, lock and reopen API ([#7558](https://github.com/tutur3u/platform/issues/7558)) ([2da9f5c](https://github.com/tutur3u/platform/commit/2da9f5c3c81eb107c5d13e3a157e791e77d46efb))
* **fee-lock:** PR-06b batch lock API ([#7560](https://github.com/tutur3u/platform/issues/7560)) ([6b986d1](https://github.com/tutur3u/platform/commit/6b986d129f77b2ea59c259a0ef06d0a42bff5529))
* **fee-lock:** PR-07 (1/3) list table, month helpers and copy ([#7541](https://github.com/tutur3u/platform/issues/7541)) ([8ad8bb6](https://github.com/tutur3u/platform/commit/8ad8bb61f4a8b9151abfa49117f2c4d3e92f0f10))
* **fee-lock:** PR-07 (2/3) month view with filters ([#7542](https://github.com/tutur3u/platform/issues/7542)) ([2a57548](https://github.com/tutur3u/platform/commit/2a57548be54fe9a58666bd1c6540add9e2a646b2))
* **fee-lock:** PR-07 (3/3) flag-gated route, nav item and pending-tab button ([#7543](https://github.com/tutur3u/platform/issues/7543)) ([f53403a](https://github.com/tutur3u/platform/commit/f53403a92a9dca661734a5c6027e073754ba6880))
* **fee-lock:** PR-07 (4/4) wire the Excel export dialog into the fee-lock page ([#7570](https://github.com/tutur3u/platform/issues/7570)) ([4afcabc](https://github.com/tutur3u/platform/commit/4afcabca775240a96ef85830ab9cce13f1ede142))
* **fee-lock:** PR-07 (5/5) mount the notice template tab ([2b5f09e](https://github.com/tutur3u/platform/commit/2b5f09eefb20b8187e66e573d47170108426b364))
* **fee-lock:** PR-09 sanitizeSpreadsheetText and export workbook ([#7559](https://github.com/tutur3u/platform/issues/7559)) ([408c319](https://github.com/tutur3u/platform/commit/408c319d5558337a1053fef0c0b92cefc2cee141))
* **fee-lock:** PR-09b ws-scoped export entry loader ([#7562](https://github.com/tutur3u/platform/issues/7562)) ([f42e0bb](https://github.com/tutur3u/platform/commit/f42e0bbc563deb9fb531e0a30a1209a02cbf9907))
* **fee-lock:** PR-09c Excel export route and exported event ([#7564](https://github.com/tutur3u/platform/issues/7564)) ([620eb25](https://github.com/tutur3u/platform/commit/620eb251a23fd06b033bc4906e1f3d1f3180bf63))
* **fee-lock:** PR-09d export dialog and client helper ([#7565](https://github.com/tutur3u/platform/issues/7565)) ([808697a](https://github.com/tutur3u/platform/commit/808697ae5d75449d3b8eb65b539e9dbc5f11f0c3))
* **fee-lock:** PR-11 notice template API ([c2b2653](https://github.com/tutur3u/platform/commit/c2b2653c7e8a66d49bf2f55dd0cc0a34c1b4ef19))
* **fee-lock:** PR-11b notice preview and HTML escaping ([f144716](https://github.com/tutur3u/platform/commit/f144716d16b17cf829dcbd836dd4b9af4def611c))
* **fee-lock:** PR-11c notice text in the Excel export ([a7f4bf3](https://github.com/tutur3u/platform/commit/a7f4bf37620a9e6c3e85e4439628af7c9c37d641))
* **fee-lock:** PR-11d notice template editor tab ([4d43410](https://github.com/tutur3u/platform/commit/4d434104430aa540e84f46935167e8c4fc4cc4c2))
* **fee-lock:** PR-12b validate fee_lock_ref and write the invoice link ([#7576](https://github.com/tutur3u/platform/issues/7576)) ([fd8a6af](https://github.com/tutur3u/platform/commit/fd8a6af0fbe73524b98caa3e84fa70c1be98b311))
* **fee-lock:** PR-12b2 accept fee_lock_ref on subscription invoice create ([#7577](https://github.com/tutur3u/platform/issues/7577)) ([5ffe644](https://github.com/tutur3u/platform/commit/5ffe64410017536b848ae7a2e46b1af038b4de4c))
* **fee-lock:** PR-12b3 explain a blocked delete of a pre-filled invoice ([#7578](https://github.com/tutur3u/platform/issues/7578)) ([13ae653](https://github.com/tutur3u/platform/commit/13ae653ea4ed1de5cccabcad1348af30a4e767bd))
* **fee-lock:** PR-12c locked fee suggestion for subscription invoices ([#7579](https://github.com/tutur3u/platform/issues/7579)) ([7d6a302](https://github.com/tutur3u/platform/commit/7d6a3022739ef535282f548dc9cce77eb0bc63aa))
* **fee-lock:** suggest the locked fee for a subscription invoice ([7d6a302](https://github.com/tutur3u/platform/commit/7d6a3022739ef535282f548dc9cce77eb0bc63aa))
* **fee-lock:** validate fee_lock_ref and write the invoice link ([fd8a6af](https://github.com/tutur3u/platform/commit/fd8a6af0fbe73524b98caa3e84fa70c1be98b311))
* **fee-lock:** wire the Excel export dialog into the fee-lock page ([4afcabc](https://github.com/tutur3u/platform/commit/4afcabca775240a96ef85830ab9cce13f1ede142))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **cutover:** align native artifact contracts ([#8228](https://github.com/tutur3u/platform/issues/8228)) ([c57c7fb](https://github.com/tutur3u/platform/commit/c57c7fb525e6c65989ffe130209e08cb6e8948a4))
* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **finance,rewise:** keep node:test files out of vitest and run them with node --test ([#8131](https://github.com/tutur3u/platform/issues/8131)) ([60d057c](https://github.com/tutur3u/platform/commit/60d057cbb6c55b340712d76d9315e5f2ea27ef86))
* **finance:** align bridge registry and startup smoke lifecycle ([#7900](https://github.com/tutur3u/platform/issues/7900)) ([4413d73](https://github.com/tutur3u/platform/commit/4413d73c98d614566013dc90d22ad0d1f00ccdcf))
* **finance:** model bounded signed SSR secret reads ([#7916](https://github.com/tutur3u/platform/issues/7916)) ([645f476](https://github.com/tutur3u/platform/commit/645f476a311680838bc7085ade80bdeb3ca5bd81))
* **finance:** resolve invoice creators with invoice permissions ([8993b82](https://github.com/tutur3u/platform/commit/8993b82f5337697c7b7c14c395cd51eb97c18442))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>hive: 0.28.0</summary>

## [0.28.0](https://github.com/tutur3u/platform/compare/hive-v0.27.0...hive-v0.28.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **hive:** native TanStack Start + Void source for Cloudflare Workers ([#7950](https://github.com/tutur3u/platform/issues/7950)) ([73926ad](https://github.com/tutur3u/platform/commit/73926ad9c4548d01bafd2f77c4e617530f7bd2c7))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **hive:** pin the test app URL against native CI build fixtures ([#8055](https://github.com/tutur3u/platform/issues/8055)) ([628fba3](https://github.com/tutur3u/platform/commit/628fba361d994ea3656f1693ae56ffd2e7692f9e))
* **hive:** seal the production cutover artifact from the build profile ([#7999](https://github.com/tutur3u/platform/issues/7999)) ([c1bdcba](https://github.com/tutur3u/platform/commit/c1bdcba730ae5b3569699b6dce2c87813fe6599c))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>infra: 0.40.0</summary>

## [0.40.0](https://github.com/tutur3u/platform/compare/infra-v0.39.0...infra-v0.40.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **feature-flags:** add runtime controls with revisioned audit ([#7852](https://github.com/tutur3u/platform/issues/7852)) ([5c46f91](https://github.com/tutur3u/platform/commit/5c46f91b5cd3c8d9df3db833f8add139e0f729ba))
* **infrastructure:** native TanStack Start + Void source for Cloudflare Workers ([#7963](https://github.com/tutur3u/platform/issues/7963)) ([a7826c1](https://github.com/tutur3u/platform/commit/a7826c1fb0931e315ef628caeb085d4110a8450f))
* **infrastructure:** staff-only sender and ledger for the 11 Nov policy notice ([#7563](https://github.com/tutur3u/platform/issues/7563)) ([6055e37](https://github.com/tutur3u/platform/commit/6055e3738a7f4acef649255888dcb321aa0299ec))
* **journal:** add a flagged mood chart and JSON export ([#7874](https://github.com/tutur3u/platform/issues/7874)) ([a230fb5](https://github.com/tutur3u/platform/commit/a230fb5f24fc511dbeb7e44a4e8960bcc3baa287))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **utils:** accept-only app coordination secret slot with promote and fallback-disable switches ([#7992](https://github.com/tutur3u/platform/issues/7992)) ([ac2b355](https://github.com/tutur3u/platform/commit/ac2b3552df633b7775cabeca5aee0b4da19030a9))
* **utils:** support staged coordination-token signing secret rotation ([#8205](https://github.com/tutur3u/platform/issues/8205)) ([baaa031](https://github.com/tutur3u/platform/commit/baaa03188bc1c57b69511503efe991196bddd446))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **admin:** authenticate infrastructure operations with one actor ([#8229](https://github.com/tutur3u/platform/issues/8229)) ([f83e4dd](https://github.com/tutur3u/platform/commit/f83e4ddf0d68a33f7b7b13c8ab3421de877a374d))
* **auth:** keep the caller user-agent on server sessions ([#7868](https://github.com/tutur3u/platform/issues/7868)) ([eff3792](https://github.com/tutur3u/platform/commit/eff3792d6baa8f8ae4450f2aa1bef93c49d2af85))
* **devbox:** bind run claims and leases to their owners ([#7130](https://github.com/tutur3u/platform/issues/7130)) ([cd92cc7](https://github.com/tutur3u/platform/commit/cd92cc7d7a6ee38069b683888ff21bd09bff0119))
* **encryption:** refuse to store plaintext when no workspace key is available ([#8086](https://github.com/tutur3u/platform/issues/8086)) ([34616cf](https://github.com/tutur3u/platform/commit/34616cf49cebc206d15e9ccb4cc9813dc56e5019))
* **infrastructure:** register policy-notice route and follow manual-redirect transport ([#8057](https://github.com/tutur3u/platform/issues/8057)) ([fc0d557](https://github.com/tutur3u/platform/commit/fc0d5579bafd0dd50bfaafd7f0ead8b20055581c))
* **infrastructure:** use manual redirect handling in desktop status and Apple review requests ([#8032](https://github.com/tutur3u/platform/issues/8032)) ([c3c08fd](https://github.com/tutur3u/platform/commit/c3c08fdeb7d75805c0c37d3aa19799bf40a047c0))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** await redirect-only root pages so the redirect reaches the router ([#8078](https://github.com/tutur3u/platform/issues/8078)) ([ff9478b](https://github.com/tutur3u/platform/commit/ff9478b15b01ea8482cade822be8e2ede6d5b12e))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>inventory: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/inventory-v0.38.0...inventory-v0.39.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **encryption:** refuse to store plaintext when no workspace key is available ([#8086](https://github.com/tutur3u/platform/issues/8086)) ([34616cf](https://github.com/tutur3u/platform/commit/34616cf49cebc206d15e9ccb4cc9813dc56e5019))
* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **inventory:** align offline cookie fixture with mounted session policy ([#8179](https://github.com/tutur3u/platform/issues/8179)) ([c224d55](https://github.com/tutur3u/platform/commit/c224d55f5be31bf79fc3e1379f3e6613603142c2))
* **inventory:** rebuild the native Cloudflare cutover on current main ([04ac227](https://github.com/tutur3u/platform/commit/04ac2275249b37df5058e8ffea3784711f84b327))
* **inventory:** supply required response-policy fixture bindings ([#7897](https://github.com/tutur3u/platform/issues/7897)) ([b646bb8](https://github.com/tutur3u/platform/commit/b646bb89f867491fdf70503c52baa42f05ff5dbd))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>storefront: 0.34.0</summary>

## [0.34.0](https://github.com/tutur3u/platform/compare/storefront-v0.33.0...storefront-v0.34.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>learn: 0.34.0</summary>

## [0.34.0](https://github.com/tutur3u/platform/compare/learn-v0.33.0...learn-v0.34.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **learn:** native TanStack Start + Void source for Cloudflare Workers ([#7961](https://github.com/tutur3u/platform/issues/7961)) ([6be5879](https://github.com/tutur3u/platform/commit/6be5879dc1aa5284bbaec48696cc8c46307a9231))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>mail: 0.33.0</summary>

## [0.33.0](https://github.com/tutur3u/platform/compare/mail-v0.32.0...mail-v0.33.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **start-bridge,cors:** enforce CSRF on mounts and tighten first-party CORS ([#8096](https://github.com/tutur3u/platform/issues/8096)) ([2abcaa0](https://github.com/tutur3u/platform/commit/2abcaa092a9ea1f50d3243c2d9f29101ac0eabf6))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **cloudflare:** add HSTS to bespoke Worker responses ([#8238](https://github.com/tutur3u/platform/issues/8238)) ([9d38c27](https://github.com/tutur3u/platform/commit/9d38c271de6d42978d5748b1fc662356ca19db63))
* **edge:** reject Calendar and Mail provider redirects ([#7907](https://github.com/tutur3u/platform/issues/7907)) ([506c1ea](https://github.com/tutur3u/platform/commit/506c1ea9abce9c3903d977e5983e3b97d37a5a07))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>marketing: 0.2.0</summary>

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
</details>

<details><summary>meet: 0.37.0</summary>

## [0.37.0](https://github.com/tutur3u/platform/compare/meet-v0.36.0...meet-v0.37.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **meet:** add named media scrim token for participant name bar ([#7948](https://github.com/tutur3u/platform/issues/7948)) ([dcdd4d4](https://github.com/tutur3u/platform/commit/dcdd4d41a455afa9eb364b2559b6b4389e110c2e))
* **meet:** classroom room caps and host admission ([#8141](https://github.com/tutur3u/platform/issues/8141)) ([d827c7b](https://github.com/tutur3u/platform/commit/d827c7b86a29fd1b129311a84d38bc1fca62b7ff))
* **meet:** floating self-preview and calmer ended screen ([#7924](https://github.com/tutur3u/platform/issues/7924)) ([eb8b552](https://github.com/tutur3u/platform/commit/eb8b5528e9e0aa3c2a89c204982378b1fbda540a))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **meet:** gate private Mira on durable participant consent ([#8274](https://github.com/tutur3u/platform/issues/8274)) ([061a566](https://github.com/tutur3u/platform/commit/061a566123e309f9004eb0793cd9a59016924c04))
* **meet:** inline the Mira mark and tighten the preparing screen ([#7922](https://github.com/tutur3u/platform/issues/7922)) ([31e74be](https://github.com/tutur3u/platform/commit/31e74be24b981b1e70ab372ee3c9f7cfafd7054b))
* **meet:** make Private Mira choices, leave and denials visible ([#8287](https://github.com/tutur3u/platform/issues/8287)) ([aad395d](https://github.com/tutur3u/platform/commit/aad395d94983c82d4623086e269d53f540fbae4e))
* **meet:** make the Meet AI gate default-off (allowlist-only, EC denied in code) ([#7518](https://github.com/tutur3u/platform/issues/7518)) ([660fa01](https://github.com/tutur3u/platform/commit/660fa0199d80c1b332a652b4d37958a20c738ce3))
* **meet:** narrow erased transcript segments before rendering ([#7904](https://github.com/tutur3u/platform/issues/7904)) ([26ee21c](https://github.com/tutur3u/platform/commit/26ee21ce0869f6696aa3df76d599b0774b696ce2))
* **meet:** prepare transcript readers for erasure markers ([#7517](https://github.com/tutur3u/platform/issues/7517)) ([f35343e](https://github.com/tutur3u/platform/commit/f35343e88998b4748ffe459a86debf26fb6bfb2c))
* **meet:** refuse legacy transcription permanently and retire the old recorder ([#7506](https://github.com/tutur3u/platform/issues/7506)) ([5ac0f24](https://github.com/tutur3u/platform/commit/5ac0f241be51d094ca2e515015a5307a386d342e))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>mind: 0.28.0</summary>

## [0.28.0](https://github.com/tutur3u/platform/compare/mind-v0.27.0...mind-v0.28.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **mind:** Cloudflare hardening: required secrets, full server-file smoke scan and smoke preconditions ([#7982](https://github.com/tutur3u/platform/issues/7982)) ([29b4527](https://github.com/tutur3u/platform/commit/29b45270223e7d6f697e4da23df69dd29c08a0fd))
* **mind:** native TanStack Start + Void source for Cloudflare Workers ([#7964](https://github.com/tutur3u/platform/issues/7964)) ([2f09b14](https://github.com/tutur3u/platform/commit/2f09b149f8a2233f847499f72bfdc5361825a43d))
* **mind:** run the abuse guard through the Cloudflare service binding ([#8001](https://github.com/tutur3u/platform/issues/8001)) ([9f703c3](https://github.com/tutur3u/platform/commit/9f703c315b74f61967e19c0b8d5fdf34b6c5494a))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **cutover:** align native artifact contracts ([#8228](https://github.com/tutur3u/platform/issues/8228)) ([c57c7fb](https://github.com/tutur3u/platform/commit/c57c7fb525e6c65989ffe130209e08cb6e8948a4))
* **mind:** qualify sealed-output smoke with required bindings ([#8132](https://github.com/tutur3u/platform/issues/8132)) ([102c44f](https://github.com/tutur3u/platform/commit/102c44fafa26a4d0f22cad2143e07d57be3adfe3))
* **mind:** stub the abuse guard in required-secrets tests ([#8054](https://github.com/tutur3u/platform/issues/8054)) ([da9f0e7](https://github.com/tutur3u/platform/commit/da9f0e727acf75abe5094579ee0acec35594d343))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>mobile: 0.28.0</summary>

## [0.28.0](https://github.com/tutur3u/platform/compare/mobile-v0.27.0...mobile-v0.28.0) (2026-11-13)


### Highlights

* **mobile:** prepare the Drive root list for offline reading behind offline_read_drive_list ([#7474](https://github.com/tutur3u/platform/issues/7474)) ([43618a3](https://github.com/tutur3u/platform/commit/43618a314e14a9191ea3682191f9bd1dbb2e1532))
* **tutoring:** gate parent message v2 by workspace config ([#7483](https://github.com/tutur3u/platform/issues/7483)) ([27ce3f5](https://github.com/tutur3u/platform/commit/27ce3f584ef69e340f388326763525c07e13b34c))
</details>

<details><summary>nova: 0.44.0</summary>

## [0.44.0](https://github.com/tutur3u/platform/compare/nova-v0.43.0...nova-v0.44.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **nova:** combine native Cloudflare worker and startup guards ([907252e](https://github.com/tutur3u/platform/commit/907252e65748c1d8ce28bfdd545297dc84616744))
* **nova:** run the abuse guard through the Cloudflare service binding ([#8002](https://github.com/tutur3u/platform/issues/8002)) ([c602004](https://github.com/tutur3u/platform/commit/c60200460f84fcf01583b390dc7532f7895fcf13))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **nova:** serve the production host and sweep Worker root hosts ([#8064](https://github.com/tutur3u/platform/issues/8064)) ([8c552cd](https://github.com/tutur3u/platform/commit/8c552cd31a6cb59e23b026ce2d0f963f8dcf70d5))
* **nova:** supply required runtime bindings in the response-policy fixture ([#7926](https://github.com/tutur3u/platform/issues/7926)) ([a5feb72](https://github.com/tutur3u/platform/commit/a5feb72c84e58586ac1484e486a4a90ecf9b0526))
* **nova:** type optional mounts and generated runtime bindings ([#8144](https://github.com/tutur3u/platform/issues/8144)) ([54504e7](https://github.com/tutur3u/platform/commit/54504e7c35bd7a52d5412d150fdb46a4813d5411))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** install the request store everywhere except client builds ([#8123](https://github.com/tutur3u/platform/issues/8123)) ([1ad6d50](https://github.com/tutur3u/platform/commit/1ad6d507de5d2b4cedced558d3eb12716720c1d5))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>playground: 0.8.0</summary>

## [0.8.0](https://github.com/tutur3u/platform/compare/playground-v0.7.0...playground-v0.8.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))


### Bug Fixes

* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
</details>

<details><summary>tools: 0.24.0</summary>

## [0.24.0](https://github.com/tutur3u/platform/compare/tools-v0.23.0...tools-v0.24.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **tools:** prepare native Cloudflare cutover artifact ([a39c34c](https://github.com/tutur3u/platform/commit/a39c34cfbad9ba67c930a7db7d2923707e986926))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **tools:** keep node:test Cloudflare checks out of vitest ([#8047](https://github.com/tutur3u/platform/issues/8047)) ([9f67afd](https://github.com/tutur3u/platform/commit/9f67afdcb50ab0f31102a30011aab9add81b929c))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>rewise: 0.47.0</summary>

## [0.47.0](https://github.com/tutur3u/platform/compare/rewise-v0.46.0...rewise-v0.47.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **rewise:** compose Cloudflare wiring onto main ([c7c7cd0](https://github.com/tutur3u/platform/commit/c7c7cd0ebd248c7ad49c14ec5f1d620a29cbb127))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workers:** bind rewise and cms to the tuturuuu-abuse-guard service ([#8035](https://github.com/tutur3u/platform/issues/8035)) ([e4ac60e](https://github.com/tutur3u/platform/commit/e4ac60ed5fdc661f95eebe3726504098256a6053))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **cutover:** align native artifact contracts ([#8228](https://github.com/tutur3u/platform/issues/8228)) ([c57c7fb](https://github.com/tutur3u/platform/commit/c57c7fb525e6c65989ffe130209e08cb6e8948a4))
* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **finance,rewise:** keep node:test files out of vitest and run them with node --test ([#8131](https://github.com/tutur3u/platform/issues/8131)) ([60d057c](https://github.com/tutur3u/platform/commit/60d057cbb6c55b340712d76d9315e5f2ea27ef86))
* **rewise:** correct artifact and login smoke assertions ([#7899](https://github.com/tutur3u/platform/issues/7899)) ([59ceb3e](https://github.com/tutur3u/platform/commit/59ceb3e357ac3436b9c68d766a22d9fe04f9f657))
* **rewise:** serve the build identity without a session check ([#8065](https://github.com/tutur3u/platform/issues/8065)) ([e795fc7](https://github.com/tutur3u/platform/commit/e795fc72e4df9a91666edb4db57b306b9c59592d))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>shortener: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/shortener-v0.26.0...shortener-v0.27.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **cloudflare:** add HSTS to bespoke Worker responses ([#8238](https://github.com/tutur3u/platform/issues/8238)) ([9d38c27](https://github.com/tutur3u/platform/commit/9d38c271de6d42978d5748b1fc662356ca19db63))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>tasks: 0.42.0</summary>

## [0.42.0](https://github.com/tutur3u/platform/compare/tasks-v0.41.0...tasks-v0.42.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **settings:** flatten board layout and inset the settings dialog ([#7920](https://github.com/tutur3u/platform/issues/7920)) ([e1518c1](https://github.com/tutur3u/platform/commit/e1518c1194ae6a8092056a80b6d53e4824f29a04))
* **start-bridge,cors:** enforce CSRF on mounts and tighten first-party CORS ([#8096](https://github.com/tutur3u/platform/issues/8096)) ([2abcaa0](https://github.com/tutur3u/platform/commit/2abcaa092a9ea1f50d3243c2d9f29101ac0eabf6))
* **tasks:** CSP with nonces and Trusted Types, report-only then switchable to enforce (one-origin T6) ([#8121](https://github.com/tutur3u/platform/issues/8121)) ([de3a663](https://github.com/tutur3u/platform/commit/de3a66307efa2643fe5e220d05e18d4e43f434d1))
* **tasks:** manifest and offline page relative to where they are served (one-origin T5) ([#8116](https://github.com/tutur3u/platform/issues/8116)) ([c1f1e2c](https://github.com/tutur3u/platform/commit/c1f1e2cf669d8867558327e32207cefb78bd1132))
* **tasks:** resolve Tasks-owned API calls under the app base (one-origin T2) ([#8110](https://github.com/tutur3u/platform/issues/8110)) ([52e7fcf](https://github.com/tutur3u/platform/commit/52e7fcfc1821728efe5a69607065cffd87183a01))
* **tasks:** serve the tuturuuu.com/tasks mount from the Tasks Worker (one-origin T1) ([#8109](https://github.com/tutur3u/platform/issues/8109)) ([7a9017e](https://github.com/tutur3u/platform/commit/7a9017e62a063e06c50c6418b6a50d93deb11845))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **ci:** retain root ratchet history and format Tasks manifest ([#8139](https://github.com/tutur3u/platform/issues/8139)) ([635f9c5](https://github.com/tutur3u/platform/commit/635f9c5c47b92ad708e098a19283b4031622fe86))
* **cloudflare:** add HSTS to bespoke Worker responses ([#8238](https://github.com/tutur3u/platform/issues/8238)) ([9d38c27](https://github.com/tutur3u/platform/commit/9d38c271de6d42978d5748b1fc662356ca19db63))
* **encryption:** refuse to store plaintext when no workspace key is available ([#8086](https://github.com/tutur3u/platform/issues/8086)) ([34616cf](https://github.com/tutur3u/platform/commit/34616cf49cebc206d15e9ccb4cc9813dc56e5019))
* **satellites:** shared workspace picker  Web invitations routing + picker layout ([#8273](https://github.com/tutur3u/platform/issues/8273)) ([38e21e3](https://github.com/tutur3u/platform/commit/38e21e33e9daeb855c707526108fb9dcee0f0522))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **tasks:** CSP collector stream cap, no script samples in logs, strict CSP on the topic verification page ([#8127](https://github.com/tutur3u/platform/issues/8127)) ([7647f10](https://github.com/tutur3u/platform/commit/7647f104247befe16821cbd789df85ea4b8ea397))
* **tasks:** isolate board transitions and sanitize runtime diagnostics ([#8177](https://github.com/tutur3u/platform/issues/8177)) ([9440e98](https://github.com/tutur3u/platform/commit/9440e9866615f296c5b2ca6f932d62710a94d411))
* **tasks:** no Supabase cookie deletions from the /api proxy on the mount (one-origin T8) ([#8122](https://github.com/tutur3u/platform/issues/8122)) ([569bc55](https://github.com/tutur3u/platform/commit/569bc55c68434969860c6734510a2550879f7409))
* **tasks:** scope people filters and protect private member emails ([#7914](https://github.com/tutur3u/platform/issues/7914)) ([596f18a](https://github.com/tutur3u/platform/commit/596f18afbe8756ebdb9ed13c6b1759841ad18452))
* **tasks:** send explicit JSON for workspace discovery and page loading ([32facc1](https://github.com/tutur3u/platform/commit/32facc1f3a88f1aee12f9cd248270e0ccd8c484c))
* **tasks:** send JSON for workspace discovery and page loaders ([#8160](https://github.com/tutur3u/platform/issues/8160)) ([65430a6](https://github.com/tutur3u/platform/commit/65430a6a09efec3591a8abe7376630c1acdc56ee))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>teach: 0.30.0</summary>

## [0.30.0](https://github.com/tutur3u/platform/compare/teach-v0.29.0...teach-v0.30.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **teach:** add inline AI review to module content ([#8167](https://github.com/tutur3u/platform/issues/8167)) ([e2b31a3](https://github.com/tutur3u/platform/commit/e2b31a39798eddce41027d4431734959918b30af))
* **teach:** native TanStack Start candidate on Vite+ and Void ([#7943](https://github.com/tutur3u/platform/issues/7943)) ([43ddad7](https://github.com/tutur3u/platform/commit/43ddad73fb63c815e9f5c0ac602d49aeb87ce294))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>pay: 0.23.0</summary>

## [0.23.0](https://github.com/tutur3u/platform/compare/pay-v0.22.0...pay-v0.23.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **web:** add workspace domain service, API routes and add-on reconciliation ([ecea578](https://github.com/tutur3u/platform/commit/ecea57841dfeee52bc30fc2d9643923cf4d4d40d))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **cutover:** align native artifact contracts ([#8228](https://github.com/tutur3u/platform/issues/8228)) ([c57c7fb](https://github.com/tutur3u/platform/commit/c57c7fb525e6c65989ffe130209e08cb6e8948a4))
* **pay:** allow the generated .ts config import in the Cloudflare type-check ([#8056](https://github.com/tutur3u/platform/issues/8056)) ([461b990](https://github.com/tutur3u/platform/commit/461b99079a62fb3edf8efbc642fd31e8448ef027))
* **pay:** scope the production artifact guard to runtime values ([#8011](https://github.com/tutur3u/platform/issues/8011)) ([94f1d1c](https://github.com/tutur3u/platform/commit/94f1d1cba17e8c3ae36a7be45a694588e3256397))
* **pay:** select the production host and cookie profile at build time ([#8006](https://github.com/tutur3u/platform/issues/8006)) ([0f3b228](https://github.com/tutur3u/platform/commit/0f3b228c6a98c8553615aa60e2261857b895efd6))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>contacts: 0.31.0</summary>

## [0.31.0](https://github.com/tutur3u/platform/compare/contacts-v0.30.0...contacts-v0.31.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **contacts:** highlight unscheduled students in Excel ([#7823](https://github.com/tutur3u/platform/issues/7823)) ([0563e8a](https://github.com/tutur3u/platform/commit/0563e8a1671539e53e0b7d2e6f98ff107ece83bd))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **ci:** restore reviewed main contracts and feedback fixtures ([#8211](https://github.com/tutur3u/platform/issues/8211)) ([bbbf404](https://github.com/tutur3u/platform/commit/bbbf404f9192b17bc7a831f6ff7ea4c567069cbc))
* **contacts:** guide tutoring exports to a bounded date range ([#7891](https://github.com/tutur3u/platform/issues/7891)) ([3080742](https://github.com/tutur3u/platform/commit/30807425e0d773c5062e87c64bdcaa528b655187))
* **contacts:** let tutoring viewers read full lesson content ([#7889](https://github.com/tutur3u/platform/issues/7889)) ([b5aa6f7](https://github.com/tutur3u/platform/commit/b5aa6f7020ebb4de7e11b425f055b4edeef2be35))
* **reports:** block approval and sending without feedback ([#7893](https://github.com/tutur3u/platform/issues/7893)) ([e1a34a4](https://github.com/tutur3u/platform/commit/e1a34a4b38c387640a88312ce3139df30eecfefe))
* **reports:** show report totals on open and filter by the month in the title ([#8063](https://github.com/tutur3u/platform/issues/8063)) ([69c7de8](https://github.com/tutur3u/platform/commit/69c7de89353e6d54064fa9b383fdcf39b96e8894))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>forms: 0.22.0</summary>

## [0.22.0](https://github.com/tutur3u/platform/compare/forms-v0.21.0...forms-v0.22.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **forms:** rebuild the native Cloudflare cutover on current main ([3b77902](https://github.com/tutur3u/platform/commit/3b779022f2a8b7d59fc436e340de123ccfa48a37))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** deny framing when a kept CSP sets no frame-ancestors ([#8140](https://github.com/tutur3u/platform/issues/8140)) ([7882748](https://github.com/tutur3u/platform/commit/78827486265644b81dfc073752b6551d2871e269))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
* **web:** serve public /roadmap from the roadmap worker ([#7860](https://github.com/tutur3u/platform/issues/7860)) ([0392ae2](https://github.com/tutur3u/platform/commit/0392ae25d3a434c07f3692456b374a70d04ac7d6))
</details>

<details><summary>git: 0.17.0</summary>

## [0.17.0](https://github.com/tutur3u/platform/compare/git-v0.16.0...git-v0.17.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **git:** rebuild the Cloudflare cutover on current main ([558157a](https://github.com/tutur3u/platform/commit/558157a4ac45dbef9a22becc5677ef6b1f961178))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **git:** expect the public root on the anonymous worker ([#7855](https://github.com/tutur3u/platform/issues/7855)) ([65bc164](https://github.com/tutur3u/platform/commit/65bc164526e4d90862338a9c0282185ed83e791a))
* **git:** seal the production cutover artifact from the emitted config ([#7998](https://github.com/tutur3u/platform/issues/7998)) ([2eee6bc](https://github.com/tutur3u/platform/commit/2eee6bcc33ac4d80e8afb280f4289f4a1071f8d1))
* **start-bridge:** install the request store everywhere except client builds ([#8123](https://github.com/tutur3u/platform/issues/8123)) ([1ad6d50](https://github.com/tutur3u/platform/commit/1ad6d507de5d2b4cedced558d3eb12716720c1d5))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>track: 0.33.0</summary>

## [0.33.0](https://github.com/tutur3u/platform/compare/track-v0.32.0...track-v0.33.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **encryption:** refuse to store plaintext when no workspace key is available ([#8086](https://github.com/tutur3u/platform/issues/8086)) ([34616cf](https://github.com/tutur3u/platform/commit/34616cf49cebc206d15e9ccb4cc9813dc56e5019))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>workspace: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/workspace-v0.1.0...workspace-v0.2.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **web:** add workspace domains settings page ([f37c0c0](https://github.com/tutur3u/platform/commit/f37c0c0fc8a2293ca9a82402155e253ca811b67d))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))
* **workspace:** carve authenticated app out of web onto Start ([#7944](https://github.com/tutur3u/platform/issues/7944)) ([51d7454](https://github.com/tutur3u/platform/commit/51d7454b305abc360a3320e6e43dcb1e1aa64c6c))
* **workspace:** carve the changelog, crawlers, polls and queues groups and register page modules ([#7972](https://github.com/tutur3u/platform/issues/7972)) ([870563a](https://github.com/tutur3u/platform/commit/870563ae3b7c5bb6e6d3f4c1f219924bfa4089e8))


### Bug Fixes

* close [#8157](https://github.com/tutur3u/platform/issues/8157) route-registry, inventory and policy gates on main ([#8166](https://github.com/tutur3u/platform/issues/8166)) ([ab9dbab](https://github.com/tutur3u/platform/commit/ab9dbabcd592b58002ed7cb9f79dde87351b8fda))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **seo:** register the marketing app and generate the new robots.txt files ([#8038](https://github.com/tutur3u/platform/issues/8038)) ([d830cec](https://github.com/tutur3u/platform/commit/d830cec3dbcebe696713ad7b4308e85b2308cf57))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
* **workspace:** authorize datasets with the satellite actor ([#8024](https://github.com/tutur3u/platform/issues/8024)) ([88cf376](https://github.com/tutur3u/platform/commit/88cf3761d497ae18e7303681d7a2341467493d42))
* **workspace:** do not register an offline worker ([#8019](https://github.com/tutur3u/platform/issues/8019)) ([de5c76a](https://github.com/tutur3u/platform/commit/de5c76a8dc89c6e3772de17586d90188d9c4b553))
* **workspace:** fail closed on the API forward origin, resync Web copies, allowlist the subdomain for CSRF ([#7981](https://github.com/tutur3u/platform/issues/7981)) ([b84abea](https://github.com/tutur3u/platform/commit/b84abea571c5de1dc3ee29708a4be06d3effd682))
* **workspace:** keep the node:test profile out of vitest ([#8036](https://github.com/tutur3u/platform/issues/8036)) ([de2ad31](https://github.com/tutur3u/platform/commit/de2ad31d2821a217a478ff276674370e13ccf324))
* **workspace:** move account-switch routes out of the vault directory ([#8016](https://github.com/tutur3u/platform/issues/8016)) ([8016403](https://github.com/tutur3u/platform/commit/8016403b1afd8a8d3259462b021d8e749af75170))
* **workspace:** resync Web auth copies ([#8183](https://github.com/tutur3u/platform/issues/8183)) ([81233bd](https://github.com/tutur3u/platform/commit/81233bdf3457403a4b39af5bccef9bf8d9f3c078))


### Performance Improvements

* **mira:** send immediately and show thinking state instantly ([2401331](https://github.com/tutur3u/platform/commit/240133125b1a5f4d7359b63f80ff8a2d62be7866))
</details>

<details><summary>start-bridge: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/start-bridge-v0.1.1...start-bridge-v0.2.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **start-bridge,cors:** enforce CSRF on mounts and tighten first-party CORS ([#8096](https://github.com/tutur3u/platform/issues/8096)) ([2abcaa0](https://github.com/tutur3u/platform/commit/2abcaa092a9ea1f50d3243c2d9f29101ac0eabf6))
* **start-bridge:** honour TTR_ONE_ORIGIN_&lt;APP&gt; in every bridged app ([#8098](https://github.com/tutur3u/platform/issues/8098)) ([5c70306](https://github.com/tutur3u/platform/commit/5c70306a0687ce9da6e3047bdb1c2b51bdb7adee))
* **start-bridge:** mounted no-writer guard for the per-app session cookie ([#8093](https://github.com/tutur3u/platform/issues/8093)) ([24e0ffe](https://github.com/tutur3u/platform/commit/24e0ffee9609b0392ab4b4c2bc3c88446f7c2f9c))
* **tasks:** CSP with nonces and Trusted Types, report-only then switchable to enforce (one-origin T6) ([#8121](https://github.com/tutur3u/platform/issues/8121)) ([de3a663](https://github.com/tutur3u/platform/commit/de3a66307efa2643fe5e220d05e18d4e43f434d1))


### Bug Fixes

* **auth,cors:** mounted logout CORS fails closed ([#8102](https://github.com/tutur3u/platform/issues/8102)) ([981de50](https://github.com/tutur3u/platform/commit/981de50799a12d32afc43e1b6b3dda30cccfeb3a))
* **auth:** CSRF check no longer bypassed by a junk Bearer on mounts ([#8101](https://github.com/tutur3u/platform/issues/8101)) ([8c8d949](https://github.com/tutur3u/platform/commit/8c8d94920a43d419df8191230fdd3dd68435f8b9))
* **ci:** refresh retained route digest and type header fixtures ([#8135](https://github.com/tutur3u/platform/issues/8135)) ([add27f5](https://github.com/tutur3u/platform/commit/add27f5f9b25ccce060a1a0ead02b63dc7f40709))
* **security:** enforce exact shared Worker HSTS boundary ([#8226](https://github.com/tutur3u/platform/issues/8226)) ([95fad90](https://github.com/tutur3u/platform/commit/95fad90e527fe3a2a24b3e0df12e3445901a7cbe))
* **start-bridge:** deny framing when a kept CSP sets no frame-ancestors ([#8140](https://github.com/tutur3u/platform/issues/8140)) ([7882748](https://github.com/tutur3u/platform/commit/78827486265644b81dfc073752b6551d2871e269))
* **start-bridge:** harden thrown-error response headers ([5b3fa45](https://github.com/tutur3u/platform/commit/5b3fa457ab92469c6410daeabb8c3d94572a59eb))
* **start-bridge:** install the request store everywhere except client builds ([#8123](https://github.com/tutur3u/platform/issues/8123)) ([1ad6d50](https://github.com/tutur3u/platform/commit/1ad6d507de5d2b4cedced558d3eb12716720c1d5))
* **start-bridge:** keep AsyncLocalStorage out of the client bundle ([#8069](https://github.com/tutur3u/platform/issues/8069)) ([65693de](https://github.com/tutur3u/platform/commit/65693de765829dbcfaa40cc7468fe7a182d6930d))
* **start-bridge:** send server-function payloads in POST bodies ([#8239](https://github.com/tutur3u/platform/issues/8239)) ([028d2a7](https://github.com/tutur3u/platform/commit/028d2a7c98fdd7fbd48ff8b263b65bc5007177fe))


### Performance Improvements

* **marketing:** reduce landing render delay and hydration ([#8188](https://github.com/tutur3u/platform/issues/8188)) ([3306953](https://github.com/tutur3u/platform/commit/33069539b7a181cd74542ac6d53b9f80d34de92b))
</details>

<details><summary>ai: 0.19.1</summary>

## [0.19.1](https://github.com/tutur3u/platform/compare/ai-v0.19.0...ai-v0.19.1) (2026-11-13)


### Bug Fixes

* **meet:** prepare transcript readers for erasure markers ([#7517](https://github.com/tutur3u/platform/issues/7517)) ([f35343e](https://github.com/tutur3u/platform/commit/f35343e88998b4748ffe459a86debf26fb6bfb2c))
* **meet:** redact transcription provider errors (erase V0) ([#7512](https://github.com/tutur3u/platform/issues/7512)) ([421adb8](https://github.com/tutur3u/platform/commit/421adb88736c8317572d1915bf2bcaf8dc8df6ff))
* **meet:** refuse legacy transcription permanently and retire the old recorder ([#7506](https://github.com/tutur3u/platform/issues/7506)) ([5ac0f24](https://github.com/tutur3u/platform/commit/5ac0f241be51d094ca2e515015a5307a386d342e))


### Performance Improvements

* **mira:** create new chats without waiting for title generation ([#8281](https://github.com/tutur3u/platform/issues/8281)) ([8b3431d](https://github.com/tutur3u/platform/commit/8b3431d1d3f7e8039dd395d0a4e1348f3b278b2b))
</details>

<details><summary>auth: 0.9.0</summary>

## [0.9.0](https://github.com/tutur3u/platform/compare/auth-v0.8.0...auth-v0.9.0) (2026-11-13)


### Features

* **auth:** same-origin sign-in return for apex-mounted apps ([#8095](https://github.com/tutur3u/platform/issues/8095)) ([966bad2](https://github.com/tutur3u/platform/commit/966bad2d958e3d529b7daa940f350e833c13c960))


### Bug Fixes

* **auth,gateway:** keep apex sign-in returns on the public host ([#8087](https://github.com/tutur3u/platform/issues/8087)) ([2c90f3b](https://github.com/tutur3u/platform/commit/2c90f3b32e62091ac988957f9d7512125ce64a9d))
* **auth:** CSRF check no longer bypassed by a junk Bearer on mounts ([#8101](https://github.com/tutur3u/platform/issues/8101)) ([8c8d949](https://github.com/tutur3u/platform/commit/8c8d94920a43d419df8191230fdd3dd68435f8b9))
* **start-bridge:** mounted verify never clears the session cookie ([#8100](https://github.com/tutur3u/platform/issues/8100)) ([c2c0019](https://github.com/tutur3u/platform/commit/c2c001999475e3c10dfcc2c5a06562ee1ddf945c))
* **web,auth:** Web logout endpoints need same-origin proof without a cookie ([#8105](https://github.com/tutur3u/platform/issues/8105)) ([4275283](https://github.com/tutur3u/platform/commit/4275283548b0b4b4f7222cbf6d9baa314165492f))
</details>

<details><summary>education-core: 0.6.0</summary>

## [0.6.0](https://github.com/tutur3u/platform/compare/education-core-v0.5.1...education-core-v0.6.0) (2026-11-13)


### Features

* **teach:** add inline AI review to module content ([#8167](https://github.com/tutur3u/platform/issues/8167)) ([e2b31a3](https://github.com/tutur3u/platform/commit/e2b31a39798eddce41027d4431734959918b30af))
</details>

<details><summary>feature-flags: 1.1.0</summary>

## [1.1.0](https://github.com/tutur3u/platform/compare/feature-flags-v1.0.0...feature-flags-v1.1.0) (2026-11-13)


### Features

* **feature-flags:** add runtime controls with revisioned audit ([#7852](https://github.com/tutur3u/platform/issues/7852)) ([5c46f91](https://github.com/tutur3u/platform/commit/5c46f91b5cd3c8d9df3db833f8add139e0f729ba))
* **tutoring:** gate parent message v2 by workspace config ([#7483](https://github.com/tutur3u/platform/issues/7483)) ([27ce3f5](https://github.com/tutur3u/platform/commit/27ce3f584ef69e340f388326763525c07e13b34c))


### Bug Fixes

* **ci:** restore reviewed main contracts and feedback fixtures ([#8211](https://github.com/tutur3u/platform/issues/8211)) ([bbbf404](https://github.com/tutur3u/platform/commit/bbbf404f9192b17bc7a831f6ff7ea4c567069cbc))
* **tooling:** compose reviewed main test recovery fixes ([2253e83](https://github.com/tutur3u/platform/commit/2253e837508958ec2724e7143f533039baf3f4f2))
</details>

<details><summary>finance-core: 0.6.0</summary>

## [0.6.0](https://github.com/tutur3u/platform/compare/finance-core-v0.5.0...finance-core-v0.6.0) (2026-11-13)


### Features

* **fee-lock:** PR-11b notice preview and HTML escaping ([f144716](https://github.com/tutur3u/platform/commit/f144716d16b17cf829dcbd836dd4b9af4def611c))


### Bug Fixes

* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
</details>

<details><summary>payment-core: 0.7.0</summary>

## [0.7.0](https://github.com/tutur3u/platform/compare/payment-core-v0.6.2...payment-core-v0.7.0) (2026-11-13)


### Features

* **web:** add workspace domain service, API routes and add-on reconciliation ([ecea578](https://github.com/tutur3u/platform/commit/ecea57841dfeee52bc30fc2d9643923cf4d4d40d))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>internal-api: 0.57.0</summary>

## [0.57.0](https://github.com/tutur3u/platform/compare/internal-api-v0.56.0...internal-api-v0.57.0) (2026-11-13)


### Features

* **contacts:** highlight unscheduled students in Excel ([#7823](https://github.com/tutur3u/platform/issues/7823)) ([0563e8a](https://github.com/tutur3u/platform/commit/0563e8a1671539e53e0b7d2e6f98ff107ece83bd))
* **documents:** gate hierarchy API and validate writes ([325affa](https://github.com/tutur3u/platform/commit/325affa9f8fd3d570f2bfb643c7891d35e1e2274))
* **fee-lock:** PR-09b ws-scoped export entry loader ([#7562](https://github.com/tutur3u/platform/issues/7562)) ([f42e0bb](https://github.com/tutur3u/platform/commit/f42e0bbc563deb9fb531e0a30a1209a02cbf9907))
* **fee-lock:** PR-09d export dialog and client helper ([#7565](https://github.com/tutur3u/platform/issues/7565)) ([808697a](https://github.com/tutur3u/platform/commit/808697ae5d75449d3b8eb65b539e9dbc5f11f0c3))
* **fee-lock:** PR-11 notice template API ([c2b2653](https://github.com/tutur3u/platform/commit/c2b2653c7e8a66d49bf2f55dd0cc0a34c1b4ef19))
* **fee-lock:** PR-11b notice preview and HTML escaping ([f144716](https://github.com/tutur3u/platform/commit/f144716d16b17cf829dcbd836dd4b9af4def611c))
* **fee-lock:** PR-11c notice text in the Excel export ([a7f4bf3](https://github.com/tutur3u/platform/commit/a7f4bf37620a9e6c3e85e4439628af7c9c37d641))
* **journal:** add a flagged mood chart and JSON export ([#7874](https://github.com/tutur3u/platform/issues/7874)) ([a230fb5](https://github.com/tutur3u/platform/commit/a230fb5f24fc511dbeb7e44a4e8960bcc3baa287))
* **meet:** add self-capture session, consent and read contracts ([#7309](https://github.com/tutur3u/platform/issues/7309)) ([52c690c](https://github.com/tutur3u/platform/commit/52c690c802e60099dd3d1df8122d2ef09f922a59))
* **tasks-ui:** route bare Tasks API fetches and root links through the app base (one-origin T4) ([#8113](https://github.com/tutur3u/platform/issues/8113)) ([d71e054](https://github.com/tutur3u/platform/commit/d71e054b1bf5e6d8ddfedc3179ada74c540c0be4))
* **teach:** add inline AI review to module content ([#8167](https://github.com/tutur3u/platform/issues/8167)) ([e2b31a3](https://github.com/tutur3u/platform/commit/e2b31a39798eddce41027d4431734959918b30af))
* **tutoring:** gate parent message v2 by workspace config ([#7483](https://github.com/tutur3u/platform/issues/7483)) ([27ce3f5](https://github.com/tutur3u/platform/commit/27ce3f584ef69e340f388326763525c07e13b34c))
* **web:** add workspace domains settings page ([f37c0c0](https://github.com/tutur3u/platform/commit/f37c0c0fc8a2293ca9a82402155e253ca811b67d))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))
* **workspace:** carve authenticated app out of web onto Start ([#7944](https://github.com/tutur3u/platform/issues/7944)) ([51d7454](https://github.com/tutur3u/platform/commit/51d7454b305abc360a3320e6e43dcb1e1aa64c6c))


### Bug Fixes

* **auth:** allow ten switchable accounts and canonical avatars ([#7869](https://github.com/tutur3u/platform/issues/7869)) ([a552aa5](https://github.com/tutur3u/platform/commit/a552aa5e0df05e3912d764c26684956fe98d50af))
* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **internal-api,utils:** use manual redirect handling in shared infrastructure clients ([#8033](https://github.com/tutur3u/platform/issues/8033)) ([8e8a7ea](https://github.com/tutur3u/platform/commit/8e8a7eaad26a40b61e94335e9321fd3ac3855589))
* **meet:** gate private Mira on durable participant consent ([#8274](https://github.com/tutur3u/platform/issues/8274)) ([061a566](https://github.com/tutur3u/platform/commit/061a566123e309f9004eb0793cd9a59016924c04))
* **meet:** prepare transcript readers for erasure markers ([#7517](https://github.com/tutur3u/platform/issues/7517)) ([f35343e](https://github.com/tutur3u/platform/commit/f35343e88998b4748ffe459a86debf26fb6bfb2c))
* **reports:** show report totals on open and filter by the month in the title ([#8063](https://github.com/tutur3u/platform/issues/8063)) ([69c7de8](https://github.com/tutur3u/platform/commit/69c7de89353e6d54064fa9b383fdcf39b96e8894))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>inventory-core: 0.12.0</summary>

## [0.12.0](https://github.com/tutur3u/platform/compare/inventory-core-v0.11.2...inventory-core-v0.12.0) (2026-11-13)


### Features

* **utils:** accept-only app coordination secret slot with promote and fallback-disable switches ([#7992](https://github.com/tutur3u/platform/issues/7992)) ([ac2b355](https://github.com/tutur3u/platform/commit/ac2b3552df633b7775cabeca5aee0b4da19030a9))
* **utils:** support staged coordination-token signing secret rotation ([#8205](https://github.com/tutur3u/platform/issues/8205)) ([baaa031](https://github.com/tutur3u/platform/commit/baaa03188bc1c57b69511503efe991196bddd446))


### Bug Fixes

* **encryption:** refuse to store plaintext when no workspace key is available ([#8086](https://github.com/tutur3u/platform/issues/8086)) ([34616cf](https://github.com/tutur3u/platform/commit/34616cf49cebc206d15e9ccb4cc9813dc56e5019))
</details>

<details><summary>legal: 0.3.2</summary>

## [0.3.2](https://github.com/tutur3u/platform/compare/legal-v0.3.1...legal-v0.3.2) (2026-11-13)


### Bug Fixes

* **legal:** hide internal review and upcoming-changes notices on production legal pages ([#8288](https://github.com/tutur3u/platform/issues/8288)) ([9c62d49](https://github.com/tutur3u/platform/commit/9c62d49c2f4204db2b2e1beaf8baa87357aff057))
</details>

<details><summary>marketing-shell: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/marketing-shell-v0.1.0...marketing-shell-v0.2.0) (2026-11-13)


### Features

* **marketing-shell:** one marketing layout; roadmap on the /home frame ([#8103](https://github.com/tutur3u/platform/issues/8103)) ([f3e5405](https://github.com/tutur3u/platform/commit/f3e5405b85a18cf0abab7c7823fa7f455ace133d))
* **roadmap:** indexable Vietnamese pages, JSON-LD, sitemap, lighter assets ([#8163](https://github.com/tutur3u/platform/issues/8163)) ([e57b42f](https://github.com/tutur3u/platform/commit/e57b42f47fcb26c6a95074796b6ba6eb774918ed))


### Bug Fixes

* **marketing-shell:** register the package with Release Please and the docs inventory ([#8124](https://github.com/tutur3u/platform/issues/8124)) ([cd71a4f](https://github.com/tutur3u/platform/commit/cd71a4fe4ddd73bf0a6289b68e561d4793341162))
* **roadmap:** dock filters below the compact navbar ([#8133](https://github.com/tutur3u/platform/issues/8133)) ([9659c5f](https://github.com/tutur3u/platform/commit/9659c5feea1863eef1d98ffe23ddec686e4a76fb))


### Performance Improvements

* **marketing:** adopt shared shell and streamline landing ([#8129](https://github.com/tutur3u/platform/issues/8129)) ([5f510d6](https://github.com/tutur3u/platform/commit/5f510d6db991bd3792e697cc2ee3ff7d543295a1))
* **marketing:** prioritize landing CSS and server-render the poster ([#8260](https://github.com/tutur3u/platform/issues/8260)) ([4ed7896](https://github.com/tutur3u/platform/commit/4ed7896421aa3c6dc03f5cdf6c34058055662198))
* **roadmap:** make roadmap and EduFest fast on low-end phones ([#8190](https://github.com/tutur3u/platform/issues/8190)) ([1bb95fd](https://github.com/tutur3u/platform/commit/1bb95fddc0df955a9b1b1cc96422dfb2a38583b1))
* **roadmap:** preload the hero font weights for each language ([a4dfb8e](https://github.com/tutur3u/platform/commit/a4dfb8ebd816446134a65d166d997d40c8c85f59))
</details>

<details><summary>realtime: 0.12.0</summary>

## [0.12.0](https://github.com/tutur3u/platform/compare/realtime-v0.11.0...realtime-v0.12.0) (2026-11-13)


### Features

* **meet:** classroom room caps and host admission ([#8141](https://github.com/tutur3u/platform/issues/8141)) ([d827c7b](https://github.com/tutur3u/platform/commit/d827c7b86a29fd1b129311a84d38bc1fca62b7ff))


### Bug Fixes

* **meet:** gate private Mira on durable participant consent ([#8274](https://github.com/tutur3u/platform/issues/8274)) ([061a566](https://github.com/tutur3u/platform/commit/061a566123e309f9004eb0793cd9a59016924c04))
* **meet:** make the Meet AI gate default-off (allowlist-only, EC denied in code) ([#7518](https://github.com/tutur3u/platform/issues/7518)) ([660fa01](https://github.com/tutur3u/platform/commit/660fa0199d80c1b332a652b4d37958a20c738ce3))
* **notes:** follow the shared default-off Meet AI gate ([#8041](https://github.com/tutur3u/platform/issues/8041)) ([5830abd](https://github.com/tutur3u/platform/commit/5830abd62f2d202d90b7da77ce06c17d6ce46a28))
* **realtime:** deny redirected channel broadcasts ([#7913](https://github.com/tutur3u/platform/issues/7913)) ([9a64f87](https://github.com/tutur3u/platform/commit/9a64f87ea0238bedfb3639eaa7fcdc39be93409a))
</details>

<details><summary>satellite: 0.28.0</summary>

## [0.28.0](https://github.com/tutur3u/platform/compare/satellite-v0.27.0...satellite-v0.28.0) (2026-11-13)


### Features

* **web:** move app marketing pages under products ([#6795](https://github.com/tutur3u/platform/issues/6795)) ([3fe3bdb](https://github.com/tutur3u/platform/commit/3fe3bdbc5a6426180f26fe48ade0f6927731060a))


### Bug Fixes

* **settings:** show the workspace plan name once ([#7866](https://github.com/tutur3u/platform/issues/7866)) ([8eec383](https://github.com/tutur3u/platform/commit/8eec38339dc81b0bbbfaf9702c4273b88a01a2af))
* **ui:** make the hover-expand sidebar a layout-shift-free overlay ([#8090](https://github.com/tutur3u/platform/issues/8090)) ([a1cb136](https://github.com/tutur3u/platform/commit/a1cb1360e70798b0da26f061420f29e742411d74))
* **workspaces:** reserve app-path workspace handles ([#8088](https://github.com/tutur3u/platform/issues/8088)) ([7df0569](https://github.com/tutur3u/platform/commit/7df056971b239690bdb79b0c435ddc681cd2d0fc))
</details>

<details><summary>sdk: 0.31.0</summary>

## [0.31.0](https://github.com/tutur3u/platform/compare/sdk-v0.30.0...sdk-v0.31.0) (2026-11-13)


### Features

* **sdk:** add ttr domains commands ([c42f0a0](https://github.com/tutur3u/platform/commit/c42f0a06713956a3d9b619e574e1d564a05a27e0))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>storage-core: 0.3.5</summary>

## [0.3.5](https://github.com/tutur3u/platform/compare/storage-core-v0.3.4...storage-core-v0.3.5) (2026-11-13)


### Bug Fixes

* **storage-core:** deny redirects in download relay ([#7912](https://github.com/tutur3u/platform/issues/7912)) ([74d583f](https://github.com/tutur3u/platform/commit/74d583f9034c48ce6df922a79d48fbbbbb002a36))
</details>

<details><summary>supabase: 0.7.1</summary>

## [0.7.1](https://github.com/tutur3u/platform/compare/supabase-v0.7.0...supabase-v0.7.1) (2026-11-13)


### Bug Fixes

* **auth:** keep the caller user-agent on server sessions ([#7868](https://github.com/tutur3u/platform/issues/7868)) ([eff3792](https://github.com/tutur3u/platform/commit/eff3792d6baa8f8ae4450f2aa1bef93c49d2af85))
</details>

<details><summary>tasks-ui: 0.19.0</summary>

## [0.19.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.18.0...tasks-ui-v0.19.0) (2026-11-13)


### Features

* **settings:** flatten board layout and inset the settings dialog ([#7920](https://github.com/tutur3u/platform/issues/7920)) ([e1518c1](https://github.com/tutur3u/platform/commit/e1518c1194ae6a8092056a80b6d53e4824f29a04))
* **tasks-ui:** route bare Tasks API fetches and root links through the app base (one-origin T4) ([#8113](https://github.com/tutur3u/platform/issues/8113)) ([d71e054](https://github.com/tutur3u/platform/commit/d71e054b1bf5e6d8ddfedc3179ada74c540c0be4))


### Bug Fixes

* **tasks:** scope people filters and protect private member emails ([#7914](https://github.com/tutur3u/platform/issues/7914)) ([596f18a](https://github.com/tutur3u/platform/commit/596f18afbe8756ebdb9ed13c6b1759841ad18452))
</details>

<details><summary>types: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/types-v0.38.0...types-v0.39.0) (2026-11-13)


### Features

* **cron-control:** schedule bounded AI Studio retention with a dry-run default ([#7524](https://github.com/tutur3u/platform/issues/7524)) ([41b40a0](https://github.com/tutur3u/platform/commit/41b40a09dfda9d7b58b59b516e5f7a6af06eee79))
* **database:** add workspace document parent and position ([9616c7c](https://github.com/tutur3u/platform/commit/9616c7c1759a91fbb98626a92aeb193a8dcccab6))
* **database:** add workspace document parent and position ([#7877](https://github.com/tutur3u/platform/issues/7877)) ([9616c7c](https://github.com/tutur3u/platform/commit/9616c7c1759a91fbb98626a92aeb193a8dcccab6))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **fee-lock:** discard a new linked invoice in one transaction ([bd1b2ec](https://github.com/tutur3u/platform/commit/bd1b2eccd41e096d1a6ce6b4c0262d850a0d6078))
* **fee-lock:** PR-12a discard a new linked invoice in one transaction (M5) ([#7561](https://github.com/tutur3u/platform/issues/7561)) ([bd1b2ec](https://github.com/tutur3u/platform/commit/bd1b2eccd41e096d1a6ce6b4c0262d850a0d6078))
* **ieeai:** free-only auto-accept for ieeai-stats invites (v1) ([#8246](https://github.com/tutur3u/platform/issues/8246)) ([585cbd1](https://github.com/tutur3u/platform/commit/585cbd13b25372da7f29b79e5e14846568490190))
* **meet:** add self-capture session, consent and read contracts ([#7309](https://github.com/tutur3u/platform/issues/7309)) ([52c690c](https://github.com/tutur3u/platform/commit/52c690c802e60099dd3d1df8122d2ef09f922a59))
* **web:** add CMS page version edit, preview and publish routes ([#7591](https://github.com/tutur3u/platform/issues/7591)) ([97d33b0](https://github.com/tutur3u/platform/commit/97d33b089e9f29dcce2a08ece86632710b5f87ea))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **devbox:** bind run claims and leases to their owners ([#7130](https://github.com/tutur3u/platform/issues/7130)) ([cd92cc7](https://github.com/tutur3u/platform/commit/cd92cc7d7a6ee38069b683888ff21bd09bff0119))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>ui: 0.42.0</summary>

## [0.42.0](https://github.com/tutur3u/platform/compare/ui-v0.41.0...ui-v0.42.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **fee-lock:** PR-07 (3/3) flag-gated route, nav item and pending-tab button ([#7543](https://github.com/tutur3u/platform/issues/7543)) ([f53403a](https://github.com/tutur3u/platform/commit/f53403a92a9dca661734a5c6027e073754ba6880))
* **settings:** flatten board layout and inset the settings dialog ([#7920](https://github.com/tutur3u/platform/issues/7920)) ([e1518c1](https://github.com/tutur3u/platform/commit/e1518c1194ae6a8092056a80b6d53e4824f29a04))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** add localized experimental and beta status badges ([#7879](https://github.com/tutur3u/platform/issues/7879)) ([eb67676](https://github.com/tutur3u/platform/commit/eb6767651ddaaa7cc77c6dcbd519b7372fa2dd16))
* **ui:** mount-aware Tasks app and API URLs (one-origin T3) ([#8111](https://github.com/tutur3u/platform/issues/8111)) ([d02d73b](https://github.com/tutur3u/platform/commit/d02d73b75838e3aba44c83e37f1e5b23a9194597))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **ui:** share the profile avatar editor with workspaces ([#7871](https://github.com/tutur3u/platform/issues/7871)) ([6b04c23](https://github.com/tutur3u/platform/commit/6b04c2398038a5b86dab1bf4517bb5564911fd37))
* **web:** move app marketing pages under products ([#6795](https://github.com/tutur3u/platform/issues/6795)) ([3fe3bdb](https://github.com/tutur3u/platform/commit/3fe3bdbc5a6426180f26fe48ade0f6927731060a))


### Bug Fixes

* **auth:** keep the caller user-agent on server sessions ([#7868](https://github.com/tutur3u/platform/issues/7868)) ([eff3792](https://github.com/tutur3u/platform/commit/eff3792d6baa8f8ae4450f2aa1bef93c49d2af85))
* **ci:** align picker fixture and Pay contract fences ([#8180](https://github.com/tutur3u/platform/issues/8180)) ([b2752ac](https://github.com/tutur3u/platform/commit/b2752acdccf6fa2372e58144d0f57b1084852e27))
* **finance:** resolve invoice creators with invoice permissions ([8993b82](https://github.com/tutur3u/platform/commit/8993b82f5337697c7b7c14c395cd51eb97c18442))
* **satellites:** shared workspace picker  Web invitations routing + picker layout ([#8273](https://github.com/tutur3u/platform/issues/8273)) ([38e21e3](https://github.com/tutur3u/platform/commit/38e21e33e9daeb855c707526108fb9dcee0f0522))
* **tasks:** scope people filters and protect private member emails ([#7914](https://github.com/tutur3u/platform/issues/7914)) ([596f18a](https://github.com/tutur3u/platform/commit/596f18afbe8756ebdb9ed13c6b1759841ad18452))
* **ui:** make the hover-expand sidebar a layout-shift-free overlay ([#8090](https://github.com/tutur3u/platform/issues/8090)) ([a1cb136](https://github.com/tutur3u/platform/commit/a1cb1360e70798b0da26f061420f29e742411d74))
* **ui:** preserve workspace choices when discovery fails ([def3b03](https://github.com/tutur3u/platform/commit/def3b0318292c36d21d48729e0fdd2b2bb49beb2))
* **ui:** retain workspace choices after discovery errors ([#8159](https://github.com/tutur3u/platform/issues/8159)) ([d928e7b](https://github.com/tutur3u/platform/commit/d928e7b3be35d187f9a984ffd37d257e208f3f78))
* **workspaces:** refresh accepted invitations and handle acceptance replay ([0ad899e](https://github.com/tutur3u/platform/commit/0ad899e88085ab96be49e99dea3f6b1883f8682c))


### Performance Improvements

* **marketing:** adopt shared shell and streamline landing ([#8129](https://github.com/tutur3u/platform/issues/8129)) ([5f510d6](https://github.com/tutur3u/platform/commit/5f510d6db991bd3792e697cc2ee3ff7d543295a1))
</details>

<details><summary>users-core: 0.12.1</summary>

## [0.12.1](https://github.com/tutur3u/platform/compare/users-core-v0.12.0...users-core-v0.12.1) (2026-11-13)


### Bug Fixes

* **contacts:** filter monthly reports by report month ([#7887](https://github.com/tutur3u/platform/issues/7887)) ([d209d72](https://github.com/tutur3u/platform/commit/d209d72bfa54e4ed84b50f2a09fdb24e466a0547))
* **reports:** block approval and sending without feedback ([#7893](https://github.com/tutur3u/platform/issues/7893)) ([e1a34a4](https://github.com/tutur3u/platform/commit/e1a34a4b38c387640a88312ce3139df30eecfefe))
* **reports:** show report totals on open and filter by the month in the title ([#8063](https://github.com/tutur3u/platform/issues/8063)) ([69c7de8](https://github.com/tutur3u/platform/commit/69c7de89353e6d54064fa9b383fdcf39b96e8894))
* **users:** authenticate API keys before privileged queries ([#8236](https://github.com/tutur3u/platform/issues/8236)) ([1cf9687](https://github.com/tutur3u/platform/commit/1cf9687b00f05f9dd460d82f9d55924a8bce7c9e))
</details>

<details><summary>users-ui: 0.7.10</summary>

## [0.7.10](https://github.com/tutur3u/platform/compare/users-ui-v0.7.9...users-ui-v0.7.10) (2026-11-13)


### Bug Fixes

* **reports:** block approval and sending without feedback ([#7893](https://github.com/tutur3u/platform/issues/7893)) ([e1a34a4](https://github.com/tutur3u/platform/commit/e1a34a4b38c387640a88312ce3139df30eecfefe))
</details>

<details><summary>utils: 0.40.0</summary>

## [0.40.0](https://github.com/tutur3u/platform/compare/utils-v0.39.0...utils-v0.40.0) (2026-11-13)


### Features

* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **documents:** gate hierarchy API and validate writes ([325affa](https://github.com/tutur3u/platform/commit/325affa9f8fd3d570f2bfb643c7891d35e1e2274))
* **fee-lock:** PR-09 sanitizeSpreadsheetText and export workbook ([#7559](https://github.com/tutur3u/platform/issues/7559)) ([408c319](https://github.com/tutur3u/platform/commit/408c319d5558337a1053fef0c0b92cefc2cee141))
* **gateway,utils:** serve bare /&lt;app&gt;?query on mounts and redirect without trailing slash ([#8097](https://github.com/tutur3u/platform/issues/8097)) ([f1e9796](https://github.com/tutur3u/platform/commit/f1e9796bae7ec3396382f3ff60ee6c9fe8db6884))
* **journal:** add a flagged mood chart and JSON export ([#7874](https://github.com/tutur3u/platform/issues/7874)) ([a230fb5](https://github.com/tutur3u/platform/commit/a230fb5f24fc511dbeb7e44a4e8960bcc3baa287))
* **meet:** classroom room caps and host admission ([#8141](https://github.com/tutur3u/platform/issues/8141)) ([d827c7b](https://github.com/tutur3u/platform/commit/d827c7b86a29fd1b129311a84d38bc1fca62b7ff))
* **start-bridge,cors:** enforce CSRF on mounts and tighten first-party CORS ([#8096](https://github.com/tutur3u/platform/issues/8096)) ([2abcaa0](https://github.com/tutur3u/platform/commit/2abcaa092a9ea1f50d3243c2d9f29101ac0eabf6))
* **status-api:** rebuild the public read worker on current main ([864cefe](https://github.com/tutur3u/platform/commit/864cefe345b9ba4d2801c2cedbf3d04f9f2f6059))
* **tutoring:** gate parent message v2 by workspace config ([#7483](https://github.com/tutur3u/platform/issues/7483)) ([27ce3f5](https://github.com/tutur3u/platform/commit/27ce3f584ef69e340f388326763525c07e13b34c))
* **utils:** accept-only app coordination secret slot with promote and fallback-disable switches ([#7992](https://github.com/tutur3u/platform/issues/7992)) ([ac2b355](https://github.com/tutur3u/platform/commit/ac2b3552df633b7775cabeca5aee0b4da19030a9))
* **utils:** base-path-aware app registry, one-origin P1 ([#8092](https://github.com/tutur3u/platform/issues/8092)) ([36769f4](https://github.com/tutur3u/platform/commit/36769f4d3eeb0c8d02df6fc23de5a93cff2a1146))
* **utils:** support staged coordination-token signing secret rotation ([#8205](https://github.com/tutur3u/platform/issues/8205)) ([baaa031](https://github.com/tutur3u/platform/commit/baaa03188bc1c57b69511503efe991196bddd446))
* **web:** add CMS page version edit, preview and publish routes ([#7591](https://github.com/tutur3u/platform/issues/7591)) ([97d33b0](https://github.com/tutur3u/platform/commit/97d33b089e9f29dcce2a08ece86632710b5f87ea))
* **workspace-domains:** add edge Worker for workspace custom domains ([8cefbc9](https://github.com/tutur3u/platform/commit/8cefbc97ab9361a1a3ef5b7925d52dabdca5958f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))
* **workspace:** carve authenticated app out of web onto Start ([#7944](https://github.com/tutur3u/platform/issues/7944)) ([51d7454](https://github.com/tutur3u/platform/commit/51d7454b305abc360a3320e6e43dcb1e1aa64c6c))


### Bug Fixes

* **auth,cors:** mounted logout CORS fails closed ([#8102](https://github.com/tutur3u/platform/issues/8102)) ([981de50](https://github.com/tutur3u/platform/commit/981de50799a12d32afc43e1b6b3dda30cccfeb3a))
* close [#8157](https://github.com/tutur3u/platform/issues/8157) route-registry, inventory and policy gates on main ([#8166](https://github.com/tutur3u/platform/issues/8166)) ([ab9dbab](https://github.com/tutur3u/platform/commit/ab9dbabcd592b58002ed7cb9f79dde87351b8fda))
* **encryption:** refuse to store plaintext when no workspace key is available ([#8086](https://github.com/tutur3u/platform/issues/8086)) ([34616cf](https://github.com/tutur3u/platform/commit/34616cf49cebc206d15e9ccb4cc9813dc56e5019))
* **fee-lock:** guard snapshot revision in suggestion route and format oxc files ([#7861](https://github.com/tutur3u/platform/issues/7861)) ([a2eaf8f](https://github.com/tutur3u/platform/commit/a2eaf8ff2b1e730b76121c50295f4dd99f0b3b89))
* **finance:** resolve invoice creators with invoice permissions ([8993b82](https://github.com/tutur3u/platform/commit/8993b82f5337697c7b7c14c395cd51eb97c18442))
* **internal-api,utils:** use manual redirect handling in shared infrastructure clients ([#8033](https://github.com/tutur3u/platform/issues/8033)) ([8e8a7ea](https://github.com/tutur3u/platform/commit/8e8a7eaad26a40b61e94335e9321fd3ac3855589))
* **marketing:** serve the landing pages as indexable on tuturuuu.com ([#8178](https://github.com/tutur3u/platform/issues/8178)) ([767dc4d](https://github.com/tutur3u/platform/commit/767dc4d2ce9e77ab5e5e0c76a5fc0b7c7bbeaa1c))
* **seo:** register the marketing app and generate the new robots.txt files ([#8038](https://github.com/tutur3u/platform/issues/8038)) ([d830cec](https://github.com/tutur3u/platform/commit/d830cec3dbcebe696713ad7b4308e85b2308cf57))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
* **utils:** cover gateway, marketing, and workspace in the inventory ([#8021](https://github.com/tutur3u/platform/issues/8021)) ([f9717e6](https://github.com/tutur3u/platform/commit/f9717e622699a5e4062c9df63c49b537408b6444))
* **utils:** deny redirects in shared edge transports ([#7910](https://github.com/tutur3u/platform/issues/7910)) ([52ef97f](https://github.com/tutur3u/platform/commit/52ef97f71ba3ecee1c3f1d5bb04d81f0c71a7684))
* **utils:** record the workspace inquiries xwf gate ([#8022](https://github.com/tutur3u/platform/issues/8022)) ([d286f2e](https://github.com/tutur3u/platform/commit/d286f2e534e270657775982721eb6a5508b7d038))
* **utils:** register workspace.tuturuuu.com for app-session refresh ([#8023](https://github.com/tutur3u/platform/issues/8023)) ([d478cdb](https://github.com/tutur3u/platform/commit/d478cdbf10fd873ea5ddfdbb2043d0b1f990c488))
* **utils:** review the workspace app-coordination token consumer ([#8017](https://github.com/tutur3u/platform/issues/8017)) ([e870069](https://github.com/tutur3u/platform/commit/e870069e0e35bf3dfbcffe8b26f0bcd92fe8d0c6))
* **web,cors:** accounts API CORS uses the strict first-party allowlist ([#8106](https://github.com/tutur3u/platform/issues/8106)) ([4e5530d](https://github.com/tutur3u/platform/commit/4e5530dc077ccfee78e4420908c4d267b7483ffe))
* **workspace-domains:** refuse platform subdomains the zone already answers for ([76e45a8](https://github.com/tutur3u/platform/commit/76e45a8225faeb6dc3dddf55cea7c590e7646368))
* **workspaces:** reserve app-path workspace handles ([#8088](https://github.com/tutur3u/platform/issues/8088)) ([7df0569](https://github.com/tutur3u/platform/commit/7df056971b239690bdb79b0c435ddc681cd2d0fc))
</details>

<details><summary>lettin: 1.7.0</summary>

## [1.7.0](https://github.com/tutur3u/platform/compare/lettin-v1.6.0...lettin-v1.7.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>parley: 1.7.0</summary>

## [1.7.0](https://github.com/tutur3u/platform/compare/parley-v1.6.0...parley-v1.7.0) (2026-11-13)


### Features

* branded, theme-aware not-found and error page for every app ([#8189](https://github.com/tutur3u/platform/issues/8189)) ([1239360](https://github.com/tutur3u/platform/commit/123936030549e1e275ccd2b5256c9286a9f54a32))
* **database:** add workspace domains, entitlement and permissions ([3fa8b0d](https://github.com/tutur3u/platform/commit/3fa8b0dd8af1a3aa4bdbb7f59e97167e84d74115))
* **meet:** floating self-preview and calmer ended screen ([#7924](https://github.com/tutur3u/platform/issues/7924)) ([eb8b552](https://github.com/tutur3u/platform/commit/eb8b5528e9e0aa3c2a89c204982378b1fbda540a))
* **ui:** add actor-scoped workspace picker shortcuts ([#8170](https://github.com/tutur3u/platform/issues/8170)) ([d9a512c](https://github.com/tutur3u/platform/commit/d9a512cade746445f2b96535b8f50e8f7ee1d066))
* **ui:** pilot @ui-sdk/core for category keyboard reordering ([#8250](https://github.com/tutur3u/platform/issues/8250)) ([7b0eee6](https://github.com/tutur3u/platform/commit/7b0eee600b935e394b210a4590b670947b9a606f))
* **workspace-domains:** read the SaaS zone, apex and fallback origin from config ([8a38689](https://github.com/tutur3u/platform/commit/8a386894505308f1e4ceb3a826caa80ade76f40f))
* **workspace-domains:** workspace custom domains (paid add-on, staff bypass, edge Worker) ([#8157](https://github.com/tutur3u/platform/issues/8157)) ([11a94f0](https://github.com/tutur3u/platform/commit/11a94f0953a2fa6632c73eadfc35182229dda48c))


### Bug Fixes

* **meet:** gate private Mira on durable participant consent ([#8274](https://github.com/tutur3u/platform/issues/8274)) ([061a566](https://github.com/tutur3u/platform/commit/061a566123e309f9004eb0793cd9a59016924c04))
* **meet:** make Private Mira choices, leave and denials visible ([#8287](https://github.com/tutur3u/platform/issues/8287)) ([aad395d](https://github.com/tutur3u/platform/commit/aad395d94983c82d4623086e269d53f540fbae4e))
* **meet:** prepare transcript readers for erasure markers ([#7517](https://github.com/tutur3u/platform/issues/7517)) ([f35343e](https://github.com/tutur3u/platform/commit/f35343e88998b4748ffe459a86debf26fb6bfb2c))
* **tasks:** compose POST transport with current main ([1ff0fc7](https://github.com/tutur3u/platform/commit/1ff0fc7806853b0be9ac53d75c73d0677089ad68))
* **ui:** compose workspace reliability with current main ([07bffbe](https://github.com/tutur3u/platform/commit/07bffbe850fc6bf345f8d863c10feae66b3ccb70))
</details>

<details><summary>meet-core: 1.6.0</summary>

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
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).