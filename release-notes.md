:robot: I have created a release *beep* *boop*
---


<details><summary>platform: 0.66.0</summary>

## [0.66.0](https://github.com/tutur3u/platform/compare/platform-v0.65.0...platform-v0.66.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **inventory:** add transactional offline create receipts ([d52a973](https://github.com/tutur3u/platform/commit/d52a973166abf9d2c2e7fbc8553ad53556f02669))
* **inventory:** expose authorized deduplicated native creates ([d71325d](https://github.com/tutur3u/platform/commit/d71325d22043ea80357770269f325e6ee1e5cd7b))
* **inventory:** merge products and warehouses with conflict previews ([ebcd1d9](https://github.com/tutur3u/platform/commit/ebcd1d9b16f100743c346c1665f42f4f867f379d))
* **inventory:** merge products and warehouses with conflict previews ([#5765](https://github.com/tutur3u/platform/issues/5765)) ([35e584c](https://github.com/tutur3u/platform/commit/35e584c50061a17d9515563e0ee71c04f0cec53a))
* **learn:** add canonical Programming catalog, author forms and scoped drafts ([#5710](https://github.com/tutur3u/platform/issues/5710)) ([4e658d8](https://github.com/tutur3u/platform/commit/4e658d8c2c3c14b3b66b5e0accbf74fa4b16917e))
* **learn:** persist workspace Programming problems and authorized catalog APIs ([#5709](https://github.com/tutur3u/platform/issues/5709)) ([f39c84b](https://github.com/tutur3u/platform/commit/f39c84b9df76448683f439c78f1897847b609299))
* **lettin:** create a relaxed home and dedicated creative spaces ([54a2a38](https://github.com/tutur3u/platform/commit/54a2a38f12753044d4082398f7c8f8bde75a139d))
* **lettin:** create a relaxed home and dedicated creative spaces ([#5733](https://github.com/tutur3u/platform/issues/5733)) ([d1c03e5](https://github.com/tutur3u/platform/commit/d1c03e587a5f93309f6e8e237d818b175004ed73))
* **mobile:** add personal Agenda and unify search keyboard navigation ([bff9e55](https://github.com/tutur3u/platform/commit/bff9e5566967027ad237e2fbd3b45b6012132760))
* **mobile:** consolidate offline data and settings ([a96039a](https://github.com/tutur3u/platform/commit/a96039a4987782d69e566a57743aa2c1adc65882))
* **mobile:** consolidate offline data and settings ([#5768](https://github.com/tutur3u/platform/issues/5768)) ([a4b1256](https://github.com/tutur3u/platform/commit/a4b1256bb8bd5a53662f3c2597c13702b23a670e))
* **mobile:** inspect individual stored offline items ([fd68e81](https://github.com/tutur3u/platform/commit/fd68e813279bb2a4363ec18be198951379d7838c))
* **mobile:** make Timeline a full surface with persistent activity ([b6b912a](https://github.com/tutur3u/platform/commit/b6b912a7a94d40a42fa600112ef12fdc1761d803))
* **mobile:** model typed offline prerequisite graphs ([6a9012a](https://github.com/tutur3u/platform/commit/6a9012abf251edff18a4bf2b8c3cca3cfbc9caf6))
* **mobile:** persist typed inventory dependency identities ([7c2d86f](https://github.com/tutur3u/platform/commit/7c2d86fae5f8fac28e05e94fbc89516584cababc))
* **mobile:** replay inventory dependencies automatically ([fa8734c](https://github.com/tutur3u/platform/commit/fa8734ccebe827cab4bb8dc283f639229e7da50a))
* **mobile:** simplify Timeline and add personal Agenda navigation ([#5767](https://github.com/tutur3u/platform/issues/5767)) ([350184b](https://github.com/tutur3u/platform/commit/350184b8804dd6ec94db5914e6e546d553e5dbfe))
* **mobile:** streamline Assistant composer and navigation ([#5769](https://github.com/tutur3u/platform/issues/5769)) ([53200ca](https://github.com/tutur3u/platform/commit/53200ca3b8a526509a8eee95c446bc1d1b172271))
* **mobile:** streamline assistant prompt and navigation ([c41817a](https://github.com/tutur3u/platform/commit/c41817a6360e2457e7e5ef7a0ba9162b3e4cdbb4))
* **mobile:** support offline data and safe inventory checkout ([a45d634](https://github.com/tutur3u/platform/commit/a45d63498cc1e686d1d070f5861cf938c4e9a9ef))
* **mobile:** support offline data, cached images, and safe inventory checkout ([#5734](https://github.com/tutur3u/platform/issues/5734)) ([2f0f397](https://github.com/tutur3u/platform/commit/2f0f39763daea56f1029fcc3e99e0be53c60e106))
* **mobile:** sync inventory prerequisites and dependent writes automatically ([#5743](https://github.com/tutur3u/platform/issues/5743)) ([242fbbd](https://github.com/tutur3u/platform/commit/242fbbdb90671325af104f6c9fe79c43b81a82c1))
* **security:** scale abuse budgets by paid plans and memberships ([93ccf02](https://github.com/tutur3u/platform/commit/93ccf0237c79addaed3ab8b653bd8b57b27a9557))


### Bug Fixes

* **backend:** scope lint expectations to disconnected guarded ports ([3d8c5fe](https://github.com/tutur3u/platform/commit/3d8c5fe85250d201a91083508fecc6be3d936fd6))
* **calendar:** atomically fence native transfer snapshots ([8b34406](https://github.com/tutur3u/platform/commit/8b34406a0133769d0e995ee8fb6e62c5dcf36d50))
* **calendar:** authorize historical native primary saga sources ([01656b7](https://github.com/tutur3u/platform/commit/01656b748772f07c25ebd190a8fe31e9b544917e))
* **calendar:** fence metadata reads and retain recurrence during imports ([3895d28](https://github.com/tutur3u/platform/commit/3895d28fb4acd0164f6f021ad15df4c39a83938e))
* **calendar:** fence native edits and preserve recoverable route errors ([bff0488](https://github.com/tutur3u/platform/commit/bff0488d039b720aa796c9b3546b9cf30b86f95b))
* **calendar:** finalize compensated source deletion atomically ([14b2f73](https://github.com/tutur3u/platform/commit/14b2f73fe07056a63ff8c430ef3c73e505b082ce))
* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** integrate all inventory setup reference guards ([08e1ab1](https://github.com/tutur3u/platform/commit/08e1ab1836b45d623ab3abe092650d5053c78dad))
* **calendar:** integrate inventory setup dependency guards ([6711361](https://github.com/tutur3u/platform/commit/67113612bdab5e7a5f179b92f61ac46db9115574))
* **calendar:** order unapplied provider migrations after main ([e230dc0](https://github.com/tutur3u/platform/commit/e230dc05567f8185710d0ccdc4b779275955beca))
* **calendar:** preserve provider intent and reject ambiguous transfers ([4af32c7](https://github.com/tutur3u/platform/commit/4af32c70803b9277e76ffdc8fce0dbf3036e0424))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **ci:** allow the exact automated imgbot branch ([0104547](https://github.com/tutur3u/platform/commit/01045473c366f72a0d28ea8ab54b67a0b7a63f19))
* **ci:** avoid allocating cancelled E2E cohorts ([60f6a9c](https://github.com/tutur3u/platform/commit/60f6a9ceca6e5b53b6cfb365c03ae12c37234799))
* **ci:** bind E2E proofs to actual runner platform ([836eb46](https://github.com/tutur3u/platform/commit/836eb46218b8b54db39a1e84ac7da9081d0bd64e))
* **ci:** enforce runner match before publishing E2E proof ([36edeb7](https://github.com/tutur3u/platform/commit/36edeb712c266105668ada77ca22971a2bc47156))
* **ci:** exclude failed callbacks from migration queue ([9398f56](https://github.com/tutur3u/platform/commit/9398f560b566fef7e0c3f6145ac5fac10da2cb67))
* **ci:** isolate ineligible migration callbacks ([fd9d286](https://github.com/tutur3u/platform/commit/fd9d286b078d390419c43eb06c34285c9799d309))
* **ci:** isolate proposal review Git fixtures ([9318e01](https://github.com/tutur3u/platform/commit/9318e01ac7fdd3dea4360df9f1058412d70a6c2a))
* **ci:** omit unsafe diagnostic formats and symlink roots ([f0dcde5](https://github.com/tutur3u/platform/commit/f0dcde53efef017a88c2cc492c0103f18b4c882a))
* **ci:** redact multiline diagnostic credentials before publication ([67c77f6](https://github.com/tutur3u/platform/commit/67c77f63162202ce822636cd091178394b29296b))
* **ci:** reevaluate migrations for current production target ([b5e8902](https://github.com/tutur3u/platform/commit/b5e890239c94cf5c9b4e2b5456f77fb91d53de55))
* **ci:** reevaluate migrations for the current production commit ([#5745](https://github.com/tutur3u/platform/issues/5745)) ([62bb01f](https://github.com/tutur3u/platform/commit/62bb01f643f8cc75aaf28ab42408a9885f1a6016))
* **ci:** restore strict Rust and migration consistency checks ([#5764](https://github.com/tutur3u/platform/issues/5764)) ([f4fb41a](https://github.com/tutur3u/platform/commit/f4fb41ac4d72a8317d1e40d1db93411d99f5be3d))
* **ci:** run exact-source Rust tests before strict lint ([5d6d189](https://github.com/tutur3u/platform/commit/5d6d1895ef4b79e6100ad4c48243b53dcbe8756a))
* **ci:** run exact-source Rust tests before strict lint ([#5763](https://github.com/tutur3u/platform/issues/5763)) ([e0e7dbc](https://github.com/tutur3u/platform/commit/e0e7dbc404c1316785c8ddcaa7777f2cefb1906e))
* **ci:** sanitize E2E failure evidence before publication ([c6982f5](https://github.com/tutur3u/platform/commit/c6982f58eb04c6e2a203235b7d88985b1f395ff6))
* **ci:** whitelist the automated imgbot branch ([#5758](https://github.com/tutur3u/platform/issues/5758)) ([2e95bd2](https://github.com/tutur3u/platform/commit/2e95bd2991d5b43a0e0515a4ea360ff1a8fefe98))
* **cms:** isolate machine credentials from browser assurance ([7647689](https://github.com/tutur3u/platform/commit/7647689ab07ab3b73f2290b33eab681a2077f3bf))
* **cms:** preserve rollout probes at API auth boundary ([f881e98](https://github.com/tutur3u/platform/commit/f881e981b4f5a0debad76f1b216ee7dcc1380640))
* **cms:** preserve rollout probes at API auth boundary ([#5766](https://github.com/tutur3u/platform/issues/5766)) ([d6e05ee](https://github.com/tutur3u/platform/commit/d6e05ee2b72648dea1ad83ee025d5ac3f7f3389d))
* **database:** abort owned helpers on diagnostic callback errors ([4e97654](https://github.com/tutur3u/platform/commit/4e97654b7d68b06ee1b7c71e4b5ac77d1ccf0b52))
* **database:** review isolated native CLI environment ([#5717](https://github.com/tutur3u/platform/issues/5717)) ([6442b65](https://github.com/tutur3u/platform/commit/6442b654f96ac7939d1ce19586ddbaa8a14f3d69))
* **database:** use current inventory migration timestamp ([2db1fa9](https://github.com/tutur3u/platform/commit/2db1fa9974a10f18134f8ece0bddd30dfc3a44e8))
* **deps:** patch TanStack Start server response XSS ([4f491fb](https://github.com/tutur3u/platform/commit/4f491fb2bd85b7d81ce8c0a541b2e2737f1745ba))
* **deps:** patch TanStack Start XSS to unblock release builds ([#5755](https://github.com/tutur3u/platform/issues/5755)) ([abc15af](https://github.com/tutur3u/platform/commit/abc15affacff8ab211af41cb1e1d1c10ff8750b9))
* **devboxes:** reserve exact integer host shares ([d282009](https://github.com/tutur3u/platform/commit/d2820097fc84b6b814be24e2f23200dba389ff7b))
* **devbox:** stop failed dispatch and retain sandbox ownership ([85d1e61](https://github.com/tutur3u/platform/commit/85d1e613e65af1441fa54fc192c24ee359746723))
* **devbox:** wait for admitted creation before stopping ([b1edb12](https://github.com/tutur3u/platform/commit/b1edb127f164fa9ab8cd8598d93eb51faff9b919))
* **e2e:** align landing heading with shipped team copy ([16a6f02](https://github.com/tutur3u/platform/commit/16a6f02fc8848f9e6e25c820ec2ee2d1313dd2f9))
* **e2e:** preserve frontend-specific landing headings ([a2b69ae](https://github.com/tutur3u/platform/commit/a2b69aec2d59d8e17b272e58e6abe3fd3b93196d))
* **finance:** authenticate exchange rates with satellite sessions ([33368f1](https://github.com/tutur3u/platform/commit/33368f1c00f86f71b4a66702899af262a90122e2))
* **finance:** authenticate exchange rates with satellite sessions ([#5760](https://github.com/tutur3u/platform/issues/5760)) ([759b1e5](https://github.com/tutur3u/platform/commit/759b1e52f8867aced2d64288af43b861d5ebccdc))
* **finance:** check suspensions for both verified auth modes ([883cda4](https://github.com/tutur3u/platform/commit/883cda471fd12d1a2f810aebe094fe7f8f3af5f0))
* **finance:** keep exchange rate wire types in API package ([878be3d](https://github.com/tutur3u/platform/commit/878be3d1b0c98ec2a42173b3fe410a4b3ad76d71))
* **finance:** preserve exchange rate failure and suspension checks ([79104ef](https://github.com/tutur3u/platform/commit/79104efec30bafab996bf90bc8d69c4ab62b506b))
* **inventory:** bound identity locks by workspace buckets ([279a56c](https://github.com/tutur3u/platform/commit/279a56c38e251f876bba4e6788c2ee100bb70bbc))
* **inventory:** close merge API and contract review gaps ([37a0f44](https://github.com/tutur3u/platform/commit/37a0f446517318a270037a3ec0fb1937dfb13373))
* **inventory:** declare merge selector debounce dependency ([33d564a](https://github.com/tutur3u/platform/commit/33d564a171a8283e350ab545007c6c473b99317a))
* **inventory:** declare Web merge test database client ([9f4addf](https://github.com/tutur3u/platform/commit/9f4addf2ff9f653850d560302ee4610a1a6191b1))
* **inventory:** filter merged warehouse aliases in database ([33450b7](https://github.com/tutur3u/platform/commit/33450b777075e5093434e26a36c5161f13243db0))
* **inventory:** harden durable offline replay and validation ([7166401](https://github.com/tutur3u/platform/commit/7166401d06e357d24ab92ec104cf4e48ef1f5b3a))
* **inventory:** keep merge policy pickers context appropriate ([7264070](https://github.com/tutur3u/platform/commit/7264070773a145ecf8bd2b70a13e7ec7c397505e))
* **inventory:** load full sale filter choices and paged categories ([e10a488](https://github.com/tutur3u/platform/commit/e10a48882a1b859f9d6e62a139786e5bc5a904c2))
* **inventory:** make merge review searchable and mobile accessible ([b1f2859](https://github.com/tutur3u/platform/commit/b1f2859934400b12f364161244bae24ca5e234d6))
* **inventory:** narrow finance category merge labels ([f954fa9](https://github.com/tutur3u/platform/commit/f954fa995d2956cb6679c383373d499e8d783023))
* **inventory:** normalize blank product option labels ([b3decc1](https://github.com/tutur3u/platform/commit/b3decc12272ad3638fcd23c12816a2fc59db5c64))
* **inventory:** preserve invoice recovery and scope merge locks ([ec5352e](https://github.com/tutur3u/platform/commit/ec5352e557eb934219816f21710a169e6412df22))
* **inventory:** preserve table and view type inference ([8691a5e](https://github.com/tutur3u/platform/commit/8691a5e050502c3c125fa294b6aca6041e5ffbd1))
* **inventory:** preserve verified legacy warehouse reads ([28f4fe3](https://github.com/tutur3u/platform/commit/28f4fe3929699928f2f944604b43846d1f5d2377))
* **inventory:** preserve warehouse UUID casing parity ([8b688c1](https://github.com/tutur3u/platform/commit/8b688c150273981f323fe076741f096b5796b9cb))
* **inventory:** reset merge search and cover persistent errors ([4c3c16d](https://github.com/tutur3u/platform/commit/4c3c16d84adc2162a6fdeb7dce7f6ab2e17d5975))
* **inventory:** restore sale catalog when search clears ([10ac21f](https://github.com/tutur3u/platform/commit/10ac21f9979a051fcc794c548e75fa3cebd0949d))
* **inventory:** settle concurrent fixtures and retry missing labels ([7c279ba](https://github.com/tutur3u/platform/commit/7c279ba4e0517d189efb840aa171f3fcb3d3ba57))
* **inventory:** type filter option entries as tuples ([3c573c9](https://github.com/tutur3u/platform/commit/3c573c9357c5b081d694b45b1266a36e555cb8f6))
* **lettin:** preserve creator context and resolve review findings ([d9d3697](https://github.com/tutur3u/platform/commit/d9d3697bc3a653c4bdafebb457725bd78692baa2))
* **lettin:** use canonical invitation destinations ([cdebac2](https://github.com/tutur3u/platform/commit/cdebac239b4c6ddbf401eed17be8e9fd2aa9e3bc))
* **mobile:** align assistant floating controls and model eligibility ([f99fa11](https://github.com/tutur3u/platform/commit/f99fa11e82ba8bf35a3c0bb2cce3836ca5fd3a5d))
* **mobile:** align fullscreen workspace picker with shell ([ed49181](https://github.com/tutur3u/platform/commit/ed491810a84c14580738cb8a49402fc49d10daf6))
* **mobile:** align fullscreen workspace picker with shell ([#5742](https://github.com/tutur3u/platform/issues/5742)) ([863a858](https://github.com/tutur3u/platform/commit/863a8582bb4747fc7aaa04c65975aa45612641aa))
* **mobile:** avoid duplicate Apps brand announcements ([8e67059](https://github.com/tutur3u/platform/commit/8e67059fc790de282f82eac3c5817b8749cb7e50))
* **mobile:** bind outbox replay to its owning account ([50e4a80](https://github.com/tutur3u/platform/commit/50e4a805b948ea5b48c0998344fb322edc0095de))
* **mobile:** bound dock labels and preserve accessibility ([39712cb](https://github.com/tutur3u/platform/commit/39712cb813c17aaed31ccb1d93dfd15cd04af8ea))
* **mobile:** correct calendar times and timezone recovery ([#5753](https://github.com/tutur3u/platform/issues/5753)) ([94bd020](https://github.com/tutur3u/platform/commit/94bd0200ef236a3aaa337277a29ba207f09fc8b5))
* **mobile:** correct calendar wall times and timezone recovery ([f51e701](https://github.com/tutur3u/platform/commit/f51e701f46a0eeb64746bf98a9bb4e6e7bc9bbf4))
* **mobile:** enforce monotonic offline request spacing ([1cb15e6](https://github.com/tutur3u/platform/commit/1cb15e658b4e66efb265be129dc44453dc4a5dbe))
* **mobile:** fence cache publication and finance workspace transitions ([a798346](https://github.com/tutur3u/platform/commit/a7983465a934a47e185f4a1244c9edd2e1af8120))
* **mobile:** fence invalid inventory replay and preserve receipts ([23ea162](https://github.com/tutur3u/platform/commit/23ea162aeb2b5eed98efb4fb3636e48fdb0df5da))
* **mobile:** fence visibility changes during preference recovery ([d52318f](https://github.com/tutur3u/platform/commit/d52318f9ffe58afdfad0d5a275e166bdec1bf8b1))
* **mobile:** guard every pending product setup reference ([c4bcc00](https://github.com/tutur3u/platform/commit/c4bcc00f3c784c5c39c8023dad7442f832c80099))
* **mobile:** harden offline inventory and scoped cache replay ([d9c0b13](https://github.com/tutur3u/platform/commit/d9c0b13b386287fb874be62a8b8ec794deeb6407))
* **mobile:** integrate current main into offline settings ([218a6e6](https://github.com/tutur3u/platform/commit/218a6e663ce51cea6be5d8d0080888fa32c39fc3))
* **mobile:** integrate scoped Agenda repairs into Assistant ([62e5a66](https://github.com/tutur3u/platform/commit/62e5a6663b0663939728475308c263f4b5afcda5))
* **mobile:** keep workspace selection usable during preference outages ([ae5e419](https://github.com/tutur3u/platform/commit/ae5e4193307b0101c92b753291720994f3d26fb7))
* **mobile:** persist automatic timezone and retain scoped errors ([2d959d4](https://github.com/tutur3u/platform/commit/2d959d4cf1b6c5e550cc876f3b2722233fac17a2))
* **mobile:** preserve dock reset and profile accessibility semantics ([8ac36ad](https://github.com/tutur3u/platform/commit/8ac36ad3821c1e1c59d090964ba136b81b023c91))
* **mobile:** preserve foreground inventory verification ([0ce0bea](https://github.com/tutur3u/platform/commit/0ce0bea3c9c91f35030c473eca5fb319438e068b))
* **mobile:** preserve Home state and scope Agenda timezone ([1565656](https://github.com/tutur3u/platform/commit/15656564b93c10c7b7394de2c2f71883634f3a1b))
* **mobile:** preserve inventory foreground transport and durable fixtures ([0e68cac](https://github.com/tutur3u/platform/commit/0e68cac8891138449221479aa563738250f764ce))
* **mobile:** preserve sales receipts and finance API contracts ([c940cda](https://github.com/tutur3u/platform/commit/c940cda7ad60acadae8e005328b4e1d11701ecb7))
* **mobile:** preserve sales receipts and finance API contracts ([#5750](https://github.com/tutur3u/platform/issues/5750)) ([1c3ee92](https://github.com/tutur3u/platform/commit/1c3ee9280aa144ed2417a0b1fd09da4794ece089))
* **mobile:** preserve timezone diagnostics and restore offline scope safely ([e34a3f2](https://github.com/tutur3u/platform/commit/e34a3f2503619b630b2d84dc96beb3317c5d67e2))
* **mobile:** preserve timezone retries and calendar minute boundaries ([e68fb37](https://github.com/tutur3u/platform/commit/e68fb37ab895e5c8eb7de13e504a041a97faf40b))
* **mobile:** propagate account-bound offline replay into navigation stack ([55b0b1f](https://github.com/tutur3u/platform/commit/55b0b1f6255d737c12846b56bc655a4ef0cab532))
* **mobile:** refresh collapsed offline item lists ([d39db1d](https://github.com/tutur3u/platform/commit/d39db1de3d7fb87465bb277e3101d6fe6e31d54b))
* **mobile:** reject unresolved offline inventory setup dependencies ([bc14a6a](https://github.com/tutur3u/platform/commit/bc14a6a341926247b1f46659e4abb6dc18852649))
* **mobile:** repair offline settings review regressions ([d1e281a](https://github.com/tutur3u/platform/commit/d1e281acfcb68fc398d9553c18292e5fef04f814))
* **mobile:** reset dock sections and simplify responsive Profile ([4ff7363](https://github.com/tutur3u/platform/commit/4ff7363a8ba3d5d4d16c6f1d1a75cb082a8c10dc))
* **mobile:** reset dock sections and simplify responsive Profile ([#5735](https://github.com/tutur3u/platform/issues/5735)) ([1557706](https://github.com/tutur3u/platform/commit/15577064ac5a52993ca5cba1a90b391dd7213b4c))
* **mobile:** retain offline search and render cached rows lazily ([902844a](https://github.com/tutur3u/platform/commit/902844ad3d3c8c621c2855dc94ec807e18064b79))
* **mobile:** retain timezone save retry during cooldown reload ([afb5de6](https://github.com/tutur3u/platform/commit/afb5de6a44320b4fa2f3ca5025b242e58c31b27f))
* **mobile:** satisfy analysis and cart reconciliation checks ([d002af9](https://github.com/tutur3u/platform/commit/d002af9ae50a04c93ca91aa63b1645629ae08379))
* **mobile:** satisfy verification analyzer contracts ([d58316f](https://github.com/tutur3u/platform/commit/d58316f1ae7e8c003a17a4698f275b2b4a52b909))
* **mobile:** unblock workspace selection during preference outages ([#5754](https://github.com/tutur3u/platform/issues/5754)) ([59749d3](https://github.com/tutur3u/platform/commit/59749d3b6a28ef20e89bcdf29f500b33e7490f2a))
* **programming:** preserve bounded startup diagnostics ([c16ff0c](https://github.com/tutur3u/platform/commit/c16ff0ca79f692eee26804d497b6d82679de13d3))
* **release:** gate critical app promotion on staged API probes ([f39cea3](https://github.com/tutur3u/platform/commit/f39cea3621b504a9320b6d79675aa42b905b0476))
* **release:** gate critical app promotion on staged API probes ([#5761](https://github.com/tutur3u/platform/issues/5761)) ([391397f](https://github.com/tutur3u/platform/commit/391397f90f651d041d8f0e9ae566f8c3eab60dd7))
* **release:** preserve manual test notes and share filtering policy ([ff312ca](https://github.com/tutur3u/platform/commit/ff312ca8b16e36bdc7f65484cded768de3073c17))
* **release:** preserve safe staged probe failure reasons ([59319ee](https://github.com/tutur3u/platform/commit/59319eef4dd1a4c12df6ec1d913b1f6fd9c6e86f))
* **release:** require the Learn catalog API before promotion ([4de04e3](https://github.com/tutur3u/platform/commit/4de04e3886f3c9e1ed0150ca72d70286b2395eb9))
* **releases:** omit merge bookkeeping from release summaries ([c66e0b1](https://github.com/tutur3u/platform/commit/c66e0b139c89706db32ec70c3e87fcc9c4018b6c))
* **releases:** omit merge bookkeeping from release summaries ([#5741](https://github.com/tutur3u/platform/issues/5741)) ([552cd5a](https://github.com/tutur3u/platform/commit/552cd5ae85d19d9147f1367475f5f6b3bf522a63))
* **sdk:** bound mixed judge jobs and validate playground exports ([c5efff9](https://github.com/tutur3u/platform/commit/c5efff9427dc36cae6c4212871a335f9cd4bde03))
* **sdk:** defer hosted playground adapter to canonical API ([a18e65a](https://github.com/tutur3u/platform/commit/a18e65a862ab22b664b92f615a9e35d56e123a82))
* **sdk:** fence playground eviction and failed startup ([f208dcb](https://github.com/tutur3u/platform/commit/f208dcbd7a55385f2aa62ed8a822b029d7b5bc8f))
* **sdk:** fence playground lifecycle and keep agent leases alive ([d92e437](https://github.com/tutur3u/platform/commit/d92e437af1b2e2fdefa1036d40a71d1d45be4703))
* **sdk:** probe playground tools with the managed image path ([9571f35](https://github.com/tutur3u/platform/commit/9571f353f277efdddeeb22335a81b4475c2f4461))
* **security:** address egress guard review findings ([1e4916a](https://github.com/tutur3u/platform/commit/1e4916a7c9216ac1d5f9beadab0e69144337db7c))
* **security:** isolate bulk limits from ordinary web operations ([b3a9add](https://github.com/tutur3u/platform/commit/b3a9addf90271c7e28319a2138bbd52aaa294bc1))
* **security:** isolate caller budgets and preserve download semantics ([de5e090](https://github.com/tutur3u/platform/commit/de5e090f57e58b94bd235c47c494264a1192f5bf))
* **security:** isolate offline bulk protection from daily web operations ([#5752](https://github.com/tutur3u/platform/issues/5752)) ([fd32aca](https://github.com/tutur3u/platform/commit/fd32aca3319c67d82149975e8c3a7615dfbca275))
* **security:** stage offline download protection activation ([018f6ab](https://github.com/tutur3u/platform/commit/018f6ab2ada3fef843d66789dee6ec45fba905d3))
* **storage:** bound CMS downloads and API usage without Redis ([277ffeb](https://github.com/tutur3u/platform/commit/277ffebb738fbdb787fbe465cf6400de7ae910b2))
* **storage:** bound CMS downloads and API usage without Redis ([#5736](https://github.com/tutur3u/platform/issues/5736)) ([bbfc428](https://github.com/tutur3u/platform/commit/bbfc42886a0953ab11d303cdcceed8968127d40b))
* **storage:** generate entitlement types and isolate server tests ([da77152](https://github.com/tutur3u/platform/commit/da77152967946e64bdb8e593b340c99793830546))
* **ui:** close workspace popover without callback ([b0693b8](https://github.com/tutur3u/platform/commit/b0693b869721b9333d81d791554864291bec769d))
* **ui:** default browser workspace selectors to dropdowns ([9a8da02](https://github.com/tutur3u/platform/commit/9a8da02ceb7c03ee7eb05fb6cdc729144da6192a))
* **ui:** refine workspace dropdown recovery and viewport bounds ([06eeee7](https://github.com/tutur3u/platform/commit/06eeee77a26c1fc632907b72a5e0218d5d3fb49d))
* **web:** restore anchored workspace dropdown ([2df0661](https://github.com/tutur3u/platform/commit/2df0661f911eaec319cacca5d29242804d0e76ee))
* **web:** restore standard workspace dropdown ([#5739](https://github.com/tutur3u/platform/issues/5739)) ([f84ae74](https://github.com/tutur3u/platform/commit/f84ae741f2abab2a21aadfacda56bd7eba623466))


### Performance Improvements

* **ci:** preserve E2E proofs for inactive database proposals ([#5749](https://github.com/tutur3u/platform/issues/5749)) ([de0a76b](https://github.com/tutur3u/platform/commit/de0a76b0e769b98c5028f1b745fcfe4ea2514ffa))
* **ci:** reuse E2E proofs for inactive database proposals ([068b2e8](https://github.com/tutur3u/platform/commit/068b2e869085888b81c4706926392a53a7aba577))
* **ci:** reuse passing E2E proofs for unchanged suite inputs ([#5732](https://github.com/tutur3u/platform/issues/5732)) ([addfb9f](https://github.com/tutur3u/platform/commit/addfb9f4dadafdc006c5e1433d56bb1e7e7ed319))
* **ci:** reuse unchanged passing E2E suites ([60bfa37](https://github.com/tutur3u/platform/commit/60bfa3755990c3d49197ab7978440849aeb935dc))
* **devboxes:** parallelize bounded execution and retain warm playgrounds ([#5746](https://github.com/tutur3u/platform/issues/5746)) ([efd8ac4](https://github.com/tutur3u/platform/commit/efd8ac44b5c9f8cbf2ab5d64fbe89e1f7afe4f96))
* **devboxes:** parallelize bounded runner execution and retain warm playgrounds ([c31cbf3](https://github.com/tutur3u/platform/commit/c31cbf3a2a7cb5214d75183896791366affdc7e6))
</details>

<details><summary>ai-studio: 0.17.0</summary>

## [0.17.0](https://github.com/tutur3u/platform/compare/ai-studio-v0.16.0...ai-studio-v0.17.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>apps: 0.23.0</summary>

## [0.23.0](https://github.com/tutur3u/platform/compare/apps-v0.22.0...apps-v0.23.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>calendar: 0.33.0</summary>

## [0.33.0](https://github.com/tutur3u/platform/compare/calendar-v0.32.1...calendar-v0.33.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **mobile:** support offline data and safe inventory checkout ([a45d634](https://github.com/tutur3u/platform/commit/a45d63498cc1e686d1d070f5861cf938c4e9a9ef))
* **mobile:** support offline data, cached images, and safe inventory checkout ([#5734](https://github.com/tutur3u/platform/issues/5734)) ([2f0f397](https://github.com/tutur3u/platform/commit/2f0f39763daea56f1029fcc3e99e0be53c60e106))


### Bug Fixes

* **calendar:** atomically fence native transfer snapshots ([8b34406](https://github.com/tutur3u/platform/commit/8b34406a0133769d0e995ee8fb6e62c5dcf36d50))
* **calendar:** authorize historical native primary saga sources ([01656b7](https://github.com/tutur3u/platform/commit/01656b748772f07c25ebd190a8fe31e9b544917e))
* **calendar:** fence native edits and preserve recoverable route errors ([bff0488](https://github.com/tutur3u/platform/commit/bff0488d039b720aa796c9b3546b9cf30b86f95b))
* **calendar:** finalize compensated source deletion atomically ([14b2f73](https://github.com/tutur3u/platform/commit/14b2f73fe07056a63ff8c430ef3c73e505b082ce))
* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** preserve provider intent and reject ambiguous transfers ([4af32c7](https://github.com/tutur3u/platform/commit/4af32c70803b9277e76ffdc8fce0dbf3036e0424))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **mobile:** harden offline inventory and scoped cache replay ([d9c0b13](https://github.com/tutur3u/platform/commit/d9c0b13b386287fb874be62a8b8ec794deeb6407))
</details>

<details><summary>chat: 0.26.0</summary>

## [0.26.0](https://github.com/tutur3u/platform/compare/chat-v0.25.0...chat-v0.26.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>cms: 0.36.0</summary>

## [0.36.0](https://github.com/tutur3u/platform/compare/cms-v0.35.0...cms-v0.36.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
* **cms:** isolate machine credentials from browser assurance ([7647689](https://github.com/tutur3u/platform/commit/7647689ab07ab3b73f2290b33eab681a2077f3bf))
* **cms:** preserve rollout probes at API auth boundary ([f881e98](https://github.com/tutur3u/platform/commit/f881e981b4f5a0debad76f1b216ee7dcc1380640))
* **cms:** preserve rollout probes at API auth boundary ([#5766](https://github.com/tutur3u/platform/issues/5766)) ([d6e05ee](https://github.com/tutur3u/platform/commit/d6e05ee2b72648dea1ad83ee025d5ac3f7f3389d))
* **mobile:** integrate current main into offline settings ([218a6e6](https://github.com/tutur3u/platform/commit/218a6e663ce51cea6be5d8d0080888fa32c39fc3))
</details>

<details><summary>database: 1.39.0</summary>

## [1.39.0](https://github.com/tutur3u/platform/compare/database-v1.38.1...database-v1.39.0) (2026-10-03)


### Features

* **calendar:** add encrypted recoverable Google mutations ([4ecc93d](https://github.com/tutur3u/platform/commit/4ecc93d8ad1602407d5ebe0ddbff3a4e500f44f7))
* **calendar:** authorize and project recoverable mutation requests ([70ee17c](https://github.com/tutur3u/platform/commit/70ee17c1f55db60b8215d0c25c7de91e6a961a5a))
* **calendar:** journal provider creation and move generations ([f0b9573](https://github.com/tutur3u/platform/commit/f0b95734063121259f73f261d08cd40eb1a75ace))
* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **inventory:** add transactional offline create receipts ([d52a973](https://github.com/tutur3u/platform/commit/d52a973166abf9d2c2e7fbc8553ad53556f02669))
* **inventory:** expose authorized deduplicated native creates ([d71325d](https://github.com/tutur3u/platform/commit/d71325d22043ea80357770269f325e6ee1e5cd7b))
* **inventory:** merge products and warehouses with conflict previews ([ebcd1d9](https://github.com/tutur3u/platform/commit/ebcd1d9b16f100743c346c1665f42f4f867f379d))
* **inventory:** merge products and warehouses with conflict previews ([#5765](https://github.com/tutur3u/platform/issues/5765)) ([35e584c](https://github.com/tutur3u/platform/commit/35e584c50061a17d9515563e0ee71c04f0cec53a))
* **learn:** persist workspace Programming problems and authorized catalog APIs ([#5709](https://github.com/tutur3u/platform/issues/5709)) ([f39c84b](https://github.com/tutur3u/platform/commit/f39c84b9df76448683f439c78f1897847b609299))
* **mobile:** sync inventory prerequisites and dependent writes automatically ([#5743](https://github.com/tutur3u/platform/issues/5743)) ([242fbbd](https://github.com/tutur3u/platform/commit/242fbbdb90671325af104f6c9fe79c43b81a82c1))
* **security:** scale abuse budgets by paid plans and memberships ([93ccf02](https://github.com/tutur3u/platform/commit/93ccf0237c79addaed3ab8b653bd8b57b27a9557))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** atomically fence native transfer snapshots ([8b34406](https://github.com/tutur3u/platform/commit/8b34406a0133769d0e995ee8fb6e62c5dcf36d50))
* **calendar:** finalize compensated source deletion atomically ([14b2f73](https://github.com/tutur3u/platform/commit/14b2f73fe07056a63ff8c430ef3c73e505b082ce))
* **calendar:** harden compatibility contract validation ([c3b3a2f](https://github.com/tutur3u/platform/commit/c3b3a2ff7a9a7b8c2851f0c4f7a942ef56c43e6c))
* **calendar:** order unapplied provider migrations after main ([e230dc0](https://github.com/tutur3u/platform/commit/e230dc05567f8185710d0ccdc4b779275955beca))
* **calendar:** retain native generations and immutable saga retries ([adb8662](https://github.com/tutur3u/platform/commit/adb8662ba727911f21a685b30bbb031c027f9cbc))
* **calendar:** seal provider source fingerprints and label version ([3110590](https://github.com/tutur3u/platform/commit/311059005645374c9156193db5a473ddda764483))
* **calendar:** stage retained generation compatibility guard ([7795818](https://github.com/tutur3u/platform/commit/7795818d776bcb6a069450faab615de86ee0761b))
* **calendar:** stage retained generation compatibility guard ([#5727](https://github.com/tutur3u/platform/issues/5727)) ([5c87bfe](https://github.com/tutur3u/platform/commit/5c87bfee00c5cd9574fe984909fd40d64629db0f))
* **ci:** allow isolated database configuration rewrite ([42a8251](https://github.com/tutur3u/platform/commit/42a82519ba80a3274a2f404e52fb7dc8187129a7))
* **ci:** classify disposable startup failures without raw logs ([7f2c1cc](https://github.com/tutur3u/platform/commit/7f2c1cc325642d403f1f65cba17ac0efa1e543aa))
* **ci:** classify kernel inventory decode failures ([791dc16](https://github.com/tutur3u/platform/commit/791dc16dffae3381bff139db3258be6a2fa21000))
* **ci:** emit only actual lifecycle metadata checkpoints ([7951fb5](https://github.com/tutur3u/platform/commit/7951fb589aa83ce1b5039acae1960f67929d71b2))
* **ci:** expose bounded lifecycle phase checkpoints ([f610b5c](https://github.com/tutur3u/platform/commit/f610b5c2b570990fea3488166d6ad7c9150f93a6))
* **ci:** share atomic writes and strengthen proposal regression checks ([50490f2](https://github.com/tutur3u/platform/commit/50490f2f0b18d1e48314f9c1c9489997dbdf5cdb))
* **ci:** verify inherited leaf cgroup admission filters ([67181e0](https://github.com/tutur3u/platform/commit/67181e0ee0462cec2f8ff67d10060ee8dc78c4fa))
* **database:** abort owned helpers on diagnostic callback errors ([4e97654](https://github.com/tutur3u/platform/commit/4e97654b7d68b06ee1b7c71e4b5ac77d1ccf0b52))
* **database:** admit tracked Git files before hosted staging ([a621ae2](https://github.com/tutur3u/platform/commit/a621ae28e168d0da557c64795717b64e13729da3))
* **database:** align hosted command and runtime config isolation ([5864e06](https://github.com/tutur3u/platform/commit/5864e0664318922b06c3cffedbd3104286889de0))
* **database:** bound commands and isolate CLI temporary state ([17a182e](https://github.com/tutur3u/platform/commit/17a182e21663b57fb237879ed139f427edfc5589))
* **database:** diagnose hosted policy parser stages without raw output ([a315afb](https://github.com/tutur3u/platform/commit/a315afbb7fe27324b9841d0f30be86ef41a68053))
* **database:** distinguish hosted policy admission failures ([ecf546b](https://github.com/tutur3u/platform/commit/ecf546b18ba1ae9cad727ae4a4c123ebb68127cf))
* **database:** enforce admitted subprocess boundaries ([29d93e0](https://github.com/tutur3u/platform/commit/29d93e0c7f0f74607c3ec4bc97b23b7ebfd0e79c))
* **database:** expose safe hosted preparation checkpoints ([6d1d0e2](https://github.com/tutur3u/platform/commit/6d1d0e223c3cee83b529172c33d6fcb313f2a303))
* **database:** identify failed hosted command phases safely ([aca0d92](https://github.com/tutur3u/platform/commit/aca0d92743c90974b440b292ce53bd254ec1929a))
* **database:** isolate synthetic hosted CLI environment ([b1e366d](https://github.com/tutur3u/platform/commit/b1e366d269b671565f8ac38d4ce6d3deb682693a))
* **database:** keep fixture pipe failures inside cleanup lifecycle ([4211eef](https://github.com/tutur3u/platform/commit/4211eef2742f0014ab437eca0defc8ccfd9ea8d1))
* **database:** report fixed policy mismatch diagnostics ([9662562](https://github.com/tutur3u/platform/commit/9662562308c0e1ba68da31d833daccd605799a29))
* **database:** resolve native CLI for isolated hosted probes ([2dce73a](https://github.com/tutur3u/platform/commit/2dce73ace89c894d5782db9bbd8a775222a958ef))
* **database:** review isolated native CLI environment ([#5717](https://github.com/tutur3u/platform/issues/5717)) ([6442b65](https://github.com/tutur3u/platform/commit/6442b654f96ac7939d1ce19586ddbaa8a14f3d69))
* **database:** scope guest restore CTE inside assertion ([8b240e6](https://github.com/tutur3u/platform/commit/8b240e6fed3f0a8a94daaeb7b2c6cfcbb24b61bd))
* **database:** use current inventory migration timestamp ([2db1fa9](https://github.com/tutur3u/platform/commit/2db1fa9974a10f18134f8ece0bddd30dfc3a44e8))
* **inventory:** bound identity locks by workspace buckets ([279a56c](https://github.com/tutur3u/platform/commit/279a56c38e251f876bba4e6788c2ee100bb70bbc))
* **inventory:** close merge API and contract review gaps ([37a0f44](https://github.com/tutur3u/platform/commit/37a0f446517318a270037a3ec0fb1937dfb13373))
* **inventory:** filter merged warehouse aliases in database ([33450b7](https://github.com/tutur3u/platform/commit/33450b777075e5093434e26a36c5161f13243db0))
* **inventory:** harden durable offline replay and validation ([7166401](https://github.com/tutur3u/platform/commit/7166401d06e357d24ab92ec104cf4e48ef1f5b3a))
* **inventory:** preserve invoice recovery and scope merge locks ([ec5352e](https://github.com/tutur3u/platform/commit/ec5352e557eb934219816f21710a169e6412df22))
* **inventory:** settle concurrent fixtures and retry missing labels ([7c279ba](https://github.com/tutur3u/platform/commit/7c279ba4e0517d189efb840aa171f3fcb3d3ba57))
* **learn:** harden Programming boundaries and prove database contract ([f7723c3](https://github.com/tutur3u/platform/commit/f7723c31a74dadacd4a4352bfcb59e5f86e1bfb5))
* **learn:** tighten Programming input and request boundaries ([e13c7c6](https://github.com/tutur3u/platform/commit/e13c7c63a8de6181835d112de27cda1b670e1097))
* **mobile:** preserve sales receipts and finance API contracts ([#5750](https://github.com/tutur3u/platform/issues/5750)) ([1c3ee92](https://github.com/tutur3u/platform/commit/1c3ee9280aa144ed2417a0b1fd09da4794ece089))
* **programming:** preserve bounded startup diagnostics ([c16ff0c](https://github.com/tutur3u/platform/commit/c16ff0ca79f692eee26804d497b6d82679de13d3))
* **security:** address egress guard review findings ([1e4916a](https://github.com/tutur3u/platform/commit/1e4916a7c9216ac1d5f9beadab0e69144337db7c))
* **security:** isolate caller budgets and preserve download semantics ([de5e090](https://github.com/tutur3u/platform/commit/de5e090f57e58b94bd235c47c494264a1192f5bf))
* **storage:** bound CMS downloads and API usage without Redis ([277ffeb](https://github.com/tutur3u/platform/commit/277ffebb738fbdb787fbe465cf6400de7ae910b2))
* **storage:** bound CMS downloads and API usage without Redis ([#5736](https://github.com/tutur3u/platform/issues/5736)) ([bbfc428](https://github.com/tutur3u/platform/commit/bbfc42886a0953ab11d303cdcceed8968127d40b))
</details>

<details><summary>drive: 0.31.0</summary>

## [0.31.0](https://github.com/tutur3u/platform/compare/drive-v0.30.0...drive-v0.31.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>finance: 0.33.0</summary>

## [0.33.0](https://github.com/tutur3u/platform/compare/finance-v0.32.0...finance-v0.33.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **inventory:** expose authorized deduplicated native creates ([d71325d](https://github.com/tutur3u/platform/commit/d71325d22043ea80357770269f325e6ee1e5cd7b))
* **mobile:** sync inventory prerequisites and dependent writes automatically ([#5743](https://github.com/tutur3u/platform/issues/5743)) ([242fbbd](https://github.com/tutur3u/platform/commit/242fbbdb90671325af104f6c9fe79c43b81a82c1))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **mobile:** preserve sales receipts and finance API contracts ([#5750](https://github.com/tutur3u/platform/issues/5750)) ([1c3ee92](https://github.com/tutur3u/platform/commit/1c3ee9280aa144ed2417a0b1fd09da4794ece089))
</details>

<details><summary>hive: 0.25.0</summary>

## [0.25.0](https://github.com/tutur3u/platform/compare/hive-v0.24.1...hive-v0.25.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>infra: 0.32.0</summary>

## [0.32.0](https://github.com/tutur3u/platform/compare/infra-v0.31.0...infra-v0.32.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
* **mobile:** align reviewer notes and shared email guard ([6ef2c0b](https://github.com/tutur3u/platform/commit/6ef2c0b15fa4ab446fb56561f01d23afd9ab3e79))
* **mobile:** guard beta review access metadata ([#5678](https://github.com/tutur3u/platform/issues/5678)) ([190f305](https://github.com/tutur3u/platform/commit/190f3052e24441f57fe6a745337c7a3a72e85b4e))
</details>

<details><summary>inventory: 0.35.0</summary>

## [0.35.0](https://github.com/tutur3u/platform/compare/inventory-v0.34.0...inventory-v0.35.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **inventory:** expose authorized deduplicated native creates ([d71325d](https://github.com/tutur3u/platform/commit/d71325d22043ea80357770269f325e6ee1e5cd7b))
* **inventory:** merge products and warehouses with conflict previews ([ebcd1d9](https://github.com/tutur3u/platform/commit/ebcd1d9b16f100743c346c1665f42f4f867f379d))
* **inventory:** merge products and warehouses with conflict previews ([#5765](https://github.com/tutur3u/platform/issues/5765)) ([35e584c](https://github.com/tutur3u/platform/commit/35e584c50061a17d9515563e0ee71c04f0cec53a))
* **mobile:** sync inventory prerequisites and dependent writes automatically ([#5743](https://github.com/tutur3u/platform/issues/5743)) ([242fbbd](https://github.com/tutur3u/platform/commit/242fbbdb90671325af104f6c9fe79c43b81a82c1))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **inventory:** close merge API and contract review gaps ([37a0f44](https://github.com/tutur3u/platform/commit/37a0f446517318a270037a3ec0fb1937dfb13373))
* **inventory:** declare merge selector debounce dependency ([33d564a](https://github.com/tutur3u/platform/commit/33d564a171a8283e350ab545007c6c473b99317a))
* **inventory:** filter merged warehouse aliases in database ([33450b7](https://github.com/tutur3u/platform/commit/33450b777075e5093434e26a36c5161f13243db0))
* **inventory:** keep merge policy pickers context appropriate ([7264070](https://github.com/tutur3u/platform/commit/7264070773a145ecf8bd2b70a13e7ec7c397505e))
* **inventory:** load full sale filter choices and paged categories ([e10a488](https://github.com/tutur3u/platform/commit/e10a48882a1b859f9d6e62a139786e5bc5a904c2))
* **inventory:** make merge review searchable and mobile accessible ([b1f2859](https://github.com/tutur3u/platform/commit/b1f2859934400b12f364161244bae24ca5e234d6))
* **inventory:** narrow finance category merge labels ([f954fa9](https://github.com/tutur3u/platform/commit/f954fa995d2956cb6679c383373d499e8d783023))
* **inventory:** normalize blank product option labels ([b3decc1](https://github.com/tutur3u/platform/commit/b3decc12272ad3638fcd23c12816a2fc59db5c64))
* **inventory:** preserve table and view type inference ([8691a5e](https://github.com/tutur3u/platform/commit/8691a5e050502c3c125fa294b6aca6041e5ffbd1))
* **inventory:** preserve verified legacy warehouse reads ([28f4fe3](https://github.com/tutur3u/platform/commit/28f4fe3929699928f2f944604b43846d1f5d2377))
* **inventory:** preserve warehouse UUID casing parity ([8b688c1](https://github.com/tutur3u/platform/commit/8b688c150273981f323fe076741f096b5796b9cb))
* **inventory:** reset merge search and cover persistent errors ([4c3c16d](https://github.com/tutur3u/platform/commit/4c3c16d84adc2162a6fdeb7dce7f6ab2e17d5975))
* **inventory:** restore sale catalog when search clears ([10ac21f](https://github.com/tutur3u/platform/commit/10ac21f9979a051fcc794c548e75fa3cebd0949d))
* **inventory:** settle concurrent fixtures and retry missing labels ([7c279ba](https://github.com/tutur3u/platform/commit/7c279ba4e0517d189efb840aa171f3fcb3d3ba57))
* **inventory:** type filter option entries as tuples ([3c573c9](https://github.com/tutur3u/platform/commit/3c573c9357c5b081d694b45b1266a36e555cb8f6))
* **mobile:** preserve sales receipts and finance API contracts ([#5750](https://github.com/tutur3u/platform/issues/5750)) ([1c3ee92](https://github.com/tutur3u/platform/commit/1c3ee9280aa144ed2417a0b1fd09da4794ece089))
</details>

<details><summary>storefront: 0.30.0</summary>

## [0.30.0](https://github.com/tutur3u/platform/compare/storefront-v0.29.1...storefront-v0.30.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
</details>

<details><summary>tanstack-web: 0.39.0</summary>

## [0.39.0](https://github.com/tutur3u/platform/compare/tanstack-web-v0.38.0...tanstack-web-v0.39.0) (2026-10-03)


### Features

* **ai:** support self-hosted ChatGPT subscriptions ([a6ce805](https://github.com/tutur3u/platform/commit/a6ce8059077c312369e1693d0e1d8fbcfbdde131))
* **ai:** support self-hosted ChatGPT subscriptions ([#5728](https://github.com/tutur3u/platform/issues/5728)) ([67be76a](https://github.com/tutur3u/platform/commit/67be76ad4e140a2883afb488f5af2e28e40f13a2))
* **inventory:** expose authorized deduplicated native creates ([d71325d](https://github.com/tutur3u/platform/commit/d71325d22043ea80357770269f325e6ee1e5cd7b))
* **inventory:** merge products and warehouses with conflict previews ([ebcd1d9](https://github.com/tutur3u/platform/commit/ebcd1d9b16f100743c346c1665f42f4f867f379d))
* **inventory:** merge products and warehouses with conflict previews ([#5765](https://github.com/tutur3u/platform/issues/5765)) ([35e584c](https://github.com/tutur3u/platform/commit/35e584c50061a17d9515563e0ee71c04f0cec53a))
* **learn:** persist workspace Programming problems and authorized catalog APIs ([#5709](https://github.com/tutur3u/platform/issues/5709)) ([f39c84b](https://github.com/tutur3u/platform/commit/f39c84b9df76448683f439c78f1897847b609299))
* **mobile:** sync inventory prerequisites and dependent writes automatically ([#5743](https://github.com/tutur3u/platform/issues/5743)) ([242fbbd](https://github.com/tutur3u/platform/commit/242fbbdb90671325af104f6c9fe79c43b81a82c1))
* **seo:** automate sitemap discovery and improve bilingual team messaging ([#5729](https://github.com/tutur3u/platform/issues/5729)) ([1ec6d2e](https://github.com/tutur3u/platform/commit/1ec6d2e3eef4bb19af62133dac2ab441e5e62409))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **deps:** patch TanStack Start server response XSS ([4f491fb](https://github.com/tutur3u/platform/commit/4f491fb2bd85b7d81ce8c0a541b2e2737f1745ba))
* **deps:** patch TanStack Start XSS to unblock release builds ([#5755](https://github.com/tutur3u/platform/issues/5755)) ([abc15af](https://github.com/tutur3u/platform/commit/abc15affacff8ab211af41cb1e1d1c10ff8750b9))
* **finance:** authenticate exchange rates with satellite sessions ([33368f1](https://github.com/tutur3u/platform/commit/33368f1c00f86f71b4a66702899af262a90122e2))
* **finance:** authenticate exchange rates with satellite sessions ([#5760](https://github.com/tutur3u/platform/issues/5760)) ([759b1e5](https://github.com/tutur3u/platform/commit/759b1e52f8867aced2d64288af43b861d5ebccdc))
* **inventory:** preserve verified legacy warehouse reads ([28f4fe3](https://github.com/tutur3u/platform/commit/28f4fe3929699928f2f944604b43846d1f5d2377))
* **migration:** reconcile stack route tracking and counts ([f6c0e9d](https://github.com/tutur3u/platform/commit/f6c0e9d837ef551bd2856f6a5c8308d982c3e57e))
* **mobile:** preserve sales receipts and finance API contracts ([#5750](https://github.com/tutur3u/platform/issues/5750)) ([1c3ee92](https://github.com/tutur3u/platform/commit/1c3ee9280aa144ed2417a0b1fd09da4794ece089))
* **security:** address egress guard review findings ([1e4916a](https://github.com/tutur3u/platform/commit/1e4916a7c9216ac1d5f9beadab0e69144337db7c))
* **seo:** preserve public crawlability and strengthen discovery safeguards ([dcceebc](https://github.com/tutur3u/platform/commit/dcceebcc66e1785a85525bb26297dc205950dfd4))
* **storage:** bound CMS downloads and API usage without Redis ([277ffeb](https://github.com/tutur3u/platform/commit/277ffebb738fbdb787fbe465cf6400de7ae910b2))
* **storage:** bound CMS downloads and API usage without Redis ([#5736](https://github.com/tutur3u/platform/issues/5736)) ([bbfc428](https://github.com/tutur3u/platform/commit/bbfc42886a0953ab11d303cdcceed8968127d40b))
</details>

<details><summary>learn: 0.30.0</summary>

## [0.30.0](https://github.com/tutur3u/platform/compare/learn-v0.29.0...learn-v0.30.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **learn:** add canonical Programming catalog, author forms and scoped drafts ([#5710](https://github.com/tutur3u/platform/issues/5710)) ([4e658d8](https://github.com/tutur3u/platform/commit/4e658d8c2c3c14b3b66b5e0accbf74fa4b16917e))
* **learn:** improve Programming workspace controls and layout ([#5707](https://github.com/tutur3u/platform/issues/5707)) ([0f432ba](https://github.com/tutur3u/platform/commit/0f432ba02692f7f936ce9b191e3b152a1a67e970))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))
* **workspaces:** reconcile Hidden picker and preserve membership fences ([c9806bb](https://github.com/tutur3u/platform/commit/c9806bb12a49a777fe28ab3653bb19d9350a1471))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
* **learn:** explicitly strip types in programming QA launcher ([fc521bb](https://github.com/tutur3u/platform/commit/fc521bb4a29708e9759fb6ef01f309ef26f793fa))
* **learn:** resolve Programming route and draft review findings ([0f3b71a](https://github.com/tutur3u/platform/commit/0f3b71ab039b6f9632329d0674e42a622d7a1354))
* **learn:** resolve server boundary marker in Programming tests ([1a54dd6](https://github.com/tutur3u/platform/commit/1a54dd61ad5632c1fe65e177262f8789b0c4a126))
* **learn:** test Programming workspace source and document catalog rules ([53bb7ac](https://github.com/tutur3u/platform/commit/53bb7ac27414f342bace2f7589b89f3abf9f484b))
</details>

<details><summary>mail: 0.28.0</summary>

## [0.28.0](https://github.com/tutur3u/platform/compare/mail-v0.27.0...mail-v0.28.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **mail:** link invitations to Calendar with explicit preview on web and mobile ([#5673](https://github.com/tutur3u/platform/issues/5673)) ([726d57b](https://github.com/tutur3u/platform/commit/726d57bb095e3a85120274c315e093c7388bb45b))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
* **mail:** preserve actor scope and calendar link metadata ([e59ffc8](https://github.com/tutur3u/platform/commit/e59ffc873fde1cc3274ab18e851bb7c90b6a3ff5))
</details>

<details><summary>meet: 0.33.0</summary>

## [0.33.0](https://github.com/tutur3u/platform/compare/meet-v0.32.1...meet-v0.33.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>mind: 0.24.0</summary>

## [0.24.0](https://github.com/tutur3u/platform/compare/mind-v0.23.0...mind-v0.24.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>mobile: 0.23.0</summary>

## [0.23.0](https://github.com/tutur3u/platform/compare/mobile-v0.22.0...mobile-v0.23.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **mobile:** add personal Agenda and unify search keyboard navigation ([bff9e55](https://github.com/tutur3u/platform/commit/bff9e5566967027ad237e2fbd3b45b6012132760))
* **mobile:** consolidate offline data and settings ([a96039a](https://github.com/tutur3u/platform/commit/a96039a4987782d69e566a57743aa2c1adc65882))
* **mobile:** consolidate offline data and settings ([#5768](https://github.com/tutur3u/platform/issues/5768)) ([a4b1256](https://github.com/tutur3u/platform/commit/a4b1256bb8bd5a53662f3c2597c13702b23a670e))
* **mobile:** inspect individual stored offline items ([fd68e81](https://github.com/tutur3u/platform/commit/fd68e813279bb2a4363ec18be198951379d7838c))
* **mobile:** make Timeline a full surface with persistent activity ([b6b912a](https://github.com/tutur3u/platform/commit/b6b912a7a94d40a42fa600112ef12fdc1761d803))
* **mobile:** model typed offline prerequisite graphs ([6a9012a](https://github.com/tutur3u/platform/commit/6a9012abf251edff18a4bf2b8c3cca3cfbc9caf6))
* **mobile:** persist typed inventory dependency identities ([7c2d86f](https://github.com/tutur3u/platform/commit/7c2d86fae5f8fac28e05e94fbc89516584cababc))
* **mobile:** replay inventory dependencies automatically ([fa8734c](https://github.com/tutur3u/platform/commit/fa8734ccebe827cab4bb8dc283f639229e7da50a))
* **mobile:** simplify Timeline and add personal Agenda navigation ([#5767](https://github.com/tutur3u/platform/issues/5767)) ([350184b](https://github.com/tutur3u/platform/commit/350184b8804dd6ec94db5914e6e546d553e5dbfe))
* **mobile:** streamline Assistant composer and navigation ([#5769](https://github.com/tutur3u/platform/issues/5769)) ([53200ca](https://github.com/tutur3u/platform/commit/53200ca3b8a526509a8eee95c446bc1d1b172271))
* **mobile:** streamline assistant prompt and navigation ([c41817a](https://github.com/tutur3u/platform/commit/c41817a6360e2457e7e5ef7a0ba9162b3e4cdbb4))
* **mobile:** support offline data and safe inventory checkout ([a45d634](https://github.com/tutur3u/platform/commit/a45d63498cc1e686d1d070f5861cf938c4e9a9ef))
* **mobile:** support offline data, cached images, and safe inventory checkout ([#5734](https://github.com/tutur3u/platform/issues/5734)) ([2f0f397](https://github.com/tutur3u/platform/commit/2f0f39763daea56f1029fcc3e99e0be53c60e106))
* **mobile:** sync inventory prerequisites and dependent writes automatically ([#5743](https://github.com/tutur3u/platform/issues/5743)) ([242fbbd](https://github.com/tutur3u/platform/commit/242fbbdb90671325af104f6c9fe79c43b81a82c1))


### Bug Fixes

* **calendar:** integrate all inventory setup reference guards ([08e1ab1](https://github.com/tutur3u/platform/commit/08e1ab1836b45d623ab3abe092650d5053c78dad))
* **calendar:** integrate inventory setup dependency guards ([6711361](https://github.com/tutur3u/platform/commit/67113612bdab5e7a5f179b92f61ac46db9115574))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **inventory:** harden durable offline replay and validation ([7166401](https://github.com/tutur3u/platform/commit/7166401d06e357d24ab92ec104cf4e48ef1f5b3a))
* **mobile:** align assistant floating controls and model eligibility ([f99fa11](https://github.com/tutur3u/platform/commit/f99fa11e82ba8bf35a3c0bb2cce3836ca5fd3a5d))
* **mobile:** align fullscreen workspace picker with shell ([ed49181](https://github.com/tutur3u/platform/commit/ed491810a84c14580738cb8a49402fc49d10daf6))
* **mobile:** align fullscreen workspace picker with shell ([#5742](https://github.com/tutur3u/platform/issues/5742)) ([863a858](https://github.com/tutur3u/platform/commit/863a8582bb4747fc7aaa04c65975aa45612641aa))
* **mobile:** avoid duplicate Apps brand announcements ([8e67059](https://github.com/tutur3u/platform/commit/8e67059fc790de282f82eac3c5817b8749cb7e50))
* **mobile:** bind outbox replay to its owning account ([50e4a80](https://github.com/tutur3u/platform/commit/50e4a805b948ea5b48c0998344fb322edc0095de))
* **mobile:** bound dock labels and preserve accessibility ([39712cb](https://github.com/tutur3u/platform/commit/39712cb813c17aaed31ccb1d93dfd15cd04af8ea))
* **mobile:** correct calendar times and timezone recovery ([#5753](https://github.com/tutur3u/platform/issues/5753)) ([94bd020](https://github.com/tutur3u/platform/commit/94bd0200ef236a3aaa337277a29ba207f09fc8b5))
* **mobile:** correct calendar wall times and timezone recovery ([f51e701](https://github.com/tutur3u/platform/commit/f51e701f46a0eeb64746bf98a9bb4e6e7bc9bbf4))
* **mobile:** enforce monotonic offline request spacing ([1cb15e6](https://github.com/tutur3u/platform/commit/1cb15e658b4e66efb265be129dc44453dc4a5dbe))
* **mobile:** fence cache publication and finance workspace transitions ([a798346](https://github.com/tutur3u/platform/commit/a7983465a934a47e185f4a1244c9edd2e1af8120))
* **mobile:** fence invalid inventory replay and preserve receipts ([23ea162](https://github.com/tutur3u/platform/commit/23ea162aeb2b5eed98efb4fb3636e48fdb0df5da))
* **mobile:** fence visibility changes during preference recovery ([d52318f](https://github.com/tutur3u/platform/commit/d52318f9ffe58afdfad0d5a275e166bdec1bf8b1))
* **mobile:** guard every pending product setup reference ([c4bcc00](https://github.com/tutur3u/platform/commit/c4bcc00f3c784c5c39c8023dad7442f832c80099))
* **mobile:** harden offline inventory and scoped cache replay ([d9c0b13](https://github.com/tutur3u/platform/commit/d9c0b13b386287fb874be62a8b8ec794deeb6407))
* **mobile:** integrate current main into offline settings ([218a6e6](https://github.com/tutur3u/platform/commit/218a6e663ce51cea6be5d8d0080888fa32c39fc3))
* **mobile:** integrate scoped Agenda repairs into Assistant ([62e5a66](https://github.com/tutur3u/platform/commit/62e5a6663b0663939728475308c263f4b5afcda5))
* **mobile:** keep workspace selection usable during preference outages ([ae5e419](https://github.com/tutur3u/platform/commit/ae5e4193307b0101c92b753291720994f3d26fb7))
* **mobile:** persist automatic timezone and retain scoped errors ([2d959d4](https://github.com/tutur3u/platform/commit/2d959d4cf1b6c5e550cc876f3b2722233fac17a2))
* **mobile:** preserve dock reset and profile accessibility semantics ([8ac36ad](https://github.com/tutur3u/platform/commit/8ac36ad3821c1e1c59d090964ba136b81b023c91))
* **mobile:** preserve foreground inventory verification ([0ce0bea](https://github.com/tutur3u/platform/commit/0ce0bea3c9c91f35030c473eca5fb319438e068b))
* **mobile:** preserve Home state and scope Agenda timezone ([1565656](https://github.com/tutur3u/platform/commit/15656564b93c10c7b7394de2c2f71883634f3a1b))
* **mobile:** preserve inventory foreground transport and durable fixtures ([0e68cac](https://github.com/tutur3u/platform/commit/0e68cac8891138449221479aa563738250f764ce))
* **mobile:** preserve sales receipts and finance API contracts ([c940cda](https://github.com/tutur3u/platform/commit/c940cda7ad60acadae8e005328b4e1d11701ecb7))
* **mobile:** preserve sales receipts and finance API contracts ([#5750](https://github.com/tutur3u/platform/issues/5750)) ([1c3ee92](https://github.com/tutur3u/platform/commit/1c3ee9280aa144ed2417a0b1fd09da4794ece089))
* **mobile:** preserve timezone diagnostics and restore offline scope safely ([e34a3f2](https://github.com/tutur3u/platform/commit/e34a3f2503619b630b2d84dc96beb3317c5d67e2))
* **mobile:** preserve timezone retries and calendar minute boundaries ([e68fb37](https://github.com/tutur3u/platform/commit/e68fb37ab895e5c8eb7de13e504a041a97faf40b))
* **mobile:** propagate account-bound offline replay into navigation stack ([55b0b1f](https://github.com/tutur3u/platform/commit/55b0b1f6255d737c12846b56bc655a4ef0cab532))
* **mobile:** refresh collapsed offline item lists ([d39db1d](https://github.com/tutur3u/platform/commit/d39db1de3d7fb87465bb277e3101d6fe6e31d54b))
* **mobile:** reject unresolved offline inventory setup dependencies ([bc14a6a](https://github.com/tutur3u/platform/commit/bc14a6a341926247b1f46659e4abb6dc18852649))
* **mobile:** repair offline settings review regressions ([d1e281a](https://github.com/tutur3u/platform/commit/d1e281acfcb68fc398d9553c18292e5fef04f814))
* **mobile:** reset dock sections and simplify responsive Profile ([4ff7363](https://github.com/tutur3u/platform/commit/4ff7363a8ba3d5d4d16c6f1d1a75cb082a8c10dc))
* **mobile:** reset dock sections and simplify responsive Profile ([#5735](https://github.com/tutur3u/platform/issues/5735)) ([1557706](https://github.com/tutur3u/platform/commit/15577064ac5a52993ca5cba1a90b391dd7213b4c))
* **mobile:** retain offline search and render cached rows lazily ([902844a](https://github.com/tutur3u/platform/commit/902844ad3d3c8c621c2855dc94ec807e18064b79))
* **mobile:** retain timezone save retry during cooldown reload ([afb5de6](https://github.com/tutur3u/platform/commit/afb5de6a44320b4fa2f3ca5025b242e58c31b27f))
* **mobile:** satisfy analysis and cart reconciliation checks ([d002af9](https://github.com/tutur3u/platform/commit/d002af9ae50a04c93ca91aa63b1645629ae08379))
* **mobile:** satisfy verification analyzer contracts ([d58316f](https://github.com/tutur3u/platform/commit/d58316f1ae7e8c003a17a4698f275b2b4a52b909))
* **mobile:** unblock workspace selection during preference outages ([#5754](https://github.com/tutur3u/platform/issues/5754)) ([59749d3](https://github.com/tutur3u/platform/commit/59749d3b6a28ef20e89bcdf29f500b33e7490f2a))
* **release:** preserve manual test notes and share filtering policy ([ff312ca](https://github.com/tutur3u/platform/commit/ff312ca8b16e36bdc7f65484cded768de3073c17))
* **releases:** omit merge bookkeeping from release summaries ([c66e0b1](https://github.com/tutur3u/platform/commit/c66e0b139c89706db32ec70c3e87fcc9c4018b6c))
* **releases:** omit merge bookkeeping from release summaries ([#5741](https://github.com/tutur3u/platform/issues/5741)) ([552cd5a](https://github.com/tutur3u/platform/commit/552cd5ae85d19d9147f1367475f5f6b3bf522a63))
</details>

<details><summary>nova: 0.41.0</summary>

## [0.41.0](https://github.com/tutur3u/platform/compare/nova-v0.40.0...nova-v0.41.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>tools: 0.21.0</summary>

## [0.21.0](https://github.com/tutur3u/platform/compare/tools-v0.20.0...tools-v0.21.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>rewise: 0.43.0</summary>

## [0.43.0](https://github.com/tutur3u/platform/compare/rewise-v0.42.0...rewise-v0.43.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>shortener: 0.23.0</summary>

## [0.23.0](https://github.com/tutur3u/platform/compare/shortener-v0.22.0...shortener-v0.23.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>tasks: 0.37.0</summary>

## [0.37.0](https://github.com/tutur3u/platform/compare/tasks-v0.36.3...tasks-v0.37.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
</details>

<details><summary>teach: 0.26.0</summary>

## [0.26.0](https://github.com/tutur3u/platform/compare/teach-v0.25.1...teach-v0.26.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>pay: 0.20.0</summary>

## [0.20.0](https://github.com/tutur3u/platform/compare/pay-v0.19.0...pay-v0.20.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>contacts: 0.27.0</summary>

## [0.27.0](https://github.com/tutur3u/platform/compare/contacts-v0.26.1...contacts-v0.27.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>forms: 0.18.0</summary>

## [0.18.0](https://github.com/tutur3u/platform/compare/forms-v0.17.0...forms-v0.18.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>git: 0.13.0</summary>

## [0.13.0](https://github.com/tutur3u/platform/compare/git-v0.12.0...git-v0.13.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>track: 0.29.0</summary>

## [0.29.0](https://github.com/tutur3u/platform/compare/track-v0.28.0...track-v0.29.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>ai: 0.17.0</summary>

## [0.17.0](https://github.com/tutur3u/platform/compare/ai-v0.16.1...ai-v0.17.0) (2026-10-03)


### Features

* **ai:** support self-hosted ChatGPT subscriptions ([a6ce805](https://github.com/tutur3u/platform/commit/a6ce8059077c312369e1693d0e1d8fbcfbdde131))
* **ai:** support self-hosted ChatGPT subscriptions ([#5728](https://github.com/tutur3u/platform/issues/5728)) ([67be76a](https://github.com/tutur3u/platform/commit/67be76ad4e140a2883afb488f5af2e28e40f13a2))


### Bug Fixes

* **ai:** address ChatGPT subscription review findings ([f0bf14f](https://github.com/tutur3u/platform/commit/f0bf14f22cdec1029a29a2a9cf7fd108d6558504))
* **ai:** bind ChatGPT routing to request snapshots ([7c51eb4](https://github.com/tutur3u/platform/commit/7c51eb4634131a9ece2a29c32d1b7f33e0724bf7))
* **ai:** close subscription retry and billing edges ([91d0cc6](https://github.com/tutur3u/platform/commit/91d0cc6eb7f729bef21ea6ca2f5e36c59760b7b3))
</details>

<details><summary>education-core: 0.5.0</summary>

## [0.5.0](https://github.com/tutur3u/platform/compare/education-core-v0.4.2...education-core-v0.5.0) (2026-10-03)


### Features

* **learn:** persist workspace Programming problems and authorized catalog APIs ([#5709](https://github.com/tutur3u/platform/issues/5709)) ([f39c84b](https://github.com/tutur3u/platform/commit/f39c84b9df76448683f439c78f1897847b609299))


### Bug Fixes

* **learn:** harden Programming boundaries and prove database contract ([f7723c3](https://github.com/tutur3u/platform/commit/f7723c31a74dadacd4a4352bfcb59e5f86e1bfb5))
* **learn:** preserve trimmed localized programming limits ([85e75f4](https://github.com/tutur3u/platform/commit/85e75f4522d5df54a8bd33e1cee14f66671ed47b))
* **learn:** tighten Programming input and request boundaries ([e13c7c6](https://github.com/tutur3u/platform/commit/e13c7c63a8de6181835d112de27cda1b670e1097))
</details>

<details><summary>internal-api: 0.49.0</summary>

## [0.49.0](https://github.com/tutur3u/platform/compare/internal-api-v0.48.0...internal-api-v0.49.0) (2026-10-03)


### Features

* **ai:** support self-hosted ChatGPT subscriptions ([a6ce805](https://github.com/tutur3u/platform/commit/a6ce8059077c312369e1693d0e1d8fbcfbdde131))
* **ai:** support self-hosted ChatGPT subscriptions ([#5728](https://github.com/tutur3u/platform/issues/5728)) ([67be76a](https://github.com/tutur3u/platform/commit/67be76ad4e140a2883afb488f5af2e28e40f13a2))
* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **inventory:** merge products and warehouses with conflict previews ([ebcd1d9](https://github.com/tutur3u/platform/commit/ebcd1d9b16f100743c346c1665f42f4f867f379d))
* **inventory:** merge products and warehouses with conflict previews ([#5765](https://github.com/tutur3u/platform/issues/5765)) ([35e584c](https://github.com/tutur3u/platform/commit/35e584c50061a17d9515563e0ee71c04f0cec53a))
* **learn:** persist workspace Programming problems and authorized catalog APIs ([#5709](https://github.com/tutur3u/platform/issues/5709)) ([f39c84b](https://github.com/tutur3u/platform/commit/f39c84b9df76448683f439c78f1897847b609299))
* **mail:** link invitations to Calendar with explicit preview on web and mobile ([#5673](https://github.com/tutur3u/platform/issues/5673)) ([726d57b](https://github.com/tutur3u/platform/commit/726d57bb095e3a85120274c315e093c7388bb45b))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **ai:** address ChatGPT subscription review findings ([f0bf14f](https://github.com/tutur3u/platform/commit/f0bf14f22cdec1029a29a2a9cf7fd108d6558504))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
* **finance:** authenticate exchange rates with satellite sessions ([33368f1](https://github.com/tutur3u/platform/commit/33368f1c00f86f71b4a66702899af262a90122e2))
* **finance:** authenticate exchange rates with satellite sessions ([#5760](https://github.com/tutur3u/platform/issues/5760)) ([759b1e5](https://github.com/tutur3u/platform/commit/759b1e52f8867aced2d64288af43b861d5ebccdc))
* **finance:** keep exchange rate wire types in API package ([878be3d](https://github.com/tutur3u/platform/commit/878be3d1b0c98ec2a42173b3fe410a4b3ad76d71))
* **inventory:** make merge review searchable and mobile accessible ([b1f2859](https://github.com/tutur3u/platform/commit/b1f2859934400b12f364161244bae24ca5e234d6))
* **learn:** tighten Programming input and request boundaries ([e13c7c6](https://github.com/tutur3u/platform/commit/e13c7c63a8de6181835d112de27cda1b670e1097))
</details>

<details><summary>inventory-core: 0.10.0</summary>

## [0.10.0](https://github.com/tutur3u/platform/compare/inventory-core-v0.9.0...inventory-core-v0.10.0) (2026-10-03)


### Features

* **inventory:** expose authorized deduplicated native creates ([d71325d](https://github.com/tutur3u/platform/commit/d71325d22043ea80357770269f325e6ee1e5cd7b))
* **inventory:** merge products and warehouses with conflict previews ([ebcd1d9](https://github.com/tutur3u/platform/commit/ebcd1d9b16f100743c346c1665f42f4f867f379d))
* **inventory:** merge products and warehouses with conflict previews ([#5765](https://github.com/tutur3u/platform/issues/5765)) ([35e584c](https://github.com/tutur3u/platform/commit/35e584c50061a17d9515563e0ee71c04f0cec53a))
* **mobile:** sync inventory prerequisites and dependent writes automatically ([#5743](https://github.com/tutur3u/platform/issues/5743)) ([242fbbd](https://github.com/tutur3u/platform/commit/242fbbdb90671325af104f6c9fe79c43b81a82c1))


### Bug Fixes

* **inventory:** close merge API and contract review gaps ([37a0f44](https://github.com/tutur3u/platform/commit/37a0f446517318a270037a3ec0fb1937dfb13373))
* **inventory:** harden durable offline replay and validation ([7166401](https://github.com/tutur3u/platform/commit/7166401d06e357d24ab92ec104cf4e48ef1f5b3a))
* **mobile:** fence invalid inventory replay and preserve receipts ([23ea162](https://github.com/tutur3u/platform/commit/23ea162aeb2b5eed98efb4fb3636e48fdb0df5da))
* **mobile:** preserve inventory foreground transport and durable fixtures ([0e68cac](https://github.com/tutur3u/platform/commit/0e68cac8891138449221479aa563738250f764ce))
* **mobile:** preserve sales receipts and finance API contracts ([#5750](https://github.com/tutur3u/platform/issues/5750)) ([1c3ee92](https://github.com/tutur3u/platform/commit/1c3ee9280aa144ed2417a0b1fd09da4794ece089))
</details>

<details><summary>realtime: 0.11.0</summary>

## [0.11.0](https://github.com/tutur3u/platform/compare/realtime-v0.10.0...realtime-v0.11.0) (2026-10-03)


### Features

* **workspaces:** reconcile Hidden picker and preserve membership fences ([c9806bb](https://github.com/tutur3u/platform/commit/c9806bb12a49a777fe28ab3653bb19d9350a1471))
</details>

<details><summary>satellite: 0.24.0</summary>

## [0.24.0](https://github.com/tutur3u/platform/compare/satellite-v0.23.0...satellite-v0.24.0) (2026-10-03)


### Features

* **learn:** improve Programming workspace controls and layout ([#5707](https://github.com/tutur3u/platform/issues/5707)) ([0f432ba](https://github.com/tutur3u/platform/commit/0f432ba02692f7f936ce9b191e3b152a1a67e970))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))
* **workspaces:** reconcile Hidden picker and preserve membership fences ([c9806bb](https://github.com/tutur3u/platform/commit/c9806bb12a49a777fe28ab3653bb19d9350a1471))
</details>

<details><summary>sdk: 0.26.1</summary>

## [0.26.1](https://github.com/tutur3u/platform/compare/sdk-v0.26.0...sdk-v0.26.1) (2026-10-03)


### Bug Fixes

* **devboxes:** reserve exact integer host shares ([d282009](https://github.com/tutur3u/platform/commit/d2820097fc84b6b814be24e2f23200dba389ff7b))
* **devbox:** stop failed dispatch and retain sandbox ownership ([85d1e61](https://github.com/tutur3u/platform/commit/85d1e613e65af1441fa54fc192c24ee359746723))
* **devbox:** wait for admitted creation before stopping ([b1edb12](https://github.com/tutur3u/platform/commit/b1edb127f164fa9ab8cd8598d93eb51faff9b919))
* **sdk:** bound mixed judge jobs and validate playground exports ([c5efff9](https://github.com/tutur3u/platform/commit/c5efff9427dc36cae6c4212871a335f9cd4bde03))
* **sdk:** defer hosted playground adapter to canonical API ([a18e65a](https://github.com/tutur3u/platform/commit/a18e65a862ab22b664b92f615a9e35d56e123a82))
* **sdk:** fence playground eviction and failed startup ([f208dcb](https://github.com/tutur3u/platform/commit/f208dcbd7a55385f2aa62ed8a822b029d7b5bc8f))
* **sdk:** fence playground lifecycle and keep agent leases alive ([d92e437](https://github.com/tutur3u/platform/commit/d92e437af1b2e2fdefa1036d40a71d1d45be4703))
* **sdk:** probe playground tools with the managed image path ([9571f35](https://github.com/tutur3u/platform/commit/9571f353f277efdddeeb22335a81b4475c2f4461))


### Performance Improvements

* **devboxes:** parallelize bounded execution and retain warm playgrounds ([#5746](https://github.com/tutur3u/platform/issues/5746)) ([efd8ac4](https://github.com/tutur3u/platform/commit/efd8ac44b5c9f8cbf2ab5d64fbe89e1f7afe4f96))
* **devboxes:** parallelize bounded runner execution and retain warm playgrounds ([c31cbf3](https://github.com/tutur3u/platform/commit/c31cbf3a2a7cb5214d75183896791366affdc7e6))
</details>

<details><summary>storage-core: 0.3.0</summary>

## [0.3.0](https://github.com/tutur3u/platform/compare/storage-core-v0.2.1...storage-core-v0.3.0) (2026-10-03)


### Features

* **security:** scale abuse budgets by paid plans and memberships ([93ccf02](https://github.com/tutur3u/platform/commit/93ccf0237c79addaed3ab8b653bd8b57b27a9557))


### Bug Fixes

* **security:** address egress guard review findings ([1e4916a](https://github.com/tutur3u/platform/commit/1e4916a7c9216ac1d5f9beadab0e69144337db7c))
* **security:** isolate caller budgets and preserve download semantics ([de5e090](https://github.com/tutur3u/platform/commit/de5e090f57e58b94bd235c47c494264a1192f5bf))
* **storage:** bound CMS downloads and API usage without Redis ([277ffeb](https://github.com/tutur3u/platform/commit/277ffebb738fbdb787fbe465cf6400de7ae910b2))
* **storage:** bound CMS downloads and API usage without Redis ([#5736](https://github.com/tutur3u/platform/issues/5736)) ([bbfc428](https://github.com/tutur3u/platform/commit/bbfc42886a0953ab11d303cdcceed8968127d40b))
</details>

<details><summary>tasks-ui: 0.17.0</summary>

## [0.17.0](https://github.com/tutur3u/platform/compare/tasks-ui-v0.16.3...tasks-ui-v0.17.0) (2026-10-03)


### Features

* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))
* **workspaces:** reconcile Hidden picker and preserve membership fences ([c9806bb](https://github.com/tutur3u/platform/commit/c9806bb12a49a777fe28ab3653bb19d9350a1471))
</details>

<details><summary>trigger: 0.4.0</summary>

## [0.4.0](https://github.com/tutur3u/platform/compare/trigger-v0.3.3...trigger-v0.4.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** fence metadata reads and retain recurrence during imports ([3895d28](https://github.com/tutur3u/platform/commit/3895d28fb4acd0164f6f021ad15df4c39a83938e))
</details>

<details><summary>types: 0.34.0</summary>

## [0.34.0](https://github.com/tutur3u/platform/compare/types-v0.33.1...types-v0.34.0) (2026-10-03)


### Features

* **calendar:** add encrypted recoverable Google mutations ([4ecc93d](https://github.com/tutur3u/platform/commit/4ecc93d8ad1602407d5ebe0ddbff3a4e500f44f7))
* **calendar:** journal provider creation and move generations ([f0b9573](https://github.com/tutur3u/platform/commit/f0b95734063121259f73f261d08cd40eb1a75ace))
* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **inventory:** merge products and warehouses with conflict previews ([ebcd1d9](https://github.com/tutur3u/platform/commit/ebcd1d9b16f100743c346c1665f42f4f867f379d))
* **inventory:** merge products and warehouses with conflict previews ([#5765](https://github.com/tutur3u/platform/issues/5765)) ([35e584c](https://github.com/tutur3u/platform/commit/35e584c50061a17d9515563e0ee71c04f0cec53a))
* **learn:** persist workspace Programming problems and authorized catalog APIs ([#5709](https://github.com/tutur3u/platform/issues/5709)) ([f39c84b](https://github.com/tutur3u/platform/commit/f39c84b9df76448683f439c78f1897847b609299))
* **mobile:** sync inventory prerequisites and dependent writes automatically ([#5743](https://github.com/tutur3u/platform/issues/5743)) ([242fbbd](https://github.com/tutur3u/platform/commit/242fbbdb90671325af104f6c9fe79c43b81a82c1))


### Bug Fixes

* **calendar:** generate applied native generation RPC types ([39b8a77](https://github.com/tutur3u/platform/commit/39b8a77f35d11e15c22667716e30041739c9195f))
* **calendar:** generate staged guard RPC types ([4802a28](https://github.com/tutur3u/platform/commit/4802a28f268711895cc54eb0aa44c2a5922b5375))
* **calendar:** preserve explicit draft intent and source selection ([d2a0ac9](https://github.com/tutur3u/platform/commit/d2a0ac908366ca2feb5f11da85b1f1dde66c2fdb))
* **calendar:** stage retained generation compatibility guard ([#5727](https://github.com/tutur3u/platform/issues/5727)) ([5c87bfe](https://github.com/tutur3u/platform/commit/5c87bfee00c5cd9574fe984909fd40d64629db0f))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
* **inventory:** preserve invoice recovery and scope merge locks ([ec5352e](https://github.com/tutur3u/platform/commit/ec5352e557eb934219816f21710a169e6412df22))
* **mobile:** preserve sales receipts and finance API contracts ([#5750](https://github.com/tutur3u/platform/issues/5750)) ([1c3ee92](https://github.com/tutur3u/platform/commit/1c3ee9280aa144ed2417a0b1fd09da4794ece089))
* **security:** address egress guard review findings ([1e4916a](https://github.com/tutur3u/platform/commit/1e4916a7c9216ac1d5f9beadab0e69144337db7c))
* **storage:** bound CMS downloads and API usage without Redis ([#5736](https://github.com/tutur3u/platform/issues/5736)) ([bbfc428](https://github.com/tutur3u/platform/commit/bbfc42886a0953ab11d303cdcceed8968127d40b))
* **storage:** generate entitlement types and isolate server tests ([da77152](https://github.com/tutur3u/platform/commit/da77152967946e64bdb8e593b340c99793830546))


### Performance Improvements

* **devboxes:** parallelize bounded execution and retain warm playgrounds ([#5746](https://github.com/tutur3u/platform/issues/5746)) ([efd8ac4](https://github.com/tutur3u/platform/commit/efd8ac44b5c9f8cbf2ab5d64fbe89e1f7afe4f96))
* **devboxes:** parallelize bounded runner execution and retain warm playgrounds ([c31cbf3](https://github.com/tutur3u/platform/commit/c31cbf3a2a7cb5214d75183896791366affdc7e6))
</details>

<details><summary>ui: 0.38.0</summary>

## [0.38.0](https://github.com/tutur3u/platform/compare/ui-v0.37.2...ui-v0.38.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **finance:** authenticate exchange rates with satellite sessions ([33368f1](https://github.com/tutur3u/platform/commit/33368f1c00f86f71b4a66702899af262a90122e2))
* **finance:** authenticate exchange rates with satellite sessions ([#5760](https://github.com/tutur3u/platform/issues/5760)) ([759b1e5](https://github.com/tutur3u/platform/commit/759b1e52f8867aced2d64288af43b861d5ebccdc))
* **ui:** close workspace popover without callback ([b0693b8](https://github.com/tutur3u/platform/commit/b0693b869721b9333d81d791554864291bec769d))
* **ui:** default browser workspace selectors to dropdowns ([9a8da02](https://github.com/tutur3u/platform/commit/9a8da02ceb7c03ee7eb05fb6cdc729144da6192a))
* **ui:** refine workspace dropdown recovery and viewport bounds ([06eeee7](https://github.com/tutur3u/platform/commit/06eeee77a26c1fc632907b72a5e0218d5d3fb49d))
* **web:** restore anchored workspace dropdown ([2df0661](https://github.com/tutur3u/platform/commit/2df0661f911eaec319cacca5d29242804d0e76ee))
* **web:** restore standard workspace dropdown ([#5739](https://github.com/tutur3u/platform/issues/5739)) ([f84ae74](https://github.com/tutur3u/platform/commit/f84ae741f2abab2a21aadfacda56bd7eba623466))
</details>

<details><summary>utils: 0.34.0</summary>

## [0.34.0](https://github.com/tutur3u/platform/compare/utils-v0.33.3...utils-v0.34.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **mobile:** support offline data and safe inventory checkout ([a45d634](https://github.com/tutur3u/platform/commit/a45d63498cc1e686d1d070f5861cf938c4e9a9ef))
* **mobile:** support offline data, cached images, and safe inventory checkout ([#5734](https://github.com/tutur3u/platform/issues/5734)) ([2f0f397](https://github.com/tutur3u/platform/commit/2f0f39763daea56f1029fcc3e99e0be53c60e106))


### Bug Fixes

* **calendar:** fence metadata reads and retain recurrence during imports ([3895d28](https://github.com/tutur3u/platform/commit/3895d28fb4acd0164f6f021ad15df4c39a83938e))
* **mobile:** harden offline inventory and scoped cache replay ([d9c0b13](https://github.com/tutur3u/platform/commit/d9c0b13b386287fb874be62a8b8ec794deeb6407))
* **release:** gate critical app promotion on staged API probes ([f39cea3](https://github.com/tutur3u/platform/commit/f39cea3621b504a9320b6d79675aa42b905b0476))
* **release:** gate critical app promotion on staged API probes ([#5761](https://github.com/tutur3u/platform/issues/5761)) ([391397f](https://github.com/tutur3u/platform/commit/391397f90f651d041d8f0e9ae566f8c3eab60dd7))
* **release:** preserve manual test notes and share filtering policy ([ff312ca](https://github.com/tutur3u/platform/commit/ff312ca8b16e36bdc7f65484cded768de3073c17))
* **releases:** omit merge bookkeeping from release summaries ([c66e0b1](https://github.com/tutur3u/platform/commit/c66e0b139c89706db32ec70c3e87fcc9c4018b6c))
* **releases:** omit merge bookkeeping from release summaries ([#5741](https://github.com/tutur3u/platform/issues/5741)) ([552cd5a](https://github.com/tutur3u/platform/commit/552cd5ae85d19d9147f1367475f5f6b3bf522a63))
* **sdk:** bound mixed judge jobs and validate playground exports ([c5efff9](https://github.com/tutur3u/platform/commit/c5efff9427dc36cae6c4212871a335f9cd4bde03))
* **security:** isolate bulk limits from ordinary web operations ([b3a9add](https://github.com/tutur3u/platform/commit/b3a9addf90271c7e28319a2138bbd52aaa294bc1))
* **security:** isolate offline bulk protection from daily web operations ([#5752](https://github.com/tutur3u/platform/issues/5752)) ([fd32aca](https://github.com/tutur3u/platform/commit/fd32aca3319c67d82149975e8c3a7615dfbca275))
* **security:** stage offline download protection activation ([018f6ab](https://github.com/tutur3u/platform/commit/018f6ab2ada3fef843d66789dee6ec45fba905d3))


### Performance Improvements

* **devboxes:** parallelize bounded execution and retain warm playgrounds ([#5746](https://github.com/tutur3u/platform/issues/5746)) ([efd8ac4](https://github.com/tutur3u/platform/commit/efd8ac44b5c9f8cbf2ab5d64fbe89e1f7afe4f96))
* **devboxes:** parallelize bounded runner execution and retain warm playgrounds ([c31cbf3](https://github.com/tutur3u/platform/commit/c31cbf3a2a7cb5214d75183896791366affdc7e6))
</details>

<details><summary>lettin: 1.3.0</summary>

## [1.3.0](https://github.com/tutur3u/platform/compare/lettin-v1.2.0...lettin-v1.3.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))
* **lettin:** create a relaxed home and dedicated creative spaces ([54a2a38](https://github.com/tutur3u/platform/commit/54a2a38f12753044d4082398f7c8f8bde75a139d))
* **lettin:** create a relaxed home and dedicated creative spaces ([#5733](https://github.com/tutur3u/platform/issues/5733)) ([d1c03e5](https://github.com/tutur3u/platform/commit/d1c03e587a5f93309f6e8e237d818b175004ed73))
* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
* **lettin:** preserve creator context and resolve review findings ([d9d3697](https://github.com/tutur3u/platform/commit/d9d3697bc3a653c4bdafebb457725bd78692baa2))
* **lettin:** use canonical invitation destinations ([cdebac2](https://github.com/tutur3u/platform/commit/cdebac239b4c6ddbf401eed17be8e9fd2aa9e3bc))
</details>

<details><summary>parley: 1.3.0</summary>

## [1.3.0](https://github.com/tutur3u/platform/compare/parley-v1.2.0...parley-v1.3.0) (2026-10-03)


### Features

* **calendar:** support full Google color choices and scoped edits ([#5661](https://github.com/tutur3u/platform/issues/5661)) ([8cafac5](https://github.com/tutur3u/platform/commit/8cafac53438b504eafa8bcc8213d18448e4a17bc))


### Bug Fixes

* **calendar:** gate uncertain creation retries on durable capability ([4a0a088](https://github.com/tutur3u/platform/commit/4a0a0883ddfff464be0880afd13758908e65203f))
* **calendar:** recover edited drafts and align provider color parity ([d97142a](https://github.com/tutur3u/platform/commit/d97142abe22188b6a31a4a6b0e7b3a97d35d07f5))
* **calendar:** wire recoverable routes and gated provider palette ([ecfc1e7](https://github.com/tutur3u/platform/commit/ecfc1e7dd1c5556b94c64cde62635df15d024747))
</details>

<details><summary>meet-core: 1.3.0</summary>

## [1.3.0](https://github.com/tutur3u/platform/compare/meet-core-v1.2.1...meet-core-v1.3.0) (2026-10-03)


### Features

* **workspaces:** add private Hidden choices and fullscreen picker ([#5699](https://github.com/tutur3u/platform/issues/5699)) ([9cab7ef](https://github.com/tutur3u/platform/commit/9cab7efc0e75f71c6b1a2436eea6885e48f6bfe4))


### Bug Fixes

* **meet:** add mobile capture and room event notifications ([fe6b020](https://github.com/tutur3u/platform/commit/fe6b020b95b2799fad8314969784d06ccd7fadda))
* **meet:** resolve native capture and browser review findings ([ce9b522](https://github.com/tutur3u/platform/commit/ce9b52248eb807424a063cd89a3cd606b04c5e01))
* **meet:** restore mobile capture and room notifications ([#5721](https://github.com/tutur3u/platform/issues/5721)) ([d116a54](https://github.com/tutur3u/platform/commit/d116a54262fb74da780968d27ee8bbe0245d5812))
</details>

---
This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).