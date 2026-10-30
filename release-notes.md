:robot: I have created a release *beep* *boop*
---


<details><summary>platform: 0.73.0</summary>

## [0.73.0](https://github.com/tutur3u/platform/compare/platform-v0.72.0...platform-v0.73.0) (2026-10-30)


### Features

* **abuse-guard:** add Durable Object guard store Worker ([#6837](https://github.com/tutur3u/platform/issues/6837)) ([41970d1](https://github.com/tutur3u/platform/commit/41970d183e9120b7ed03ddc53d69301525b78a8a))
* **ai:** add private Meet transcription evaluation harness ([#7269](https://github.com/tutur3u/platform/issues/7269)) ([28a5503](https://github.com/tutur3u/platform/commit/28a5503f53655583230e95046869485012a72575))
* **ai:** create Mira chat with the first message ([#6765](https://github.com/tutur3u/platform/issues/6765)) ([aae4d08](https://github.com/tutur3u/platform/commit/aae4d088b0225d428bce41153bac7cf204d5a8dd))
* **auth:** add a framework-free CSRF check in report mode ([#6847](https://github.com/tutur3u/platform/issues/6847)) ([23ce8a3](https://github.com/tutur3u/platform/commit/23ce8a3c18dd293d76ba60051216a49e5ecc15a3))
* **calendar:** admit native production cutover ([#6952](https://github.com/tutur3u/platform/issues/6952)) ([1269e31](https://github.com/tutur3u/platform/commit/1269e310101f1b360ab1dadf0311cafe8a3d337a))
* **ci:** add an always-on CI Admitted check and isolate unadmitted PR runs ([#6917](https://github.com/tutur3u/platform/issues/6917)) ([5ce3d9b](https://github.com/tutur3u/platform/commit/5ce3d9b8e21182afde2f931fa6b5b1d1bff84ee3))
* **ci:** gate heavy PR workflows behind the ready-for-ci label ([#6901](https://github.com/tutur3u/platform/issues/6901)) ([9dceabe](https://github.com/tutur3u/platform/commit/9dceabec55512d2e2125c4810b267caac2fb4ff5))
* **contacts:** add default-off Start candidate ([#7120](https://github.com/tutur3u/platform/issues/7120)) ([9a7795d](https://github.com/tutur3u/platform/commit/9a7795d2036bb1be9c346b3461abeef8f4eb0642))
* **contacts:** add teacher topic form and supervisor assignment ([de3c4e1](https://github.com/tutur3u/platform/commit/de3c4e1c9e58cf783be53638dcd1136a910fef74))
* **contacts:** add teacher topic form and supervisor assignment ([#6929](https://github.com/tutur3u/platform/issues/6929)) ([2ef4ddc](https://github.com/tutur3u/platform/commit/2ef4ddce414748093bba366211698ab4f9fc5385))
* **contacts:** assign tutoring shifts to class groups ([#6895](https://github.com/tutur3u/platform/issues/6895)) ([6054729](https://github.com/tutur3u/platform/commit/60547296d963cc9955c53654569e06f79a32a5e9))
* **contacts:** keep make-up tutoring content linked to lesson notes ([6c3186d](https://github.com/tutur3u/platform/commit/6c3186d2331350401e3e06a5269b15a0844e7d29))
* **contacts:** keep make-up tutoring content linked to lesson notes ([#6907](https://github.com/tutur3u/platform/issues/6907)) ([2fb0e9f](https://github.com/tutur3u/platform/commit/2fb0e9ff9ac1ed4f65a09ce4137d7741eb7a4633))
* **contacts:** label weak-support tutoring content and add Thoát kèm ([#6911](https://github.com/tutur3u/platform/issues/6911)) ([83dce34](https://github.com/tutur3u/platform/commit/83dce344854b7bc3334581504fc325aefbb111af))
* **contacts:** monthly GVNN schedule editor with month clone ([#6927](https://github.com/tutur3u/platform/issues/6927)) ([13c4e0b](https://github.com/tutur3u/platform/commit/13c4e0b43cdc20a4566187386a8eecf21157a79b))
* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **contacts:** pick an existing topic contact in the add-contact form ([#7047](https://github.com/tutur3u/platform/issues/7047)) ([f025e29](https://github.com/tutur3u/platform/commit/f025e290bbf0acd7ede7554876dc2a1f8ff18dd1))
* **contacts:** show teacher topic UI only with teacher assignments on ([26c6a0b](https://github.com/tutur3u/platform/commit/26c6a0b462353c419d634018ba03e31b9c56242e))
* **database:** add topic announcement teacher assignment schema ([24ad041](https://github.com/tutur3u/platform/commit/24ad04103ecce259beb379cb2a92dce31aa9c5ee))
* **database:** add topic announcement teacher assignment schema ([#6924](https://github.com/tutur3u/platform/issues/6924)) ([cf6a18d](https://github.com/tutur3u/platform/commit/cf6a18d3cfa33d5cc5b93a673613038e347be827))
* **database:** add topic teacher deadline notice types and receipts ([#6975](https://github.com/tutur3u/platform/issues/6975)) ([ee987de](https://github.com/tutur3u/platform/commit/ee987dec1d739c81a8d5eeda0502aa2c436249bf))
* **database:** add tutoring follow-up notification foundation ([3b51993](https://github.com/tutur3u/platform/commit/3b51993e516ad33d92b9e821acf4d7e4b4d81b08))
* **database:** add tutoring follow-up notification foundation ([#6909](https://github.com/tutur3u/platform/issues/6909)) ([1a986eb](https://github.com/tutur3u/platform/commit/1a986eb918304ce12c1b732307bce9b7817a5232))
* **devbox:** admit claims by reported execution mode behind a flag ([#6457](https://github.com/tutur3u/platform/issues/6457)) ([394fd27](https://github.com/tutur3u/platform/commit/394fd27a8e6aa5f3b868237f4fc9139d95132832))
* **finance:** brand reconciliation money and test token bounds ([#6873](https://github.com/tutur3u/platform/issues/6873)) ([63417bb](https://github.com/tutur3u/platform/commit/63417bb06522ed9c64cc6ecc06cb0a9a881a88e2))
* **forms:** qualify the native root Worker ([#6858](https://github.com/tutur3u/platform/issues/6858)) ([d801dd9](https://github.com/tutur3u/platform/commit/d801dd9491ffa8ebc8594e518ab79cf3f4e6adbe))
* **guards:** add a shrink-only browser session-surface guard ([#6848](https://github.com/tutur3u/platform/issues/6848)) ([5000e41](https://github.com/tutur3u/platform/commit/5000e4110f8549a2cf4d99522b1a6753beb62e67))
* **hive:** add Cloudflare maintenance and native migration plan ([#6868](https://github.com/tutur3u/platform/issues/6868)) ([00f1071](https://github.com/tutur3u/platform/commit/00f107166aab3428cc97e84e5284ec13ff127447))
* **infrastructure:** add the private ops hub gateway ([#6997](https://github.com/tutur3u/platform/issues/6997)) ([c7be6a7](https://github.com/tutur3u/platform/commit/c7be6a7b766ce04085887cdf5510f62611bf46d8))
* **legal:** redesign What changed with a gated bilingual notice ([#7228](https://github.com/tutur3u/platform/issues/7228)) ([e92a6e4](https://github.com/tutur3u/platform/commit/e92a6e4682fbbf266ec51eff26d91a3309ad6d0a))
* **mail:** adopt the shared Start bridge and request mounts ([#6763](https://github.com/tutur3u/platform/issues/6763)) ([d3621e5](https://github.com/tutur3u/platform/commit/d3621e508fcd17c11c781baddb82c7ce42e7886f))
* **mail:** settle the sync icon smoothly and move the mail source into Settings ([#7145](https://github.com/tutur3u/platform/issues/7145)) ([7df69df](https://github.com/tutur3u/platform/commit/7df69df8b8a845d2371802aa7a32e5c150a18097))
* **mail:** tighten the inbox list hierarchy and density ([#7146](https://github.com/tutur3u/platform/issues/7146)) ([5218adf](https://github.com/tutur3u/platform/commit/5218adf56b8fcd7a811020a0bfdc0e976750975f))
* **mastermind:** accept push event v2 with urgency ([#7210](https://github.com/tutur3u/platform/issues/7210)) ([1e0570d](https://github.com/tutur3u/platform/commit/1e0570db8916d947360c0f821d4908e3be9e5c08))
* **mastermind:** catch-up section on Today ([#7213](https://github.com/tutur3u/platform/issues/7213)) ([66dba6f](https://github.com/tutur3u/platform/commit/66dba6f107c966110c078b85a4ac999dc51ce11a))
* **meet,mail:** add flagged shared-origin routing at the Worker entry ([#6746](https://github.com/tutur3u/platform/issues/6746)) ([5b83ba8](https://github.com/tutur3u/platform/commit/5b83ba8eab646d423ff567d816deed73601ea38d))
* **meet,mail:** add per-app document security headers ([#6749](https://github.com/tutur3u/platform/issues/6749)) ([f2a60c8](https://github.com/tutur3u/platform/commit/f2a60c86bac0bf658cbe43c23f07f1cfa539cd09))
* **meet:** add a fenced 365-day transcript retention purge ([#7276](https://github.com/tutur3u/platform/issues/7276)) ([bb0a4e1](https://github.com/tutur3u/platform/commit/bb0a4e18af0a0ebb4cf7b6dbe712e1ce79554420))
* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
* **meet:** improve transcription quality and support solo meetings ([#7267](https://github.com/tutur3u/platform/issues/7267)) ([ecc5e53](https://github.com/tutur3u/platform/commit/ecc5e53bfa6423ddbd9aaf789e6779c551064eab))
* **meet:** inject the abuse-guard service binding ([#6853](https://github.com/tutur3u/platform/issues/6853)) ([5a5e00c](https://github.com/tutur3u/platform/commit/5a5e00cf13cb904ed021159c4cd1f07fb98c26b0))
* **mobile:** accessible chart kit for Mastermind insights ([#7040](https://github.com/tutur3u/platform/issues/7040)) ([6118e98](https://github.com/tutur3u/platform/commit/6118e987bd845601f92e4b097460f059550ec03e))
* **mobile:** add Appearance interface styles, density, corners and motion ([2e1fece](https://github.com/tutur3u/platform/commit/2e1fecec7e1390a80d01fe553971eac42c9eef1f))
* **mobile:** add Appearance interface styles, density, corners and motion ([#6889](https://github.com/tutur3u/platform/issues/6889)) ([bce582d](https://github.com/tutur3u/platform/commit/bce582dab8db44197ea40d265fca7e89b63ecd08))
* **mobile:** add Education mode and the Today classes card ([#6982](https://github.com/tutur3u/platform/issues/6982)) ([c035dce](https://github.com/tutur3u/platform/commit/c035dce3c3b10686088dfb373a3f36d69194be36))
* **mobile:** add gated read-only Mastermind Threads ([#7171](https://github.com/tutur3u/platform/issues/7171)) ([90f80a2](https://github.com/tutur3u/platform/commit/90f80a2ef141c22eccbcfadf21d8a920c72baca2))
* **mobile:** add Mastermind Work Backlog and Staff segments ([#7110](https://github.com/tutur3u/platform/issues/7110)) ([846f433](https://github.com/tutur3u/platform/commit/846f4337a91966f084ca1178363e8b566d61bc04))
* **mobile:** add read-only Mastermind Machines ([#7227](https://github.com/tutur3u/platform/issues/7227)) ([c753cc1](https://github.com/tutur3u/platform/commit/c753cc19fc6c3c48a5b1f6680ccb1a479095de5e))
* **mobile:** add the Mastermind Decisions journal to the Inbox ([#7134](https://github.com/tutur3u/platform/issues/7134)) ([c793ad2](https://github.com/tutur3u/platform/commit/c793ad2765a2b2e1d7da054debed5d89d46f9260))
* **mobile:** add the Mastermind entry, shell and Home tab ([#7100](https://github.com/tutur3u/platform/issues/7100)) ([c66fa2c](https://github.com/tutur3u/platform/commit/c66fa2ccaba3ed4437c23ee3638f4ce81fda6b9f))
* **mobile:** add the Mastermind Inbox and capability-gated replies ([#7104](https://github.com/tutur3u/platform/issues/7104)) ([6623440](https://github.com/tutur3u/platform/commit/66234407553acd3c38e7be0a650bdb270bb0dc01))
* **mobile:** add the Mastermind Ship and Insights tabs ([#7116](https://github.com/tutur3u/platform/issues/7116)) ([8f6c3cb](https://github.com/tutur3u/platform/commit/8f6c3cbdf83e7be9b6d4b06b1cea19ddd02b5a75))
* **mobile:** add the Mastermind Work tab with lanes and lane detail ([#7106](https://github.com/tutur3u/platform/issues/7106)) ([c5ef891](https://github.com/tutur3u/platform/commit/c5ef8919cdadbc54315095b9239b1401636d9f47))
* **mobile:** answer Mastermind decisions from Home and Inbox ([#7205](https://github.com/tutur3u/platform/issues/7205)) ([595b4bd](https://github.com/tutur3u/platform/commit/595b4bd44ea64074a1e2ccadb8aa1271df278357))
* **mobile:** compact Mastermind Inbox with resolved history ([#7177](https://github.com/tutur3u/platform/issues/7177)) ([4ece677](https://github.com/tutur3u/platform/commit/4ece6778820c2e238856e6425580a888489dba9f))
* **mobile:** compact Mastermind Ship and Insights ([#7175](https://github.com/tutur3u/platform/issues/7175)) ([8091606](https://github.com/tutur3u/platform/commit/809160601ed4786e2b9b86162ebe765cd618a8f6))
* **mobile:** count Focus Time as all task-linked tracked time ([b2c3128](https://github.com/tutur3u/platform/commit/b2c31280443660396fe97ce5c985cd2a53bfe8e9))
* **mobile:** count Focus Time as all task-linked tracked time ([#6922](https://github.com/tutur3u/platform/issues/6922)) ([f6861ba](https://github.com/tutur3u/platform/commit/f6861ba061c807288f58d81c3e042cf979d4f6c0))
* **mobile:** enable the production Mastermind hub for the beta ([#7131](https://github.com/tutur3u/platform/issues/7131)) ([edcc0ed](https://github.com/tutur3u/platform/commit/edcc0ed71c66d4b2581546002277ee8271ac059e))
* **mobile:** full Mastermind decision details ([#7218](https://github.com/tutur3u/platform/issues/7218)) ([9d40f40](https://github.com/tutur3u/platform/commit/9d40f402aefe4fe1c44a085e0c8838dafc1f27fd))
* **mobile:** grouped Mira starters and a You tab with Focus Time and rows ([ed4ebbc](https://github.com/tutur3u/platform/commit/ed4ebbc00f87d1cf6ceae910fd5d4d5733e80b46))
* **mobile:** grouped Mira starters and a You tab with Focus Time and rows ([#6898](https://github.com/tutur3u/platform/issues/6898)) ([d64bbac](https://github.com/tutur3u/platform/commit/d64bbacc324fac5662147d7a0d9892b313ae8caf))
* **mobile:** grouped task detail fields and a device Pomodoro ([4e70b9d](https://github.com/tutur3u/platform/commit/4e70b9d3296a23e9fbb3dc78ec4e31889c8efca4))
* **mobile:** grouped task detail fields and a device Pomodoro ([#6900](https://github.com/tutur3u/platform/issues/6900)) ([6b0bd0a](https://github.com/tutur3u/platform/commit/6b0bd0ab2888aac5eeea8c4d3382887b29c76f40))
* **mobile:** icon-only profile edit and a scannable timeline ([#6860](https://github.com/tutur3u/platform/issues/6860)) ([72d762f](https://github.com/tutur3u/platform/commit/72d762f310b311f50565025f2a1a3ba83059c03a))
* **mobile:** live Mastermind hub source, disk cache and refresh scheduler (PR2) ([#7086](https://github.com/tutur3u/platform/issues/7086)) ([e566eb9](https://github.com/tutur3u/platform/commit/e566eb9873728fbd0773e4221357e2129d3a076b))
* **mobile:** Mastermind app data foundation and access gate ([#7039](https://github.com/tutur3u/platform/issues/7039)) ([a4f0680](https://github.com/tutur3u/platform/commit/a4f0680818dfbf8b7969577ffdde9feffd95eb9c))
* **mobile:** Mastermind beta polish ([#7123](https://github.com/tutur3u/platform/issues/7123)) ([0e70175](https://github.com/tutur3u/platform/commit/0e70175f2c2ea7bec0a5fd9d736828b430a1e940))
* **mobile:** Mastermind UX foundation and Home redesign ([#7176](https://github.com/tutur3u/platform/issues/7176)) ([ca1a2a7](https://github.com/tutur3u/platform/commit/ca1a2a76dd197aaaed00353cf59383ab8f68f2fe))
* **mobile:** name the root tabs Mira, Inbox and You and add dock search ([a872194](https://github.com/tutur3u/platform/commit/a8721942c08a009403736ea26c2abf6bf4cf8976))
* **mobile:** name the root tabs Mira, Inbox and You and add dock search ([#6897](https://github.com/tutur3u/platform/issues/6897)) ([8542531](https://github.com/tutur3u/platform/commit/8542531f21fc114ea6ed2d3461b6233daa12435b))
* **mobile:** open the task menu on Kanban card long-press ([ad9ad42](https://github.com/tutur3u/platform/commit/ad9ad42274f8675f5d63e6365643772882faf890))
* **mobile:** open the task menu on Kanban card long-press ([#6937](https://github.com/tutur3u/platform/issues/6937)) ([ff78fca](https://github.com/tutur3u/platform/commit/ff78fca153ac26a27a9245a46445953fd19c45ce))
* **mobile:** rebuild inventory item list with scan and search ([#6976](https://github.com/tutur3u/platform/issues/6976)) ([7870512](https://github.com/tutur3u/platform/commit/787051239f9d5ea503515dd9c284002e31c65f24))
* **mobile:** redesign Mira Live around one obvious start action ([#6862](https://github.com/tutur3u/platform/issues/6862)) ([d396f6a](https://github.com/tutur3u/platform/commit/d396f6ae6da424f89523a054fcc1eddcaca8ac19))
* **mobile:** redesign the board timeline as a day agenda ([#6981](https://github.com/tutur3u/platform/issues/6981)) ([caca4bd](https://github.com/tutur3u/platform/commit/caca4bd84f2e49fab6e579a6748ed86da02329d9))
* **mobile:** redesign the Mastermind decision screen with a shared design system ([#7217](https://github.com/tutur3u/platform/issues/7217)) ([e09c59b](https://github.com/tutur3u/platform/commit/e09c59b963abdd1089943921c809625ac3ad318f))
* **mobile:** redesign the task quick actions sheet ([#6974](https://github.com/tutur3u/platform/issues/6974)) ([cb276a3](https://github.com/tutur3u/platform/commit/cb276a35afdb52e20305aa849ca9823dfa3a9229))
* **mobile:** regroup Home into Today, Up next and Calendar with workspace chips ([90fe93b](https://github.com/tutur3u/platform/commit/90fe93b7807944a072fa19a6b51e29b5897975af))
* **mobile:** regroup Home into Today, Up next and Calendar with workspace chips ([#6893](https://github.com/tutur3u/platform/issues/6893)) ([84ea920](https://github.com/tutur3u/platform/commit/84ea9204226fd545ca4acde9ab0c14d9c41dcd09))
* **mobile:** relative Mastermind times with time zone tooltip ([#7223](https://github.com/tutur3u/platform/issues/7223)) ([4e3e9ce](https://github.com/tutur3u/platform/commit/4e3e9cedcc04af307210f68d8fc890a6d5790cee))
* **mobile:** SB-100 L2 app-switcher blur and S3 constant security label ([#7240](https://github.com/tutur3u/platform/issues/7240)) ([94d82f3](https://github.com/tutur3u/platform/commit/94d82f3365ef11c2e0e048d5ec197ad8983ba764))
* **mobile:** set and clear task dates from the quick actions sheet ([#7079](https://github.com/tutur3u/platform/issues/7079)) ([7e59200](https://github.com/tutur3u/platform/commit/7e592002bac648a6c533908ee67b94f2d141b8ae))
* **mobile:** show decisions answered elsewhere ([#7211](https://github.com/tutur3u/platform/issues/7211)) ([2f00366](https://github.com/tutur3u/platform/commit/2f0036634ae4d81588a528cefa433117773a9cd1))
* **mobile:** show every Mastermind decision with lazy loading ([#7221](https://github.com/tutur3u/platform/issues/7221)) ([030231d](https://github.com/tutur3u/platform/commit/030231d8669dbdee94ab40d6ed0896e1295239bc))
* **mobile:** swipe actions and a context menu on task rows ([c6812bb](https://github.com/tutur3u/platform/commit/c6812bb9371d44cb7075480d9ccc79d4535c6313))
* **mobile:** swipe actions and a context menu on task rows ([#6882](https://github.com/tutur3u/platform/issues/6882)) ([e2a3389](https://github.com/tutur3u/platform/commit/e2a3389a44b957ef2262ba8ab28f3efd07ed0951))
* **mobile:** sync Appearance per account with a device override ([24a141a](https://github.com/tutur3u/platform/commit/24a141a81cce6e8818871eb593070b68b1b36c59))
* **mobile:** sync Appearance per account with a device override ([#6938](https://github.com/tutur3u/platform/issues/6938)) ([340ef08](https://github.com/tutur3u/platform/commit/340ef08c57fc57d457d464ac60b63e3c42042905))
* **mobile:** true activity counts and a capped Home for Mastermind ([d2e0996](https://github.com/tutur3u/platform/commit/d2e099645ca43a39f111376f8ce6115b033d823a))
* **ops-hub:** add Mastermind Hub v2 backend ([#6996](https://github.com/tutur3u/platform/issues/6996)) ([9a39228](https://github.com/tutur3u/platform/commit/9a39228b0a18b8be7289957962f610396358cf76))
* **ops:** add resumable storage re-key tool for leaked signed URLs ([#6890](https://github.com/tutur3u/platform/issues/6890)) ([2f88257](https://github.com/tutur3u/platform/commit/2f88257b224ee70b783c4cf5ad8432e675e4e347))
* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))
* **start-bridge:** shared root response policy (wrapResponse), safe failures and a runtime policy gate ([#6826](https://github.com/tutur3u/platform/issues/6826)) ([10e1778](https://github.com/tutur3u/platform/commit/10e17784ef192cb5ef65eee2b38c9b9cab738a0d))
* **storage:** app-side storage access audit log ([#6891](https://github.com/tutur3u/platform/issues/6891)) ([57cc3f1](https://github.com/tutur3u/platform/commit/57cc3f1750a94890f55a9b33496a1694c11c1888))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **tasks:** seal the native artifact, gate signed-in root SSR, keep the exact offline fallback ([#6849](https://github.com/tutur3u/platform/issues/6849)) ([174d4b9](https://github.com/tutur3u/platform/commit/174d4b97e73104fa1803ff71746d67121d318acd))
* **time-tracking:** tag Pomodoro sessions and count Focus Time from them ([1fa53d2](https://github.com/tutur3u/platform/commit/1fa53d2c3f3fa68dd5219f1b43a31d0327a1c82e))
* **time-tracking:** tag Pomodoro sessions and count Focus Time from them ([#6903](https://github.com/tutur3u/platform/issues/6903)) ([783c384](https://github.com/tutur3u/platform/commit/783c38480a786e57aa9a4d70e1bf95b7e18bf19c))
* **topic-announcements:** add teacher-scoped access and send deadline ([3cb09f3](https://github.com/tutur3u/platform/commit/3cb09f3896307385fbeaf4cfbcc3320d7e77d8a5))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **topic-announcements:** gate teacher assignments behind a workspace flag ([8252f98](https://github.com/tutur3u/platform/commit/8252f98a107e27d7ecb1605cb39793256fa9c406))
* **turbo-cache:** add self-hosted Turborepo remote cache Worker on R2 ([#6484](https://github.com/tutur3u/platform/issues/6484)) ([b1ebc00](https://github.com/tutur3u/platform/commit/b1ebc00ccbc544eea40cb8083e794f9eae311631))
* **tutoring:** add workspace campus list and announcement place picker ([#7049](https://github.com/tutur3u/platform/issues/7049)) ([9ae0a76](https://github.com/tutur3u/platform/commit/9ae0a76828670c29cbdce07638d0213324453a6d))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([5b52e01](https://github.com/tutur3u/platform/commit/5b52e018e1789d47ea2fbab7d85be3a3ec48e4cc))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([9eb14a6](https://github.com/tutur3u/platform/commit/9eb14a6c62076e5f59d5f412a504833e58a81bb6))
* **tutoring:** tutor groups for the policy, teacher picker and queues ([#7054](https://github.com/tutur3u/platform/issues/7054)) ([5298df0](https://github.com/tutur3u/platform/commit/5298df043e186f242d660b018d0003f608ec04a8))
* **utils:** add abuse-guard store protocol and clients ([#6834](https://github.com/tutur3u/platform/issues/6834)) ([22b79b6](https://github.com/tutur3u/platform/commit/22b79b62be0fe486e66f1a0a2420b4b58449bf87))
* **utils:** atomic password reservations on the abuse-guard store ([#6852](https://github.com/tutur3u/platform/issues/6852)) ([bd55672](https://github.com/tutur3u/platform/commit/bd55672054633e8cf6801b24747b63b30d4967dc))
* **utils:** route offline, proxy and replay guards through the abuse-guard store ([#6845](https://github.com/tutur3u/platform/issues/6845)) ([ceb59e3](https://github.com/tutur3u/platform/commit/ceb59e3fc6bbdd3451b2b94cf195c6bbec4077ab))
* **web:** add default-off Start Worker candidate ([#7090](https://github.com/tutur3u/platform/issues/7090)) ([dff8ffc](https://github.com/tutur3u/platform/commit/dff8ffcd9cafaa73f8cfe8555c9470bb439d0b02))
* **web:** add signed Mastermind push-events route ([#7133](https://github.com/tutur3u/platform/issues/7133)) ([8416d3c](https://github.com/tutur3u/platform/commit/8416d3cb54dced26149d0d82316739cd2842fcfa))
* **web:** migrate remaining legal pages ([#7107](https://github.com/tutur3u/platform/issues/7107)) ([8a0f947](https://github.com/tutur3u/platform/commit/8a0f9474be2d90311d832c8896a6f95e21b81cbe))
* **web:** prepare dormant Cloudflare cron scheduling ([#7091](https://github.com/tutur3u/platform/issues/7091)) ([5e3f3fe](https://github.com/tutur3u/platform/commit/5e3f3fe2acef63e252260218c2e2b4fe8b2f2204))
* **web:** redesign the download page around one recommended download ([#6941](https://github.com/tutur3u/platform/issues/6941)) ([ef12e37](https://github.com/tutur3u/platform/commit/ef12e37a3f246dd610dc1f6625ea6391d2602536))
* **web:** render Community Guidelines natively in the Start candidate ([#7111](https://github.com/tutur3u/platform/issues/7111)) ([a32548f](https://github.com/tutur3u/platform/commit/a32548f34709465c71e3b432c8f5360341387575))
* **web:** render public legal pages in Start staging candidate ([#7102](https://github.com/tutur3u/platform/issues/7102)) ([7f2f1d7](https://github.com/tutur3u/platform/commit/7f2f1d7923d08751d15b63cacc0a7ee3451f32eb))
* **web:** render security policy and bug bounty in Start candidate ([#7122](https://github.com/tutur3u/platform/issues/7122)) ([77814ea](https://github.com/tutur3u/platform/commit/77814ea0ec520fd8435d8241e0a1ac2110365c65))


### Bug Fixes

* **abuse-guard:** enforce durable command fairness ([#6865](https://github.com/tutur3u/platform/issues/6865)) ([1c44022](https://github.com/tutur3u/platform/commit/1c440227fb512187bb98dddf00b92c7127078e04))
* **abuse-guard:** log invalid budget config once and update the hotspot runbook ([#7247](https://github.com/tutur3u/platform/issues/7247)) ([fb28dd5](https://github.com/tutur3u/platform/commit/fb28dd530aec76ceb6a624a2dcbe2b7d2e9a497a))
* **ai:** accept only user and assistant chat input from clients ([#7139](https://github.com/tutur3u/platform/issues/7139)) ([3d6d542](https://github.com/tutur3u/platform/commit/3d6d54204c6b557ecb5a44c05c3e5d5fabf235cd))
* **ai:** read evaluation inputs through one file handle ([#7280](https://github.com/tutur3u/platform/issues/7280)) ([c77068a](https://github.com/tutur3u/platform/commit/c77068a7515a21adfbe1fa42a6586c7113228982))
* **ai:** sign Mira generated images on read in chat history ([#6896](https://github.com/tutur3u/platform/issues/6896)) ([64da5ce](https://github.com/tutur3u/platform/commit/64da5ce3bc0ba345ae08261a3fec2b2af77504ea))
* **ai:** validate public request admission before workspace lookups ([#7027](https://github.com/tutur3u/platform/issues/7027)) ([c969617](https://github.com/tutur3u/platform/commit/c96961748c672c2ca588c9a499a253a3f58a0f82))
* **ai:** validate public request admission before workspace lookups. ([c969617](https://github.com/tutur3u/platform/commit/c96961748c672c2ca588c9a499a253a3f58a0f82))
* align main unit fixtures with authorization and app inventory ([#7265](https://github.com/tutur3u/platform/issues/7265)) ([0eb1e3a](https://github.com/tutur3u/platform/commit/0eb1e3a8d350c5179bfaad63fc7281bfd47ebbf8))
* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **api:** align export and satellite request boundaries ([#7021](https://github.com/tutur3u/platform/issues/7021)) ([73a876a](https://github.com/tutur3u/platform/commit/73a876aaa7f13eceb13b6e6946e61d8323b1cf10))
* **api:** align user group workspace scoping ([#7001](https://github.com/tutur3u/platform/issues/7001)) ([7c7ec6e](https://github.com/tutur3u/platform/commit/7c7ec6ea248d9a3fdb7aabf9e64fbda1933ad321))
* **api:** align workspace operation permissions and references ([#7033](https://github.com/tutur3u/platform/issues/7033)) ([86c6dd4](https://github.com/tutur3u/platform/commit/86c6dd4dd388a9081334293b0b0005452e846200))
* **api:** refresh retained-route source hashes ([#6915](https://github.com/tutur3u/platform/issues/6915)) ([b13dfe4](https://github.com/tutur3u/platform/commit/b13dfe48d447b229b4e2872adfc96f1c565b93b1))
* **api:** regenerate stale retained-routes artifact ([#7101](https://github.com/tutur3u/platform/issues/7101)) ([38f46be](https://github.com/tutur3u/platform/commit/38f46be597a2bd276923298c4bad8d394ac5e7a1))
* **api:** sync retained registry after tutoring updates ([#6931](https://github.com/tutur3u/platform/issues/6931)) ([a227f83](https://github.com/tutur3u/platform/commit/a227f83bf34e23f614e7c228c9763110d1875aa4))
* **auth:** align cross-app handoff identity ([#7008](https://github.com/tutur3u/platform/issues/7008)) ([e5c30f9](https://github.com/tutur3u/platform/commit/e5c30f95886d20c8cce3a7bad1a9ad7d71a3cb63))
* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** never hand raw session tokens to browser requests ([#6832](https://github.com/tutur3u/platform/issues/6832)) ([90ef383](https://github.com/tutur3u/platform/commit/90ef383d05e946c97a3e703ff305c69eb928e95d))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **auth:** require verified email to link a Microsoft identity ([#7132](https://github.com/tutur3u/platform/issues/7132)) ([d0414bc](https://github.com/tutur3u/platform/commit/d0414bcd93c7997bcdea3fcbfc1efd9ba262d5e4))
* **auth:** restrict Microsoft sign-in to the staff tenant ([#7169](https://github.com/tutur3u/platform/issues/7169)) ([ae20ab4](https://github.com/tutur3u/platform/commit/ae20ab41ffd387a6d0ba45fa8d73d456445283ac))
* **auth:** revoke cross-app tokens on logout and password change ([#6839](https://github.com/tutur3u/platform/issues/6839)) ([091c3dd](https://github.com/tutur3u/platform/commit/091c3dda067db3e8c3459b041dcb2a5b4f85bd2e))
* **auth:** scope challenge and participant management ([#7026](https://github.com/tutur3u/platform/issues/7026)) ([0991afe](https://github.com/tutur3u/platform/commit/0991afedb1757203fb4d95496e2cc034df6aa4fc))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
* **calendar:** cap automatic Google consent restarts ([#6869](https://github.com/tutur3u/platform/issues/6869)) ([a155548](https://github.com/tutur3u/platform/commit/a155548bf7b3513c4cb5e25adff491d429b3836c))
* **calendar:** close OAuth self-heal review follow-ups ([#6878](https://github.com/tutur3u/platform/issues/6878)) ([3765547](https://github.com/tutur3u/platform/commit/376554797511bbe02bf56b06218b8ae69040ad06))
* **calendar:** deliver OAuth health spike notifications ([3ae17ff](https://github.com/tutur3u/platform/commit/3ae17ff64879d2efa439982ffe70a4d056e2f784))
* **calendar:** deliver OAuth health spike notifications ([#6871](https://github.com/tutur3u/platform/issues/6871)) ([292429e](https://github.com/tutur3u/platform/commit/292429e2ecf12a4ebf72f56bb09c5f331ada717f))
* **calendar:** persist transient provider degradation ([#6867](https://github.com/tutur3u/platform/issues/6867)) ([5a2d7c1](https://github.com/tutur3u/platform/commit/5a2d7c1fbe0295f9ea8b9af9fa8af64c24bbb7ca))
* **calendar:** qualify staging on its admitted custom host ([c5ad593](https://github.com/tutur3u/platform/commit/c5ad593517f7481eb3395eed754486beda3de0c7))
* **calendar:** qualify the root Worker and exact offline assets ([#6859](https://github.com/tutur3u/platform/issues/6859)) ([284bdaf](https://github.com/tutur3u/platform/commit/284bdaf034e5b127b1c5c690d74b43da6a178276))
* **calendar:** target verified operators for OAuth spike alerts ([5977bf7](https://github.com/tutur3u/platform/commit/5977bf7942691df373a4daf5355088491c7ed809))
* **ci:** accept the post-[#6948](https://github.com/tutur3u/platform/issues/6948) staging producer blob in the production gate ([#6958](https://github.com/tutur3u/platform/issues/6958)) ([8c89a28](https://github.com/tutur3u/platform/commit/8c89a2841f83745c0dd13af973ee6ac388af1774))
* **ci:** admit the live cron-control state before the web mode var ([#7290](https://github.com/tutur3u/platform/issues/7290)) ([1f588d7](https://github.com/tutur3u/platform/commit/1f588d792ead80cfc651c3512be6a64928e7c177))
* **ci:** align action pin tests and ops hub cache admission ([#7259](https://github.com/tutur3u/platform/issues/7259)) ([021e5b3](https://github.com/tutur3u/platform/commit/021e5b350bae0789257f2d897bc483dc1f493d94))
* **ci:** baseline the read-only cache workflow assertion ([#6888](https://github.com/tutur3u/platform/issues/6888)) ([7d3effe](https://github.com/tutur3u/platform/commit/7d3effe5c46c74abbba645e647f56e15b7b5d119))
* **ci:** block service workers in the root-browser gate; filter Tasks on the runtime pointer ([#6866](https://github.com/tutur3u/platform/issues/6866)) ([c236656](https://github.com/tutur3u/platform/commit/c2366569b17d5f1276f2a0b2fd0eb1b8492c2317))
* **ci:** bound diagnostic redaction and wrapped credential matching ([#6964](https://github.com/tutur3u/platform/issues/6964)) ([14e88a2](https://github.com/tutur3u/platform/commit/14e88a2c200663e1d069b58d02aa26a3722d6701))
* **ci:** classify and admit the contacts and web Start candidates ([#7149](https://github.com/tutur3u/platform/issues/7149)) ([f01edd6](https://github.com/tutur3u/platform/commit/f01edd67e2da0fb396d0730b1892c5cdc124ac01))
* **ci:** consolidate cheap PR checks ([#6956](https://github.com/tutur3u/platform/issues/6956)) ([e70454f](https://github.com/tutur3u/platform/commit/e70454f5622291724804d4ad30c2f52d4b22bb9f))
* **ci:** cut hosted PR queue pressure with superseding and docs-only skips ([#6894](https://github.com/tutur3u/platform/issues/6894)) ([7c8220f](https://github.com/tutur3u/platform/commit/7c8220f58b813ba4096e3a39822108be4e580e26))
* **ci:** decouple staging migration markers from Vercel previews ([#6960](https://github.com/tutur3u/platform/issues/6960)) ([b6c69b7](https://github.com/tutur3u/platform/commit/b6c69b7310369993a15e41146018ddc80265c36c))
* **ci:** drop persisted checkout credentials from desktop beta release status ([#7244](https://github.com/tutur3u/platform/issues/7244)) ([f4db822](https://github.com/tutur3u/platform/commit/f4db82246f340cabb5f078334dc29556a5f845a4))
* **ci:** evaluate desktop beta wildcard expressions ([#6959](https://github.com/tutur3u/platform/issues/6959)) ([b5f5e73](https://github.com/tutur3u/platform/commit/b5f5e731d3f1f24b7ab9c0079ba821138bc945e0))
* **ci:** fit Play release notes into the store budget ([#6957](https://github.com/tutur3u/platform/issues/6957)) ([00558d4](https://github.com/tutur3u/platform/commit/00558d4c689b5494e60c60bf8270172457031de9))
* **ci:** guard native uploads and disable source maps ([#6972](https://github.com/tutur3u/platform/issues/6972)) ([57a89fe](https://github.com/tutur3u/platform/commit/57a89fec3a0fa83bb21518cf828bb1924aff6ddd))
* **ci:** harden Calendar recovery proof and public upload diagnostics ([#6963](https://github.com/tutur3u/platform/issues/6963)) ([efc5c1d](https://github.com/tutur3u/platform/commit/efc5c1d707720f3b4ebe12e0cf19f29d38dd3e6e))
* **ci:** keep the production service-role key out of pull request jobs ([#6945](https://github.com/tutur3u/platform/issues/6945)) ([946c512](https://github.com/tutur3u/platform/commit/946c512eadbe024c15d1163567b557f61417c987))
* **ci:** locate unit-test result gates by step name ([#7251](https://github.com/tutur3u/platform/issues/7251)) ([bb6573f](https://github.com/tutur3u/platform/commit/bb6573f8f5683890c15166f5a61e2f17140c8422))
* **ci:** make CI Admitted bootstrap visible and state its advisory boundary ([#6926](https://github.com/tutur3u/platform/issues/6926)) ([57b883a](https://github.com/tutur3u/platform/commit/57b883aecf0c049ba9b09d33bbfe3ed0405ce099))
* **ci:** prepare native production Workers without routing ([#6939](https://github.com/tutur3u/platform/issues/6939)) ([c548b21](https://github.com/tutur3u/platform/commit/c548b21a4998a6c0dc53874c4e7fa744da920fd2))
* **ci:** recover open release PR overflow notes and read release gates with the job token ([#6953](https://github.com/tutur3u/platform/issues/6953)) ([5b63bfe](https://github.com/tutur3u/platform/commit/5b63bfe1599e3c58b3259b767a4a282812dd6f0f))
* **ci:** repair main Biome, docs, type-check, route inventory and test fixtures ([#7165](https://github.com/tutur3u/platform/issues/7165)) ([082ce3e](https://github.com/tutur3u/platform/commit/082ce3e9d9a8e94d23a15becf174b938a884a181))
* **ci:** repair root test baseline expectations ([#6947](https://github.com/tutur3u/platform/issues/6947)) ([aa79684](https://github.com/tutur3u/platform/commit/aa7968497269ff95f9a2c60770d75412d1234ba0))
* **ci:** require new migrations to sort after the base branch ([#7246](https://github.com/tutur3u/platform/issues/7246)) ([4bf194c](https://github.com/tutur3u/platform/commit/4bf194cd6467e4d3c12458ab60dd47dc8dc7b4d0))
* **ci:** scope Supabase migration credentials to branch-restricted environments ([#6948](https://github.com/tutur3u/platform/issues/6948)) ([12b8f6c](https://github.com/tutur3u/platform/commit/12b8f6c59fa8eeaed0b0520d75f6636791afafd5))
* **ci:** scope the release-please admin token to a branch-restricted environment ([#6949](https://github.com/tutur3u/platform/issues/6949)) ([ca66f98](https://github.com/tutur3u/platform/commit/ca66f9880b4a321a59422772af5260cbdeafcd97))
* **ci:** stabilize native runtime prerequisite downloads ([#7083](https://github.com/tutur3u/platform/issues/7083)) ([5a4edbb](https://github.com/tutur3u/platform/commit/5a4edbb732cfb1b9a82532b9eb3bdfd2d776ea0a))
* **ci:** stop pulling Vercel preview env into the external package build ([#6950](https://github.com/tutur3u/platform/issues/6950)) ([5206f4c](https://github.com/tutur3u/platform/commit/5206f4c40bd60667383c7f1b925a3f33e6e2fdb2))
* **cli:** reject unsupported upgrade arguments before installation ([#6773](https://github.com/tutur3u/platform/issues/6773)) ([62f9db7](https://github.com/tutur3u/platform/commit/62f9db75298d454032554c3d0602a7547d294d57))
* **cms:** align form and content workspace permissions ([#7023](https://github.com/tutur3u/platform/issues/7023)) ([798d418](https://github.com/tutur3u/platform/commit/798d4189a31e2bacd66c49ce60d21c3b83241411))
* **cms:** restrict external project setup to platform admins ([#7183](https://github.com/tutur3u/platform/issues/7183)) ([3b02a14](https://github.com/tutur3u/platform/commit/3b02a148bfde012df0080234d8a99aa876f6f298))
* **contacts:** block unverified topic sends without losing the draft ([#6923](https://github.com/tutur3u/platform/issues/6923)) ([184bcf3](https://github.com/tutur3u/platform/commit/184bcf3b9d1c2fb5400adca2d0834cd9edcb5172))
* **contacts:** bound linked-content freeze and warn when it fails ([#6919](https://github.com/tutur3u/platform/issues/6919)) ([841dad8](https://github.com/tutur3u/platform/commit/841dad85aeade756e8acd0aabcfdb842344d45d4))
* **contacts:** English center tutoring defaults to one session, three-day follow-up ([#6906](https://github.com/tutur3u/platform/issues/6906)) ([8ce9380](https://github.com/tutur3u/platform/commit/8ce93809bad90473bb90cb83df0e5ca8bdfba05e))
* **contacts:** freeze linked notes on blank-content completion ([f3ca795](https://github.com/tutur3u/platform/commit/f3ca795c748c280377fa2dc288b260337a4c179a))
* **contacts:** GVNN schedule notify teachers, swap race and unsaved-changes guard ([#6966](https://github.com/tutur3u/platform/issues/6966)) ([429bcb3](https://github.com/tutur3u/platform/commit/429bcb30bb03f082c523e8f06c5f3b8c493ac2f4))
* **contacts:** prevent duplicate topics and attachments, search teachers ([f7e2ce2](https://github.com/tutur3u/platform/commit/f7e2ce2bf0bc122d8bda75cd54dac8abee17b7df))
* **contacts:** restore proxied topic APIs and schedule navigation ([#6967](https://github.com/tutur3u/platform/issues/6967)) ([ef0f982](https://github.com/tutur3u/platform/commit/ef0f982a50a67beaf95e32375ced01eeae2f67dc))
* **contacts:** sweep stale schedule claims first and pin the exact-status claim ([#6988](https://github.com/tutur3u/platform/issues/6988)) ([f31b18c](https://github.com/tutur3u/platform/commit/f31b18c740d7ebccd93e2f214a5d26defcae2803))
* **cron-control:** admit unchanged dashboard deployment ([#7300](https://github.com/tutur3u/platform/issues/7300)) ([aed3c71](https://github.com/tutur3u/platform/commit/aed3c71e64a09d7cba6eb5ae89cdfaa1b6357b7b))
* **cron-control:** verify cron sets independent of order ([#7304](https://github.com/tutur3u/platform/issues/7304)) ([39dc633](https://github.com/tutur3u/platform/commit/39dc6330e0ff24a0605c4427f4144d476873483b))
* **database:** add caller checks to privileged reporting functions ([#7080](https://github.com/tutur3u/platform/issues/7080)) ([877bb82](https://github.com/tutur3u/platform/commit/877bb82dfb20dd5ea5a3cdc68256f230a63e457c))
* **database:** align AI chat and subscription RPC access ([#7035](https://github.com/tutur3u/platform/issues/7035)) ([9fd1c02](https://github.com/tutur3u/platform/commit/9fd1c021c78467bf692ea759fb8fd48664ed181b))
* **database:** align time-tracking and task RPC permissions ([#7000](https://github.com/tutur3u/platform/issues/7000)) ([6730c79](https://github.com/tutur3u/platform/commit/6730c798f17be276dc3f1fe8efd60306a84b66f3))
* **database:** align workspace merge phase permissions ([#7002](https://github.com/tutur3u/platform/issues/7002)) ([fa47e8d](https://github.com/tutur3u/platform/commit/fa47e8d24c03633e3dbee9f6ccb7d2f9540e3a8e))
* **database:** bound claim admission DDL lock waits ([ecb532b](https://github.com/tutur3u/platform/commit/ecb532b1809cf54ebb5201f50ca4681b91ca757a))
* **database:** bound cross-app token lifetime and audience, contain overlong tokens ([#6840](https://github.com/tutur3u/platform/issues/6840)) ([c858586](https://github.com/tutur3u/platform/commit/c858586a6ae8c907ab55bdf5476b7bd73f2b28b7))
* **database:** bound reaper DDL and document concurrent index recovery ([f4a5a02](https://github.com/tutur3u/platform/commit/f4a5a02e4e22e26426ae0fae124c95462ee1cd64))
* **database:** harden session management function guards ([#6993](https://github.com/tutur3u/platform/issues/6993)) ([fb921f4](https://github.com/tutur3u/platform/commit/fb921f4f2f102070da9eaaae63629b86c23ca21c))
* **database:** keep topic teacher constraints NOT VALID under the lock ([5a18018](https://github.com/tutur3u/platform/commit/5a18018598705054993e658375d2a4ec31c8505c))
* **database:** leave tutoring notification type check NOT VALID ([1197883](https://github.com/tutur3u/platform/commit/1197883a3f66ccc4a53d9927e629fce320e68540))
* **database:** move tutoring migration to 20261026191000 ([1250a1c](https://github.com/tutur3u/platform/commit/1250a1c0db1230ed78e478c3709cc76d531d5044))
* **database:** pin notification trigger host and use Vault bearer (SR-327) ([#7113](https://github.com/tutur3u/platform/issues/7113)) ([1c8fdf9](https://github.com/tutur3u/platform/commit/1c8fdf9c9fdd85824f31d1fe562bb9b3c001f4dd))
* **database:** preserve unrelated notification types on tutoring rollback ([e3b4293](https://github.com/tutur3u/platform/commit/e3b4293ce35ba49c13b4a6a960e4e1a62ec23fcc))
* **database:** restate employee runtime readiness ACL ([#7231](https://github.com/tutur3u/platform/issues/7231)) ([0047e77](https://github.com/tutur3u/platform/commit/0047e77296c6609401bd07de1fd12f4712568aaf))
* **database:** restore employee readiness and whiteboard payload contracts ([#7189](https://github.com/tutur3u/platform/issues/7189)) ([4666c9c](https://github.com/tutur3u/platform/commit/4666c9c9eec6fed461042bdabc272b0152a075e6))
* **database:** restrict an RPC to the service role ([#7059](https://github.com/tutur3u/platform/issues/7059)) ([4fb4eef](https://github.com/tutur3u/platform/commit/4fb4eef4533f0ca3e654fa5681f91d6010d22d7d))
* **database:** restrict audit and legacy token privileges ([#7112](https://github.com/tutur3u/platform/issues/7112)) ([e6b4c45](https://github.com/tutur3u/platform/commit/e6b4c452c3f2cfc85e38dd18f1ffd0dcabe4d929))
* **database:** restrict remaining privileged definer functions ([#7092](https://github.com/tutur3u/platform/issues/7092)) ([5743c29](https://github.com/tutur3u/platform/commit/5743c290cfccc7c9250f1c9e6027c3318482df74))
* **database:** restrict two internal merge helpers to the service role ([#7069](https://github.com/tutur3u/platform/issues/7069)) ([291bb02](https://github.com/tutur3u/platform/commit/291bb02f9be4a7624a7f525e034ba02b0660df3c))
* **database:** restrict workspace user link repair to the service role ([#6994](https://github.com/tutur3u/platform/issues/6994)) ([debface](https://github.com/tutur3u/platform/commit/debface3d868d9207a4568774c88e0ae7f31bd3d))
* **database:** scope Discord mappings to the linked workspace ([#7014](https://github.com/tutur3u/platform/issues/7014)) ([cc59d0b](https://github.com/tutur3u/platform/commit/cc59d0ba1527509297ec18ac6a1d559991f1fe64))
* **database:** scope public function execution privileges ([#7076](https://github.com/tutur3u/platform/issues/7076)) ([c2e1d7e](https://github.com/tutur3u/platform/commit/c2e1d7ed0287a719c7052967372cc77ee9acd436))
* **database:** scope time request detail references ([#7024](https://github.com/tutur3u/platform/issues/7024)) ([c7fb9f5](https://github.com/tutur3u/platform/commit/c7fb9f523e612c3522460d6edcae98cbb2a3550c))
* **database:** tighten table privileges ([#7197](https://github.com/tutur3u/platform/issues/7197)) ([a43d2c3](https://github.com/tutur3u/platform/commit/a43d2c3d159bcaca6e1716781750d2cdd0135e88))
* **db:** guard task cycle links to the cycle workspace ([#6942](https://github.com/tutur3u/platform/issues/6942)) ([54bf36e](https://github.com/tutur3u/platform/commit/54bf36edfff49ffed85957f3f8ceb3260099aeb7))
* **db:** pin time tracking definer search_path and fix linked-request rejection ([#7281](https://github.com/tutur3u/platform/issues/7281)) ([51bb558](https://github.com/tutur3u/platform/commit/51bb55860abbc4900cef61342e8862b97e2f4c72))
* **db:** pin workspace ownership in row policies ([#7136](https://github.com/tutur3u/platform/issues/7136)) ([232181a](https://github.com/tutur3u/platform/commit/232181a6f78f0bf4cb1ddc0cadc0427082163464))
* **db:** protect workspace ownership changes ([#7184](https://github.com/tutur3u/platform/issues/7184)) ([123271e](https://github.com/tutur3u/platform/commit/123271e7d757f0f4c2a335153a92bab7535c8241))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **db:** scope workspace invites to their workspace ([#7137](https://github.com/tutur3u/platform/issues/7137)) ([9cde8ca](https://github.com/tutur3u/platform/commit/9cde8ca40fdcb86fa1cb49dd8f638ff8427fde24))
* **db:** tighten workspace ownership change paths ([#7194](https://github.com/tutur3u/platform/issues/7194)) ([b099b73](https://github.com/tutur3u/platform/commit/b099b7303ea29ad9f39df90dfc99352e96b821e4))
* **db:** verify staff identity in domain-gated policies ([#7138](https://github.com/tutur3u/platform/issues/7138)) ([c4593fb](https://github.com/tutur3u/platform/commit/c4593fb27c8aeac4e757235fcdc36fbaf9d5d5a9))
* **desktop:** publish run-free desktop versions with structured release notes ([#7157](https://github.com/tutur3u/platform/issues/7157)) ([90643d7](https://github.com/tutur3u/platform/commit/90643d747d01672e6f3a8ccc348f26aed0586d5c))
* **devboxes:** reap stale runs that hold runner capacity ([#6460](https://github.com/tutur3u/platform/issues/6460)) ([702e108](https://github.com/tutur3u/platform/commit/702e108c2a0dd0cfb75e0ac54bf34461782a9bb0))
* **docs:** escape &lt;option&gt; placeholder in Mastermind decision detail ([#7236](https://github.com/tutur3u/platform/issues/7236)) ([64e660f](https://github.com/tutur3u/platform/commit/64e660f6c5146908696a6eeac5f6671aa69b0ea0))
* **drive:** expire and revoke export links ([#7140](https://github.com/tutur3u/platform/issues/7140)) ([307f08f](https://github.com/tutur3u/platform/commit/307f08fee6ded7b19fe61901390afa45c33d5dce))
* **e2e:** collect Playwright specs and keep shared localhost sessions ([#7163](https://github.com/tutur3u/platform/issues/7163)) ([35b2963](https://github.com/tutur3u/platform/commit/35b2963c77ddc5207f6fa778f9d40dc997af2a50))
* **education:** scope learner and teacher resource access ([#7017](https://github.com/tutur3u/platform/issues/7017)) ([5942601](https://github.com/tutur3u/platform/commit/59426011aafb60ec51da42f6feb95872834acc60))
* **education:** validate test courses and quiz destinations ([#7020](https://github.com/tutur3u/platform/issues/7020)) ([8535738](https://github.com/tutur3u/platform/commit/8535738863df43f37c64eb8348a9a02377b6308a))
* **finance:** align database workspace boundaries ([#7031](https://github.com/tutur3u/platform/issues/7031)) ([01dbc5b](https://github.com/tutur3u/platform/commit/01dbc5b5f2ddc487e6f239888683026323ad48e7))
* **finance:** align workspace scoping for finance routes ([#7029](https://github.com/tutur3u/platform/issues/7029)) ([2ba27b9](https://github.com/tutur3u/platform/commit/2ba27b96035bbd43288b6c3de1e9ca9909b9243a))
* **finance:** keep legacy cutoff before first exact tuition month ([#6880](https://github.com/tutur3u/platform/issues/6880)) ([956f184](https://github.com/tutur3u/platform/commit/956f1844d8adfd5b52cdc2b10af1ef0c302971df))
* **finance:** require authorized callers for finance read RPCs ([#7003](https://github.com/tutur3u/platform/issues/7003)) ([90d5fe4](https://github.com/tutur3u/platform/commit/90d5fe4e6aa83a565e9b4965d97a54b624ed5518))
* **finance:** restrict legacy finance chart and migration RPCs ([#7006](https://github.com/tutur3u/platform/issues/7006)) ([626ef83](https://github.com/tutur3u/platform/commit/626ef837b37b1af7cf5c576f261b40a939a4b418))
* **finance:** retire the wallet migration writer ([#7126](https://github.com/tutur3u/platform/issues/7126)) ([0ef3673](https://github.com/tutur3u/platform/commit/0ef3673546e17264c2e0edfba413f005a182416c))
* **finance:** scope categories and transaction access to the workspace ([#7150](https://github.com/tutur3u/platform/issues/7150)) ([f08c4ea](https://github.com/tutur3u/platform/commit/f08c4ead35be9b81465de2505121de003285f651))
* **forms:** align definition and media workspace access ([#7015](https://github.com/tutur3u/platform/issues/7015)) ([98a5757](https://github.com/tutur3u/platform/commit/98a57572ce4e99b3b5240245c1577875a85de88b))
* **forms:** scope share-link lookup to the resolved workspace ([#7065](https://github.com/tutur3u/platform/issues/7065)) ([869062d](https://github.com/tutur3u/platform/commit/869062d27200a075ba1afe112c0ae0ca2ac05661))
* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* **infra:** align platform administration permissions ([#7011](https://github.com/tutur3u/platform/issues/7011)) ([18d30ec](https://github.com/tutur3u/platform/commit/18d30ec1204fcd89d7abc8cb463043331330f33d))
* **infra:** guard the managed cron secret in the database ([#7190](https://github.com/tutur3u/platform/issues/7190)) ([300ad76](https://github.com/tutur3u/platform/commit/300ad76390bff5712ba97b57980ec2a28caea345))
* **infra:** require platform admin for workspace secrets ([#7174](https://github.com/tutur3u/platform/issues/7174)) ([496de2e](https://github.com/tutur3u/platform/commit/496de2ef9c819ec73e647e395e80f494a3c696c9))
* **infra:** require verified staff identity for managed cron toggles ([#7181](https://github.com/tutur3u/platform/issues/7181)) ([714983a](https://github.com/tutur3u/platform/commit/714983a56d7672bf221d72841c211fa4dd3c5d63))
* **infrastructure:** align secret and role permission access ([#7013](https://github.com/tutur3u/platform/issues/7013)) ([4917e16](https://github.com/tutur3u/platform/commit/4917e16567f3b348ace0159d6cc982be50b9a8b7))
* **integrations:** align AI and project request authorization ([#7012](https://github.com/tutur3u/platform/issues/7012)) ([606e882](https://github.com/tutur3u/platform/commit/606e882bb3c44f39eb7277f4a9701acc492a025b))
* **inventory:** align product stock routes with adjust-stock permission model ([#7063](https://github.com/tutur3u/platform/issues/7063)) ([68d5c5f](https://github.com/tutur3u/platform/commit/68d5c5f769a8011ce5cb297b2af8130193d3cfa4))
* **inventory:** remove stale server logger fixture ([#6954](https://github.com/tutur3u/platform/issues/6954)) ([eb8842b](https://github.com/tutur3u/platform/commit/eb8842ba190f0603eedbbc9a9aa26e06203e92f2))
* **inventory:** repair baseline unit tests ([#6855](https://github.com/tutur3u/platform/issues/6855)) ([7d5776b](https://github.com/tutur3u/platform/commit/7d5776b5bc0c9d71c06948272e56e81b691ceb1b))
* **inventory:** resolve product export test path relative to file ([#6965](https://github.com/tutur3u/platform/issues/6965)) ([1bdb508](https://github.com/tutur3u/platform/commit/1bdb508a97e56885660c59fdd6b32fed45e9c47f))
* **inventory:** type existing stock rows for route comparisons ([#7230](https://github.com/tutur3u/platform/issues/7230)) ([8f5fa7f](https://github.com/tutur3u/platform/commit/8f5fa7f2884642cd7c254d21e9e9a14dd22f1cb9))
* **learn:** require parent consent for Tulearn parent links (SR-238) ([#7062](https://github.com/tutur3u/platform/issues/7062)) ([b085a0e](https://github.com/tutur3u/platform/commit/b085a0e331aa758fd1e8f490df284b6bf22ed63a))
* **learn:** use typed clients for parent consent helpers ([#7252](https://github.com/tutur3u/platform/issues/7252)) ([d64dc27](https://github.com/tutur3u/platform/commit/d64dc2728e57220415fe5dcf6e2101c717fdbe8f))
* **legal:** keep safety rules in the proposed AUP and community policies ([#7226](https://github.com/tutur3u/platform/issues/7226)) ([8ffeeef](https://github.com/tutur3u/platform/commit/8ffeeef8bc996b1997a46047e322f86885438c6c))
* **legal:** restore the in-force legal documents and separate proposed changes ([#7220](https://github.com/tutur3u/platform/issues/7220)) ([e035fa9](https://github.com/tutur3u/platform/commit/e035fa9c54d79b7766cd8d4c053b2f739d4d0ff4))
* **legal:** restore the in-force legal documents and separate proposed changes ([#7220](https://github.com/tutur3u/platform/issues/7220)) ([aba1e25](https://github.com/tutur3u/platform/commit/aba1e250d7bcd08ae2ead0417e6816f8c97d2ae6))
* **lint:** clear remaining Biome useTemplate infos on main ([#7237](https://github.com/tutur3u/platform/issues/7237)) ([1ce93ac](https://github.com/tutur3u/platform/commit/1ce93ac22174394f039083322b6be89c49ba3fc2))
* **mastermind:** persist mobile replies during undo ([#7208](https://github.com/tutur3u/platform/issues/7208)) ([1c1411d](https://github.com/tutur3u/platform/commit/1c1411dc46fe1f8f61580bece789ec96b28eacc1))
* **mastermind:** preserve push success receipts across deadlines ([#7152](https://github.com/tutur3u/platform/issues/7152)) ([dfc58c5](https://github.com/tutur3u/platform/commit/dfc58c5d7407b1943de80d0b3bfa727656342447))
* **meet:** admit AI credits before reserving transcript chunks ([#7243](https://github.com/tutur3u/platform/issues/7243)) ([0826b0e](https://github.com/tutur3u/platform/commit/0826b0eeee62421c284f1edfb9e4454bb2d1d526))
* **meet:** align guest and poll plan access ([#7010](https://github.com/tutur3u/platform/issues/7010)) ([3848203](https://github.com/tutur3u/platform/commit/38482031cb31370266617da264d71bea61a48acb))
* **meet:** apply anonymous plan access to guest availability writes ([#7064](https://github.com/tutur3u/platform/issues/7064)) ([019d52d](https://github.com/tutur3u/platform/commit/019d52d2f27f2c37c96ca967ff9edc56d12e00c8))
* **meet:** apply anonymous plan access to guest availability writes. ([019d52d](https://github.com/tutur3u/platform/commit/019d52d2f27f2c37c96ca967ff9edc56d12e00c8))
* **meet:** preserve host identity and transcript access ([#7030](https://github.com/tutur3u/platform/issues/7030)) ([3753d70](https://github.com/tutur3u/platform/commit/3753d7060ace891269187a7972d4a460148905af))
* **meet:** tighten legacy meeting and recording access ([#7270](https://github.com/tutur3u/platform/issues/7270)) ([08c55af](https://github.com/tutur3u/platform/commit/08c55af1c43bb9354e38aa6bda875e939f8c1003))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **members:** normalize targets before access changes ([#7005](https://github.com/tutur3u/platform/issues/7005)) ([9d870f6](https://github.com/tutur3u/platform/commit/9d870f62769d8941695eff1ca07d68714abc171a))
* **mobile:** accept CDN-weakened ETags from the Mastermind hub ([#7156](https://github.com/tutur3u/platform/issues/7156)) ([3837c57](https://github.com/tutur3u/platform/commit/3837c571b7db63e9f8846e49c775399a15186a11))
* **mobile:** accept release and quota field envelopes ([f1fb5f4](https://github.com/tutur3u/platform/commit/f1fb5f4cf87e534769f62bd1088ab960e2f78f47))
* **mobile:** annotate usage gaps and retain hub status reasons ([256ae3f](https://github.com/tutur3u/platform/commit/256ae3f6a3b48d66291acd7d70646aeab3e6dc07))
* **mobile:** bound store metadata retries and lookup deadline ([#6961](https://github.com/tutur3u/platform/issues/6961)) ([6196331](https://github.com/tutur3u/platform/commit/6196331a96c9def7a7ca24a0a362cae70f09d9ff))
* **mobile:** consume Forge companion fields and verify publisher fixture ([41caf51](https://github.com/tutur3u/platform/commit/41caf5177023e67302e003126946c18f7e633d5d))
* **mobile:** correct Mastermind Home freshness and accessible controls ([4bcf709](https://github.com/tutur3u/platform/commit/4bcf70910140da69840d0e728d7ee6e611a60106))
* **mobile:** harden Mastermind hub snapshot parsing ([#7173](https://github.com/tutur3u/platform/issues/7173)) ([b27e563](https://github.com/tutur3u/platform/commit/b27e563ccf0b52c9e84566dc5238b1ced846a244))
* **mobile:** harden release URLs, keychain class, backups and PKCE storage ([#7124](https://github.com/tutur3u/platform/issues/7124)) ([d947c18](https://github.com/tutur3u/platform/commit/d947c18d44abb936c237d7c21cdb5f15b1833005))
* **mobile:** harden secure storage adoption and session retries ([#7167](https://github.com/tutur3u/platform/issues/7167)) ([26118b8](https://github.com/tutur3u/platform/commit/26118b8b87014bb83cda0b7ad3d295183897908b))
* **mobile:** harden task-row swipes, roll back failed edits, add Start focus ([04973f8](https://github.com/tutur3u/platform/commit/04973f8fcf1d7ab23ad1c171eb89979bae817b4b))
* **mobile:** harden task-row swipes, roll back failed edits, add Start focus ([#6886](https://github.com/tutur3u/platform/issues/6886)) ([f2ab16a](https://github.com/tutur3u/platform/commit/f2ab16a81b6b122af81a075c77ec9550e168693a))
* **mobile:** keep Mastermind count tiles tappable via semantics and ignore misdated fleet points ([c05d993](https://github.com/tutur3u/platform/commit/c05d99382bc45470113fb8938a6b0cf8b4e2184f))
* **mobile:** keep the Pomodoro off manual sessions and follow resume chains ([db8c7e6](https://github.com/tutur3u/platform/commit/db8c7e6882b37faebd216f32e6983c39e18cb074))
* **mobile:** label the Kanban assign sheet Save and announce long-press ([44edf2c](https://github.com/tutur3u/platform/commit/44edf2cae74a6e5542f14c712eaa144dae8adc34))
* **mobile:** let Mastermind tile labels wrap instead of truncating ([08076c5](https://github.com/tutur3u/platform/commit/08076c57b629b0b4a104b01da37ddd213efb372e))
* **mobile:** make the device Pomodoro safe across missed phases and stale sessions ([7da4ad0](https://github.com/tutur3u/platform/commit/7da4ad05f291566c116ea8a1aa93cdf5d760e7f4))
* **mobile:** manage workspace visibility and filter Home choices ([#6978](https://github.com/tutur3u/platform/issues/6978)) ([8d625ae](https://github.com/tutur3u/platform/commit/8d625ae0a791b16db681a9ce238c66d0a8194003))
* **mobile:** migrate device storage and recover duplicate sessions ([884c9bc](https://github.com/tutur3u/platform/commit/884c9bcd20a017d42f9c955963e8d5bfaa2da483))
* **mobile:** one search action, centred Mira prompt, Profile edit button and count-chip cleanup ([#6973](https://github.com/tutur3u/platform/issues/6973)) ([7b74bb1](https://github.com/tutur3u/platform/commit/7b74bb11409df047a1e5fbac5d79e785909cb12d))
* **mobile:** preserve running timers and focus session recovery ([8c550d7](https://github.com/tutur3u/platform/commit/8c550d76c311c54c6139e957234f0d7b757729f3))
* **mobile:** preserve sessions during keychain duplicate retries ([744c09a](https://github.com/tutur3u/platform/commit/744c09a88ab81c0d37b362740c587ff80807fb8c))
* **mobile:** prevent task estimation crashes ([#6971](https://github.com/tutur3u/platform/issues/6971)) ([bae4818](https://github.com/tutur3u/platform/commit/bae48188780882f496a7838648708f049f1c58f4))
* **mobile:** prioritize staged sessions during recovery ([7ad2b2e](https://github.com/tutur3u/platform/commit/7ad2b2e938c2516add26c911ee4828b3ffbd1f03))
* **mobile:** reconcile Mastermind decisions and explain missing data ([eae3a0c](https://github.com/tutur3u/platform/commit/eae3a0c97b5955e70268d3a165a771f589bb5f55))
* **mobile:** register push tokens only after notification permission ([#7277](https://github.com/tutur3u/platform/issues/7277)) ([b967fc7](https://github.com/tutur3u/platform/commit/b967fc7cb56c569c9d60f7c1af331da4ffc0751e))
* **mobile:** replace stale staged sessions before persisting ([e089770](https://github.com/tutur3u/platform/commit/e0897701128aadefc406dd28a2fa8e1c575d423c))
* **mobile:** restore missing pacing glyph and align reason assertions ([6aae2d6](https://github.com/tutur3u/platform/commit/6aae2d66807a245124605437a6dd4b083a50bbfc))
* **mobile:** route Mira attachments on a held chat through New chat ([#7077](https://github.com/tutur3u/platform/issues/7077)) ([d607e95](https://github.com/tutur3u/platform/commit/d607e952e72b454a5c414b6e84576201d47d9bc1))
* **mobile:** route Mira attachments on a held chat through New chat. ([d607e95](https://github.com/tutur3u/platform/commit/d607e952e72b454a5c414b6e84576201d47d9bc1))
* **mobile:** serialize Appearance uploads and seed only once per device ([af452c7](https://github.com/tutur3u/platform/commit/af452c7f484dbdfeff17bb5111aeddce20ee583a))
* **mobile:** serialize pinned workspace saves behind security checks ([#7074](https://github.com/tutur3u/platform/issues/7074)) ([4e2dc62](https://github.com/tutur3u/platform/commit/4e2dc62d67b40a60b35d5122e1bd423540370dc2))
* **mobile:** skip unreachable TestFlight sources in release history ([#7141](https://github.com/tutur3u/platform/issues/7141)) ([cd0f46c](https://github.com/tutur3u/platform/commit/cd0f46cba38aa01acdf780b0e421c93a7b29b7e7))
* **mobile:** stack mastermind segments instead of scrolling at large text ([85959dd](https://github.com/tutur3u/platform/commit/85959ddda4d86bdc311d2fa0f026a4e092197661))
* **mobile:** stop Mira chat scroll teleport and clear the composer on send ([#6734](https://github.com/tutur3u/platform/issues/6734)) ([e3c0770](https://github.com/tutur3u/platform/commit/e3c07706c3b30d229548a1ffa0e179c95d5aa89e))
* **mobile:** tolerate hub additions and preserve dock clearance ([ada4823](https://github.com/tutur3u/platform/commit/ada4823ccf962a50078a6de3a0f74dc1208d8a97))
* **mobile:** type the glass benchmark list key ([0dede00](https://github.com/tutur3u/platform/commit/0dede00ec299485e48b24e25da9625bdc5dded65))
* **mobile:** upload Mira attachments into the selected chat's store ([#6724](https://github.com/tutur3u/platform/issues/6724)) ([2109920](https://github.com/tutur3u/platform/commit/21099205486b88ca5aa9562071eab3e04dd7877b))
* **playground:** require a signed-in staff session for AI routes and pages ([#7215](https://github.com/tutur3u/platform/issues/7215)) ([e4e42e0](https://github.com/tutur3u/platform/commit/e4e42e06ca651b9838e06248f9ad4add952768d0))
* **repo:** point WARP.md directly at AGENTS.md ([#6946](https://github.com/tutur3u/platform/issues/6946)) ([ee8c7b8](https://github.com/tutur3u/platform/commit/ee8c7b87afd149c70b7bcfbbffaa01e379109f91))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
* **roles:** scope role permission updates to the role's workspace ([#6995](https://github.com/tutur3u/platform/issues/6995)) ([010f0f2](https://github.com/tutur3u/platform/commit/010f0f228acf8acbb095f2a6020eac414deac5d6))
* **sdk:** approve storage export links portable source ([#7154](https://github.com/tutur3u/platform/issues/7154)) ([8b60602](https://github.com/tutur3u/platform/commit/8b60602fd58b894a6bc5af3db8920676da1183ec))
* **sdk:** make resource host tests deterministic ([#6870](https://github.com/tutur3u/platform/issues/6870)) ([b52f17b](https://github.com/tutur3u/platform/commit/b52f17b64433e897d85912194edb108f4a4c7eea))
* **security:** harden staging-host guard and restore reserved-host handling ([#7256](https://github.com/tutur3u/platform/issues/7256)) ([077e48c](https://github.com/tutur3u/platform/commit/077e48c3ecea2841d4c99c9d848122ef1827dd42))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **security:** validate project branches and strip guard comments ([#7271](https://github.com/tutur3u/platform/issues/7271)) ([d718355](https://github.com/tutur3u/platform/commit/d718355c2d86bb875e835326f7744b9832673839))
* **storage-rekey:** prefer opaque secret keys ([#6936](https://github.com/tutur3u/platform/issues/6936)) ([7c48741](https://github.com/tutur3u/platform/commit/7c4874166cb8005e10d553ccf5becec148ea8ff1))
* **storage:** cap Mira tool signed URLs and harden the share redirect ([b391ea2](https://github.com/tutur3u/platform/commit/b391ea2943fae9bb8f1d1bb5f32f23e087e6d1e0))
* **storage:** cap signed URL lifetimes and sign stored media on read ([#6887](https://github.com/tutur3u/platform/issues/6887)) ([b08e0e4](https://github.com/tutur3u/platform/commit/b08e0e4f1afb6ef069d01c4f725cc07178bbfdcc))
* **storage:** enforce bucket RLS rules in AI chat file read routes ([#6881](https://github.com/tutur3u/platform/issues/6881)) ([6609697](https://github.com/tutur3u/platform/commit/66096974e08e366a6591ba3f1f9e358ffdb394ce))
* **storage:** isolate private chat attachments from Drive ([#6876](https://github.com/tutur3u/platform/issues/6876)) ([bedddc3](https://github.com/tutur3u/platform/commit/bedddc33bfb08a3af7a8fe75c08a0272b20cc40d))
* **storage:** keep topic announcement uploads on their gated branch ([6acb5ee](https://github.com/tutur3u/platform/commit/6acb5eeff30f9bfadc08dce986e979f7da4bc58f))
* **storage:** least-privilege path-scoped RLS for workspace storage ([#6879](https://github.com/tutur3u/platform/issues/6879)) ([93b3e81](https://github.com/tutur3u/platform/commit/93b3e81bbdbab087d61d699269d696cd194aa6c5))
* **storage:** make topic-announcements a service-role-only storage root ([ae4e091](https://github.com/tutur3u/platform/commit/ae4e091fa2578059e202f16f355f1b5bfd38fc48))
* **storage:** make topic-announcements a service-role-only storage root ([#6920](https://github.com/tutur3u/platform/issues/6920)) ([3ca84b0](https://github.com/tutur3u/platform/commit/3ca84b00fed1221b65103025dad856b4c1aad55b))
* **storage:** match Drive private roots case-insensitively ([#7084](https://github.com/tutur3u/platform/issues/7084)) ([85b61bb](https://github.com/tutur3u/platform/commit/85b61bb064adb66876fd9e993b8e8f0617fa5f25))
* **storage:** short-lived signed URLs and sign-on-read for stored media ([b235bdb](https://github.com/tutur3u/platform/commit/b235bdbdb84198ebaf1e58a6c2e29d216f113fcf))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))
* **tasks:** complete guest board test auth fixture ([#7225](https://github.com/tutur3u/platform/issues/7225)) ([84827c6](https://github.com/tutur3u/platform/commit/84827c6b492c81a942fca43ca2ab170890f0b554))
* **tasks:** limit project update attachment links to 15 minutes ([#6850](https://github.com/tutur3u/platform/issues/6850)) ([7e0f08c](https://github.com/tutur3u/platform/commit/7e0f08c25c9a8ffb38f85d2cfaa16873895857f5))
* **tasks:** restrict task list writes to authorized members ([#7125](https://github.com/tutur3u/platform/issues/7125)) ([f6d616f](https://github.com/tutur3u/platform/commit/f6d616f14bdbd76a215bca76fdfcda995cf356e8))
* **tasks:** scope board capacity rules and public-link writes (SR-229) ([#7060](https://github.com/tutur3u/platform/issues/7060)) ([cda3344](https://github.com/tutur3u/platform/commit/cda3344e084e4f95a7a2d66aab3817d93104518e))
* **teach:** enforce page-level workspace membership ([#7098](https://github.com/tutur3u/platform/issues/7098)) ([77f5869](https://github.com/tutur3u/platform/commit/77f58694876e8320dcf38789f4b0ba2c5725589a))
* **teach:** scope module pages to the workspace (F8) ([#7082](https://github.com/tutur3u/platform/issues/7082)) ([7925a33](https://github.com/tutur3u/platform/commit/7925a33d05070f6eea74adacc1dd728b301df31d))
* **teach:** scope quiz set and module reads to the route workspace ([#7078](https://github.com/tutur3u/platform/issues/7078)) ([4be48e4](https://github.com/tutur3u/platform/commit/4be48e41cf255f59f06586b069102cc52b015a1c))
* **teach:** scope quiz-set module link to the route workspace ([#7067](https://github.com/tutur3u/platform/issues/7067)) ([2a7cefb](https://github.com/tutur3u/platform/commit/2a7cefbe3911e75077bdc9e6659df479097184f4))
* **time-tracking:** bound tagged stats, refuse tags on manual entries, migrate legacy Pomodoro state ([195c85c](https://github.com/tutur3u/platform/commit/195c85c41589a3bd451735f625b69daab4895e3f))
* **time-tracking:** bound tagged stats, refuse tags on manual entries, migrate legacy Pomodoro state ([#6905](https://github.com/tutur3u/platform/issues/6905)) ([a4ecda3](https://github.com/tutur3u/platform/commit/a4ecda3b69c763430ef59ea98674306383e31ffa))
* **time-tracking:** validate request task, category and linked-session scope ([#7068](https://github.com/tutur3u/platform/issues/7068)) ([716b49f](https://github.com/tutur3u/platform/commit/716b49f97999af4df1f20cc97214385e6e3f4f7d))
* **tooling:** resolve staging host Biome lint diagnostics ([#7263](https://github.com/tutur3u/platform/issues/7263)) ([29fbabf](https://github.com/tutur3u/platform/commit/29fbabf03498aeb715ba2ec7a6ff4343055c9a34))
* **topic-announcements:** store blank topics as NULL and fail the flag closed ([9e3611a](https://github.com/tutur3u/platform/commit/9e3611a96b42be5a8a75059e1cc546f862e4dd6b))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([16e8ff6](https://github.com/tutur3u/platform/commit/16e8ff65880be827c4c2dc03e7cc186b0b2c7724))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([f913a3c](https://github.com/tutur3u/platform/commit/f913a3c012ba38211e05c6a98692e8d1c7ccc04a))
* **tutoring:** default the schedule teacher picker to tutor groups ([#7172](https://github.com/tutur3u/platform/issues/7172)) ([8e7f682](https://github.com/tutur3u/platform/commit/8e7f6820cd082c95bf129211558b35511c30a0cd))
* **tutoring:** expect total cong in payroll export ([#7279](https://github.com/tutur3u/platform/issues/7279)) ([44c7c50](https://github.com/tutur3u/platform/commit/44c7c50d3a1e0650137bdb6e9b0bdc2dcdbdb8aa))
* **tutoring:** let one teacher tutor many learners in a shared slot ([#7255](https://github.com/tutur3u/platform/issues/7255)) ([daf6835](https://github.com/tutur3u/platform/commit/daf6835daade9216a16efc177a4e8dab6ab0919e))
* **tutoring:** list learners under current classes and needs-tutoring groups ([#7257](https://github.com/tutur3u/platform/issues/7257)) ([07c85f4](https://github.com/tutur3u/platform/commit/07c85f41c16c9ac86ea3afa5710c93bf934454b0))
* **tutoring:** page queue reads past the PostgREST row cap ([#7242](https://github.com/tutur3u/platform/issues/7242)) ([88dd35f](https://github.com/tutur3u/platform/commit/88dd35f96098ca14b7e5e1aa4baf11598c87caf4))
* **tutoring:** page queue reads past the PostgREST row cap ([#7242](https://github.com/tutur3u/platform/issues/7242)) ([45c66e0](https://github.com/tutur3u/platform/commit/45c66e00cf8e2826ac7e9f08372b73b2d27efe44))
* **tutoring:** repeat every selected weekday ([#7109](https://github.com/tutur3u/platform/issues/7109)) ([82fa151](https://github.com/tutur3u/platform/commit/82fa1519939842bb3d4596c89f07f4152f1e6811))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([f029cf6](https://github.com/tutur3u/platform/commit/f029cf6dad6ef202ddd43aefdc15014dbb9eb4bc))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **tutoring:** teach the right content for absent, weak and both rows. ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **ui:** increase light muted foreground contrast ([#7219](https://github.com/tutur3u/platform/issues/7219)) ([e1870dd](https://github.com/tutur3u/platform/commit/e1870dd454293ab614dc636d6ecaba00e84c10dc))
* **ui:** start satellite sidebar closed on mobile ([#7161](https://github.com/tutur3u/platform/issues/7161)) ([d1f4824](https://github.com/tutur3u/platform/commit/d1f482417c36bdf0c0bd179e2a7af6a63537b968))
* **users:** align approval and post delivery scoping ([#6989](https://github.com/tutur3u/platform/issues/6989)) ([d1a7052](https://github.com/tutur3u/platform/commit/d1a7052c247e19467cbff8aa60c8c06dbb46e91d))
* **users:** align workspace read permissions ([#7022](https://github.com/tutur3u/platform/issues/7022)) ([6d81393](https://github.com/tutur3u/platform/commit/6d8139370238d3be6455724c7e71bd296004002e))
* **users:** retire unused compatibility routes ([#6983](https://github.com/tutur3u/platform/issues/6983)) ([008738c](https://github.com/tutur3u/platform/commit/008738c2ff67e5bfbe7fba8fe996ed6dcf29cf23))
* **users:** scope report delivery preview and send to the report's group ([#7061](https://github.com/tutur3u/platform/issues/7061)) ([f85a01e](https://github.com/tutur3u/platform/commit/f85a01ecfe0c67f0fdcd23fc89faa7530d31ce43))
* **users:** tighten workspace read scoping and permissions ([#6979](https://github.com/tutur3u/platform/issues/6979)) ([f720f64](https://github.com/tutur3u/platform/commit/f720f64bc07ad85ec2e41c69d8ead1e342d9d802))
* **users:** validate group-check participants ([#6984](https://github.com/tutur3u/platform/issues/6984)) ([e992446](https://github.com/tutur3u/platform/commit/e9924465065e4c82b915eef194bd8c742fc9ed87))
* **utils:** include Turbo cache in the internal comparison inventory ([#6899](https://github.com/tutur3u/platform/issues/6899)) ([945ccbe](https://github.com/tutur3u/platform/commit/945ccbe3119e62f6025d6755ae5379dec34e78c9))
* **web:** check staff identity before role permissions in crawler and time-tracking routes ([#7260](https://github.com/tutur3u/platform/issues/7260)) ([118e1c6](https://github.com/tutur3u/platform/commit/118e1c60e8f4f2d7048e65722c5ce05a014caa83))
* **web:** claim only Mira's live abilities on the site ([#7216](https://github.com/tutur3u/platform/issues/7216)) ([940d418](https://github.com/tutur3u/platform/commit/940d418aa35b95dc42e4d817cc884c6e3a21c9cd))
* **web:** close candidate cookie domain bypass before staging ([#7096](https://github.com/tutur3u/platform/issues/7096)) ([dd33ba3](https://github.com/tutur3u/platform/commit/dd33ba35554866e2ddfc360bae92340ead45972b))
* **web:** keep onboarding workspaces when the creator is already a member ([#7151](https://github.com/tutur3u/platform/issues/7151)) ([46f932e](https://github.com/tutur3u/platform/commit/46f932e39f16bc73b5378d9b030b09ce632461dc))
* **web:** match declined invites to the confirmed account email ([#7148](https://github.com/tutur3u/platform/issues/7148)) ([5e7c6db](https://github.com/tutur3u/platform/commit/5e7c6db997deaa5b6c23ad476c96d6d7041a8b5b))
* **web:** narrow stored attachment size and format resolved tests ([69e1470](https://github.com/tutur3u/platform/commit/69e147003d9a49f38007b64e8b7161e278a60bd7))
* **web:** preserve Discord permission client database types ([#7268](https://github.com/tutur3u/platform/issues/7268)) ([286ae27](https://github.com/tutur3u/platform/commit/286ae274cc4d16dcc8483eac4c76ef6d83a7bd95))
* **web:** ship Meet Together messages to the marketing client provider ([#7056](https://github.com/tutur3u/platform/issues/7056)) ([4ca3feb](https://github.com/tutur3u/platform/commit/4ca3feb3e9fd59c9ef0bbfe5fc6c801d26d99167))
* **web:** type creator-grant test permission payload ([#7201](https://github.com/tutur3u/platform/issues/7201)) ([5b9c5cf](https://github.com/tutur3u/platform/commit/5b9c5cf74fa7ce3ef0ed7e7669d66a145bb46149))
* **workspace:** prevent secrets page render failure ([#6968](https://github.com/tutur3u/platform/issues/6968)) ([0c319f8](https://github.com/tutur3u/platform/commit/0c319f8d1ac244445b424aa3c9c48bed352049c0))
* **workspace:** surface deletion failures and preserve confirmation ([#6969](https://github.com/tutur3u/platform/issues/6969)) ([a6af584](https://github.com/tutur3u/platform/commit/a6af584903a4741934e023776d90bc50667c1a33))


### Performance Improvements

* **ai:** cut Mira time to first token ([#6725](https://github.com/tutur3u/platform/issues/6725)) ([192ce93](https://github.com/tutur3u/platform/commit/192ce93c5cf7d3cf38489d6be97ab589e271778a))
* **auth:** verify the request user once across refresh, guard and MFA ([#7153](https://github.com/tutur3u/platform/issues/7153)) ([959206e](https://github.com/tutur3u/platform/commit/959206efa1b1b686c75a1d17eade931519e8729f))
* **database:** drop nine unused indexes to free production disk ([#7053](https://github.com/tutur3u/platform/issues/7053)) ([c576162](https://github.com/tutur3u/platform/commit/c576162619d563f7e893dfc803655df0281070b2))
* **mail:** load the inbox list without waiting on bootstrap writes ([#7144](https://github.com/tutur3u/platform/issues/7144)) ([05da011](https://github.com/tutur3u/platform/commit/05da011557427cf7bc0b62ae3bb03f11d8c716f5))
* **mobile:** defer optional model recovery until after first paint ([#7203](https://github.com/tutur3u/platform/issues/7203)) ([4b7aad9](https://github.com/tutur3u/platform/commit/4b7aad99835c1015b003607614b89e3104e83758))
* **mobile:** parallelize independent startup init ([#7207](https://github.com/tutur3u/platform/issues/7207)) ([8d30040](https://github.com/tutur3u/platform/commit/8d30040e94bd824cdbc471e2f4c1563e46bda383))
* **mobile:** trim bundle weight ([#7212](https://github.com/tutur3u/platform/issues/7212)) ([0af4cfe](https://github.com/tutur3u/platform/commit/0af4cfeda0afb9e982dea2ab94c23a466748e335))
</details>

<details><summary>ai-studio: 0.20.0</summary>

## [0.20.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.19.0...ai-studio-v0.20.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>calendar: 0.37.0</summary>

## [0.37.0](https://github.com/tutur3u/platform/compare/calendar-v0.36.0...calendar-v0.37.0) (2026-10-30)


### Features

* **calendar:** admit native production cutover ([#6952](https://github.com/tutur3u/platform/issues/6952)) ([1269e31](https://github.com/tutur3u/platform/commit/1269e310101f1b360ab1dadf0311cafe8a3d337a))
* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **calendar:** cap automatic Google consent restarts ([#6869](https://github.com/tutur3u/platform/issues/6869)) ([a155548](https://github.com/tutur3u/platform/commit/a155548bf7b3513c4cb5e25adff491d429b3836c))
* **calendar:** close OAuth self-heal review follow-ups ([#6878](https://github.com/tutur3u/platform/issues/6878)) ([3765547](https://github.com/tutur3u/platform/commit/376554797511bbe02bf56b06218b8ae69040ad06))
* **calendar:** deliver OAuth health spike notifications ([3ae17ff](https://github.com/tutur3u/platform/commit/3ae17ff64879d2efa439982ffe70a4d056e2f784))
* **calendar:** deliver OAuth health spike notifications ([#6871](https://github.com/tutur3u/platform/issues/6871)) ([292429e](https://github.com/tutur3u/platform/commit/292429e2ecf12a4ebf72f56bb09c5f331ada717f))
* **calendar:** persist transient provider degradation ([#6867](https://github.com/tutur3u/platform/issues/6867)) ([5a2d7c1](https://github.com/tutur3u/platform/commit/5a2d7c1fbe0295f9ea8b9af9fa8af64c24bbb7ca))
* **calendar:** qualify the root Worker and exact offline assets ([#6859](https://github.com/tutur3u/platform/issues/6859)) ([284bdaf](https://github.com/tutur3u/platform/commit/284bdaf034e5b127b1c5c690d74b43da6a178276))
* **calendar:** target verified operators for OAuth spike alerts ([5977bf7](https://github.com/tutur3u/platform/commit/5977bf7942691df373a4daf5355088491c7ed809))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>chat: 0.29.0</summary>

## [0.29.0](https://github.com/tutur3u/platform/compare/chat-v0.28.0...chat-v0.29.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
</details>

<details><summary>cms: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/cms-v0.38.0...cms-v0.39.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **cms:** align form and content workspace permissions ([#7023](https://github.com/tutur3u/platform/issues/7023)) ([798d418](https://github.com/tutur3u/platform/commit/798d4189a31e2bacd66c49ce60d21c3b83241411))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>database: 1.45.0</summary>

## [1.45.0](https://github.com/tutur3u/platform/compare/database-v1.44.0...database-v1.45.0) (2026-10-30)


### Features

* **ai:** create Mira chat with the first message ([#6765](https://github.com/tutur3u/platform/issues/6765)) ([aae4d08](https://github.com/tutur3u/platform/commit/aae4d088b0225d428bce41153bac7cf204d5a8dd))
* **database:** add topic announcement teacher assignment schema ([24ad041](https://github.com/tutur3u/platform/commit/24ad04103ecce259beb379cb2a92dce31aa9c5ee))
* **database:** add topic announcement teacher assignment schema ([#6924](https://github.com/tutur3u/platform/issues/6924)) ([cf6a18d](https://github.com/tutur3u/platform/commit/cf6a18d3cfa33d5cc5b93a673613038e347be827))
* **database:** add topic teacher deadline notice types and receipts ([#6975](https://github.com/tutur3u/platform/issues/6975)) ([ee987de](https://github.com/tutur3u/platform/commit/ee987dec1d739c81a8d5eeda0502aa2c436249bf))
* **database:** add tutoring follow-up notification foundation ([3b51993](https://github.com/tutur3u/platform/commit/3b51993e516ad33d92b9e821acf4d7e4b4d81b08))
* **database:** add tutoring follow-up notification foundation ([#6909](https://github.com/tutur3u/platform/issues/6909)) ([1a986eb](https://github.com/tutur3u/platform/commit/1a986eb918304ce12c1b732307bce9b7817a5232))
* **devbox:** admit claims by reported execution mode behind a flag ([#6457](https://github.com/tutur3u/platform/issues/6457)) ([394fd27](https://github.com/tutur3u/platform/commit/394fd27a8e6aa5f3b868237f4fc9139d95132832))
* **meet:** add a fenced 365-day transcript retention purge ([#7276](https://github.com/tutur3u/platform/issues/7276)) ([bb0a4e1](https://github.com/tutur3u/platform/commit/bb0a4e18af0a0ebb4cf7b6dbe712e1ce79554420))
* **storage:** app-side storage access audit log ([#6891](https://github.com/tutur3u/platform/issues/6891)) ([57cc3f1](https://github.com/tutur3u/platform/commit/57cc3f1750a94890f55a9b33496a1694c11c1888))


### Bug Fixes

* **auth:** align cross-app handoff identity ([#7008](https://github.com/tutur3u/platform/issues/7008)) ([e5c30f9](https://github.com/tutur3u/platform/commit/e5c30f95886d20c8cce3a7bad1a9ad7d71a3cb63))
* **auth:** require verified email to link a Microsoft identity ([#7132](https://github.com/tutur3u/platform/issues/7132)) ([d0414bc](https://github.com/tutur3u/platform/commit/d0414bcd93c7997bcdea3fcbfc1efd9ba262d5e4))
* **database:** add caller checks to privileged reporting functions ([#7080](https://github.com/tutur3u/platform/issues/7080)) ([877bb82](https://github.com/tutur3u/platform/commit/877bb82dfb20dd5ea5a3cdc68256f230a63e457c))
* **database:** align AI chat and subscription RPC access ([#7035](https://github.com/tutur3u/platform/issues/7035)) ([9fd1c02](https://github.com/tutur3u/platform/commit/9fd1c021c78467bf692ea759fb8fd48664ed181b))
* **database:** align time-tracking and task RPC permissions ([#7000](https://github.com/tutur3u/platform/issues/7000)) ([6730c79](https://github.com/tutur3u/platform/commit/6730c798f17be276dc3f1fe8efd60306a84b66f3))
* **database:** align workspace merge phase permissions ([#7002](https://github.com/tutur3u/platform/issues/7002)) ([fa47e8d](https://github.com/tutur3u/platform/commit/fa47e8d24c03633e3dbee9f6ccb7d2f9540e3a8e))
* **database:** bound claim admission DDL lock waits ([ecb532b](https://github.com/tutur3u/platform/commit/ecb532b1809cf54ebb5201f50ca4681b91ca757a))
* **database:** bound cross-app token lifetime and audience, contain overlong tokens ([#6840](https://github.com/tutur3u/platform/issues/6840)) ([c858586](https://github.com/tutur3u/platform/commit/c858586a6ae8c907ab55bdf5476b7bd73f2b28b7))
* **database:** bound reaper DDL and document concurrent index recovery ([f4a5a02](https://github.com/tutur3u/platform/commit/f4a5a02e4e22e26426ae0fae124c95462ee1cd64))
* **database:** harden session management function guards ([#6993](https://github.com/tutur3u/platform/issues/6993)) ([fb921f4](https://github.com/tutur3u/platform/commit/fb921f4f2f102070da9eaaae63629b86c23ca21c))
* **database:** keep topic teacher constraints NOT VALID under the lock ([5a18018](https://github.com/tutur3u/platform/commit/5a18018598705054993e658375d2a4ec31c8505c))
* **database:** leave tutoring notification type check NOT VALID ([1197883](https://github.com/tutur3u/platform/commit/1197883a3f66ccc4a53d9927e629fce320e68540))
* **database:** move tutoring migration to 20261026191000 ([1250a1c](https://github.com/tutur3u/platform/commit/1250a1c0db1230ed78e478c3709cc76d531d5044))
* **database:** pin notification trigger host and use Vault bearer (SR-327) ([#7113](https://github.com/tutur3u/platform/issues/7113)) ([1c8fdf9](https://github.com/tutur3u/platform/commit/1c8fdf9c9fdd85824f31d1fe562bb9b3c001f4dd))
* **database:** preserve unrelated notification types on tutoring rollback ([e3b4293](https://github.com/tutur3u/platform/commit/e3b4293ce35ba49c13b4a6a960e4e1a62ec23fcc))
* **database:** restate employee runtime readiness ACL ([#7231](https://github.com/tutur3u/platform/issues/7231)) ([0047e77](https://github.com/tutur3u/platform/commit/0047e77296c6609401bd07de1fd12f4712568aaf))
* **database:** restore employee readiness and whiteboard payload contracts ([#7189](https://github.com/tutur3u/platform/issues/7189)) ([4666c9c](https://github.com/tutur3u/platform/commit/4666c9c9eec6fed461042bdabc272b0152a075e6))
* **database:** restrict an RPC to the service role ([#7059](https://github.com/tutur3u/platform/issues/7059)) ([4fb4eef](https://github.com/tutur3u/platform/commit/4fb4eef4533f0ca3e654fa5681f91d6010d22d7d))
* **database:** restrict audit and legacy token privileges ([#7112](https://github.com/tutur3u/platform/issues/7112)) ([e6b4c45](https://github.com/tutur3u/platform/commit/e6b4c452c3f2cfc85e38dd18f1ffd0dcabe4d929))
* **database:** restrict remaining privileged definer functions ([#7092](https://github.com/tutur3u/platform/issues/7092)) ([5743c29](https://github.com/tutur3u/platform/commit/5743c290cfccc7c9250f1c9e6027c3318482df74))
* **database:** restrict two internal merge helpers to the service role ([#7069](https://github.com/tutur3u/platform/issues/7069)) ([291bb02](https://github.com/tutur3u/platform/commit/291bb02f9be4a7624a7f525e034ba02b0660df3c))
* **database:** restrict workspace user link repair to the service role ([#6994](https://github.com/tutur3u/platform/issues/6994)) ([debface](https://github.com/tutur3u/platform/commit/debface3d868d9207a4568774c88e0ae7f31bd3d))
* **database:** scope Discord mappings to the linked workspace ([#7014](https://github.com/tutur3u/platform/issues/7014)) ([cc59d0b](https://github.com/tutur3u/platform/commit/cc59d0ba1527509297ec18ac6a1d559991f1fe64))
* **database:** scope public function execution privileges ([#7076](https://github.com/tutur3u/platform/issues/7076)) ([c2e1d7e](https://github.com/tutur3u/platform/commit/c2e1d7ed0287a719c7052967372cc77ee9acd436))
* **database:** scope time request detail references ([#7024](https://github.com/tutur3u/platform/issues/7024)) ([c7fb9f5](https://github.com/tutur3u/platform/commit/c7fb9f523e612c3522460d6edcae98cbb2a3550c))
* **database:** tighten table privileges ([#7197](https://github.com/tutur3u/platform/issues/7197)) ([a43d2c3](https://github.com/tutur3u/platform/commit/a43d2c3d159bcaca6e1716781750d2cdd0135e88))
* **db:** guard task cycle links to the cycle workspace ([#6942](https://github.com/tutur3u/platform/issues/6942)) ([54bf36e](https://github.com/tutur3u/platform/commit/54bf36edfff49ffed85957f3f8ceb3260099aeb7))
* **db:** pin time tracking definer search_path and fix linked-request rejection ([#7281](https://github.com/tutur3u/platform/issues/7281)) ([51bb558](https://github.com/tutur3u/platform/commit/51bb55860abbc4900cef61342e8862b97e2f4c72))
* **db:** pin workspace ownership in row policies ([#7136](https://github.com/tutur3u/platform/issues/7136)) ([232181a](https://github.com/tutur3u/platform/commit/232181a6f78f0bf4cb1ddc0cadc0427082163464))
* **db:** protect workspace ownership changes ([#7184](https://github.com/tutur3u/platform/issues/7184)) ([123271e](https://github.com/tutur3u/platform/commit/123271e7d757f0f4c2a335153a92bab7535c8241))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **db:** scope workspace invites to their workspace ([#7137](https://github.com/tutur3u/platform/issues/7137)) ([9cde8ca](https://github.com/tutur3u/platform/commit/9cde8ca40fdcb86fa1cb49dd8f638ff8427fde24))
* **db:** tighten workspace ownership change paths ([#7194](https://github.com/tutur3u/platform/issues/7194)) ([b099b73](https://github.com/tutur3u/platform/commit/b099b7303ea29ad9f39df90dfc99352e96b821e4))
* **db:** verify staff identity in domain-gated policies ([#7138](https://github.com/tutur3u/platform/issues/7138)) ([c4593fb](https://github.com/tutur3u/platform/commit/c4593fb27c8aeac4e757235fcdc36fbaf9d5d5a9))
* **devboxes:** reap stale runs that hold runner capacity ([#6460](https://github.com/tutur3u/platform/issues/6460)) ([702e108](https://github.com/tutur3u/platform/commit/702e108c2a0dd0cfb75e0ac54bf34461782a9bb0))
* **finance:** align database workspace boundaries ([#7031](https://github.com/tutur3u/platform/issues/7031)) ([01dbc5b](https://github.com/tutur3u/platform/commit/01dbc5b5f2ddc487e6f239888683026323ad48e7))
* **finance:** keep legacy cutoff before first exact tuition month ([#6880](https://github.com/tutur3u/platform/issues/6880)) ([956f184](https://github.com/tutur3u/platform/commit/956f1844d8adfd5b52cdc2b10af1ef0c302971df))
* **finance:** require authorized callers for finance read RPCs ([#7003](https://github.com/tutur3u/platform/issues/7003)) ([90d5fe4](https://github.com/tutur3u/platform/commit/90d5fe4e6aa83a565e9b4965d97a54b624ed5518))
* **finance:** restrict legacy finance chart and migration RPCs ([#7006](https://github.com/tutur3u/platform/issues/7006)) ([626ef83](https://github.com/tutur3u/platform/commit/626ef837b37b1af7cf5c576f261b40a939a4b418))
* **finance:** scope categories and transaction access to the workspace ([#7150](https://github.com/tutur3u/platform/issues/7150)) ([f08c4ea](https://github.com/tutur3u/platform/commit/f08c4ead35be9b81465de2505121de003285f651))
* **infra:** guard the managed cron secret in the database ([#7190](https://github.com/tutur3u/platform/issues/7190)) ([300ad76](https://github.com/tutur3u/platform/commit/300ad76390bff5712ba97b57980ec2a28caea345))
* **meet:** preserve host identity and transcript access ([#7030](https://github.com/tutur3u/platform/issues/7030)) ([3753d70](https://github.com/tutur3u/platform/commit/3753d7060ace891269187a7972d4a460148905af))
* **meet:** tighten legacy meeting and recording access ([#7270](https://github.com/tutur3u/platform/issues/7270)) ([08c55af](https://github.com/tutur3u/platform/commit/08c55af1c43bb9354e38aa6bda875e939f8c1003))
* **storage:** keep topic announcement uploads on their gated branch ([6acb5ee](https://github.com/tutur3u/platform/commit/6acb5eeff30f9bfadc08dce986e979f7da4bc58f))
* **storage:** least-privilege path-scoped RLS for workspace storage ([#6879](https://github.com/tutur3u/platform/issues/6879)) ([93b3e81](https://github.com/tutur3u/platform/commit/93b3e81bbdbab087d61d699269d696cd194aa6c5))
* **storage:** make topic-announcements a service-role-only storage root ([ae4e091](https://github.com/tutur3u/platform/commit/ae4e091fa2578059e202f16f355f1b5bfd38fc48))
* **storage:** make topic-announcements a service-role-only storage root ([#6920](https://github.com/tutur3u/platform/issues/6920)) ([3ca84b0](https://github.com/tutur3u/platform/commit/3ca84b00fed1221b65103025dad856b4c1aad55b))
* **tasks:** restrict task list writes to authorized members ([#7125](https://github.com/tutur3u/platform/issues/7125)) ([f6d616f](https://github.com/tutur3u/platform/commit/f6d616f14bdbd76a215bca76fdfcda995cf356e8))
* **time-tracking:** validate request task, category and linked-session scope ([#7068](https://github.com/tutur3u/platform/issues/7068)) ([716b49f](https://github.com/tutur3u/platform/commit/716b49f97999af4df1f20cc97214385e6e3f4f7d))


### Performance Improvements

* **database:** drop nine unused indexes to free production disk ([#7053](https://github.com/tutur3u/platform/issues/7053)) ([c576162](https://github.com/tutur3u/platform/commit/c576162619d563f7e893dfc803655df0281070b2))
</details>

<details><summary>drive: 0.34.0</summary>

## [0.34.0](https://github.com/tutur3u/platform/compare/drive-v0.33.0...drive-v0.34.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **drive:** expire and revoke export links ([#7140](https://github.com/tutur3u/platform/issues/7140)) ([307f08f](https://github.com/tutur3u/platform/commit/307f08fee6ded7b19fe61901390afa45c33d5dce))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>external: 0.6.2</summary>

## [0.6.2](https://github.com/tutur3u/platform/compare/external-v0.6.1...external-v0.6.2) (2026-10-30)


### Bug Fixes

* **api:** align export and satellite request boundaries ([#7021](https://github.com/tutur3u/platform/issues/7021)) ([73a876a](https://github.com/tutur3u/platform/commit/73a876aaa7f13eceb13b6e6946e61d8323b1cf10))
</details>

<details><summary>finance: 0.36.0</summary>

## [0.36.0](https://github.com/tutur3u/platform/compare/finance-v0.35.0...finance-v0.36.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **finance:** brand reconciliation money and test token bounds ([#6873](https://github.com/tutur3u/platform/issues/6873)) ([63417bb](https://github.com/tutur3u/platform/commit/63417bb06522ed9c64cc6ecc06cb0a9a881a88e2))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **finance:** align workspace scoping for finance routes ([#7029](https://github.com/tutur3u/platform/issues/7029)) ([2ba27b9](https://github.com/tutur3u/platform/commit/2ba27b96035bbd43288b6c3de1e9ca9909b9243a))
* **finance:** retire the wallet migration writer ([#7126](https://github.com/tutur3u/platform/issues/7126)) ([0ef3673](https://github.com/tutur3u/platform/commit/0ef3673546e17264c2e0edfba413f005a182416c))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>hive: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/hive-v0.26.2...hive-v0.27.0) (2026-10-30)


### Features

* **hive:** add Cloudflare maintenance and native migration plan ([#6868](https://github.com/tutur3u/platform/issues/6868)) ([00f1071](https://github.com/tutur3u/platform/commit/00f107166aab3428cc97e84e5284ec13ff127447))
</details>

<details><summary>infra: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/infra-v0.38.0...infra-v0.39.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **infrastructure:** add the private ops hub gateway ([#6997](https://github.com/tutur3u/platform/issues/6997)) ([c7be6a7](https://github.com/tutur3u/platform/commit/c7be6a7b766ce04085887cdf5510f62611bf46d8))
* **ops:** add resumable storage re-key tool for leaked signed URLs ([#6890](https://github.com/tutur3u/platform/issues/6890)) ([2f88257](https://github.com/tutur3u/platform/commit/2f88257b224ee70b783c4cf5ad8432e675e4e347))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* align main unit fixtures with authorization and app inventory ([#7265](https://github.com/tutur3u/platform/issues/7265)) ([0eb1e3a](https://github.com/tutur3u/platform/commit/0eb1e3a8d350c5179bfaad63fc7281bfd47ebbf8))
* **api:** align export and satellite request boundaries ([#7021](https://github.com/tutur3u/platform/issues/7021)) ([73a876a](https://github.com/tutur3u/platform/commit/73a876aaa7f13eceb13b6e6946e61d8323b1cf10))
* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **database:** scope Discord mappings to the linked workspace ([#7014](https://github.com/tutur3u/platform/issues/7014)) ([cc59d0b](https://github.com/tutur3u/platform/commit/cc59d0ba1527509297ec18ac6a1d559991f1fe64))
* **desktop:** publish run-free desktop versions with structured release notes ([#7157](https://github.com/tutur3u/platform/issues/7157)) ([90643d7](https://github.com/tutur3u/platform/commit/90643d747d01672e6f3a8ccc348f26aed0586d5c))
* **devboxes:** reap stale runs that hold runner capacity ([#6460](https://github.com/tutur3u/platform/issues/6460)) ([702e108](https://github.com/tutur3u/platform/commit/702e108c2a0dd0cfb75e0ac54bf34461782a9bb0))
* **infra:** align platform administration permissions ([#7011](https://github.com/tutur3u/platform/issues/7011)) ([18d30ec](https://github.com/tutur3u/platform/commit/18d30ec1204fcd89d7abc8cb463043331330f33d))
* **infra:** require platform admin for workspace secrets ([#7174](https://github.com/tutur3u/platform/issues/7174)) ([496de2e](https://github.com/tutur3u/platform/commit/496de2ef9c819ec73e647e395e80f494a3c696c9))
* **infra:** require verified staff identity for managed cron toggles ([#7181](https://github.com/tutur3u/platform/issues/7181)) ([714983a](https://github.com/tutur3u/platform/commit/714983a56d7672bf221d72841c211fa4dd3c5d63))
* **infrastructure:** align secret and role permission access ([#7013](https://github.com/tutur3u/platform/issues/7013)) ([4917e16](https://github.com/tutur3u/platform/commit/4917e16567f3b348ace0159d6cc982be50b9a8b7))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
* **security:** harden staging-host guard and restore reserved-host handling ([#7256](https://github.com/tutur3u/platform/issues/7256)) ([077e48c](https://github.com/tutur3u/platform/commit/077e48c3ecea2841d4c99c9d848122ef1827dd42))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **security:** validate project branches and strip guard comments ([#7271](https://github.com/tutur3u/platform/issues/7271)) ([d718355](https://github.com/tutur3u/platform/commit/d718355c2d86bb875e835326f7744b9832673839))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
* **users:** align approval and post delivery scoping ([#6989](https://github.com/tutur3u/platform/issues/6989)) ([d1a7052](https://github.com/tutur3u/platform/commit/d1a7052c247e19467cbff8aa60c8c06dbb46e91d))
</details>

<details><summary>inventory: 0.38.0</summary>

## [0.38.0](https://github.com/tutur3u/platform/compare/inventory-v0.37.0...inventory-v0.38.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **api:** align user group workspace scoping ([#7001](https://github.com/tutur3u/platform/issues/7001)) ([7c7ec6e](https://github.com/tutur3u/platform/commit/7c7ec6ea248d9a3fdb7aabf9e64fbda1933ad321))
* **api:** align workspace operation permissions and references ([#7033](https://github.com/tutur3u/platform/issues/7033)) ([86c6dd4](https://github.com/tutur3u/platform/commit/86c6dd4dd388a9081334293b0b0005452e846200))
* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* **inventory:** align product stock routes with adjust-stock permission model ([#7063](https://github.com/tutur3u/platform/issues/7063)) ([68d5c5f](https://github.com/tutur3u/platform/commit/68d5c5f769a8011ce5cb297b2af8130193d3cfa4))
* **inventory:** remove stale server logger fixture ([#6954](https://github.com/tutur3u/platform/issues/6954)) ([eb8842b](https://github.com/tutur3u/platform/commit/eb8842ba190f0603eedbbc9a9aa26e06203e92f2))
* **inventory:** repair baseline unit tests ([#6855](https://github.com/tutur3u/platform/issues/6855)) ([7d5776b](https://github.com/tutur3u/platform/commit/7d5776b5bc0c9d71c06948272e56e81b691ceb1b))
* **inventory:** resolve product export test path relative to file ([#6965](https://github.com/tutur3u/platform/issues/6965)) ([1bdb508](https://github.com/tutur3u/platform/commit/1bdb508a97e56885660c59fdd6b32fed45e9c47f))
* **inventory:** type existing stock rows for route comparisons ([#7230](https://github.com/tutur3u/platform/issues/7230)) ([8f5fa7f](https://github.com/tutur3u/platform/commit/8f5fa7f2884642cd7c254d21e9e9a14dd22f1cb9))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>storefront: 0.33.0</summary>

## [0.33.0](https://github.com/tutur3u/platform/compare/storefront-v0.32.0...storefront-v0.33.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))


### Bug Fixes

* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>learn: 0.33.0</summary>

## [0.33.0](https://github.com/tutur3u/platform/compare/learn-v0.32.0...learn-v0.33.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))


### Bug Fixes

* **education:** scope learner and teacher resource access ([#7017](https://github.com/tutur3u/platform/issues/7017)) ([5942601](https://github.com/tutur3u/platform/commit/59426011aafb60ec51da42f6feb95872834acc60))
* **education:** validate test courses and quiz destinations ([#7020](https://github.com/tutur3u/platform/issues/7020)) ([8535738](https://github.com/tutur3u/platform/commit/8535738863df43f37c64eb8348a9a02377b6308a))
* **learn:** require parent consent for Tulearn parent links (SR-238) ([#7062](https://github.com/tutur3u/platform/issues/7062)) ([b085a0e](https://github.com/tutur3u/platform/commit/b085a0e331aa758fd1e8f490df284b6bf22ed63a))
* **learn:** use typed clients for parent consent helpers ([#7252](https://github.com/tutur3u/platform/issues/7252)) ([d64dc27](https://github.com/tutur3u/platform/commit/d64dc2728e57220415fe5dcf6e2101c717fdbe8f))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
</details>

<details><summary>mail: 0.32.0</summary>

## [0.32.0](https://github.com/tutur3u/platform/compare/mail-v0.31.0...mail-v0.32.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **mail:** adopt the shared Start bridge and request mounts ([#6763](https://github.com/tutur3u/platform/issues/6763)) ([d3621e5](https://github.com/tutur3u/platform/commit/d3621e508fcd17c11c781baddb82c7ce42e7886f))
* **mail:** settle the sync icon smoothly and move the mail source into Settings ([#7145](https://github.com/tutur3u/platform/issues/7145)) ([7df69df](https://github.com/tutur3u/platform/commit/7df69df8b8a845d2371802aa7a32e5c150a18097))
* **mail:** tighten the inbox list hierarchy and density ([#7146](https://github.com/tutur3u/platform/issues/7146)) ([5218adf](https://github.com/tutur3u/platform/commit/5218adf56b8fcd7a811020a0bfdc0e976750975f))
* **meet,mail:** add flagged shared-origin routing at the Worker entry ([#6746](https://github.com/tutur3u/platform/issues/6746)) ([5b83ba8](https://github.com/tutur3u/platform/commit/5b83ba8eab646d423ff567d816deed73601ea38d))
* **meet,mail:** add per-app document security headers ([#6749](https://github.com/tutur3u/platform/issues/6749)) ([f2a60c8](https://github.com/tutur3u/platform/commit/f2a60c86bac0bf658cbe43c23f07f1cfa539cd09))
* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))


### Performance Improvements

* **mail:** load the inbox list without waiting on bootstrap writes ([#7144](https://github.com/tutur3u/platform/issues/7144)) ([05da011](https://github.com/tutur3u/platform/commit/05da011557427cf7bc0b62ae3bb03f11d8c716f5))
</details>

<details><summary>meet: 0.36.0</summary>

## [0.36.0](https://github.com/tutur3u/platform/compare/meet-v0.35.0...meet-v0.36.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **meet,mail:** add flagged shared-origin routing at the Worker entry ([#6746](https://github.com/tutur3u/platform/issues/6746)) ([5b83ba8](https://github.com/tutur3u/platform/commit/5b83ba8eab646d423ff567d816deed73601ea38d))
* **meet,mail:** add per-app document security headers ([#6749](https://github.com/tutur3u/platform/issues/6749)) ([f2a60c8](https://github.com/tutur3u/platform/commit/f2a60c86bac0bf658cbe43c23f07f1cfa539cd09))
* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
* **meet:** inject the abuse-guard service binding ([#6853](https://github.com/tutur3u/platform/issues/6853)) ([5a5e00c](https://github.com/tutur3u/platform/commit/5a5e00cf13cb904ed021159c4cd1f07fb98c26b0))
* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** admit AI credits before reserving transcript chunks ([#7243](https://github.com/tutur3u/platform/issues/7243)) ([0826b0e](https://github.com/tutur3u/platform/commit/0826b0eeee62421c284f1edfb9e4454bb2d1d526))
* **meet:** tighten legacy meeting and recording access ([#7270](https://github.com/tutur3u/platform/issues/7270)) ([08c55af](https://github.com/tutur3u/platform/commit/08c55af1c43bb9354e38aa6bda875e939f8c1003))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>mind: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/mind-v0.26.0...mind-v0.27.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
</details>

<details><summary>mobile: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/mobile-v0.26.0...mobile-v0.27.0) (2026-10-30)


### Highlights

* **ai:** create Mira chat with the first message ([#6765](https://github.com/tutur3u/platform/issues/6765)) ([aae4d08](https://github.com/tutur3u/platform/commit/aae4d088b0225d428bce41153bac7cf204d5a8dd))
* **mastermind:** catch-up section on Today ([#7213](https://github.com/tutur3u/platform/issues/7213)) ([66dba6f](https://github.com/tutur3u/platform/commit/66dba6f107c966110c078b85a4ac999dc51ce11a))
* **mobile:** accessible chart kit for Mastermind insights ([#7040](https://github.com/tutur3u/platform/issues/7040)) ([6118e98](https://github.com/tutur3u/platform/commit/6118e987bd845601f92e4b097460f059550ec03e))
* **mobile:** add Appearance interface styles, density, corners and motion ([2e1fece](https://github.com/tutur3u/platform/commit/2e1fecec7e1390a80d01fe553971eac42c9eef1f))
* **mobile:** add Appearance interface styles, density, corners and motion ([#6889](https://github.com/tutur3u/platform/issues/6889)) ([bce582d](https://github.com/tutur3u/platform/commit/bce582dab8db44197ea40d265fca7e89b63ecd08))
* **mobile:** add Education mode and the Today classes card ([#6982](https://github.com/tutur3u/platform/issues/6982)) ([c035dce](https://github.com/tutur3u/platform/commit/c035dce3c3b10686088dfb373a3f36d69194be36))
* **mobile:** add gated read-only Mastermind Threads ([#7171](https://github.com/tutur3u/platform/issues/7171)) ([90f80a2](https://github.com/tutur3u/platform/commit/90f80a2ef141c22eccbcfadf21d8a920c72baca2))
* **mobile:** add Mastermind Work Backlog and Staff segments ([#7110](https://github.com/tutur3u/platform/issues/7110)) ([846f433](https://github.com/tutur3u/platform/commit/846f4337a91966f084ca1178363e8b566d61bc04))
* **mobile:** add read-only Mastermind Machines ([#7227](https://github.com/tutur3u/platform/issues/7227)) ([c753cc1](https://github.com/tutur3u/platform/commit/c753cc19fc6c3c48a5b1f6680ccb1a479095de5e))
* **mobile:** add the Mastermind Decisions journal to the Inbox ([#7134](https://github.com/tutur3u/platform/issues/7134)) ([c793ad2](https://github.com/tutur3u/platform/commit/c793ad2765a2b2e1d7da054debed5d89d46f9260))
* **mobile:** add the Mastermind entry, shell and Home tab ([#7100](https://github.com/tutur3u/platform/issues/7100)) ([c66fa2c](https://github.com/tutur3u/platform/commit/c66fa2ccaba3ed4437c23ee3638f4ce81fda6b9f))
* **mobile:** add the Mastermind Inbox and capability-gated replies ([#7104](https://github.com/tutur3u/platform/issues/7104)) ([6623440](https://github.com/tutur3u/platform/commit/66234407553acd3c38e7be0a650bdb270bb0dc01))
* **mobile:** add the Mastermind Ship and Insights tabs ([#7116](https://github.com/tutur3u/platform/issues/7116)) ([8f6c3cb](https://github.com/tutur3u/platform/commit/8f6c3cbdf83e7be9b6d4b06b1cea19ddd02b5a75))
* **mobile:** add the Mastermind Work tab with lanes and lane detail ([#7106](https://github.com/tutur3u/platform/issues/7106)) ([c5ef891](https://github.com/tutur3u/platform/commit/c5ef8919cdadbc54315095b9239b1401636d9f47))
* **mobile:** answer Mastermind decisions from Home and Inbox ([#7205](https://github.com/tutur3u/platform/issues/7205)) ([595b4bd](https://github.com/tutur3u/platform/commit/595b4bd44ea64074a1e2ccadb8aa1271df278357))
* **mobile:** compact Mastermind Inbox with resolved history ([#7177](https://github.com/tutur3u/platform/issues/7177)) ([4ece677](https://github.com/tutur3u/platform/commit/4ece6778820c2e238856e6425580a888489dba9f))
* **mobile:** compact Mastermind Ship and Insights ([#7175](https://github.com/tutur3u/platform/issues/7175)) ([8091606](https://github.com/tutur3u/platform/commit/809160601ed4786e2b9b86162ebe765cd618a8f6))
* **mobile:** count Focus Time as all task-linked tracked time ([b2c3128](https://github.com/tutur3u/platform/commit/b2c31280443660396fe97ce5c985cd2a53bfe8e9))
* **mobile:** count Focus Time as all task-linked tracked time ([#6922](https://github.com/tutur3u/platform/issues/6922)) ([f6861ba](https://github.com/tutur3u/platform/commit/f6861ba061c807288f58d81c3e042cf979d4f6c0))
* **mobile:** enable the production Mastermind hub for the beta ([#7131](https://github.com/tutur3u/platform/issues/7131)) ([edcc0ed](https://github.com/tutur3u/platform/commit/edcc0ed71c66d4b2581546002277ee8271ac059e))
* **mobile:** full Mastermind decision details ([#7218](https://github.com/tutur3u/platform/issues/7218)) ([9d40f40](https://github.com/tutur3u/platform/commit/9d40f402aefe4fe1c44a085e0c8838dafc1f27fd))
* **mobile:** grouped Mira starters and a You tab with Focus Time and rows ([ed4ebbc](https://github.com/tutur3u/platform/commit/ed4ebbc00f87d1cf6ceae910fd5d4d5733e80b46))
* **mobile:** grouped Mira starters and a You tab with Focus Time and rows ([#6898](https://github.com/tutur3u/platform/issues/6898)) ([d64bbac](https://github.com/tutur3u/platform/commit/d64bbacc324fac5662147d7a0d9892b313ae8caf))
* **mobile:** grouped task detail fields and a device Pomodoro ([4e70b9d](https://github.com/tutur3u/platform/commit/4e70b9d3296a23e9fbb3dc78ec4e31889c8efca4))
* **mobile:** grouped task detail fields and a device Pomodoro ([#6900](https://github.com/tutur3u/platform/issues/6900)) ([6b0bd0a](https://github.com/tutur3u/platform/commit/6b0bd0ab2888aac5eeea8c4d3382887b29c76f40))
* **mobile:** icon-only profile edit and a scannable timeline ([#6860](https://github.com/tutur3u/platform/issues/6860)) ([72d762f](https://github.com/tutur3u/platform/commit/72d762f310b311f50565025f2a1a3ba83059c03a))
* **mobile:** live Mastermind hub source, disk cache and refresh scheduler (PR2) ([#7086](https://github.com/tutur3u/platform/issues/7086)) ([e566eb9](https://github.com/tutur3u/platform/commit/e566eb9873728fbd0773e4221357e2129d3a076b))
* **mobile:** Mastermind app data foundation and access gate ([#7039](https://github.com/tutur3u/platform/issues/7039)) ([a4f0680](https://github.com/tutur3u/platform/commit/a4f0680818dfbf8b7969577ffdde9feffd95eb9c))
* **mobile:** Mastermind beta polish ([#7123](https://github.com/tutur3u/platform/issues/7123)) ([0e70175](https://github.com/tutur3u/platform/commit/0e70175f2c2ea7bec0a5fd9d736828b430a1e940))
* **mobile:** Mastermind UX foundation and Home redesign ([#7176](https://github.com/tutur3u/platform/issues/7176)) ([ca1a2a7](https://github.com/tutur3u/platform/commit/ca1a2a76dd197aaaed00353cf59383ab8f68f2fe))
* **mobile:** name the root tabs Mira, Inbox and You and add dock search ([a872194](https://github.com/tutur3u/platform/commit/a8721942c08a009403736ea26c2abf6bf4cf8976))
* **mobile:** name the root tabs Mira, Inbox and You and add dock search ([#6897](https://github.com/tutur3u/platform/issues/6897)) ([8542531](https://github.com/tutur3u/platform/commit/8542531f21fc114ea6ed2d3461b6233daa12435b))
* **mobile:** open the task menu on Kanban card long-press ([ad9ad42](https://github.com/tutur3u/platform/commit/ad9ad42274f8675f5d63e6365643772882faf890))
* **mobile:** open the task menu on Kanban card long-press ([#6937](https://github.com/tutur3u/platform/issues/6937)) ([ff78fca](https://github.com/tutur3u/platform/commit/ff78fca153ac26a27a9245a46445953fd19c45ce))
* **mobile:** rebuild inventory item list with scan and search ([#6976](https://github.com/tutur3u/platform/issues/6976)) ([7870512](https://github.com/tutur3u/platform/commit/787051239f9d5ea503515dd9c284002e31c65f24))
* **mobile:** redesign Mira Live around one obvious start action ([#6862](https://github.com/tutur3u/platform/issues/6862)) ([d396f6a](https://github.com/tutur3u/platform/commit/d396f6ae6da424f89523a054fcc1eddcaca8ac19))
* **mobile:** redesign the board timeline as a day agenda ([#6981](https://github.com/tutur3u/platform/issues/6981)) ([caca4bd](https://github.com/tutur3u/platform/commit/caca4bd84f2e49fab6e579a6748ed86da02329d9))
* **mobile:** redesign the Mastermind decision screen with a shared design system ([#7217](https://github.com/tutur3u/platform/issues/7217)) ([e09c59b](https://github.com/tutur3u/platform/commit/e09c59b963abdd1089943921c809625ac3ad318f))
* **mobile:** redesign the task quick actions sheet ([#6974](https://github.com/tutur3u/platform/issues/6974)) ([cb276a3](https://github.com/tutur3u/platform/commit/cb276a35afdb52e20305aa849ca9823dfa3a9229))
* **mobile:** regroup Home into Today, Up next and Calendar with workspace chips ([90fe93b](https://github.com/tutur3u/platform/commit/90fe93b7807944a072fa19a6b51e29b5897975af))
* **mobile:** regroup Home into Today, Up next and Calendar with workspace chips ([#6893](https://github.com/tutur3u/platform/issues/6893)) ([84ea920](https://github.com/tutur3u/platform/commit/84ea9204226fd545ca4acde9ab0c14d9c41dcd09))
* **mobile:** relative Mastermind times with time zone tooltip ([#7223](https://github.com/tutur3u/platform/issues/7223)) ([4e3e9ce](https://github.com/tutur3u/platform/commit/4e3e9cedcc04af307210f68d8fc890a6d5790cee))
* **mobile:** SB-100 L2 app-switcher blur and S3 constant security label ([#7240](https://github.com/tutur3u/platform/issues/7240)) ([94d82f3](https://github.com/tutur3u/platform/commit/94d82f3365ef11c2e0e048d5ec197ad8983ba764))
* **mobile:** set and clear task dates from the quick actions sheet ([#7079](https://github.com/tutur3u/platform/issues/7079)) ([7e59200](https://github.com/tutur3u/platform/commit/7e592002bac648a6c533908ee67b94f2d141b8ae))
* **mobile:** show decisions answered elsewhere ([#7211](https://github.com/tutur3u/platform/issues/7211)) ([2f00366](https://github.com/tutur3u/platform/commit/2f0036634ae4d81588a528cefa433117773a9cd1))
* **mobile:** show every Mastermind decision with lazy loading ([#7221](https://github.com/tutur3u/platform/issues/7221)) ([030231d](https://github.com/tutur3u/platform/commit/030231d8669dbdee94ab40d6ed0896e1295239bc))
* **mobile:** swipe actions and a context menu on task rows ([c6812bb](https://github.com/tutur3u/platform/commit/c6812bb9371d44cb7075480d9ccc79d4535c6313))
* **mobile:** swipe actions and a context menu on task rows ([#6882](https://github.com/tutur3u/platform/issues/6882)) ([e2a3389](https://github.com/tutur3u/platform/commit/e2a3389a44b957ef2262ba8ab28f3efd07ed0951))
* **mobile:** sync Appearance per account with a device override ([24a141a](https://github.com/tutur3u/platform/commit/24a141a81cce6e8818871eb593070b68b1b36c59))
* **mobile:** sync Appearance per account with a device override ([#6938](https://github.com/tutur3u/platform/issues/6938)) ([340ef08](https://github.com/tutur3u/platform/commit/340ef08c57fc57d457d464ac60b63e3c42042905))
* **mobile:** true activity counts and a capped Home for Mastermind ([d2e0996](https://github.com/tutur3u/platform/commit/d2e099645ca43a39f111376f8ce6115b033d823a))
* **time-tracking:** tag Pomodoro sessions and count Focus Time from them ([1fa53d2](https://github.com/tutur3u/platform/commit/1fa53d2c3f3fa68dd5219f1b43a31d0327a1c82e))
* **time-tracking:** tag Pomodoro sessions and count Focus Time from them ([#6903](https://github.com/tutur3u/platform/issues/6903)) ([783c384](https://github.com/tutur3u/platform/commit/783c38480a786e57aa9a4d70e1bf95b7e18bf19c))
* **web:** add signed Mastermind push-events route ([#7133](https://github.com/tutur3u/platform/issues/7133)) ([8416d3c](https://github.com/tutur3u/platform/commit/8416d3cb54dced26149d0d82316739cd2842fcfa))


### Fixes

* **ai:** cut Mira time to first token ([#6725](https://github.com/tutur3u/platform/issues/6725)) ([192ce93](https://github.com/tutur3u/platform/commit/192ce93c5cf7d3cf38489d6be97ab589e271778a))
* **auth:** restrict Microsoft sign-in to the staff tenant ([#7169](https://github.com/tutur3u/platform/issues/7169)) ([ae20ab4](https://github.com/tutur3u/platform/commit/ae20ab41ffd387a6d0ba45fa8d73d456445283ac))
* **desktop:** publish run-free desktop versions with structured release notes ([#7157](https://github.com/tutur3u/platform/issues/7157)) ([90643d7](https://github.com/tutur3u/platform/commit/90643d747d01672e6f3a8ccc348f26aed0586d5c))
* **mastermind:** persist mobile replies during undo ([#7208](https://github.com/tutur3u/platform/issues/7208)) ([1c1411d](https://github.com/tutur3u/platform/commit/1c1411dc46fe1f8f61580bece789ec96b28eacc1))
* **mobile:** accept CDN-weakened ETags from the Mastermind hub ([#7156](https://github.com/tutur3u/platform/issues/7156)) ([3837c57](https://github.com/tutur3u/platform/commit/3837c571b7db63e9f8846e49c775399a15186a11))
* **mobile:** accept release and quota field envelopes ([f1fb5f4](https://github.com/tutur3u/platform/commit/f1fb5f4cf87e534769f62bd1088ab960e2f78f47))
* **mobile:** annotate usage gaps and retain hub status reasons ([256ae3f](https://github.com/tutur3u/platform/commit/256ae3f6a3b48d66291acd7d70646aeab3e6dc07))
* **mobile:** consume Forge companion fields and verify publisher fixture ([41caf51](https://github.com/tutur3u/platform/commit/41caf5177023e67302e003126946c18f7e633d5d))
* **mobile:** correct Mastermind Home freshness and accessible controls ([4bcf709](https://github.com/tutur3u/platform/commit/4bcf70910140da69840d0e728d7ee6e611a60106))
* **mobile:** defer optional model recovery until after first paint ([#7203](https://github.com/tutur3u/platform/issues/7203)) ([4b7aad9](https://github.com/tutur3u/platform/commit/4b7aad99835c1015b003607614b89e3104e83758))
* **mobile:** harden Mastermind hub snapshot parsing ([#7173](https://github.com/tutur3u/platform/issues/7173)) ([b27e563](https://github.com/tutur3u/platform/commit/b27e563ccf0b52c9e84566dc5238b1ced846a244))
* **mobile:** harden release URLs, keychain class, backups and PKCE storage ([#7124](https://github.com/tutur3u/platform/issues/7124)) ([d947c18](https://github.com/tutur3u/platform/commit/d947c18d44abb936c237d7c21cdb5f15b1833005))
* **mobile:** harden secure storage adoption and session retries ([#7167](https://github.com/tutur3u/platform/issues/7167)) ([26118b8](https://github.com/tutur3u/platform/commit/26118b8b87014bb83cda0b7ad3d295183897908b))
* **mobile:** harden task-row swipes, roll back failed edits, add Start focus ([04973f8](https://github.com/tutur3u/platform/commit/04973f8fcf1d7ab23ad1c171eb89979bae817b4b))
* **mobile:** harden task-row swipes, roll back failed edits, add Start focus ([#6886](https://github.com/tutur3u/platform/issues/6886)) ([f2ab16a](https://github.com/tutur3u/platform/commit/f2ab16a81b6b122af81a075c77ec9550e168693a))
* **mobile:** keep Mastermind count tiles tappable via semantics and ignore misdated fleet points ([c05d993](https://github.com/tutur3u/platform/commit/c05d99382bc45470113fb8938a6b0cf8b4e2184f))
* **mobile:** keep the Pomodoro off manual sessions and follow resume chains ([db8c7e6](https://github.com/tutur3u/platform/commit/db8c7e6882b37faebd216f32e6983c39e18cb074))
* **mobile:** label the Kanban assign sheet Save and announce long-press ([44edf2c](https://github.com/tutur3u/platform/commit/44edf2cae74a6e5542f14c712eaa144dae8adc34))
* **mobile:** let Mastermind tile labels wrap instead of truncating ([08076c5](https://github.com/tutur3u/platform/commit/08076c57b629b0b4a104b01da37ddd213efb372e))
* **mobile:** make the device Pomodoro safe across missed phases and stale sessions ([7da4ad0](https://github.com/tutur3u/platform/commit/7da4ad05f291566c116ea8a1aa93cdf5d760e7f4))
* **mobile:** manage workspace visibility and filter Home choices ([#6978](https://github.com/tutur3u/platform/issues/6978)) ([8d625ae](https://github.com/tutur3u/platform/commit/8d625ae0a791b16db681a9ce238c66d0a8194003))
* **mobile:** migrate device storage and recover duplicate sessions ([884c9bc](https://github.com/tutur3u/platform/commit/884c9bcd20a017d42f9c955963e8d5bfaa2da483))
* **mobile:** one search action, centred Mira prompt, Profile edit button and count-chip cleanup ([#6973](https://github.com/tutur3u/platform/issues/6973)) ([7b74bb1](https://github.com/tutur3u/platform/commit/7b74bb11409df047a1e5fbac5d79e785909cb12d))
* **mobile:** parallelize independent startup init ([#7207](https://github.com/tutur3u/platform/issues/7207)) ([8d30040](https://github.com/tutur3u/platform/commit/8d30040e94bd824cdbc471e2f4c1563e46bda383))
* **mobile:** preserve running timers and focus session recovery ([8c550d7](https://github.com/tutur3u/platform/commit/8c550d76c311c54c6139e957234f0d7b757729f3))
* **mobile:** preserve sessions during keychain duplicate retries ([744c09a](https://github.com/tutur3u/platform/commit/744c09a88ab81c0d37b362740c587ff80807fb8c))
* **mobile:** prevent task estimation crashes ([#6971](https://github.com/tutur3u/platform/issues/6971)) ([bae4818](https://github.com/tutur3u/platform/commit/bae48188780882f496a7838648708f049f1c58f4))
* **mobile:** prioritize staged sessions during recovery ([7ad2b2e](https://github.com/tutur3u/platform/commit/7ad2b2e938c2516add26c911ee4828b3ffbd1f03))
* **mobile:** reconcile Mastermind decisions and explain missing data ([eae3a0c](https://github.com/tutur3u/platform/commit/eae3a0c97b5955e70268d3a165a771f589bb5f55))
* **mobile:** register push tokens only after notification permission ([#7277](https://github.com/tutur3u/platform/issues/7277)) ([b967fc7](https://github.com/tutur3u/platform/commit/b967fc7cb56c569c9d60f7c1af331da4ffc0751e))
* **mobile:** replace stale staged sessions before persisting ([e089770](https://github.com/tutur3u/platform/commit/e0897701128aadefc406dd28a2fa8e1c575d423c))
* **mobile:** restore missing pacing glyph and align reason assertions ([6aae2d6](https://github.com/tutur3u/platform/commit/6aae2d66807a245124605437a6dd4b083a50bbfc))
* **mobile:** route Mira attachments on a held chat through New chat ([#7077](https://github.com/tutur3u/platform/issues/7077)) ([d607e95](https://github.com/tutur3u/platform/commit/d607e952e72b454a5c414b6e84576201d47d9bc1))
* **mobile:** route Mira attachments on a held chat through New chat. ([d607e95](https://github.com/tutur3u/platform/commit/d607e952e72b454a5c414b6e84576201d47d9bc1))
* **mobile:** serialize Appearance uploads and seed only once per device ([af452c7](https://github.com/tutur3u/platform/commit/af452c7f484dbdfeff17bb5111aeddce20ee583a))
* **mobile:** serialize pinned workspace saves behind security checks ([#7074](https://github.com/tutur3u/platform/issues/7074)) ([4e2dc62](https://github.com/tutur3u/platform/commit/4e2dc62d67b40a60b35d5122e1bd423540370dc2))
* **mobile:** stack mastermind segments instead of scrolling at large text ([85959dd](https://github.com/tutur3u/platform/commit/85959ddda4d86bdc311d2fa0f026a4e092197661))
* **mobile:** stop Mira chat scroll teleport and clear the composer on send ([#6734](https://github.com/tutur3u/platform/issues/6734)) ([e3c0770](https://github.com/tutur3u/platform/commit/e3c07706c3b30d229548a1ffa0e179c95d5aa89e))
* **mobile:** tolerate hub additions and preserve dock clearance ([ada4823](https://github.com/tutur3u/platform/commit/ada4823ccf962a50078a6de3a0f74dc1208d8a97))
* **mobile:** trim bundle weight ([#7212](https://github.com/tutur3u/platform/issues/7212)) ([0af4cfe](https://github.com/tutur3u/platform/commit/0af4cfeda0afb9e982dea2ab94c23a466748e335))
* **mobile:** type the glass benchmark list key ([0dede00](https://github.com/tutur3u/platform/commit/0dede00ec299485e48b24e25da9625bdc5dded65))
* **mobile:** upload Mira attachments into the selected chat's store ([#6724](https://github.com/tutur3u/platform/issues/6724)) ([2109920](https://github.com/tutur3u/platform/commit/21099205486b88ca5aa9562071eab3e04dd7877b))
* **time-tracking:** bound tagged stats, refuse tags on manual entries, migrate legacy Pomodoro state ([195c85c](https://github.com/tutur3u/platform/commit/195c85c41589a3bd451735f625b69daab4895e3f))
* **time-tracking:** bound tagged stats, refuse tags on manual entries, migrate legacy Pomodoro state ([#6905](https://github.com/tutur3u/platform/issues/6905)) ([a4ecda3](https://github.com/tutur3u/platform/commit/a4ecda3b69c763430ef59ea98674306383e31ffa))
</details>

<details><summary>nova: 0.43.0</summary>

## [0.43.0](https://github.com/tutur3u/platform/compare/nova-v0.42.2...nova-v0.43.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))


### Bug Fixes

* **abuse-guard:** enforce durable command fairness ([#6865](https://github.com/tutur3u/platform/issues/6865)) ([1c44022](https://github.com/tutur3u/platform/commit/1c440227fb512187bb98dddf00b92c7127078e04))
* **auth:** scope challenge and participant management ([#7026](https://github.com/tutur3u/platform/issues/7026)) ([0991afe](https://github.com/tutur3u/platform/commit/0991afedb1757203fb4d95496e2cc034df6aa4fc))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>playground: 0.6.2</summary>

## [0.6.2](https://github.com/tutur3u/platform/compare/playground-v0.6.1...playground-v0.6.2) (2026-10-30)


### Bug Fixes

* **playground:** require a signed-in staff session for AI routes and pages ([#7215](https://github.com/tutur3u/platform/issues/7215)) ([e4e42e0](https://github.com/tutur3u/platform/commit/e4e42e06ca651b9838e06248f9ad4add952768d0))
</details>

<details><summary>rewise: 0.46.0</summary>

## [0.46.0](https://github.com/tutur3u/platform/compare/rewise-v0.45.0...rewise-v0.46.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **storage:** least-privilege path-scoped RLS for workspace storage ([#6879](https://github.com/tutur3u/platform/issues/6879)) ([93b3e81](https://github.com/tutur3u/platform/commit/93b3e81bbdbab087d61d699269d696cd194aa6c5))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>tasks: 0.41.0</summary>

## [0.41.0](https://github.com/tutur3u/platform/compare/tasks-v0.40.0...tasks-v0.41.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **tasks:** seal the native artifact, gate signed-in root SSR, keep the exact offline fallback ([#6849](https://github.com/tutur3u/platform/issues/6849)) ([174d4b9](https://github.com/tutur3u/platform/commit/174d4b97e73104fa1803ff71746d67121d318acd))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **api:** align export and satellite request boundaries ([#7021](https://github.com/tutur3u/platform/issues/7021)) ([73a876a](https://github.com/tutur3u/platform/commit/73a876aaa7f13eceb13b6e6946e61d8323b1cf10))
* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **database:** align time-tracking and task RPC permissions ([#7000](https://github.com/tutur3u/platform/issues/7000)) ([6730c79](https://github.com/tutur3u/platform/commit/6730c798f17be276dc3f1fe8efd60306a84b66f3))
* **infrastructure:** align secret and role permission access ([#7013](https://github.com/tutur3u/platform/issues/7013)) ([4917e16](https://github.com/tutur3u/platform/commit/4917e16567f3b348ace0159d6cc982be50b9a8b7))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **tasks:** complete guest board test auth fixture ([#7225](https://github.com/tutur3u/platform/issues/7225)) ([84827c6](https://github.com/tutur3u/platform/commit/84827c6b492c81a942fca43ca2ab170890f0b554))
* **tasks:** limit project update attachment links to 15 minutes ([#6850](https://github.com/tutur3u/platform/issues/6850)) ([7e0f08c](https://github.com/tutur3u/platform/commit/7e0f08c25c9a8ffb38f85d2cfaa16873895857f5))
* **tasks:** restrict task list writes to authorized members ([#7125](https://github.com/tutur3u/platform/issues/7125)) ([f6d616f](https://github.com/tutur3u/platform/commit/f6d616f14bdbd76a215bca76fdfcda995cf356e8))
* **tasks:** scope board capacity rules and public-link writes (SR-229) ([#7060](https://github.com/tutur3u/platform/issues/7060)) ([cda3344](https://github.com/tutur3u/platform/commit/cda3344e084e4f95a7a2d66aab3817d93104518e))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>teach: 0.29.0</summary>

## [0.29.0](https://github.com/tutur3u/platform/compare/teach-v0.28.0...teach-v0.29.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))


### Bug Fixes

* align main unit fixtures with authorization and app inventory ([#7265](https://github.com/tutur3u/platform/issues/7265)) ([0eb1e3a](https://github.com/tutur3u/platform/commit/0eb1e3a8d350c5179bfaad63fc7281bfd47ebbf8))
* **education:** scope learner and teacher resource access ([#7017](https://github.com/tutur3u/platform/issues/7017)) ([5942601](https://github.com/tutur3u/platform/commit/59426011aafb60ec51da42f6feb95872834acc60))
* **education:** validate test courses and quiz destinations ([#7020](https://github.com/tutur3u/platform/issues/7020)) ([8535738](https://github.com/tutur3u/platform/commit/8535738863df43f37c64eb8348a9a02377b6308a))
* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* **teach:** enforce page-level workspace membership ([#7098](https://github.com/tutur3u/platform/issues/7098)) ([77f5869](https://github.com/tutur3u/platform/commit/77f58694876e8320dcf38789f4b0ba2c5725589a))
* **teach:** scope module pages to the workspace (F8) ([#7082](https://github.com/tutur3u/platform/issues/7082)) ([7925a33](https://github.com/tutur3u/platform/commit/7925a33d05070f6eea74adacc1dd728b301df31d))
* **teach:** scope quiz set and module reads to the route workspace ([#7078](https://github.com/tutur3u/platform/issues/7078)) ([4be48e4](https://github.com/tutur3u/platform/commit/4be48e41cf255f59f06586b069102cc52b015a1c))
* **teach:** scope quiz-set module link to the route workspace ([#7067](https://github.com/tutur3u/platform/issues/7067)) ([2a7cefb](https://github.com/tutur3u/platform/commit/2a7cefbe3911e75077bdc9e6659df479097184f4))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
</details>

<details><summary>contacts: 0.30.0</summary>

## [0.30.0](https://github.com/tutur3u/platform/compare/contacts-v0.29.0...contacts-v0.30.0) (2026-10-30)


### Features

* **contacts:** add default-off Start candidate ([#7120](https://github.com/tutur3u/platform/issues/7120)) ([9a7795d](https://github.com/tutur3u/platform/commit/9a7795d2036bb1be9c346b3461abeef8f4eb0642))
* **contacts:** add teacher topic form and supervisor assignment ([de3c4e1](https://github.com/tutur3u/platform/commit/de3c4e1c9e58cf783be53638dcd1136a910fef74))
* **contacts:** add teacher topic form and supervisor assignment ([#6929](https://github.com/tutur3u/platform/issues/6929)) ([2ef4ddc](https://github.com/tutur3u/platform/commit/2ef4ddce414748093bba366211698ab4f9fc5385))
* **contacts:** assign tutoring shifts to class groups ([#6895](https://github.com/tutur3u/platform/issues/6895)) ([6054729](https://github.com/tutur3u/platform/commit/60547296d963cc9955c53654569e06f79a32a5e9))
* **contacts:** keep make-up tutoring content linked to lesson notes ([6c3186d](https://github.com/tutur3u/platform/commit/6c3186d2331350401e3e06a5269b15a0844e7d29))
* **contacts:** keep make-up tutoring content linked to lesson notes ([#6907](https://github.com/tutur3u/platform/issues/6907)) ([2fb0e9f](https://github.com/tutur3u/platform/commit/2fb0e9ff9ac1ed4f65a09ce4137d7741eb7a4633))
* **contacts:** label weak-support tutoring content and add Thoát kèm ([#6911](https://github.com/tutur3u/platform/issues/6911)) ([83dce34](https://github.com/tutur3u/platform/commit/83dce344854b7bc3334581504fc325aefbb111af))
* **contacts:** monthly GVNN schedule editor with month clone ([#6927](https://github.com/tutur3u/platform/issues/6927)) ([13c4e0b](https://github.com/tutur3u/platform/commit/13c4e0b43cdc20a4566187386a8eecf21157a79b))
* **contacts:** pick an existing topic contact in the add-contact form ([#7047](https://github.com/tutur3u/platform/issues/7047)) ([f025e29](https://github.com/tutur3u/platform/commit/f025e290bbf0acd7ede7554876dc2a1f8ff18dd1))
* **contacts:** show teacher topic UI only with teacher assignments on ([26c6a0b](https://github.com/tutur3u/platform/commit/26c6a0b462353c419d634018ba03e31b9c56242e))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([3cb09f3](https://github.com/tutur3u/platform/commit/3cb09f3896307385fbeaf4cfbcc3320d7e77d8a5))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **topic-announcements:** gate teacher assignments behind a workspace flag ([8252f98](https://github.com/tutur3u/platform/commit/8252f98a107e27d7ecb1605cb39793256fa9c406))
* **tutoring:** add workspace campus list and announcement place picker ([#7049](https://github.com/tutur3u/platform/issues/7049)) ([9ae0a76](https://github.com/tutur3u/platform/commit/9ae0a76828670c29cbdce07638d0213324453a6d))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([5b52e01](https://github.com/tutur3u/platform/commit/5b52e018e1789d47ea2fbab7d85be3a3ec48e4cc))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([9eb14a6](https://github.com/tutur3u/platform/commit/9eb14a6c62076e5f59d5f412a504833e58a81bb6))
* **tutoring:** tutor groups for the policy, teacher picker and queues ([#7054](https://github.com/tutur3u/platform/issues/7054)) ([5298df0](https://github.com/tutur3u/platform/commit/5298df043e186f242d660b018d0003f608ec04a8))


### Bug Fixes

* **contacts:** block unverified topic sends without losing the draft ([#6923](https://github.com/tutur3u/platform/issues/6923)) ([184bcf3](https://github.com/tutur3u/platform/commit/184bcf3b9d1c2fb5400adca2d0834cd9edcb5172))
* **contacts:** bound linked-content freeze and warn when it fails ([#6919](https://github.com/tutur3u/platform/issues/6919)) ([841dad8](https://github.com/tutur3u/platform/commit/841dad85aeade756e8acd0aabcfdb842344d45d4))
* **contacts:** GVNN schedule notify teachers, swap race and unsaved-changes guard ([#6966](https://github.com/tutur3u/platform/issues/6966)) ([429bcb3](https://github.com/tutur3u/platform/commit/429bcb30bb03f082c523e8f06c5f3b8c493ac2f4))
* **contacts:** prevent duplicate topics and attachments, search teachers ([f7e2ce2](https://github.com/tutur3u/platform/commit/f7e2ce2bf0bc122d8bda75cd54dac8abee17b7df))
* **contacts:** restore proxied topic APIs and schedule navigation ([#6967](https://github.com/tutur3u/platform/issues/6967)) ([ef0f982](https://github.com/tutur3u/platform/commit/ef0f982a50a67beaf95e32375ced01eeae2f67dc))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([16e8ff6](https://github.com/tutur3u/platform/commit/16e8ff65880be827c4c2dc03e7cc186b0b2c7724))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([f913a3c](https://github.com/tutur3u/platform/commit/f913a3c012ba38211e05c6a98692e8d1c7ccc04a))
* **tutoring:** default the schedule teacher picker to tutor groups ([#7172](https://github.com/tutur3u/platform/issues/7172)) ([8e7f682](https://github.com/tutur3u/platform/commit/8e7f6820cd082c95bf129211558b35511c30a0cd))
* **tutoring:** let one teacher tutor many learners in a shared slot ([#7255](https://github.com/tutur3u/platform/issues/7255)) ([daf6835](https://github.com/tutur3u/platform/commit/daf6835daade9216a16efc177a4e8dab6ab0919e))
* **tutoring:** list learners under current classes and needs-tutoring groups ([#7257](https://github.com/tutur3u/platform/issues/7257)) ([07c85f4](https://github.com/tutur3u/platform/commit/07c85f41c16c9ac86ea3afa5710c93bf934454b0))
* **tutoring:** repeat every selected weekday ([#7109](https://github.com/tutur3u/platform/issues/7109)) ([82fa151](https://github.com/tutur3u/platform/commit/82fa1519939842bb3d4596c89f07f4152f1e6811))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([f029cf6](https://github.com/tutur3u/platform/commit/f029cf6dad6ef202ddd43aefdc15014dbb9eb4bc))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **tutoring:** teach the right content for absent, weak and both rows. ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **users:** tighten workspace read scoping and permissions ([#6979](https://github.com/tutur3u/platform/issues/6979)) ([f720f64](https://github.com/tutur3u/platform/commit/f720f64bc07ad85ec2e41c69d8ead1e342d9d802))
</details>

<details><summary>forms: 0.21.0</summary>

## [0.21.0](https://github.com/tutur3u/platform/compare/forms-v0.20.0...forms-v0.21.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **forms:** qualify the native root Worker ([#6858](https://github.com/tutur3u/platform/issues/6858)) ([d801dd9](https://github.com/tutur3u/platform/commit/d801dd9491ffa8ebc8594e518ab79cf3f4e6adbe))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **cms:** align form and content workspace permissions ([#7023](https://github.com/tutur3u/platform/issues/7023)) ([798d418](https://github.com/tutur3u/platform/commit/798d4189a31e2bacd66c49ce60d21c3b83241411))
* **forms:** align definition and media workspace access ([#7015](https://github.com/tutur3u/platform/issues/7015)) ([98a5757](https://github.com/tutur3u/platform/commit/98a57572ce4e99b3b5240245c1577875a85de88b))
* **forms:** scope share-link lookup to the resolved workspace ([#7065](https://github.com/tutur3u/platform/issues/7065)) ([869062d](https://github.com/tutur3u/platform/commit/869062d27200a075ba1afe112c0ae0ca2ac05661))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>git: 0.16.0</summary>

## [0.16.0](https://github.com/tutur3u/platform/compare/git-v0.15.0...git-v0.16.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>track: 0.32.0</summary>

## [0.32.0](https://github.com/tutur3u/platform/compare/track-v0.31.0...track-v0.32.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **time-tracking:** validate request task, category and linked-session scope ([#7068](https://github.com/tutur3u/platform/issues/7068)) ([716b49f](https://github.com/tutur3u/platform/commit/716b49f97999af4df1f20cc97214385e6e3f4f7d))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>start-bridge: 0.2.0</summary>

## [0.2.0](https://github.com/tutur3u/platform/compare/start-bridge-v0.1.0...start-bridge-v0.2.0) (2026-10-30)


### Features

* **auth:** add a framework-free CSRF check in report mode ([#6847](https://github.com/tutur3u/platform/issues/6847)) ([23ce8a3](https://github.com/tutur3u/platform/commit/23ce8a3c18dd293d76ba60051216a49e5ecc15a3))
* **contacts:** add default-off Start candidate ([#7120](https://github.com/tutur3u/platform/issues/7120)) ([9a7795d](https://github.com/tutur3u/platform/commit/9a7795d2036bb1be9c346b3461abeef8f4eb0642))
* **start-bridge:** shared root response policy (wrapResponse), safe failures and a runtime policy gate ([#6826](https://github.com/tutur3u/platform/issues/6826)) ([10e1778](https://github.com/tutur3u/platform/commit/10e17784ef192cb5ef65eee2b38c9b9cab738a0d))


### Bug Fixes

* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
</details>

<details><summary>ai: 0.19.0</summary>

## [0.19.0](https://github.com/tutur3u/platform/compare/ai-v0.18.3...ai-v0.19.0) (2026-10-30)


### Features

* **ai:** add private Meet transcription evaluation harness ([#7269](https://github.com/tutur3u/platform/issues/7269)) ([28a5503](https://github.com/tutur3u/platform/commit/28a5503f53655583230e95046869485012a72575))
* **meet:** improve transcription quality and support solo meetings ([#7267](https://github.com/tutur3u/platform/issues/7267)) ([ecc5e53](https://github.com/tutur3u/platform/commit/ecc5e53bfa6423ddbd9aaf789e6779c551064eab))
* **ops:** add resumable storage re-key tool for leaked signed URLs ([#6890](https://github.com/tutur3u/platform/issues/6890)) ([2f88257](https://github.com/tutur3u/platform/commit/2f88257b224ee70b783c4cf5ad8432e675e4e347))


### Bug Fixes

* **ai:** accept only user and assistant chat input from clients ([#7139](https://github.com/tutur3u/platform/issues/7139)) ([3d6d542](https://github.com/tutur3u/platform/commit/3d6d54204c6b557ecb5a44c05c3e5d5fabf235cd))
* **ai:** read evaluation inputs through one file handle ([#7280](https://github.com/tutur3u/platform/issues/7280)) ([c77068a](https://github.com/tutur3u/platform/commit/c77068a7515a21adfbe1fa42a6586c7113228982))
* **ai:** validate public request admission before workspace lookups ([#7027](https://github.com/tutur3u/platform/issues/7027)) ([c969617](https://github.com/tutur3u/platform/commit/c96961748c672c2ca588c9a499a253a3f58a0f82))
* **ai:** validate public request admission before workspace lookups. ([c969617](https://github.com/tutur3u/platform/commit/c96961748c672c2ca588c9a499a253a3f58a0f82))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **infrastructure:** align secret and role permission access ([#7013](https://github.com/tutur3u/platform/issues/7013)) ([4917e16](https://github.com/tutur3u/platform/commit/4917e16567f3b348ace0159d6cc982be50b9a8b7))
* **integrations:** align AI and project request authorization ([#7012](https://github.com/tutur3u/platform/issues/7012)) ([606e882](https://github.com/tutur3u/platform/commit/606e882bb3c44f39eb7277f4a9701acc492a025b))
* **mobile:** upload Mira attachments into the selected chat's store ([#6724](https://github.com/tutur3u/platform/issues/6724)) ([2109920](https://github.com/tutur3u/platform/commit/21099205486b88ca5aa9562071eab3e04dd7877b))
* **storage:** cap Mira tool signed URLs and harden the share redirect ([b391ea2](https://github.com/tutur3u/platform/commit/b391ea2943fae9bb8f1d1bb5f32f23e087e6d1e0))
* **storage:** cap signed URL lifetimes and sign stored media on read ([#6887](https://github.com/tutur3u/platform/issues/6887)) ([b08e0e4](https://github.com/tutur3u/platform/commit/b08e0e4f1afb6ef069d01c4f725cc07178bbfdcc))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))


### Performance Improvements

* **ai:** cut Mira time to first token ([#6725](https://github.com/tutur3u/platform/issues/6725)) ([192ce93](https://github.com/tutur3u/platform/commit/192ce93c5cf7d3cf38489d6be97ab589e271778a))
</details>

<details><summary>apis: 0.13.2</summary>

## [0.13.2](https://github.com/tutur3u/platform/compare/apis-v0.13.1...apis-v0.13.2) (2026-10-30)


### Bug Fixes

* **api:** align user group workspace scoping ([#7001](https://github.com/tutur3u/platform/issues/7001)) ([7c7ec6e](https://github.com/tutur3u/platform/commit/7c7ec6ea248d9a3fdb7aabf9e64fbda1933ad321))
* **auth:** scope challenge and participant management ([#7026](https://github.com/tutur3u/platform/issues/7026)) ([0991afe](https://github.com/tutur3u/platform/commit/0991afedb1757203fb4d95496e2cc034df6aa4fc))
* **finance:** align workspace scoping for finance routes ([#7029](https://github.com/tutur3u/platform/issues/7029)) ([2ba27b9](https://github.com/tutur3u/platform/commit/2ba27b96035bbd43288b6c3de1e9ca9909b9243a))
* **finance:** scope categories and transaction access to the workspace ([#7150](https://github.com/tutur3u/platform/issues/7150)) ([f08c4ea](https://github.com/tutur3u/platform/commit/f08c4ead35be9b81465de2505121de003285f651))
* **meet:** align guest and poll plan access ([#7010](https://github.com/tutur3u/platform/issues/7010)) ([3848203](https://github.com/tutur3u/platform/commit/38482031cb31370266617da264d71bea61a48acb))
* **meet:** apply anonymous plan access to guest availability writes ([#7064](https://github.com/tutur3u/platform/issues/7064)) ([019d52d](https://github.com/tutur3u/platform/commit/019d52d2f27f2c37c96ca967ff9edc56d12e00c8))
* **meet:** apply anonymous plan access to guest availability writes. ([019d52d](https://github.com/tutur3u/platform/commit/019d52d2f27f2c37c96ca967ff9edc56d12e00c8))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **members:** normalize targets before access changes ([#7005](https://github.com/tutur3u/platform/issues/7005)) ([9d870f6](https://github.com/tutur3u/platform/commit/9d870f62769d8941695eff1ca07d68714abc171a))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
</details>

<details><summary>auth: 0.8.0</summary>

## [0.8.0](https://github.com/tutur3u/platform/compare/auth-v0.7.0...auth-v0.8.0) (2026-10-30)


### Features

* **auth:** add a framework-free CSRF check in report mode ([#6847](https://github.com/tutur3u/platform/issues/6847)) ([23ce8a3](https://github.com/tutur3u/platform/commit/23ce8a3c18dd293d76ba60051216a49e5ecc15a3))
* **finance:** brand reconciliation money and test token bounds ([#6873](https://github.com/tutur3u/platform/issues/6873)) ([63417bb](https://github.com/tutur3u/platform/commit/63417bb06522ed9c64cc6ecc06cb0a9a881a88e2))


### Bug Fixes

* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** revoke cross-app tokens on logout and password change ([#6839](https://github.com/tutur3u/platform/issues/6839)) ([091c3dd](https://github.com/tutur3u/platform/commit/091c3dda067db3e8c3459b041dcb2a5b4f85bd2e))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **e2e:** collect Playwright specs and keep shared localhost sessions ([#7163](https://github.com/tutur3u/platform/issues/7163)) ([35b2963](https://github.com/tutur3u/platform/commit/35b2963c77ddc5207f6fa778f9d40dc997af2a50))


### Performance Improvements

* **auth:** verify the request user once across refresh, guard and MFA ([#7153](https://github.com/tutur3u/platform/issues/7153)) ([959206e](https://github.com/tutur3u/platform/commit/959206efa1b1b686c75a1d17eade931519e8729f))
</details>

<details><summary>education-core: 0.5.1</summary>

## [0.5.1](https://github.com/tutur3u/platform/compare/education-core-v0.5.0...education-core-v0.5.1) (2026-10-30)


### Bug Fixes

* **learn:** require parent consent for Tulearn parent links (SR-238) ([#7062](https://github.com/tutur3u/platform/issues/7062)) ([b085a0e](https://github.com/tutur3u/platform/commit/b085a0e331aa758fd1e8f490df284b6bf22ed63a))
* **teach:** enforce page-level workspace membership ([#7098](https://github.com/tutur3u/platform/issues/7098)) ([77f5869](https://github.com/tutur3u/platform/commit/77f58694876e8320dcf38789f4b0ba2c5725589a))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
</details>

<details><summary>internal-api: 0.56.0</summary>

## [0.56.0](https://github.com/tutur3u/platform/compare/internal-api-v0.55.0...internal-api-v0.56.0) (2026-10-30)


### Features

* **contacts:** assign tutoring shifts to class groups ([#6895](https://github.com/tutur3u/platform/issues/6895)) ([6054729](https://github.com/tutur3u/platform/commit/60547296d963cc9955c53654569e06f79a32a5e9))
* **contacts:** keep make-up tutoring content linked to lesson notes ([6c3186d](https://github.com/tutur3u/platform/commit/6c3186d2331350401e3e06a5269b15a0844e7d29))
* **contacts:** keep make-up tutoring content linked to lesson notes ([#6907](https://github.com/tutur3u/platform/issues/6907)) ([2fb0e9f](https://github.com/tutur3u/platform/commit/2fb0e9ff9ac1ed4f65a09ce4137d7741eb7a4633))
* **contacts:** label weak-support tutoring content and add Thoát kèm ([#6911](https://github.com/tutur3u/platform/issues/6911)) ([83dce34](https://github.com/tutur3u/platform/commit/83dce344854b7bc3334581504fc325aefbb111af))
* **contacts:** monthly GVNN schedule editor with month clone ([#6927](https://github.com/tutur3u/platform/issues/6927)) ([13c4e0b](https://github.com/tutur3u/platform/commit/13c4e0b43cdc20a4566187386a8eecf21157a79b))
* **topic-announcements:** add teacher-scoped access and send deadline ([3cb09f3](https://github.com/tutur3u/platform/commit/3cb09f3896307385fbeaf4cfbcc3320d7e77d8a5))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **tutoring:** add workspace campus list and announcement place picker ([#7049](https://github.com/tutur3u/platform/issues/7049)) ([9ae0a76](https://github.com/tutur3u/platform/commit/9ae0a76828670c29cbdce07638d0213324453a6d))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([5b52e01](https://github.com/tutur3u/platform/commit/5b52e018e1789d47ea2fbab7d85be3a3ec48e4cc))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([9eb14a6](https://github.com/tutur3u/platform/commit/9eb14a6c62076e5f59d5f412a504833e58a81bb6))
* **tutoring:** tutor groups for the policy, teacher picker and queues ([#7054](https://github.com/tutur3u/platform/issues/7054)) ([5298df0](https://github.com/tutur3u/platform/commit/5298df043e186f242d660b018d0003f608ec04a8))


### Bug Fixes

* **ai:** sign Mira generated images on read in chat history ([#6896](https://github.com/tutur3u/platform/issues/6896)) ([64da5ce](https://github.com/tutur3u/platform/commit/64da5ce3bc0ba345ae08261a3fec2b2af77504ea))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **contacts:** block unverified topic sends without losing the draft ([#6923](https://github.com/tutur3u/platform/issues/6923)) ([184bcf3](https://github.com/tutur3u/platform/commit/184bcf3b9d1c2fb5400adca2d0834cd9edcb5172))
* **contacts:** bound linked-content freeze and warn when it fails ([#6919](https://github.com/tutur3u/platform/issues/6919)) ([841dad8](https://github.com/tutur3u/platform/commit/841dad85aeade756e8acd0aabcfdb842344d45d4))
* **contacts:** English center tutoring defaults to one session, three-day follow-up ([#6906](https://github.com/tutur3u/platform/issues/6906)) ([8ce9380](https://github.com/tutur3u/platform/commit/8ce93809bad90473bb90cb83df0e5ca8bdfba05e))
* **contacts:** GVNN schedule notify teachers, swap race and unsaved-changes guard ([#6966](https://github.com/tutur3u/platform/issues/6966)) ([429bcb3](https://github.com/tutur3u/platform/commit/429bcb30bb03f082c523e8f06c5f3b8c493ac2f4))
* **drive:** expire and revoke export links ([#7140](https://github.com/tutur3u/platform/issues/7140)) ([307f08f](https://github.com/tutur3u/platform/commit/307f08fee6ded7b19fe61901390afa45c33d5dce))
* **education:** scope learner and teacher resource access ([#7017](https://github.com/tutur3u/platform/issues/7017)) ([5942601](https://github.com/tutur3u/platform/commit/59426011aafb60ec51da42f6feb95872834acc60))
* **learn:** require parent consent for Tulearn parent links (SR-238) ([#7062](https://github.com/tutur3u/platform/issues/7062)) ([b085a0e](https://github.com/tutur3u/platform/commit/b085a0e331aa758fd1e8f490df284b6bf22ed63a))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([16e8ff6](https://github.com/tutur3u/platform/commit/16e8ff65880be827c4c2dc03e7cc186b0b2c7724))
* **tutoring:** allow learners to share a teacher group slot ([#7222](https://github.com/tutur3u/platform/issues/7222)) ([f913a3c](https://github.com/tutur3u/platform/commit/f913a3c012ba38211e05c6a98692e8d1c7ccc04a))
* **tutoring:** let one teacher tutor many learners in a shared slot ([#7255](https://github.com/tutur3u/platform/issues/7255)) ([daf6835](https://github.com/tutur3u/platform/commit/daf6835daade9216a16efc177a4e8dab6ab0919e))
* **tutoring:** list learners under current classes and needs-tutoring groups ([#7257](https://github.com/tutur3u/platform/issues/7257)) ([07c85f4](https://github.com/tutur3u/platform/commit/07c85f41c16c9ac86ea3afa5710c93bf934454b0))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([f029cf6](https://github.com/tutur3u/platform/commit/f029cf6dad6ef202ddd43aefdc15014dbb9eb4bc))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **tutoring:** teach the right content for absent, weak and both rows. ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **workspace:** surface deletion failures and preserve confirmation ([#6969](https://github.com/tutur3u/platform/issues/6969)) ([a6af584](https://github.com/tutur3u/platform/commit/a6af584903a4741934e023776d90bc50667c1a33))
</details>

<details><summary>inventory-core: 0.11.2</summary>

## [0.11.2](https://github.com/tutur3u/platform/compare/inventory-core-v0.11.1...inventory-core-v0.11.2) (2026-10-30)


### Bug Fixes

* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* restore main type check (meet fixture, track request routes) ([#7232](https://github.com/tutur3u/platform/issues/7232)) ([4fa1436](https://github.com/tutur3u/platform/commit/4fa143673a92161f31b4c300f774ebcbbdef468f))
</details>

<details><summary>legal: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/legal-v0.3.1...legal-v0.4.0) (2026-10-30)


### Features

* **legal:** redesign What changed with a gated bilingual notice ([#7228](https://github.com/tutur3u/platform/issues/7228)) ([e92a6e4](https://github.com/tutur3u/platform/commit/e92a6e4682fbbf266ec51eff26d91a3309ad6d0a))


### Bug Fixes

* **legal:** keep safety rules in the proposed AUP and community policies ([#7226](https://github.com/tutur3u/platform/issues/7226)) ([8ffeeef](https://github.com/tutur3u/platform/commit/8ffeeef8bc996b1997a46047e322f86885438c6c))
* **legal:** restore the in-force legal documents and separate proposed changes ([#7220](https://github.com/tutur3u/platform/issues/7220)) ([e035fa9](https://github.com/tutur3u/platform/commit/e035fa9c54d79b7766cd8d4c053b2f739d4d0ff4))
* **legal:** restore the in-force legal documents and separate proposed changes ([#7220](https://github.com/tutur3u/platform/issues/7220)) ([aba1e25](https://github.com/tutur3u/platform/commit/aba1e250d7bcd08ae2ead0417e6816f8c97d2ae6))
</details>

<details><summary>realtime: 0.11.0</summary>

## [0.11.0](https://github.com/tutur3u/platform/compare/realtime-v0.10.2...realtime-v0.11.0) (2026-10-30)


### Features

* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
</details>

<details><summary>satellite: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/satellite-v0.26.0...satellite-v0.27.0) (2026-10-30)


### Features

* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))


### Bug Fixes

* **ui:** start satellite sidebar closed on mobile ([#7161](https://github.com/tutur3u/platform/issues/7161)) ([d1f4824](https://github.com/tutur3u/platform/commit/d1f482417c36bdf0c0bd179e2a7af6a63537b968))
</details>

<details><summary>sdk: 0.29.1</summary>

## [0.29.1](https://github.com/tutur3u/platform/compare/sdk-v0.29.0...sdk-v0.29.1) (2026-10-30)


### Bug Fixes

* **cli:** reject unsupported upgrade arguments before installation ([#6773](https://github.com/tutur3u/platform/issues/6773)) ([62f9db7](https://github.com/tutur3u/platform/commit/62f9db75298d454032554c3d0602a7547d294d57))
* **sdk:** approve storage export links portable source ([#7154](https://github.com/tutur3u/platform/issues/7154)) ([8b60602](https://github.com/tutur3u/platform/commit/8b60602fd58b894a6bc5af3db8920676da1183ec))
* **sdk:** make resource host tests deterministic ([#6870](https://github.com/tutur3u/platform/issues/6870)) ([b52f17b](https://github.com/tutur3u/platform/commit/b52f17b64433e897d85912194edb108f4a4c7eea))
</details>

<details><summary>storage-core: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/storage-core-v0.3.3...storage-core-v0.4.0) (2026-10-30)


### Features

* **storage:** app-side storage access audit log ([#6891](https://github.com/tutur3u/platform/issues/6891)) ([57cc3f1](https://github.com/tutur3u/platform/commit/57cc3f1750a94890f55a9b33496a1694c11c1888))


### Bug Fixes

* **ai:** sign Mira generated images on read in chat history ([#6896](https://github.com/tutur3u/platform/issues/6896)) ([64da5ce](https://github.com/tutur3u/platform/commit/64da5ce3bc0ba345ae08261a3fec2b2af77504ea))
* **drive:** expire and revoke export links ([#7140](https://github.com/tutur3u/platform/issues/7140)) ([307f08f](https://github.com/tutur3u/platform/commit/307f08fee6ded7b19fe61901390afa45c33d5dce))
* **storage:** cap signed URL lifetimes and sign stored media on read ([#6887](https://github.com/tutur3u/platform/issues/6887)) ([b08e0e4](https://github.com/tutur3u/platform/commit/b08e0e4f1afb6ef069d01c4f725cc07178bbfdcc))
* **storage:** enforce bucket RLS rules in AI chat file read routes ([#6881](https://github.com/tutur3u/platform/issues/6881)) ([6609697](https://github.com/tutur3u/platform/commit/66096974e08e366a6591ba3f1f9e358ffdb394ce))
* **storage:** isolate private chat attachments from Drive ([#6876](https://github.com/tutur3u/platform/issues/6876)) ([bedddc3](https://github.com/tutur3u/platform/commit/bedddc33bfb08a3af7a8fe75c08a0272b20cc40d))
* **storage:** make topic-announcements a service-role-only storage root ([ae4e091](https://github.com/tutur3u/platform/commit/ae4e091fa2578059e202f16f355f1b5bfd38fc48))
* **storage:** make topic-announcements a service-role-only storage root ([#6920](https://github.com/tutur3u/platform/issues/6920)) ([3ca84b0](https://github.com/tutur3u/platform/commit/3ca84b00fed1221b65103025dad856b4c1aad55b))
* **storage:** match Drive private roots case-insensitively ([#7084](https://github.com/tutur3u/platform/issues/7084)) ([85b61bb](https://github.com/tutur3u/platform/commit/85b61bb064adb66876fd9e993b8e8f0617fa5f25))
* **storage:** short-lived signed URLs and sign-on-read for stored media ([b235bdb](https://github.com/tutur3u/platform/commit/b235bdbdb84198ebaf1e58a6c2e29d216f113fcf))
</details>

<details><summary>supabase: 0.6.1</summary>

## [0.6.1](https://github.com/tutur3u/platform/compare/supabase-v0.6.0...supabase-v0.6.1) (2026-10-30)


### Bug Fixes

* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
</details>

<details><summary>tasks-api: 0.5.3</summary>

## [0.5.3](https://github.com/tutur3u/platform/compare/tasks-api-v0.5.2...tasks-api-v0.5.3) (2026-10-30)


### Bug Fixes

* **auth:** align verified account email handling ([#7007](https://github.com/tutur3u/platform/issues/7007)) ([5f47957](https://github.com/tutur3u/platform/commit/5f47957d2c2053d3281866ba45e76fb5fdb1f356))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))
</details>

<details><summary>tasks-ui: 0.18.0</summary>

## [0.18.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.17.3...tasks-ui-v0.18.0) (2026-10-30)


### Features

* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))


### Bug Fixes

* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))
</details>

<details><summary>types: 0.38.0</summary>

## [0.38.0](https://github.com/tutur3u/platform/compare/types-v0.37.0...types-v0.38.0) (2026-10-30)


### Features

* **ai:** create Mira chat with the first message ([#6765](https://github.com/tutur3u/platform/issues/6765)) ([aae4d08](https://github.com/tutur3u/platform/commit/aae4d088b0225d428bce41153bac7cf204d5a8dd))
* **database:** add topic announcement teacher assignment schema ([24ad041](https://github.com/tutur3u/platform/commit/24ad04103ecce259beb379cb2a92dce31aa9c5ee))
* **database:** add topic announcement teacher assignment schema ([#6924](https://github.com/tutur3u/platform/issues/6924)) ([cf6a18d](https://github.com/tutur3u/platform/commit/cf6a18d3cfa33d5cc5b93a673613038e347be827))
* **database:** add topic teacher deadline notice types and receipts ([#6975](https://github.com/tutur3u/platform/issues/6975)) ([ee987de](https://github.com/tutur3u/platform/commit/ee987dec1d739c81a8d5eeda0502aa2c436249bf))
* **database:** add tutoring follow-up notification foundation ([3b51993](https://github.com/tutur3u/platform/commit/3b51993e516ad33d92b9e821acf4d7e4b4d81b08))
* **database:** add tutoring follow-up notification foundation ([#6909](https://github.com/tutur3u/platform/issues/6909)) ([1a986eb](https://github.com/tutur3u/platform/commit/1a986eb918304ce12c1b732307bce9b7817a5232))
* **devbox:** admit claims by reported execution mode behind a flag ([#6457](https://github.com/tutur3u/platform/issues/6457)) ([394fd27](https://github.com/tutur3u/platform/commit/394fd27a8e6aa5f3b868237f4fc9139d95132832))


### Bug Fixes

* **database:** restrict remaining privileged definer functions ([#7092](https://github.com/tutur3u/platform/issues/7092)) ([5743c29](https://github.com/tutur3u/platform/commit/5743c290cfccc7c9250f1c9e6027c3318482df74))
* **database:** scope Discord mappings to the linked workspace ([#7014](https://github.com/tutur3u/platform/issues/7014)) ([cc59d0b](https://github.com/tutur3u/platform/commit/cc59d0ba1527509297ec18ac6a1d559991f1fe64))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **devboxes:** reap stale runs that hold runner capacity ([#6460](https://github.com/tutur3u/platform/issues/6460)) ([702e108](https://github.com/tutur3u/platform/commit/702e108c2a0dd0cfb75e0ac54bf34461782a9bb0))
* **mobile:** manage workspace visibility and filter Home choices ([#6978](https://github.com/tutur3u/platform/issues/6978)) ([8d625ae](https://github.com/tutur3u/platform/commit/8d625ae0a791b16db681a9ce238c66d0a8194003))
</details>

<details><summary>ui: 0.41.0</summary>

## [0.41.0](https://github.com/tutur3u/platform/compare/ui-v0.40.0...ui-v0.41.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **finance:** brand reconciliation money and test token bounds ([#6873](https://github.com/tutur3u/platform/issues/6873)) ([63417bb](https://github.com/tutur3u/platform/commit/63417bb06522ed9c64cc6ecc06cb0a9a881a88e2))
* **topic-announcements:** add teacher-scoped access and send deadline ([3cb09f3](https://github.com/tutur3u/platform/commit/3cb09f3896307385fbeaf4cfbcc3320d7e77d8a5))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **contacts:** GVNN schedule notify teachers, swap race and unsaved-changes guard ([#6966](https://github.com/tutur3u/platform/issues/6966)) ([429bcb3](https://github.com/tutur3u/platform/commit/429bcb30bb03f082c523e8f06c5f3b8c493ac2f4))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **mobile:** manage workspace visibility and filter Home choices ([#6978](https://github.com/tutur3u/platform/issues/6978)) ([8d625ae](https://github.com/tutur3u/platform/commit/8d625ae0a791b16db681a9ce238c66d0a8194003))
* **ui:** increase light muted foreground contrast ([#7219](https://github.com/tutur3u/platform/issues/7219)) ([e1870dd](https://github.com/tutur3u/platform/commit/e1870dd454293ab614dc636d6ecaba00e84c10dc))
* **ui:** start satellite sidebar closed on mobile ([#7161](https://github.com/tutur3u/platform/issues/7161)) ([d1f4824](https://github.com/tutur3u/platform/commit/d1f482417c36bdf0c0bd179e2a7af6a63537b968))
* **users:** align workspace read permissions ([#7022](https://github.com/tutur3u/platform/issues/7022)) ([6d81393](https://github.com/tutur3u/platform/commit/6d8139370238d3be6455724c7e71bd296004002e))
</details>

<details><summary>users-core: 0.12.0</summary>

## [0.12.0](https://github.com/tutur3u/platform/compare/users-core-v0.11.2...users-core-v0.12.0) (2026-10-30)


### Features

* **topic-announcements:** add teacher-scoped access and send deadline ([3cb09f3](https://github.com/tutur3u/platform/commit/3cb09f3896307385fbeaf4cfbcc3320d7e77d8a5))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **topic-announcements:** gate teacher assignments behind a workspace flag ([8252f98](https://github.com/tutur3u/platform/commit/8252f98a107e27d7ecb1605cb39793256fa9c406))


### Bug Fixes

* **api:** align user group workspace scoping ([#7001](https://github.com/tutur3u/platform/issues/7001)) ([7c7ec6e](https://github.com/tutur3u/platform/commit/7c7ec6ea248d9a3fdb7aabf9e64fbda1933ad321))
* **api:** align workspace operation permissions and references ([#7033](https://github.com/tutur3u/platform/issues/7033)) ([86c6dd4](https://github.com/tutur3u/platform/commit/86c6dd4dd388a9081334293b0b0005452e846200))
* **groups:** align group and member access checks ([#7028](https://github.com/tutur3u/platform/issues/7028)) ([6fa6453](https://github.com/tutur3u/platform/commit/6fa6453a9b76559fdac74fe6727c71348b090307))
* **storage:** cap signed URL lifetimes and sign stored media on read ([#6887](https://github.com/tutur3u/platform/issues/6887)) ([b08e0e4](https://github.com/tutur3u/platform/commit/b08e0e4f1afb6ef069d01c4f725cc07178bbfdcc))
* **storage:** short-lived signed URLs and sign-on-read for stored media ([b235bdb](https://github.com/tutur3u/platform/commit/b235bdbdb84198ebaf1e58a6c2e29d216f113fcf))
* **topic-announcements:** store blank topics as NULL and fail the flag closed ([9e3611a](https://github.com/tutur3u/platform/commit/9e3611a96b42be5a8a75059e1cc546f862e4dd6b))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **users:** align approval and post delivery scoping ([#6989](https://github.com/tutur3u/platform/issues/6989)) ([d1a7052](https://github.com/tutur3u/platform/commit/d1a7052c247e19467cbff8aa60c8c06dbb46e91d))
* **users:** align workspace read permissions ([#7022](https://github.com/tutur3u/platform/issues/7022)) ([6d81393](https://github.com/tutur3u/platform/commit/6d8139370238d3be6455724c7e71bd296004002e))
* **users:** scope report delivery preview and send to the report's group ([#7061](https://github.com/tutur3u/platform/issues/7061)) ([f85a01e](https://github.com/tutur3u/platform/commit/f85a01ecfe0c67f0fdcd23fc89faa7530d31ce43))
* **users:** tighten workspace read scoping and permissions ([#6979](https://github.com/tutur3u/platform/issues/6979)) ([f720f64](https://github.com/tutur3u/platform/commit/f720f64bc07ad85ec2e41c69d8ead1e342d9d802))
* **users:** validate group-check participants ([#6984](https://github.com/tutur3u/platform/issues/6984)) ([e992446](https://github.com/tutur3u/platform/commit/e9924465065e4c82b915eef194bd8c742fc9ed87))
</details>

<details><summary>utils: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/utils-v0.38.1...utils-v0.39.0) (2026-10-30)


### Features

* **abuse-guard:** add Durable Object guard store Worker ([#6837](https://github.com/tutur3u/platform/issues/6837)) ([41970d1](https://github.com/tutur3u/platform/commit/41970d183e9120b7ed03ddc53d69301525b78a8a))
* **contacts:** add default-off Start candidate ([#7120](https://github.com/tutur3u/platform/issues/7120)) ([9a7795d](https://github.com/tutur3u/platform/commit/9a7795d2036bb1be9c346b3461abeef8f4eb0642))
* **contacts:** keep make-up tutoring content linked to lesson notes ([6c3186d](https://github.com/tutur3u/platform/commit/6c3186d2331350401e3e06a5269b15a0844e7d29))
* **contacts:** keep make-up tutoring content linked to lesson notes ([#6907](https://github.com/tutur3u/platform/issues/6907)) ([2fb0e9f](https://github.com/tutur3u/platform/commit/2fb0e9ff9ac1ed4f65a09ce4137d7741eb7a4633))
* **contacts:** monthly GVNN schedule editor with month clone ([#6927](https://github.com/tutur3u/platform/issues/6927)) ([13c4e0b](https://github.com/tutur3u/platform/commit/13c4e0b43cdc20a4566187386a8eecf21157a79b))
* **database:** add topic announcement teacher assignment schema ([24ad041](https://github.com/tutur3u/platform/commit/24ad04103ecce259beb379cb2a92dce31aa9c5ee))
* **database:** add topic announcement teacher assignment schema ([#6924](https://github.com/tutur3u/platform/issues/6924)) ([cf6a18d](https://github.com/tutur3u/platform/commit/cf6a18d3cfa33d5cc5b93a673613038e347be827))
* **finance:** brand reconciliation money and test token bounds ([#6873](https://github.com/tutur3u/platform/issues/6873)) ([63417bb](https://github.com/tutur3u/platform/commit/63417bb06522ed9c64cc6ecc06cb0a9a881a88e2))
* **meet,mail:** add flagged shared-origin routing at the Worker entry ([#6746](https://github.com/tutur3u/platform/issues/6746)) ([5b83ba8](https://github.com/tutur3u/platform/commit/5b83ba8eab646d423ff567d816deed73601ea38d))
* **meet,mail:** add per-app document security headers ([#6749](https://github.com/tutur3u/platform/issues/6749)) ([f2a60c8](https://github.com/tutur3u/platform/commit/f2a60c86bac0bf658cbe43c23f07f1cfa539cd09))
* **perf:** measure app switches for the one-origin rollout ([#6756](https://github.com/tutur3u/platform/issues/6756)) ([893f041](https://github.com/tutur3u/platform/commit/893f041e9b242a490a5a4abfa5de86adcd574a12))
* **start-bridge:** shared root response policy (wrapResponse), safe failures and a runtime policy gate ([#6826](https://github.com/tutur3u/platform/issues/6826)) ([10e1778](https://github.com/tutur3u/platform/commit/10e17784ef192cb5ef65eee2b38c9b9cab738a0d))
* **topic-announcements:** add teacher-scoped access and send deadline ([3cb09f3](https://github.com/tutur3u/platform/commit/3cb09f3896307385fbeaf4cfbcc3320d7e77d8a5))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))
* **topic-announcements:** gate teacher assignments behind a workspace flag ([8252f98](https://github.com/tutur3u/platform/commit/8252f98a107e27d7ecb1605cb39793256fa9c406))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([5b52e01](https://github.com/tutur3u/platform/commit/5b52e018e1789d47ea2fbab7d85be3a3ec48e4cc))
* **tutoring:** per-session content and class time in the parent message ([#7055](https://github.com/tutur3u/platform/issues/7055)) ([9eb14a6](https://github.com/tutur3u/platform/commit/9eb14a6c62076e5f59d5f412a504833e58a81bb6))
* **utils:** add abuse-guard store protocol and clients ([#6834](https://github.com/tutur3u/platform/issues/6834)) ([22b79b6](https://github.com/tutur3u/platform/commit/22b79b62be0fe486e66f1a0a2420b4b58449bf87))
* **utils:** atomic password reservations on the abuse-guard store ([#6852](https://github.com/tutur3u/platform/issues/6852)) ([bd55672](https://github.com/tutur3u/platform/commit/bd55672054633e8cf6801b24747b63b30d4967dc))
* **utils:** route offline, proxy and replay guards through the abuse-guard store ([#6845](https://github.com/tutur3u/platform/issues/6845)) ([ceb59e3](https://github.com/tutur3u/platform/commit/ceb59e3fc6bbdd3451b2b94cf195c6bbec4077ab))
* **web:** add signed Mastermind push-events route ([#7133](https://github.com/tutur3u/platform/issues/7133)) ([8416d3c](https://github.com/tutur3u/platform/commit/8416d3cb54dced26149d0d82316739cd2842fcfa))
* **web:** render public legal pages in Start staging candidate ([#7102](https://github.com/tutur3u/platform/issues/7102)) ([7f2f1d7](https://github.com/tutur3u/platform/commit/7f2f1d7923d08751d15b63cacc0a7ee3451f32eb))


### Bug Fixes

* **abuse-guard:** enforce durable command fairness ([#6865](https://github.com/tutur3u/platform/issues/6865)) ([1c44022](https://github.com/tutur3u/platform/commit/1c440227fb512187bb98dddf00b92c7127078e04))
* align main unit fixtures with authorization and app inventory ([#7265](https://github.com/tutur3u/platform/issues/7265)) ([0eb1e3a](https://github.com/tutur3u/platform/commit/0eb1e3a8d350c5179bfaad63fc7281bfd47ebbf8))
* align workspace scoping for time requests and tasks ([#6999](https://github.com/tutur3u/platform/issues/6999)) ([c889c8b](https://github.com/tutur3u/platform/commit/c889c8b65ed09b8fec7bb50cf4b8fe1f3bedee61))
* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **auth:** scope the managed login shortcut to the configured shared cookie domain ([#7051](https://github.com/tutur3u/platform/issues/7051)) ([0f7d9e6](https://github.com/tutur3u/platform/commit/0f7d9e6f0bf96b41b48dd920015c309ff41dee82))
* **database:** bound cross-app token lifetime and audience, contain overlong tokens ([#6840](https://github.com/tutur3u/platform/issues/6840)) ([c858586](https://github.com/tutur3u/platform/commit/c858586a6ae8c907ab55bdf5476b7bd73f2b28b7))
* **db:** restrict subscription writes to billing service ([#7185](https://github.com/tutur3u/platform/issues/7185)) ([c1503bc](https://github.com/tutur3u/platform/commit/c1503bcaa98bd0ea0d3cae02cce34065c39e7681))
* **infra:** require platform admin for workspace secrets ([#7174](https://github.com/tutur3u/platform/issues/7174)) ([496de2e](https://github.com/tutur3u/platform/commit/496de2ef9c819ec73e647e395e80f494a3c696c9))
* **integrations:** align AI and project request authorization ([#7012](https://github.com/tutur3u/platform/issues/7012)) ([606e882](https://github.com/tutur3u/platform/commit/606e882bb3c44f39eb7277f4a9701acc492a025b))
* **playground:** require a signed-in staff session for AI routes and pages ([#7215](https://github.com/tutur3u/platform/issues/7215)) ([e4e42e0](https://github.com/tutur3u/platform/commit/e4e42e06ca651b9838e06248f9ad4add952768d0))
* **roles:** scope role permission updates to the role's workspace ([#6995](https://github.com/tutur3u/platform/issues/6995)) ([010f0f2](https://github.com/tutur3u/platform/commit/010f0f228acf8acbb095f2a6020eac414deac5d6))
* **security:** harden staging-host guard and restore reserved-host handling ([#7256](https://github.com/tutur3u/platform/issues/7256)) ([077e48c](https://github.com/tutur3u/platform/commit/077e48c3ecea2841d4c99c9d848122ef1827dd42))
* **security:** isolate staging hosts from production cookies ([#7245](https://github.com/tutur3u/platform/issues/7245)) ([4395a92](https://github.com/tutur3u/platform/commit/4395a92e9a0d1ee03b93fc7a944cc2722afd2974))
* **security:** validate project branches and strip guard comments ([#7271](https://github.com/tutur3u/platform/issues/7271)) ([d718355](https://github.com/tutur3u/platform/commit/d718355c2d86bb875e835326f7744b9832673839))
* **tasks:** align board access and realtime delivery ([#7016](https://github.com/tutur3u/platform/issues/7016)) ([70aef15](https://github.com/tutur3u/platform/commit/70aef1546bf600aaa29fc046a915fc7c69be4d02))
* **time-tracking:** validate request task, category and linked-session scope ([#7068](https://github.com/tutur3u/platform/issues/7068)) ([716b49f](https://github.com/tutur3u/platform/commit/716b49f97999af4df1f20cc97214385e6e3f4f7d))
* **topic-announcements:** store blank topics as NULL and fail the flag closed ([9e3611a](https://github.com/tutur3u/platform/commit/9e3611a96b42be5a8a75059e1cc546f862e4dd6b))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([99aa5a8](https://github.com/tutur3u/platform/commit/99aa5a84b735abd4970bebb70bc7ccc3e8081c53))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening ([#7057](https://github.com/tutur3u/platform/issues/7057)) ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring,topic-announcements:** enforce the tutoring gate, weak-content and search hardening. ([c678300](https://github.com/tutur3u/platform/commit/c678300a63eba6c8e6b57ead465d247fd0d38331))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([f029cf6](https://github.com/tutur3u/platform/commit/f029cf6dad6ef202ddd43aefdc15014dbb9eb4bc))
* **tutoring:** teach the right content for absent, weak and both rows ([#7052](https://github.com/tutur3u/platform/issues/7052)) ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **tutoring:** teach the right content for absent, weak and both rows. ([d6eef3a](https://github.com/tutur3u/platform/commit/d6eef3a7713e3fcb917ffc00dfca88828cd7489f))
* **utils:** include Turbo cache in the internal comparison inventory ([#6899](https://github.com/tutur3u/platform/issues/6899)) ([945ccbe](https://github.com/tutur3u/platform/commit/945ccbe3119e62f6025d6755ae5379dec34e78c9))


### Performance Improvements

* **auth:** verify the request user once across refresh, guard and MFA ([#7153](https://github.com/tutur3u/platform/issues/7153)) ([959206e](https://github.com/tutur3u/platform/commit/959206efa1b1b686c75a1d17eade931519e8729f))
</details>

<details><summary>lettin: 1.7.0</summary>

## [1.7.0](https://github.com/tutur3u/platform/compare/lettin-v1.6.0...lettin-v1.7.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>parley: 1.6.0</summary>

## [1.6.0](https://github.com/tutur3u/platform/compare/parley-v1.5.0...parley-v1.6.0) (2026-10-30)


### Features

* **contacts:** notify homeroom teachers when tutoring is completed ([#6912](https://github.com/tutur3u/platform/issues/6912)) ([7cb1f4c](https://github.com/tutur3u/platform/commit/7cb1f4c9f8c76ab39b8439c79280d0515dd269eb))
* **tasks:** hide Initiatives in Tasks and remove their create controls ([#7099](https://github.com/tutur3u/platform/issues/7099)) ([72cfb25](https://github.com/tutur3u/platform/commit/72cfb25d4df4bf068669b4dc21590a23b6f717a9))
* **topic-announcements:** add teacher-scoped access and send deadline ([#6928](https://github.com/tutur3u/platform/issues/6928)) ([bc62da4](https://github.com/tutur3u/platform/commit/bc62da488da9edc61e131eb1eb11458b560ade45))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** admit AI credits before reserving transcript chunks ([#7243](https://github.com/tutur3u/platform/issues/7243)) ([0826b0e](https://github.com/tutur3u/platform/commit/0826b0eeee62421c284f1edfb9e4454bb2d1d526))
* **meet:** validate plan creation access ([#7004](https://github.com/tutur3u/platform/issues/7004)) ([e16af79](https://github.com/tutur3u/platform/commit/e16af79b25a50c94395f4a6d579ffa3ce6485153))
* **topic-announcements:** tighten teacher write scope and label topic_assigned ([d7af005](https://github.com/tutur3u/platform/commit/d7af005c28d05bf97379e6b6dffcd343a75d1a47))
</details>

<details><summary>meet-core: 1.5.0</summary>

## [1.5.0](https://github.com/tutur3u/platform/compare/meet-core-v1.4.2...meet-core-v1.5.0) (2026-10-30)


### Features

* **meet:** add transcription state and consent protocol ([#7266](https://github.com/tutur3u/platform/issues/7266)) ([2d601a1](https://github.com/tutur3u/platform/commit/2d601a1620cc8d39d425abb0617774c6eb2184bf))
* **meet:** improve transcription quality and support solo meetings ([#7267](https://github.com/tutur3u/platform/issues/7267)) ([ecc5e53](https://github.com/tutur3u/platform/commit/ecc5e53bfa6423ddbd9aaf789e6779c551064eab))


### Bug Fixes

* **auth:** require a verified identity for staff-only routes ([#7127](https://github.com/tutur3u/platform/issues/7127)) ([2198072](https://github.com/tutur3u/platform/commit/2198072bcd0d584ae24c1b47e32caedf90dc4344))
* **meet:** admit AI credits before reserving transcript chunks ([#7243](https://github.com/tutur3u/platform/issues/7243)) ([0826b0e](https://github.com/tutur3u/platform/commit/0826b0eeee62421c284f1edfb9e4454bb2d1d526))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).