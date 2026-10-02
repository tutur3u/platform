# Changelog

## [0.22.0](https://github.com/tutur3u/platform/compare/mobile-v0.21.0...mobile-v0.22.0) (2026-10-02)


### Features

* **auth:** prefer password for exact Tuturuuu email domains ([#5690](https://github.com/tutur3u/platform/issues/5690)) ([7ff4f6b](https://github.com/tutur3u/platform/commit/7ff4f6bdcc6fdd992785b8a3212c7cfe842185f7))
* **mobile:** add scoped inventory stock health ([3c6f226](https://github.com/tutur3u/platform/commit/3c6f22668c1674f29a76385dc6c08f18cbb10715))
* **mobile:** add scoped inventory stock health counts ([#5700](https://github.com/tutur3u/platform/issues/5700)) ([6410809](https://github.com/tutur3u/platform/commit/64108097682b2f97c723c70b7df664d4b259bdcb))
* **mobile:** browse Profile activity by date or agenda ([ad9332f](https://github.com/tutur3u/platform/commit/ad9332fec4c0f14ad7cce86b399c9bc43c7600d4))
* **mobile:** browse Profile Timeline by date or agenda ([#5706](https://github.com/tutur3u/platform/issues/5706)) ([2b4336d](https://github.com/tutur3u/platform/commit/2b4336de79604db8045839f55b828d04eb74be73))
* **mobile:** compact Inventory workflows and stock summaries ([#5696](https://github.com/tutur3u/platform/issues/5696)) ([b9e0757](https://github.com/tutur3u/platform/commit/b9e075757cc83d2b0131f607a8ff521d3b7516c3))
* **mobile:** consolidate Settings into compact nested controls ([#5692](https://github.com/tutur3u/platform/issues/5692)) ([0bb5a31](https://github.com/tutur3u/platform/commit/0bb5a3130449fb4e101db0ea5f456585e88ad760))
* **mobile:** launch a unique Apps search result on submit ([#5691](https://github.com/tutur3u/platform/issues/5691)) ([d5e7a64](https://github.com/tutur3u/platform/commit/d5e7a64efab0eca4f95eb3732b1bfb322ecf6579))


### Bug Fixes

* **calendar:** bind source color hydration to persisted identity ([00269c3](https://github.com/tutur3u/platform/commit/00269c315cd2ac8e1c9607f450100db8537cada2))
* **calendar:** preserve opaque rendering cues and hydrate source colors ([33847dd](https://github.com/tutur3u/platform/commit/33847ddcd8a3cf2b5cef8ebf50ca4c1700424a27))
* **calendar:** preserve read availability and multi-day contrast ([0cfa6b5](https://github.com/tutur3u/platform/commit/0cfa6b5496633dd6f9da4ad9522b5d7a4c769b8a))
* **calendar:** render opaque readable event colors ([#5694](https://github.com/tutur3u/platform/issues/5694)) ([6e3d81d](https://github.com/tutur3u/platform/commit/6e3d81d6fdd6f8155f12e36ede58d31fde0ac362))
* **mobile:** address inventory compact review findings ([18d3b46](https://github.com/tutur3u/platform/commit/18d3b46c5ca6eef060a932377edb06c5e94e00e2))
* **mobile:** clarify stock health scope and capture evidence ([4b800e7](https://github.com/tutur3u/platform/commit/4b800e7f0a943f9f212433fe9cdd1847d282b922))
* **mobile:** contain scrolling in both dialog bodies ([4ab938f](https://github.com/tutur3u/platform/commit/4ab938f3e0faab07b11bd15794acbf8fdf50d3c6))
* **mobile:** fit scaled navbar titles without resizing icons ([68e50bd](https://github.com/tutur3u/platform/commit/68e50bda5750a4922f5a933caedf2e34d9a1054e)) ([#5701](https://github.com/tutur3u/platform/issues/5701)) ([2c80e9b](https://github.com/tutur3u/platform/commit/2c80e9bdb556a8454b952f6034307c202d547f98))
* **mobile:** guard inventory manage ownership and completion scope ([ee59239](https://github.com/tutur3u/platform/commit/ee59239e45254a7eca3f97a9764fc0ea1adb920f))
* **mobile:** harden timezone retry recovery ([264b4b8](https://github.com/tutur3u/platform/commit/264b4b89ab9e1cb4194374a3714b46832c5e486a))
* **mobile:** keep scaled Settings choices scrollable ([b61807c](https://github.com/tutur3u/platform/commit/b61807c2daf8c0ee828364d7335c1ae6e1f61f1c))
* **mobile:** keep timeline loading and date selection provisional ([510a96e](https://github.com/tutur3u/platform/commit/510a96ee56a3724f6e55a9adfbc78f679cb45073))
* **mobile:** measure accessible titles and complete graphemes ([6c42abe](https://github.com/tutur3u/platform/commit/6c42abe17b04b0100a9aac036529123f6037080a))
* **mobile:** preserve fractional inventory stock precision ([528579e](https://github.com/tutur3u/platform/commit/528579e59d2705a977c0d226c3a5c8bb844a28af)) ([#5723](https://github.com/tutur3u/platform/issues/5723)) ([71d82c9](https://github.com/tutur3u/platform/commit/71d82c9f100a17ce76251c9123d9935616803cb0))
* **mobile:** preserve injected inventory repository ownership ([22a33bd](https://github.com/tutur3u/platform/commit/22a33bd229d3294d7ecbf3d8057aace0b14709ff))
* **mobile:** preserve unlimited inventory stock and setup scope ([#5698](https://github.com/tutur3u/platform/issues/5698)) ([2021cb8](https://github.com/tutur3u/platform/commit/2021cb8ac8338003c863f37b87f6d708a90540c2))
* **mobile:** resolve timezone settings with verified native sessions ([#5720](https://github.com/tutur3u/platform/issues/5720)) ([5640ca2](https://github.com/tutur3u/platform/commit/5640ca22bcbfda6cd0470f39171ffa2366af779e))
* **mobile:** restore verified timezone resolution ([462c68b](https://github.com/tutur3u/platform/commit/462c68bf22b2b412dd1825c12c3558b10b028a40))
* **mobile:** retain navbar title ink and cache scroll geometry ([78057b9](https://github.com/tutur3u/platform/commit/78057b92d517f5eab9df977169f8be9250ec8238))
* **mobile:** retain timezone snapshots during overlapping loads ([eff42e2](https://github.com/tutur3u/platform/commit/eff42e2cf9d3159ee6fc68be1079df5f50fd92e2))
* **mobile:** reveal selected timeline dates and retain uncertainty ([3c6dee4](https://github.com/tutur3u/platform/commit/3c6dee418f484118c582e83dce022176f6183018))

## [0.21.0](https://github.com/tutur3u/platform/compare/mobile-v0.20.0...mobile-v0.21.0) (2026-10-01)


### Features

* **mobile:** add scoped timezone settings and preserve calendar instants ([4f96eca](https://github.com/tutur3u/platform/commit/4f96ecad57893376604d9859a8a235273b9373db)) ([#5656](https://github.com/tutur3u/platform/issues/5656)) ([eed3b40](https://github.com/tutur3u/platform/commit/eed3b4001db6a5273f148d105187c8e4ecc2d684))
* **mobile:** consolidate settings and unify ordering and profile views ([66129e1](https://github.com/tutur3u/platform/commit/66129e1bcd778475bd3645068968352c438f87fb)) ([#5658](https://github.com/tutur3u/platform/issues/5658)) ([baf0e11](https://github.com/tutur3u/platform/commit/baf0e115104c13df924a22bd4c56d79660c5b9b7))
* **mobile:** inherit verified timezone fixes into settings assembly ([c4600c9](https://github.com/tutur3u/platform/commit/c4600c9d0485f9c14dbe741c480e0edc237d5eb8))


### Bug Fixes

* **mail:** add invitation RSVP and settle final inbox archive ([#5668](https://github.com/tutur3u/platform/issues/5668)) ([48a1687](https://github.com/tutur3u/platform/commit/48a1687f253cb7df72716fd4c289a0dcf1aa329d))
* **mail:** preserve recurrence and replay state ([89afe35](https://github.com/tutur3u/platform/commit/89afe35adb557e9f09fd7a023284f005fa9a9d7b))
* **mail:** support invitation replies and settle empty inbox ([57e27ab](https://github.com/tutur3u/platform/commit/57e27ab6582e6cb5a1b6be43039ebf795cf908a2))
* **mobile:** handle avatar image failures with visible fallback ([8ae5bf3](https://github.com/tutur3u/platform/commit/8ae5bf3d9d824e115f56011d490308e5dd57672c))
* **mobile:** inherit reminder and timezone review corrections ([c3ebfce](https://github.com/tutur3u/platform/commit/c3ebfce99d4943df42d0609400e9509a1562507d))
* **mobile:** merge beta changes with published release notes ([e83174b](https://github.com/tutur3u/platform/commit/e83174b13951be4b270b798d3dd007ff57dce62a))
* **mobile:** preserve avatar image identity across rebuilds ([e8f4352](https://github.com/tutur3u/platform/commit/e8f4352796636e78ea21e9886a40ed955d93b845))
* **mobile:** preserve calendar instants across timezone transitions ([6399a08](https://github.com/tutur3u/platform/commit/6399a08e7c51cd8c2085d128cc10826915b1ba1f))
* **mobile:** preserve unused beta source versions ([#5667](https://github.com/tutur3u/platform/issues/5667)) ([9298057](https://github.com/tutur3u/platform/commit/9298057f5c26f54948c618083c223fb5d6ac0a04))
* **mobile:** reconcile pending reminders across session changes ([14f6cc4](https://github.com/tutur3u/platform/commit/14f6cc4cb6aa892d9c8125f0034e978cea592cf4))
* **mobile:** recover unresolved timezone preferences ([486c0e9](https://github.com/tutur3u/platform/commit/486c0e97a81cb6421d7b4c07743561db7a25193a)) ([#5680](https://github.com/tutur3u/platform/issues/5680)) ([301e29d](https://github.com/tutur3u/platform/commit/301e29df55dfefaa9b230d7a7ea689f903809200))
* **mobile:** require verified workspace membership refresh ([4df15c8](https://github.com/tutur3u/platform/commit/4df15c87f31c4b2b1602c6e31b78bf39a114f73a))
* **mobile:** retain avatar fallback on image and disposal failures ([#5662](https://github.com/tutur3u/platform/issues/5662)) ([7f383d1](https://github.com/tutur3u/platform/commit/7f383d157a0f6b2dc1330e31911c2730a33f441b))
* **mobile:** retain reminders during unresolved workspace discovery ([f8610d0](https://github.com/tutur3u/platform/commit/f8610d0aae90699c91d319d51ecb307a4025d08c))
* **mobile:** schedule all-day reminders in the effective timezone ([904ba81](https://github.com/tutur3u/platform/commit/904ba818c99fad6afd5b3ee5a4810880f45138f5))
* **mobile:** serialize timezone reminder reconciliation ([7b0e0fc](https://github.com/tutur3u/platform/commit/7b0e0fc00b20fb1955b55e61509c564a638285a8))

## [0.20.0](https://github.com/tutur3u/platform/compare/mobile-v0.19.0...mobile-v0.20.0) (2026-09-29)


### Features

* **mobile:** customize Apps and Home visibility and order ([0516b67](https://github.com/tutur3u/platform/commit/0516b67a3943c46489ffffe1b79c6748d1c3f863))
* **mobile:** customize Apps, Home, dock, and experiments ([#5645](https://github.com/tutur3u/platform/issues/5645)) ([b63ec8f](https://github.com/tutur3u/platform/commit/b63ec8f2f971dea0e26793184e63ac2588192e9d))
* **mobile:** make Meet Mail Chat and Notes opt-in ([44aad51](https://github.com/tutur3u/platform/commit/44aad51b976662e807ca3d0709e647ae80da6233))
* **mobile:** refine Apps and Home customization ([154d522](https://github.com/tutur3u/platform/commit/154d522e695af20726f74b2a95dada70226373fa)) ([#5647](https://github.com/tutur3u/platform/issues/5647)) ([377671f](https://github.com/tutur3u/platform/commit/377671f38f646d44663f7eaee2fa2119a9bf9c6b))


### Bug Fixes

* **infrastructure:** isolate app review identities from staff access ([#5632](https://github.com/tutur3u/platform/issues/5632)) ([ecad401](https://github.com/tutur3u/platform/commit/ecad4019f602317b59d37500cd8049d1602d11fa))
* **mobile:** animate dock tap highlight without splash ([e244fc5](https://github.com/tutur3u/platform/commit/e244fc5fdeeceed498112aa7f6d38af32045f4df))
* **mobile:** honor explicit dock back parents ([4107069](https://github.com/tutur3u/platform/commit/4107069f3db159ec74a46098fdaa00a4b57242fa))
* **mobile:** keep Home shell action overlay full size ([d288b95](https://github.com/tutur3u/platform/commit/d288b9547e46669ffbc29f562c2f2f083c2ef8c7))
* **mobile:** keep peer navigation and currency snapshots stable ([794acda](https://github.com/tutur3u/platform/commit/794acda1ee65207cbedcf2919f59b62a9d20aef8)) ([#5639](https://github.com/tutur3u/platform/issues/5639)) ([6489396](https://github.com/tutur3u/platform/commit/6489396c918180a79d66807a092e8e77f661c1e4))
* **mobile:** refine floating dock feedback and back hierarchy ([c14fbd8](https://github.com/tutur3u/platform/commit/c14fbd8a5407796488b35aade1a0a3cd82673ea9)) ([#5642](https://github.com/tutur3u/platform/issues/5642)) ([1bfe314](https://github.com/tutur3u/platform/commit/1bfe31465e30058f37c40323b13fba3a64ea7c6e))
* **mobile:** refine floating dock gesture and material ([b7dff9c](https://github.com/tutur3u/platform/commit/b7dff9c37b29534794a2987efcc95811b4acb1d5)) ([#5638](https://github.com/tutur3u/platform/issues/5638)) ([9e74c42](https://github.com/tutur3u/platform/commit/9e74c4218f5d0f24265c22b9a0b9ebd6beee7bf1))
* **mobile:** refine glass dock navigation and shell search ([eab97b3](https://github.com/tutur3u/platform/commit/eab97b3423201d27163ea6cca2d86b7bbd73cee1)) ([#5643](https://github.com/tutur3u/platform/issues/5643)) ([2d0983d](https://github.com/tutur3u/platform/commit/2d0983d6becfb11730bab61683db55878110a4f4))
* **mobile:** respect access in experiment sorter ([12ac509](https://github.com/tutur3u/platform/commit/12ac509af05a9440fa81f828f7c69b2bd26de65b))

## [0.19.0](https://github.com/tutur3u/platform/compare/mobile-v0.18.0...mobile-v0.19.0) (2026-09-29)


### Features

* **auth:** enforce required account MFA lifecycle ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))
* **meet:** improve mobile meeting entry and ended review ([a889bd1](https://github.com/tutur3u/platform/commit/a889bd13ecf417fdfb308e1fce8d09443d715329))
* **meet:** improve tablet prejoin, listing, and ended review ([#5477](https://github.com/tutur3u/platform/issues/5477)) ([e507a8f](https://github.com/tutur3u/platform/commit/e507a8f5e45a6c308499090ab4ce0008369ac831))
* **meet:** show speaker-attributed mobile transcripts ([f078fb4](https://github.com/tutur3u/platform/commit/f078fb422ef2461801054a87304948ac058e7a7d)) ([#5498](https://github.com/tutur3u/platform/issues/5498)) ([7c4dd5a](https://github.com/tutur3u/platform/commit/7c4dd5a44cd161ff30c7bf5b65b7cdcadea2dd96))
* **mobile:** add Apps list and grid views ([d836961](https://github.com/tutur3u/platform/commit/d836961dc6f999b8786dc98c68f36687153ba9a9)) ([#5575](https://github.com/tutur3u/platform/issues/5575)) ([5d72345](https://github.com/tutur3u/platform/commit/5d72345a19b1cae6678b6bf7182b6b9f86571ba0))
* **mobile:** add consented native Live screen sharing ([#5444](https://github.com/tutur3u/platform/issues/5444)) ([7df297a](https://github.com/tutur3u/platform/commit/7df297ab6a2d5ecf96760355a2b99917f9b10926))
* **mobile:** add native Meet Mira reviews ([#5468](https://github.com/tutur3u/platform/issues/5468)) ([db3b60a](https://github.com/tutur3u/platform/commit/db3b60a374642342ff538c04965ad61537419e04))
* **mobile:** add native Meet recording permission settings ([98f02c9](https://github.com/tutur3u/platform/commit/98f02c9237a82b450d58ceea12aefee84d82b0e6)) ([#5470](https://github.com/tutur3u/platform/issues/5470)) ([7fe6b7c](https://github.com/tutur3u/platform/commit/7fe6b7cabacbbc8099ec6342d5d5f6bbbbb67fc2))
* **mobile:** add scoped entity replica and more offline modules ([af0f741](https://github.com/tutur3u/platform/commit/af0f74171c3d9693cb2e1cedb7f20320d5ec4cad))
* **mobile:** align Apps and Mira Live navigation ([#5580](https://github.com/tutur3u/platform/issues/5580)) ([350774f](https://github.com/tutur3u/platform/commit/350774f179a58ae7e9c00c5f2c5a642d129cdaf9))
* **mobile:** align Apps and Mira Live with shell navigation ([8c63228](https://github.com/tutur3u/platform/commit/8c632282f95eac1c2fb577da5cc38c6ff0a9d9a8))
* **mobile:** archive opened notifications quietly ([9685b0d](https://github.com/tutur3u/platform/commit/9685b0dd80ff5ba2349c915f9672ab5f5ae5b3b3)) ([#5467](https://github.com/tutur3u/platform/issues/5467)) ([e31cae8](https://github.com/tutur3u/platform/commit/e31cae8c430e849d6eb3bc9109abbea8fe785848))
* **mobile:** bring public Mira reviews into native Meet ([ea5fb63](https://github.com/tutur3u/platform/commit/ea5fb6377527b7357db63493e84560facd8f75d6))
* **mobile:** cache inventory catalog and refine finance overview ([1a0c1ab](https://github.com/tutur3u/platform/commit/1a0c1ab18b7fff2712dfe59b8883e8dbfa2b0b56))
* **mobile:** cache inventory catalog and wallet checkpoints ([#5564](https://github.com/tutur3u/platform/issues/5564)) ([192df98](https://github.com/tutur3u/platform/commit/192df98a4ee6f2dc4b0b0e70322d67cf74ecdb4d))
* **mobile:** cache timer data and queue session edits ([fd2e78b](https://github.com/tutur3u/platform/commit/fd2e78bd95afb3ec4f2fd2866ff5a1a613027f6a))
* **mobile:** complete offline workspace action queue ([5de0aa9](https://github.com/tutur3u/platform/commit/5de0aa91b82dd48c9999d13d60136270b3babce0))
* **mobile:** complete workspace replica paths and cache revalidation ([3502b29](https://github.com/tutur3u/platform/commit/3502b29b8423bbe809dafb0181503763995b5bf4))
* **mobile:** configure app lock delay ([df54f42](https://github.com/tutur3u/platform/commit/df54f428717277c492d981dff296ebe17401933d))
* **mobile:** configure app lock timing ([#5558](https://github.com/tutur3u/platform/issues/5558)) ([d3474d2](https://github.com/tutur3u/platform/commit/d3474d24fe96753e01edc67fc1dc876251e41a01))
* **mobile:** confirm discarding offline changes ([a90251d](https://github.com/tutur3u/platform/commit/a90251da3ff081ada55620cfc38ca53c348e50d8))
* **mobile:** expand Assistant model picker parity ([a5335fe](https://github.com/tutur3u/platform/commit/a5335febf7b3f8898d7d2a34186355897946f8bc)) ([#5542](https://github.com/tutur3u/platform/issues/5542)) ([8a4115d](https://github.com/tutur3u/platform/commit/8a4115d3d5e345e029ee4b0c019f349625583db3))
* **mobile:** expand local replica across workspace modules ([#5611](https://github.com/tutur3u/platform/issues/5611)) ([f204336](https://github.com/tutur3u/platform/commit/f204336ef739e8cd225971b923d320bfbe3915ce))
* **mobile:** extend offline finance and mail caching ([ab48c81](https://github.com/tutur3u/platform/commit/ab48c8102dab61cdee27f5b42b1f18ac3c88b9ea))
* **mobile:** extend offline replica to chat meet and tasks ([2bcdfb8](https://github.com/tutur3u/platform/commit/2bcdfb8cb1505df193e16af0782a38bcc29ec317))
* **mobile:** extend offline replica to profile and connected services ([507a0ec](https://github.com/tutur3u/platform/commit/507a0ecfe3086c11fc9d703c5d87c918ca885932))
* **mobile:** label notifications across all apps ([984ab41](https://github.com/tutur3u/platform/commit/984ab418401010c2e73600c3a99dcc68a53b9ff8)) ([#5621](https://github.com/tutur3u/platform/issues/5621)) ([2c6f3ea](https://github.com/tutur3u/platform/commit/2c6f3ea056327e5db59fd6d0a4a090dee3e6010a))
* **mobile:** make Notes compact and readable ([c5e6ace](https://github.com/tutur3u/platform/commit/c5e6ace651635fcc4eb448479dee0587eb8abf1e)) ([#5551](https://github.com/tutur3u/platform/issues/5551)) ([ca357f9](https://github.com/tutur3u/platform/commit/ca357f936a1f0660a0e1148ef403314b356a230c))
* **mobile:** mark queued finance taxonomy cards ([80dcd7e](https://github.com/tutur3u/platform/commit/80dcd7e8025152aa1a82e08c72b75b96d767cbaa))
* **mobile:** modernize Chat list and message layout ([40fcfbc](https://github.com/tutur3u/platform/commit/40fcfbc986513bcf652d72cb2807e0f9aef99616)) ([#5496](https://github.com/tutur3u/platform/issues/5496)) ([3bb90cd](https://github.com/tutur3u/platform/commit/3bb90cd8af15059339bb12597e40d77eeed470f2))
* **mobile:** play room Mira Live audio natively ([7d5dd39](https://github.com/tutur3u/platform/commit/7d5dd39c0f5c81e0a9fff5e92c55663f2de87a09)) ([#5471](https://github.com/tutur3u/platform/issues/5471)) ([61a5767](https://github.com/tutur3u/platform/commit/61a57678b1d5be056479184e55bb6306f0250fe6))
* **mobile:** preview Chat media attachments ([c181038](https://github.com/tutur3u/platform/commit/c181038dd2f3e8dd25efbfbd7b0a49183bdf3ce7)) ([#5553](https://github.com/tutur3u/platform/issues/5553)) ([f6045a7](https://github.com/tutur3u/platform/commit/f6045a75fb935dd6e44bdebe24b7f57cfbce0f53))
* **mobile:** queue board and chat edits offline ([9e88128](https://github.com/tutur3u/platform/commit/9e88128b2f1ec3b5413b0de6822a3aac99037717))
* **mobile:** queue drive uploads and task planning edits ([85d1fcd](https://github.com/tutur3u/platform/commit/85d1fcdcb1d662da25635804cef9716bd8ffad81))
* **mobile:** queue inventory sales and finance checkpoints offline ([a5a7ea4](https://github.com/tutur3u/platform/commit/a5a7ea4c1f3f9dcddbfc26cede629540982138ca))
* **mobile:** queue inventory setup edits offline ([e32902c](https://github.com/tutur3u/platform/commit/e32902c9de00741ebf36939acbc939267cc5ce42))
* **mobile:** queue timer approvals and comments offline ([b5f8960](https://github.com/tutur3u/platform/commit/b5f896007dffa673a8721c1208b179a3059b18b7))
* **mobile:** refine notes and add cross-platform locking ([457d85c](https://github.com/tutur3u/platform/commit/457d85c57ebeed1325623604f1bd0bea891d2772)) ([#5562](https://github.com/tutur3u/platform/issues/5562)) ([fde79d6](https://github.com/tutur3u/platform/commit/fde79d6074fd970fe8964c40669b9d4696fc61e2))
* **mobile:** refresh workspace experience and offline edit foundation ([#5610](https://github.com/tutur3u/platform/issues/5610)) ([55a25b0](https://github.com/tutur3u/platform/commit/55a25b08d5fc14701dd8499bdc0eebdee094ae2f))
* **mobile:** refresh workspace UX and build offline edit foundation ([b1a26c2](https://github.com/tutur3u/platform/commit/b1a26c2a918bdd9fcc0a460f0adbea7c914b44fc))
* **mobile:** report production crashes and Meet media health ([4382096](https://github.com/tutur3u/platform/commit/43820967b5a4ef281e87b394b8a1ace4d4b21d4a)) ([#5597](https://github.com/tutur3u/platform/issues/5597)) ([94668a3](https://github.com/tutur3u/platform/commit/94668a38ecdcade89323d8913f1a2ca75a9d8ee4))
* **mobile:** schedule task and calendar reminders ([bddfd23](https://github.com/tutur3u/platform/commit/bddfd231bdd3a778b931cf669b6bfbe6f45ba256)) ([#5486](https://github.com/tutur3u/platform/issues/5486)) ([67b2a68](https://github.com/tutur3u/platform/commit/67b2a6890cfe80b819f0fcc912e48d579d386ac0))
* **mobile:** show and limit cached storage by category ([de7292a](https://github.com/tutur3u/platform/commit/de7292ae2f0fbc13e7f5a6dc3f1a442c390b5726))
* **mobile:** simplify assistant mode and chat history controls ([4453d32](https://github.com/tutur3u/platform/commit/4453d323600d336ad3d0378bd3a53a232fd69ac6)) ([#5566](https://github.com/tutur3u/platform/issues/5566)) ([e9f839e](https://github.com/tutur3u/platform/commit/e9f839e43f671059fc3f8fd6d11be84b5cc30a23))
* **mobile:** simplify shell chrome and surface mail and meet on Home ([68bc6e6](https://github.com/tutur3u/platform/commit/68bc6e67219ed03db095a983b8d79bcc0ee7fa09)) ([#5484](https://github.com/tutur3u/platform/issues/5484)) ([58250ea](https://github.com/tutur3u/platform/commit/58250eaa11b5804f34b8fd199d3fc3f7f235ad53))
* **mobile:** streamline settings and show release history ([7885450](https://github.com/tutur3u/platform/commit/7885450a31a3630d7995b66c7b83804913304fae)) ([#5483](https://github.com/tutur3u/platform/issues/5483)) ([de3afa1](https://github.com/tutur3u/platform/commit/de3afa1fd973073ed67fb0903107f430402e491e))
* **mobile:** visualize and limit cached storage ([#5560](https://github.com/tutur3u/platform/issues/5560)) ([4b9989b](https://github.com/tutur3u/platform/commit/4b9989b23ba5e3b41e298550aa80277c09e6a7f7))
* **notes:** add archive views and structured editing ([1c78aa2](https://github.com/tutur3u/platform/commit/1c78aa292ebca25660c1ec7464cd6cc02144c82a))
* **notes:** add device lock with passkey and QR recovery ([f8ad1f9](https://github.com/tutur3u/platform/commit/f8ad1f9b3e6a2008411337aced706227d732f068)) ([#5583](https://github.com/tutur3u/platform/issues/5583)) ([7f9372b](https://github.com/tutur3u/platform/commit/7f9372bd37886d73f93ab0f732d7603d17811115))
* **notes:** add synced workspace notes on web and mobile ([47adf2e](https://github.com/tutur3u/platform/commit/47adf2e9a353e8f5f20f003570f0166b92f9a89b))
* **notes:** add workspace Notes on web and mobile ([#5535](https://github.com/tutur3u/platform/issues/5535)) ([eeee849](https://github.com/tutur3u/platform/commit/eeee8494ba1198fc098d03cee34276dd40d39103))
* **notes:** archive views and structured editing ([#5576](https://github.com/tutur3u/platform/issues/5576)) ([a67b186](https://github.com/tutur3u/platform/commit/a67b186318153cad8b10b71bbfc9335b80d0768a))
* **notes:** link tasks events and meetings from notes ([6596c64](https://github.com/tutur3u/platform/commit/6596c641a81b8823f48acb2b08d65d7ba0d20ffb))
* **notes:** link tasks, events, and meetings ([#5543](https://github.com/tutur3u/platform/issues/5543)) ([6304aae](https://github.com/tutur3u/platform/commit/6304aaef3d7a8a52d2d62ad5c66e3127595aa5d7))


### Bug Fixes

* **assistant:** address media and discovery review issues ([28996d3](https://github.com/tutur3u/platform/commit/28996d3c2aa8dab47d974856620bd1989f3233bd))
* **assistant:** preserve voice retries and saved replies ([9a5a44f](https://github.com/tutur3u/platform/commit/9a5a44fe8f7e58f382658de4bf03c9d17c2d7345)) ([#5517](https://github.com/tutur3u/platform/issues/5517)) ([8101e94](https://github.com/tutur3u/platform/commit/8101e949b0484786e0ec490502ab32d3ac3e7041))
* **assistant:** respect source size gate ([5603662](https://github.com/tutur3u/platform/commit/5603662c710c54efc6a9126666ed198b5e0f9f1b))
* **calendar:** treat working locations as non-reminder events ([454e666](https://github.com/tutur3u/platform/commit/454e666a6465e3debd06260aedc1de7b96ab5d67)) ([#5511](https://github.com/tutur3u/platform/issues/5511)) ([6508ad6](https://github.com/tutur3u/platform/commit/6508ad681aaa174b186022fcbd526e20be682973))
* **meet:** address review findings in mobile scheduling and room review ([f2a637c](https://github.com/tutur3u/platform/commit/f2a637c34d9019c04616606a50c6cd313b0ce68e))
* **meet:** complete native SFU negotiation ([a820f39](https://github.com/tutur3u/platform/commit/a820f392699daa02d6530fd5c1bf7a9327dc4c8e)) ([#5510](https://github.com/tutur3u/platform/issues/5510)) ([7683b66](https://github.com/tutur3u/platform/commit/7683b66741641e9b526a3fdb6f69f4a6aac274da))
* **meet:** guard schedule feedback after closing editor ([7a85add](https://github.com/tutur3u/platform/commit/7a85addea95dd935a101421946a0754b60337972))
* **meet:** satisfy transcript widget analysis ([0149e27](https://github.com/tutur3u/platform/commit/0149e272c83d53b8e15e9bef237dc3241405e526))
* **mobile:** archive mail alerts after message load ([a61e455](https://github.com/tutur3u/platform/commit/a61e4559840c57e8f5bcbe77c92ea6489435f6a5))
* **mobile:** await streamed upload response ([a65f01e](https://github.com/tutur3u/platform/commit/a65f01e1cbe37000cee85607e2d3b311b893a023))
* **mobile:** cancel reminders outside scheduled limit ([2e2a3e2](https://github.com/tutur3u/platform/commit/2e2a3e29c6494b45a4274492efee6913cce50890))
* **mobile:** clarify calendar reminder notifications ([cc8bb1b](https://github.com/tutur3u/platform/commit/cc8bb1bb937dc0506babe49fab489e83ece06e86))
* **mobile:** clear floating header in Apps sorting ([0ab680e](https://github.com/tutur3u/platform/commit/0ab680ede731224d1126aa247221fed5e8dbace6))
* **mobile:** compact floating shell header ([#5526](https://github.com/tutur3u/platform/issues/5526)) ([8de4981](https://github.com/tutur3u/platform/commit/8de49811e119bc6e303eab6da152401926d47708))
* **mobile:** compact multi-day calendar layout ([93b59c2](https://github.com/tutur3u/platform/commit/93b59c229634b1b6bbbd31c9dcdd2a113bd79ee7)) ([#5474](https://github.com/tutur3u/platform/issues/5474)) ([0cf4c62](https://github.com/tutur3u/platform/commit/0cf4c621e1a3956918473c6330675197c72d07a3))
* **mobile:** configure Mail primary action and speed up archiving ([#5475](https://github.com/tutur3u/platform/issues/5475)) ([45bb143](https://github.com/tutur3u/platform/commit/45bb143937000156a5718736e80838588bee96f3))
* **mobile:** expand root layouts and clear hidden header space ([4cd9892](https://github.com/tutur3u/platform/commit/4cd98925f6b65fe093fd0145ef5aaf51979fdc80)) ([#5501](https://github.com/tutur3u/platform/issues/5501)) ([ab314ff](https://github.com/tutur3u/platform/commit/ab314ff67cfe8b8c7e9fa13d333c21f681996ccd))
* **mobile:** explain Meet capture failure ([be2fb38](https://github.com/tutur3u/platform/commit/be2fb38e9cd16e5daf4555c32b1e509e12c60d3d))
* **mobile:** fit Mail content and consolidate reader actions ([2b1abdc](https://github.com/tutur3u/platform/commit/2b1abdcb48304b02e2efa17617b534f109b13614)) ([#5502](https://github.com/tutur3u/platform/issues/5502)) ([49a54bd](https://github.com/tutur3u/platform/commit/49a54bd16d8d4c5f9d75969777dabfaa38264dfa))
* **mobile:** fit wide Mail newsletters to phone screens ([#5466](https://github.com/tutur3u/platform/issues/5466)) ([6ce7a7c](https://github.com/tutur3u/platform/commit/6ce7a7c7ec88f42a61680bafdbc0d5740a4c7879))
* **mobile:** float shell header and compact root surfaces ([44aff5c](https://github.com/tutur3u/platform/commit/44aff5c3e2b9a9932b7a5ab955712336a1405e96)) ([#5492](https://github.com/tutur3u/platform/issues/5492)) ([998d9de](https://github.com/tutur3u/platform/commit/998d9de15035905bbaa617348a53ceb25ea16e99))
* **mobile:** format Meet review endpoint path ([997ea7c](https://github.com/tutur3u/platform/commit/997ea7c74b563043fd8655f00eee005684ff638d))
* **mobile:** gate Mira Live entry on current workspace ([ec83b24](https://github.com/tutur3u/platform/commit/ec83b2481bff9e5da7d5800b6c7e2e70fb9566b5))
* **mobile:** guard note unlock state and format widgets ([bfd22f1](https://github.com/tutur3u/platform/commit/bfd22f17f853f282b3d28edf5d4852c515e37d4a))
* **mobile:** handle unknown remote media kind ([ab54c16](https://github.com/tutur3u/platform/commit/ab54c167a9d1d081df07072365f6525f2eb7dc0c))
* **mobile:** harden live screen capture startup and frames ([63433b8](https://github.com/tutur3u/platform/commit/63433b853010f84835ff3206d6847591e1841d43))
* **mobile:** improve Assistant voice and gallery attachments ([#5534](https://github.com/tutur3u/platform/issues/5534)) ([fab87d7](https://github.com/tutur3u/platform/commit/fab87d7e51ba0ef36a9d53d89a748407942e89d0))
* **mobile:** improve assistant voice and media attachments ([f733f5b](https://github.com/tutur3u/platform/commit/f733f5b981fd90bcbedb438e4b4ae7eb3cc4551c))
* **mobile:** improve Meet media diagnosis and room invites ([c11e359](https://github.com/tutur3u/platform/commit/c11e3594c5a197e8f6240ac46f939f94f0a0a03f)) ([#5584](https://github.com/tutur3u/platform/issues/5584)) ([fea48a7](https://github.com/tutur3u/platform/commit/fea48a7b3cf0c1ed8db2d6e34939080035528080))
* **mobile:** keep Apps grid usable at narrow widths ([45db40a](https://github.com/tutur3u/platform/commit/45db40a056038457c421664f06bce9823c49afb9))
* **mobile:** keep Apps sorting below floating header ([#5557](https://github.com/tutur3u/platform/issues/5557)) ([4c55c11](https://github.com/tutur3u/platform/commit/4c55c11edf5db7746a553dd67373f8ea7c701def))
* **mobile:** keep Assistant voice recordings attached and sendable ([a73f83b](https://github.com/tutur3u/platform/commit/a73f83b6ab4e6707ab766bff73ba3ae8bd22c113)) ([#5485](https://github.com/tutur3u/platform/issues/5485)) ([311fa5b](https://github.com/tutur3u/platform/commit/311fa5b0e68c395b08fcba4d5c195cf8d49fde85))
* **mobile:** keep cached Finance overview visible during refresh ([f9609ac](https://github.com/tutur3u/platform/commit/f9609ac8b4b2fa9763a79a47d1b275b7ee488ef0))
* **mobile:** keep fixed headers visible above dock ([6e19fb2](https://github.com/tutur3u/platform/commit/6e19fb272b99f9a3025942889d67454a73c18b75))
* **mobile:** keep home previews fresh and dock visibility aligned ([0e5f173](https://github.com/tutur3u/platform/commit/0e5f173bb9f3c069660a727087e3c9a05f177603))
* **mobile:** keep Mira Live scoped and stable across screens ([8aee732](https://github.com/tutur3u/platform/commit/8aee732b14142e6e185384a0e2f9cd2c83864934))
* **mobile:** keep notification migration checks current ([8c03623](https://github.com/tutur3u/platform/commit/8c03623d8715648e575af7457341d19b30078739))
* **mobile:** make calendar reminders name events and lead times ([#5555](https://github.com/tutur3u/platform/issues/5555)) ([c49e07f](https://github.com/tutur3u/platform/commit/c49e07f92230a2b30f63e1b6d41cc8dfdd9ca96e))
* **mobile:** make Mail primary actions configurable and responsive ([7902ace](https://github.com/tutur3u/platform/commit/7902ace23fc21099dbd75a67aa7ec51cd4cde35a))
* **mobile:** make Mira retry feedback clear in dark mode ([03177d3](https://github.com/tutur3u/platform/commit/03177d307ebf7c4d9dbdb1f4cbc9b23acd0c7d0b))
* **mobile:** open calendar reminder events and clarify alerts ([76f144c](https://github.com/tutur3u/platform/commit/76f144c8ff27d3f144aba33299249cd33bd882c7))
* **mobile:** open calendar reminders and clarify alerts ([#5589](https://github.com/tutur3u/platform/issues/5589)) ([efecc5b](https://github.com/tutur3u/platform/commit/efecc5ba30644037ca942a44607e07b55ab06bf9))
* **mobile:** open Chat on conversation list ([b0fdf6e](https://github.com/tutur3u/platform/commit/b0fdf6e3743995cf19706fd29572c703c6bcfe5f)) ([#5503](https://github.com/tutur3u/platform/issues/5503)) ([fe76404](https://github.com/tutur3u/platform/commit/fe764040b41856b5bc4c61ee2299352137602912))
* **mobile:** open scheduled reminders after cold launch ([49267f1](https://github.com/tutur3u/platform/commit/49267f1cb006d39b687d5cc728e11d97374f93dd))
* **mobile:** place Meet sheets above floating dock ([a860098](https://github.com/tutur3u/platform/commit/a8600987156e4b85f1270a719fe11ecee5f0685f))
* **mobile:** preserve header clearance and fill notification pages ([63322cc](https://github.com/tutur3u/platform/commit/63322cc2da7afc8dfef00defcb18b06d2897d0f8))
* **mobile:** preserve mail whitespace and thread expansion ([2552e79](https://github.com/tutur3u/platform/commit/2552e792acdb4568cd890c973888097212a1024f))
* **mobile:** preserve status inset beneath floating header ([322969d](https://github.com/tutur3u/platform/commit/322969d10e4cd20ca1483d9f100ed590aa6d9eab)) ([#5524](https://github.com/tutur3u/platform/issues/5524)) ([f523d80](https://github.com/tutur3u/platform/commit/f523d80ade14653096103e2f4af0a1f9d66ce56a))
* **mobile:** publish iOS beta without ReplayKit extension ([#5480](https://github.com/tutur3u/platform/issues/5480)) ([f34e204](https://github.com/tutur3u/platform/commit/f34e204c157264e20b660bb4b2dc9a78b0efdbdd))
* **mobile:** read note links from local replica ([2fb98d4](https://github.com/tutur3u/platform/commit/2fb98d4dca07d37fd8b31921b11ad6227ef252f6)) ([#5617](https://github.com/tutur3u/platform/issues/5617)) ([491bf41](https://github.com/tutur3u/platform/commit/491bf41cc022fe8d3a64305581934c1d9e89389f))
* **mobile:** recognize every launcher in notifications ([1eb78df](https://github.com/tutur3u/platform/commit/1eb78df78866886219ecc04bf64d09dc39ea34b8))
* **mobile:** recover Meet publishers without outgoing media ([4a799d8](https://github.com/tutur3u/platform/commit/4a799d819002e937b9649a5eda4895911f4c3d82)) ([#5594](https://github.com/tutur3u/platform/issues/5594)) ([5b01446](https://github.com/tutur3u/platform/commit/5b014464fe5d745d4f8c210f2ce4200059d079bb))
* **mobile:** refine assistant title and navbar retap ([f9c0b32](https://github.com/tutur3u/platform/commit/f9c0b32d219328cdc30797654342ee63f467217b))
* **mobile:** refine Mail reader actions and thread layout ([6143235](https://github.com/tutur3u/platform/commit/6143235fa04b6c68e686009a221477db4bf6c0d8)) ([#5494](https://github.com/tutur3u/platform/issues/5494)) ([fb75d69](https://github.com/tutur3u/platform/commit/fb75d6995cdb35c23a3c6672300d0e5b03f1692c))
* **mobile:** remove duplicate CMS chrome ([45b24b8](https://github.com/tutur3u/platform/commit/45b24b828b71af0b31391509bb1c552265ad35c5)) ([#5552](https://github.com/tutur3u/platform/issues/5552)) ([9e41876](https://github.com/tutur3u/platform/commit/9e41876a118f8f6a7f6894576c202e036321fe33))
* **mobile:** remove redundant dashboard entrance delays ([f6d67ee](https://github.com/tutur3u/platform/commit/f6d67ee321e672d5c9e99eb7e5c7045695e80a4a))
* **mobile:** report Meet media capture failures safely ([01f36a9](https://github.com/tutur3u/platform/commit/01f36a93cd72e3663f00f3c2fd6f375fa875e2de))
* **mobile:** reserve full floating header height ([#5521](https://github.com/tutur3u/platform/issues/5521)) ([ffe46bd](https://github.com/tutur3u/platform/commit/ffe46bd669cb6ed8f572842b5f3c6a79938df0cb))
* **mobile:** resolve Meet analyzer and format issues ([6411d51](https://github.com/tutur3u/platform/commit/6411d51628a10ae934dfa5db6351e81461ae613d))
* **mobile:** restore Meet media and call exit controls ([8b9d27a](https://github.com/tutur3u/platform/commit/8b9d27a2d1de5caa4872506798bb8661bf186502)) ([#5497](https://github.com/tutur3u/platform/issues/5497)) ([f44bf94](https://github.com/tutur3u/platform/commit/f44bf945ccd08e91d7b0b93c1d2f0b18b3d8228c))
* **mobile:** retain cached Finance overview during refresh ([#5559](https://github.com/tutur3u/platform/issues/5559)) ([416b70d](https://github.com/tutur3u/platform/commit/416b70d5d9275e209516d94e020866fb71508b38))
* **mobile:** retain session through refresh transport errors ([a12bc82](https://github.com/tutur3u/platform/commit/a12bc827d2f990fe301d9cd1854d688c0e1f242c)) ([#5482](https://github.com/tutur3u/platform/issues/5482)) ([f87108b](https://github.com/tutur3u/platform/commit/f87108bb662f0dc46184fca950735a730a5785f6))
* **mobile:** retry saved Mira messages idempotently ([4ad0fd9](https://github.com/tutur3u/platform/commit/4ad0fd9ed98d90d4ad7a9d347c912011de825a42))
* **mobile:** retry saved Mira messages without duplication ([#5476](https://github.com/tutur3u/platform/issues/5476)) ([e8ee430](https://github.com/tutur3u/platform/commit/e8ee430b886c9738cd0a688af9ef211216e5c934))
* **mobile:** return save result when Notes closes ([8970176](https://github.com/tutur3u/platform/commit/897017609747feeb51cc9be67dc259e3a92b6988))
* **mobile:** satisfy model picker analyzer style ([330f9c1](https://github.com/tutur3u/platform/commit/330f9c175bd0ede543fcbed7cdcb40a8f4ef09f2))
* **mobile:** satisfy responsive layout analysis ([cc1bb28](https://github.com/tutur3u/platform/commit/cc1bb2844d46c519075411ae9fb2ca633e2221fa))
* **mobile:** satisfy security dialog lint ([83b63cf](https://github.com/tutur3u/platform/commit/83b63cfe66c7b7cc54714abd1c8b4d3270d16b70))
* **mobile:** scope note link replica fallback to request ([a2b2e26](https://github.com/tutur3u/platform/commit/a2b2e268f5c8de503624e346dfc519993506c063))
* **mobile:** ship iOS beta without ReplayKit extension ([d376262](https://github.com/tutur3u/platform/commit/d376262234f0dfb074c552a57417edeb88cd675c))
* **mobile:** show beta changes for every patch version ([6f2ba67](https://github.com/tutur3u/platform/commit/6f2ba6736c4385f1c4f01dbaa55b01ecfc64a195)) ([#5488](https://github.com/tutur3u/platform/issues/5488)) ([94f9896](https://github.com/tutur3u/platform/commit/94f98963c11fdcb58ef1a5e00973e852037c2f6c))
* **mobile:** show disk Finance snapshot on forced refresh ([ac7ecc5](https://github.com/tutur3u/platform/commit/ac7ecc57b84702d062f2b9ed6e5a227c06cbe770))
* **mobile:** simplify Mira Live and require explicit connection ([8100f94](https://github.com/tutur3u/platform/commit/8100f942ab3058100a38ca60f6fdc6ad1953a642)) ([#5573](https://github.com/tutur3u/platform/issues/5573)) ([8d3f52b](https://github.com/tutur3u/platform/commit/8d3f52be217d049ebd35ba003b29eaa79c0696ab))
* **mobile:** stabilize Meet media recovery ([2db72bc](https://github.com/tutur3u/platform/commit/2db72bce189cf5da403f9cd3035736ed23cae4f0))
* **mobile:** stabilize root chrome and align content widths ([e1c5bcf](https://github.com/tutur3u/platform/commit/e1c5bcf680fee701e7cc75b453150028398eafd5)) ([#5514](https://github.com/tutur3u/platform/issues/5514)) ([21b7cd6](https://github.com/tutur3u/platform/commit/21b7cd6761affadc8c5604f4d7c5a710cdb7a6de))
* **mobile:** streamline assistant media and model selection ([c0b3583](https://github.com/tutur3u/platform/commit/c0b3583ef0d6c77633444f6d36b484c89e65da22)) ([#5539](https://github.com/tutur3u/platform/issues/5539)) ([73a9381](https://github.com/tutur3u/platform/commit/73a938103504e7bd93200eee08d6b6410af5ab72))
* **mobile:** streamline chat navigation and content clearance ([425f193](https://github.com/tutur3u/platform/commit/425f193fcd2fb09d89169926a5b6dd1d1ce85874)) ([#5513](https://github.com/tutur3u/platform/issues/5513)) ([22fd621](https://github.com/tutur3u/platform/commit/22fd6219da49a6b69e1e62342e5c00f179dbfc2d))
* **mobile:** upload Assistant recordings with MP4 audio MIME ([3e44e5f](https://github.com/tutur3u/platform/commit/3e44e5f42cae97df03899a96c01d27cc55509b4a)) ([#5495](https://github.com/tutur3u/platform/issues/5495)) ([dca10e8](https://github.com/tutur3u/platform/commit/dca10e8ae937032724d0c805dbf434464abfe73d))
* **mobile:** validate negotiated track metadata ([e6cf05f](https://github.com/tutur3u/platform/commit/e6cf05f62ea3fa5cd8cb747cf75f25d90f05a057))
* **notes:** open linked work in native mobile screens ([cbcb5c2](https://github.com/tutur3u/platform/commit/cbcb5c2cbd514ff911ce016153020b3603b8dea8))
* **notes:** preserve mobile drafts across navigation and workspaces ([0abee33](https://github.com/tutur3u/platform/commit/0abee335035f08a0397492c6659b66d823cbca06))
* **notes:** tighten lock navigation and recovery boundaries ([4f2960c](https://github.com/tutur3u/platform/commit/4f2960c2ca0f5e3d06ff440ef462f3f1e5027672))


### Performance Improvements

* **mobile:** cache inline Mail media and hand off archive actions ([670a4f6](https://github.com/tutur3u/platform/commit/670a4f66e3b56cd8623e1f22e983cb0745278781)) ([#5554](https://github.com/tutur3u/platform/issues/5554)) ([5445f50](https://github.com/tutur3u/platform/commit/5445f50a194c94bee85ef4fbb5e4d97ad652bfc7))
* **mobile:** keep cache usage totals during writes ([4853fbf](https://github.com/tutur3u/platform/commit/4853fbf868e2238d301a7d8cc7a96fe2e229bfe1))

## [0.18.0](https://github.com/tutur3u/platform/compare/mobile-v0.17.0...mobile-v0.18.0) (2026-09-29)


### Features

* **mobile:** complete offline workspace action queue ([5de0aa9](https://github.com/tutur3u/platform/commit/5de0aa91b82dd48c9999d13d60136270b3babce0))
* **mobile:** complete workspace replica paths and cache revalidation ([3502b29](https://github.com/tutur3u/platform/commit/3502b29b8423bbe809dafb0181503763995b5bf4))
* **mobile:** confirm discarding offline changes ([a90251d](https://github.com/tutur3u/platform/commit/a90251da3ff081ada55620cfc38ca53c348e50d8))
* **mobile:** expand local replica across workspace modules ([#5611](https://github.com/tutur3u/platform/issues/5611)) ([f204336](https://github.com/tutur3u/platform/commit/f204336ef739e8cd225971b923d320bfbe3915ce))
* **mobile:** extend offline finance and mail caching ([ab48c81](https://github.com/tutur3u/platform/commit/ab48c8102dab61cdee27f5b42b1f18ac3c88b9ea))
* **mobile:** extend offline replica to profile and connected services ([507a0ec](https://github.com/tutur3u/platform/commit/507a0ecfe3086c11fc9d703c5d87c918ca885932))
* **mobile:** mark queued finance taxonomy cards ([80dcd7e](https://github.com/tutur3u/platform/commit/80dcd7e8025152aa1a82e08c72b75b96d767cbaa))
* **mobile:** queue board and chat edits offline ([9e88128](https://github.com/tutur3u/platform/commit/9e88128b2f1ec3b5413b0de6822a3aac99037717))
* **mobile:** queue drive uploads and task planning edits ([85d1fcd](https://github.com/tutur3u/platform/commit/85d1fcdcb1d662da25635804cef9716bd8ffad81))
* **mobile:** queue inventory sales and finance checkpoints offline ([a5a7ea4](https://github.com/tutur3u/platform/commit/a5a7ea4c1f3f9dcddbfc26cede629540982138ca))
* **mobile:** queue inventory setup edits offline ([e32902c](https://github.com/tutur3u/platform/commit/e32902c9de00741ebf36939acbc939267cc5ce42))
* **mobile:** queue timer approvals and comments offline ([b5f8960](https://github.com/tutur3u/platform/commit/b5f896007dffa673a8721c1208b179a3059b18b7))
* **mobile:** refresh workspace experience and offline edit foundation ([#5610](https://github.com/tutur3u/platform/issues/5610)) ([55a25b0](https://github.com/tutur3u/platform/commit/55a25b08d5fc14701dd8499bdc0eebdee094ae2f))


### Bug Fixes

* **mobile:** read note links from local replica ([2fb98d4](https://github.com/tutur3u/platform/commit/2fb98d4dca07d37fd8b31921b11ad6227ef252f6)) ([#5617](https://github.com/tutur3u/platform/issues/5617)) ([491bf41](https://github.com/tutur3u/platform/commit/491bf41cc022fe8d3a64305581934c1d9e89389f))
* **mobile:** scope note link replica fallback to request ([a2b2e26](https://github.com/tutur3u/platform/commit/a2b2e268f5c8de503624e346dfc519993506c063))

## [0.17.0](https://github.com/tutur3u/platform/compare/mobile-v0.16.0...mobile-v0.17.0) (2026-09-28)


### Features

* **mobile:** report production crashes and Meet media health ([4382096](https://github.com/tutur3u/platform/commit/43820967b5a4ef281e87b394b8a1ace4d4b21d4a)) ([#5597](https://github.com/tutur3u/platform/issues/5597)) ([94668a3](https://github.com/tutur3u/platform/commit/94668a38ecdcade89323d8913f1a2ca75a9d8ee4))


### Bug Fixes

* **mobile:** handle unknown remote media kind ([ab54c16](https://github.com/tutur3u/platform/commit/ab54c167a9d1d081df07072365f6525f2eb7dc0c))
* **mobile:** improve Meet media diagnosis and room invites ([#5584](https://github.com/tutur3u/platform/issues/5584)) ([fea48a7](https://github.com/tutur3u/platform/commit/fea48a7b3cf0c1ed8db2d6e34939080035528080))
* **mobile:** recover Meet publishers without outgoing media ([4a799d8](https://github.com/tutur3u/platform/commit/4a799d819002e937b9649a5eda4895911f4c3d82)) ([#5594](https://github.com/tutur3u/platform/issues/5594)) ([5b01446](https://github.com/tutur3u/platform/commit/5b014464fe5d745d4f8c210f2ce4200059d079bb))
* **mobile:** report Meet media capture failures safely ([01f36a9](https://github.com/tutur3u/platform/commit/01f36a93cd72e3663f00f3c2fd6f375fa875e2de))

## [0.16.0](https://github.com/tutur3u/platform/compare/mobile-v0.15.0...mobile-v0.16.0) (2026-09-27)


### Features

* **mobile:** align Apps and Mira Live navigation ([#5580](https://github.com/tutur3u/platform/issues/5580)) ([350774f](https://github.com/tutur3u/platform/commit/350774f179a58ae7e9c00c5f2c5a642d129cdaf9))
* **mobile:** align Apps and Mira Live with shell navigation ([8c63228](https://github.com/tutur3u/platform/commit/8c632282f95eac1c2fb577da5cc38c6ff0a9d9a8))
* **notes:** add device lock with passkey and QR recovery ([f8ad1f9](https://github.com/tutur3u/platform/commit/f8ad1f9b3e6a2008411337aced706227d732f068)) ([#5583](https://github.com/tutur3u/platform/issues/5583)) ([7f9372b](https://github.com/tutur3u/platform/commit/7f9372bd37886d73f93ab0f732d7603d17811115))


### Bug Fixes

* **mobile:** open calendar reminder events and clarify alerts ([76f144c](https://github.com/tutur3u/platform/commit/76f144c8ff27d3f144aba33299249cd33bd882c7))
* **mobile:** open calendar reminders and clarify alerts ([#5589](https://github.com/tutur3u/platform/issues/5589)) ([efecc5b](https://github.com/tutur3u/platform/commit/efecc5ba30644037ca942a44607e07b55ab06bf9))
* **notes:** tighten lock navigation and recovery boundaries ([4f2960c](https://github.com/tutur3u/platform/commit/4f2960c2ca0f5e3d06ff440ef462f3f1e5027672))

## [0.15.0](https://github.com/tutur3u/platform/compare/mobile-v0.14.0...mobile-v0.15.0) (2026-09-27)


### Features

* **mobile:** add Apps list and grid views ([d836961](https://github.com/tutur3u/platform/commit/d836961dc6f999b8786dc98c68f36687153ba9a9)) ([#5575](https://github.com/tutur3u/platform/issues/5575)) ([5d72345](https://github.com/tutur3u/platform/commit/5d72345a19b1cae6678b6bf7182b6b9f86571ba0))
* **mobile:** cache inventory catalog and refine finance overview ([1a0c1ab](https://github.com/tutur3u/platform/commit/1a0c1ab18b7fff2712dfe59b8883e8dbfa2b0b56))
* **mobile:** cache inventory catalog and wallet checkpoints ([#5564](https://github.com/tutur3u/platform/issues/5564)) ([192df98](https://github.com/tutur3u/platform/commit/192df98a4ee6f2dc4b0b0e70322d67cf74ecdb4d))
* **mobile:** refine notes and add cross-platform locking ([457d85c](https://github.com/tutur3u/platform/commit/457d85c57ebeed1325623604f1bd0bea891d2772)) ([#5562](https://github.com/tutur3u/platform/issues/5562)) ([fde79d6](https://github.com/tutur3u/platform/commit/fde79d6074fd970fe8964c40669b9d4696fc61e2))
* **mobile:** simplify assistant mode and chat history controls ([4453d32](https://github.com/tutur3u/platform/commit/4453d323600d336ad3d0378bd3a53a232fd69ac6)) ([#5566](https://github.com/tutur3u/platform/issues/5566)) ([e9f839e](https://github.com/tutur3u/platform/commit/e9f839e43f671059fc3f8fd6d11be84b5cc30a23))
* **notes:** add archive views and structured editing ([1c78aa2](https://github.com/tutur3u/platform/commit/1c78aa292ebca25660c1ec7464cd6cc02144c82a))
* **notes:** archive views and structured editing ([#5576](https://github.com/tutur3u/platform/issues/5576)) ([a67b186](https://github.com/tutur3u/platform/commit/a67b186318153cad8b10b71bbfc9335b80d0768a))


### Bug Fixes

* **mobile:** gate Mira Live entry on current workspace ([ec83b24](https://github.com/tutur3u/platform/commit/ec83b2481bff9e5da7d5800b6c7e2e70fb9566b5))
* **mobile:** guard note unlock state and format widgets ([bfd22f1](https://github.com/tutur3u/platform/commit/bfd22f17f853f282b3d28edf5d4852c515e37d4a))
* **mobile:** keep Apps grid usable at narrow widths ([45db40a](https://github.com/tutur3u/platform/commit/45db40a056038457c421664f06bce9823c49afb9))
* **mobile:** keep Mira Live scoped and stable across screens ([8aee732](https://github.com/tutur3u/platform/commit/8aee732b14142e6e185384a0e2f9cd2c83864934))
* **mobile:** refine assistant title and navbar retap ([f9c0b32](https://github.com/tutur3u/platform/commit/f9c0b32d219328cdc30797654342ee63f467217b))
* **mobile:** simplify Mira Live and require explicit connection ([8100f94](https://github.com/tutur3u/platform/commit/8100f942ab3058100a38ca60f6fdc6ad1953a642)) ([#5573](https://github.com/tutur3u/platform/issues/5573)) ([8d3f52b](https://github.com/tutur3u/platform/commit/8d3f52be217d049ebd35ba003b29eaa79c0696ab))

## [0.14.0](https://github.com/tutur3u/platform/compare/mobile-v0.13.1...mobile-v0.14.0) (2026-09-26)


### Features

* **mobile:** configure app lock delay ([df54f42](https://github.com/tutur3u/platform/commit/df54f428717277c492d981dff296ebe17401933d))
* **mobile:** configure app lock timing ([#5558](https://github.com/tutur3u/platform/issues/5558)) ([d3474d2](https://github.com/tutur3u/platform/commit/d3474d24fe96753e01edc67fc1dc876251e41a01))
* **mobile:** expand Assistant model picker parity ([a5335fe](https://github.com/tutur3u/platform/commit/a5335febf7b3f8898d7d2a34186355897946f8bc)) ([#5542](https://github.com/tutur3u/platform/issues/5542)) ([8a4115d](https://github.com/tutur3u/platform/commit/8a4115d3d5e345e029ee4b0c019f349625583db3))
* **mobile:** make Notes compact and readable ([c5e6ace](https://github.com/tutur3u/platform/commit/c5e6ace651635fcc4eb448479dee0587eb8abf1e)) ([#5551](https://github.com/tutur3u/platform/issues/5551)) ([ca357f9](https://github.com/tutur3u/platform/commit/ca357f936a1f0660a0e1148ef403314b356a230c))
* **mobile:** preview Chat media attachments ([c181038](https://github.com/tutur3u/platform/commit/c181038dd2f3e8dd25efbfbd7b0a49183bdf3ce7)) ([#5553](https://github.com/tutur3u/platform/issues/5553)) ([f6045a7](https://github.com/tutur3u/platform/commit/f6045a75fb935dd6e44bdebe24b7f57cfbce0f53))
* **mobile:** show and limit cached storage by category ([de7292a](https://github.com/tutur3u/platform/commit/de7292ae2f0fbc13e7f5a6dc3f1a442c390b5726))
* **mobile:** visualize and limit cached storage ([#5560](https://github.com/tutur3u/platform/issues/5560)) ([4b9989b](https://github.com/tutur3u/platform/commit/4b9989b23ba5e3b41e298550aa80277c09e6a7f7))
* **notes:** add synced workspace notes on web and mobile ([47adf2e](https://github.com/tutur3u/platform/commit/47adf2e9a353e8f5f20f003570f0166b92f9a89b))
* **notes:** add workspace Notes on web and mobile ([#5535](https://github.com/tutur3u/platform/issues/5535)) ([eeee849](https://github.com/tutur3u/platform/commit/eeee8494ba1198fc098d03cee34276dd40d39103))
* **notes:** link tasks events and meetings from notes ([6596c64](https://github.com/tutur3u/platform/commit/6596c641a81b8823f48acb2b08d65d7ba0d20ffb))
* **notes:** link tasks, events, and meetings ([#5543](https://github.com/tutur3u/platform/issues/5543)) ([6304aae](https://github.com/tutur3u/platform/commit/6304aaef3d7a8a52d2d62ad5c66e3127595aa5d7))


### Bug Fixes

* **assistant:** address media and discovery review issues ([28996d3](https://github.com/tutur3u/platform/commit/28996d3c2aa8dab47d974856620bd1989f3233bd))
* **mobile:** await streamed upload response ([a65f01e](https://github.com/tutur3u/platform/commit/a65f01e1cbe37000cee85607e2d3b311b893a023))
* **mobile:** clarify calendar reminder notifications ([cc8bb1b](https://github.com/tutur3u/platform/commit/cc8bb1bb937dc0506babe49fab489e83ece06e86))
* **mobile:** clear floating header in Apps sorting ([0ab680e](https://github.com/tutur3u/platform/commit/0ab680ede731224d1126aa247221fed5e8dbace6))
* **mobile:** improve Assistant voice and gallery attachments ([#5534](https://github.com/tutur3u/platform/issues/5534)) ([fab87d7](https://github.com/tutur3u/platform/commit/fab87d7e51ba0ef36a9d53d89a748407942e89d0))
* **mobile:** improve assistant voice and media attachments ([f733f5b](https://github.com/tutur3u/platform/commit/f733f5b981fd90bcbedb438e4b4ae7eb3cc4551c))
* **mobile:** keep Apps sorting below floating header ([#5557](https://github.com/tutur3u/platform/issues/5557)) ([4c55c11](https://github.com/tutur3u/platform/commit/4c55c11edf5db7746a553dd67373f8ea7c701def))
* **mobile:** keep cached Finance overview visible during refresh ([f9609ac](https://github.com/tutur3u/platform/commit/f9609ac8b4b2fa9763a79a47d1b275b7ee488ef0))
* **mobile:** make calendar reminders name events and lead times ([#5555](https://github.com/tutur3u/platform/issues/5555)) ([c49e07f](https://github.com/tutur3u/platform/commit/c49e07f92230a2b30f63e1b6d41cc8dfdd9ca96e))
* **mobile:** remove duplicate CMS chrome ([45b24b8](https://github.com/tutur3u/platform/commit/45b24b828b71af0b31391509bb1c552265ad35c5)) ([#5552](https://github.com/tutur3u/platform/issues/5552)) ([9e41876](https://github.com/tutur3u/platform/commit/9e41876a118f8f6a7f6894576c202e036321fe33))
* **mobile:** retain cached Finance overview during refresh ([#5559](https://github.com/tutur3u/platform/issues/5559)) ([416b70d](https://github.com/tutur3u/platform/commit/416b70d5d9275e209516d94e020866fb71508b38))
* **mobile:** return save result when Notes closes ([8970176](https://github.com/tutur3u/platform/commit/897017609747feeb51cc9be67dc259e3a92b6988))
* **mobile:** satisfy model picker analyzer style ([330f9c1](https://github.com/tutur3u/platform/commit/330f9c175bd0ede543fcbed7cdcb40a8f4ef09f2))
* **mobile:** satisfy security dialog lint ([83b63cf](https://github.com/tutur3u/platform/commit/83b63cfe66c7b7cc54714abd1c8b4d3270d16b70))
* **mobile:** show disk Finance snapshot on forced refresh ([ac7ecc5](https://github.com/tutur3u/platform/commit/ac7ecc57b84702d062f2b9ed6e5a227c06cbe770))
* **mobile:** streamline assistant media and model selection ([c0b3583](https://github.com/tutur3u/platform/commit/c0b3583ef0d6c77633444f6d36b484c89e65da22)) ([#5539](https://github.com/tutur3u/platform/issues/5539)) ([73a9381](https://github.com/tutur3u/platform/commit/73a938103504e7bd93200eee08d6b6410af5ab72))
* **notes:** open linked work in native mobile screens ([cbcb5c2](https://github.com/tutur3u/platform/commit/cbcb5c2cbd514ff911ce016153020b3603b8dea8))
* **notes:** preserve mobile drafts across navigation and workspaces ([0abee33](https://github.com/tutur3u/platform/commit/0abee335035f08a0397492c6659b66d823cbca06))


### Performance Improvements

* **mobile:** cache inline Mail media and hand off archive actions ([670a4f6](https://github.com/tutur3u/platform/commit/670a4f66e3b56cd8623e1f22e983cb0745278781)) ([#5554](https://github.com/tutur3u/platform/issues/5554)) ([5445f50](https://github.com/tutur3u/platform/commit/5445f50a194c94bee85ef4fbb5e4d97ad652bfc7))
* **mobile:** keep cache usage totals during writes ([4853fbf](https://github.com/tutur3u/platform/commit/4853fbf868e2238d301a7d8cc7a96fe2e229bfe1))

## [0.13.1](https://github.com/tutur3u/platform/compare/mobile-v0.13.0...mobile-v0.13.1) (2026-09-25)


### Bug Fixes

* **mobile:** compact floating shell header ([#5526](https://github.com/tutur3u/platform/issues/5526)) ([8de4981](https://github.com/tutur3u/platform/commit/8de49811e119bc6e303eab6da152401926d47708))
* **mobile:** preserve status inset beneath floating header ([322969d](https://github.com/tutur3u/platform/commit/322969d10e4cd20ca1483d9f100ed590aa6d9eab)) ([#5524](https://github.com/tutur3u/platform/issues/5524)) ([f523d80](https://github.com/tutur3u/platform/commit/f523d80ade14653096103e2f4af0a1f9d66ce56a))

## [0.13.0](https://github.com/tutur3u/platform/compare/mobile-v0.12.0...mobile-v0.13.0) (2026-09-25)


### Features

* **auth:** add trusted mobile authenticators and login approvals ([55e4d79](https://github.com/tutur3u/platform/commit/55e4d792bde2c543c3be8204a980fa99069527e4))
* **auth:** enforce required account MFA lifecycle ([e08f27d](https://github.com/tutur3u/platform/commit/e08f27dbc082f7d9c951bb0792357638f3dcfb0a)) ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))
* **auth:** trusted mobile authenticators and desktop login approvals ([#5400](https://github.com/tutur3u/platform/issues/5400)) ([4e9e9d2](https://github.com/tutur3u/platform/commit/4e9e9d20fd6a65c07b9f83008ef5ccd7c4d60d7f))
* **desktop:** add managed beta updates and Microsoft Store packaging ([#5443](https://github.com/tutur3u/platform/issues/5443)) ([59d836f](https://github.com/tutur3u/platform/commit/59d836f6405d0167c7567717be3eb507c5351d30))
* **desktop:** add managed beta updates and Store packaging ([91f8f1e](https://github.com/tutur3u/platform/commit/91f8f1e6ef4dd374f802488985d9d7168dd8bbf2))
* **desktop:** add secure beta distributions and download page ([b034081](https://github.com/tutur3u/platform/commit/b034081273ee5967924bc319c0c9f99b406148c1)) ([#5405](https://github.com/tutur3u/platform/issues/5405)) ([105af8a](https://github.com/tutur3u/platform/commit/105af8aa003a791034fe1a0719dc2663a4b83e56))
* **infrastructure:** add web and mobile account recovery ([5e42191](https://github.com/tutur3u/platform/commit/5e42191a675b8edee62a62c58ae656e3a05d243f))
* **infrastructure:** add web and mobile internal account recovery ([#5440](https://github.com/tutur3u/platform/issues/5440)) ([0694318](https://github.com/tutur3u/platform/commit/06943180c538f9f294586555d5d776c2cf1ea69e))
* **infrastructure:** authenticate native Calendar gateway ([e225ec7](https://github.com/tutur3u/platform/commit/e225ec73f3f5dd958bbe7dacab986271e877728e))
* **mail:** add personal thread snooze and mute ([50f7b88](https://github.com/tutur3u/platform/commit/50f7b884706c156cd9a10a2b5c38f3079615096e)) ([#5445](https://github.com/tutur3u/platform/issues/5445)) ([26e392c](https://github.com/tutur3u/platform/commit/26e392c283a31fab038f03294ced90f2e8174874))
* **mail:** deliver incoming email push notifications ([273003a](https://github.com/tutur3u/platform/commit/273003ac9b6b6f47729eb65c9a207a35d9764fed)) ([#5442](https://github.com/tutur3u/platform/issues/5442)) ([256ab93](https://github.com/tutur3u/platform/commit/256ab93d7e96273c0d351c26e48e87fb6496c3ba))
* **meet:** improve mobile meeting entry and ended review ([a889bd1](https://github.com/tutur3u/platform/commit/a889bd13ecf417fdfb308e1fce8d09443d715329))
* **meet:** improve tablet prejoin, listing, and ended review ([#5477](https://github.com/tutur3u/platform/issues/5477)) ([e507a8f](https://github.com/tutur3u/platform/commit/e507a8f5e45a6c308499090ab4ce0008369ac831))
* **meet:** show speaker-attributed mobile transcripts ([f078fb4](https://github.com/tutur3u/platform/commit/f078fb422ef2461801054a87304948ac058e7a7d)) ([#5498](https://github.com/tutur3u/platform/issues/5498)) ([7c4dd5a](https://github.com/tutur3u/platform/commit/7c4dd5a44cd161ff30c7bf5b65b7cdcadea2dd96))
* **mobile:** add consented native Live screen sharing ([b8c99e4](https://github.com/tutur3u/platform/commit/b8c99e46e203d819d902e8b4fe5333586bd21026)) ([#5444](https://github.com/tutur3u/platform/issues/5444)) ([7df297a](https://github.com/tutur3u/platform/commit/7df297ab6a2d5ecf96760355a2b99917f9b10926))
* **mobile:** add Meet prejoin and device controls ([d443582](https://github.com/tutur3u/platform/commit/d443582c7b678d262bdd21e37003b42a9b764373))
* **mobile:** add native Meet Mira reviews ([#5468](https://github.com/tutur3u/platform/issues/5468)) ([db3b60a](https://github.com/tutur3u/platform/commit/db3b60a374642342ff538c04965ad61537419e04))
* **mobile:** add native Meet prejoin and device controls ([#5463](https://github.com/tutur3u/platform/issues/5463)) ([1e2b658](https://github.com/tutur3u/platform/commit/1e2b65897d3ebfc3593d677f60b37631d5f2d967))
* **mobile:** add native Meet recording permission settings ([98f02c9](https://github.com/tutur3u/platform/commit/98f02c9237a82b450d58ceea12aefee84d82b0e6)) ([#5470](https://github.com/tutur3u/platform/issues/5470)) ([7fe6b7c](https://github.com/tutur3u/platform/commit/7fe6b7cabacbbc8099ec6342d5d5f6bbbbb67fc2))
* **mobile:** add persistent mail message appearance controls ([5fbc5a0](https://github.com/tutur3u/platform/commit/5fbc5a0eeec345a9c8ab5f30609d8b295ccd29f6))
* **mobile:** add persistent Mail message appearance controls ([#5430](https://github.com/tutur3u/platform/issues/5430)) ([596acd9](https://github.com/tutur3u/platform/commit/596acd9b218c4e24cc981596c77e1d2499f70ec8))
* **mobile:** add private Mira chat in Meet ([14af2d4](https://github.com/tutur3u/platform/commit/14af2d438c7f6d123a69cc1156f8994d888c1faa)) ([#5464](https://github.com/tutur3u/platform/issues/5464)) ([8cb0e82](https://github.com/tutur3u/platform/commit/8cb0e82da990e7842705e9ece159bc13dd74e528))
* **mobile:** add private profile activity and workspace sharing ([38b5d1b](https://github.com/tutur3u/platform/commit/38b5d1bec3a0296fbbcaf128c2c4f3bdd685b108))
* **mobile:** add private Profile activity and workspace sharing ([#5429](https://github.com/tutur3u/platform/issues/5429)) ([4285508](https://github.com/tutur3u/platform/commit/4285508854d8f602656b86551c0940ec67ef29c0))
* **mobile:** add workspace Mail client ([6b1054b](https://github.com/tutur3u/platform/commit/6b1054bf37479570118ee70c5301ca452a5d03ee)) ([#5388](https://github.com/tutur3u/platform/issues/5388)) ([ebfed37](https://github.com/tutur3u/platform/commit/ebfed377ce643a48c470553b40bff6ca8def5fd8))
* **mobile:** archive opened notifications quietly ([9685b0d](https://github.com/tutur3u/platform/commit/9685b0dd80ff5ba2349c915f9672ab5f5ae5b3b3)) ([#5467](https://github.com/tutur3u/platform/issues/5467)) ([e31cae8](https://github.com/tutur3u/platform/commit/e31cae8c430e849d6eb3bc9109abbea8fe785848))
* **mobile:** bring public Mira reviews into native Meet ([ea5fb63](https://github.com/tutur3u/platform/commit/ea5fb6377527b7357db63493e84560facd8f75d6))
* **mobile:** compact Mail and render isolated HTML ([7d0e4f8](https://github.com/tutur3u/platform/commit/7d0e4f8cf800ad8fd588002279b3d5ecdb6d40b6)) ([#5396](https://github.com/tutur3u/platform/issues/5396)) ([9545e89](https://github.com/tutur3u/platform/commit/9545e89822ee4f71563a2be9ee491ff3c9d484b6))
* **mobile:** implement native Meet calls ([2ae13f2](https://github.com/tutur3u/platform/commit/2ae13f2d56510882c387b27859b9bf316414aeb7)) ([#5461](https://github.com/tutur3u/platform/issues/5461)) ([bd2a9e0](https://github.com/tutur3u/platform/commit/bd2a9e08e73913dc02ef9c3b22c6e91aa73c3391))
* **mobile:** modernize Chat list and message layout ([40fcfbc](https://github.com/tutur3u/platform/commit/40fcfbc986513bcf652d72cb2807e0f9aef99616)) ([#5496](https://github.com/tutur3u/platform/issues/5496)) ([3bb90cd](https://github.com/tutur3u/platform/commit/3bb90cd8af15059339bb12597e40d77eeed470f2))
* **mobile:** play room Mira Live audio natively ([7d5dd39](https://github.com/tutur3u/platform/commit/7d5dd39c0f5c81e0a9fff5e92c55663f2de87a09)) ([#5471](https://github.com/tutur3u/platform/issues/5471)) ([61a5767](https://github.com/tutur3u/platform/commit/61a57678b1d5be056479184e55bb6306f0250fe6))
* **mobile:** schedule task and calendar reminders ([bddfd23](https://github.com/tutur3u/platform/commit/bddfd231bdd3a778b931cf669b6bfbe6f45ba256)) ([#5486](https://github.com/tutur3u/platform/issues/5486)) ([67b2a68](https://github.com/tutur3u/platform/commit/67b2a6890cfe80b819f0fcc912e48d579d386ac0))
* **mobile:** simplify navigation and keep cached screens responsive ([583bec6](https://github.com/tutur3u/platform/commit/583bec69a1a5fcce050a0950bedfd5919a9807ee))
* **mobile:** simplify shell chrome and surface mail and meet on Home ([68bc6e6](https://github.com/tutur3u/platform/commit/68bc6e67219ed03db095a983b8d79bcc0ee7fa09)) ([#5484](https://github.com/tutur3u/platform/issues/5484)) ([58250ea](https://github.com/tutur3u/platform/commit/58250eaa11b5804f34b8fd199d3fc3f7f235ad53))
* **mobile:** streamline settings and show release history ([7885450](https://github.com/tutur3u/platform/commit/7885450a31a3630d7995b66c7b83804913304fae)) ([#5483](https://github.com/tutur3u/platform/issues/5483)) ([de3afa1](https://github.com/tutur3u/platform/commit/de3afa1fd973073ed67fb0903107f430402e491e))


### Bug Fixes

* **assistant:** preserve voice retries and saved replies ([9a5a44f](https://github.com/tutur3u/platform/commit/9a5a44fe8f7e58f382658de4bf03c9d17c2d7345)) ([#5517](https://github.com/tutur3u/platform/issues/5517)) ([8101e94](https://github.com/tutur3u/platform/commit/8101e949b0484786e0ec490502ab32d3ac3e7041))
* **assistant:** respect source size gate ([5603662](https://github.com/tutur3u/platform/commit/5603662c710c54efc6a9126666ed198b5e0f9f1b))
* **auth:** preserve enrollment recovery across dismissible setup ([521f8e8](https://github.com/tutur3u/platform/commit/521f8e8316283322b3af1577ff0d0a5bcd90b200))
* **auth:** repair mobile authenticator enrollment and setup sheet ([153321f](https://github.com/tutur3u/platform/commit/153321f1e9601126133c181f430fdb7bbedff9d4)) ([#5407](https://github.com/tutur3u/platform/issues/5407)) ([d0a95fd](https://github.com/tutur3u/platform/commit/d0a95fdd2a3768e5d185bfc135121b6c51834a6d))
* **auth:** skip MFA enrollment without an authenticated user ([14e6837](https://github.com/tutur3u/platform/commit/14e6837acad77e16e2ca58a63d7a2b1863b14ec5))
* **calendar:** restore background sync and mobile refresh ([#5402](https://github.com/tutur3u/platform/issues/5402)) ([98a6a29](https://github.com/tutur3u/platform/commit/98a6a2963f26eab0bf785829a76f04f892c05efd))
* **calendar:** restore server sync and mobile freshness ([26c6f51](https://github.com/tutur3u/platform/commit/26c6f5114ac1605071b077d63550a73082c38ec4))
* **calendar:** treat working locations as non-reminder events ([454e666](https://github.com/tutur3u/platform/commit/454e666a6465e3debd06260aedc1de7b96ab5d67)) ([#5511](https://github.com/tutur3u/platform/issues/5511)) ([6508ad6](https://github.com/tutur3u/platform/commit/6508ad681aaa174b186022fcbd526e20be682973))
* **ci:** enable and verify signed mobile beta releases ([#5387](https://github.com/tutur3u/platform/issues/5387)) ([3b34df6](https://github.com/tutur3u/platform/commit/3b34df69b5565924180b18b3a41152a8bb80366e))
* **ci:** verify signed mobile beta releases ([f6985a6](https://github.com/tutur3u/platform/commit/f6985a6fb462c40629c7a719ef135f7aecd8c476))
* **desktop:** address beta updater review findings ([bf53a23](https://github.com/tutur3u/platform/commit/bf53a2304d6d2d561a2fcacc5ea2d83a9a45cf1e))
* **meet:** address review findings in mobile scheduling and room review ([f2a637c](https://github.com/tutur3u/platform/commit/f2a637c34d9019c04616606a50c6cd313b0ce68e))
* **meet:** complete native SFU negotiation ([a820f39](https://github.com/tutur3u/platform/commit/a820f392699daa02d6530fd5c1bf7a9327dc4c8e)) ([#5510](https://github.com/tutur3u/platform/issues/5510)) ([7683b66](https://github.com/tutur3u/platform/commit/7683b66741641e9b526a3fdb6f69f4a6aac274da))
* **meet:** guard schedule feedback after closing editor ([7a85add](https://github.com/tutur3u/platform/commit/7a85addea95dd935a101421946a0754b60337972))
* **meet:** satisfy transcript widget analysis ([0149e27](https://github.com/tutur3u/platform/commit/0149e272c83d53b8e15e9bef237dc3241405e526))
* **mobile:** accommodate larger navigation labels ([d49e0b0](https://github.com/tutur3u/platform/commit/d49e0b00543be6d31ca95d7171cb3f3bb42f645c))
* **mobile:** adapt Assistant starters to tablet layouts ([0c9e17c](https://github.com/tutur3u/platform/commit/0c9e17c881f3d8bfc8ab2e7bb42efcb1fd2f376a))
* **mobile:** adapt calendar defaults and agenda layout ([44611ee](https://github.com/tutur3u/platform/commit/44611eeb6b8e0249a39c3d03c591d4fb75c7c342)) ([#5426](https://github.com/tutur3u/platform/issues/5426)) ([d4ed218](https://github.com/tutur3u/platform/commit/d4ed2181c1b9ec222c29e667360d15865b8abe8b))
* **mobile:** adapt shell and boards to tablet windows ([1990cb6](https://github.com/tutur3u/platform/commit/1990cb625bfc318a47af2343ad364b40fb4ebcc5)) ([#5395](https://github.com/tutur3u/platform/issues/5395)) ([9be8a79](https://github.com/tutur3u/platform/commit/9be8a79eae646c08dc596a65839a258c08739546))
* **mobile:** address Mail review edge cases ([7434846](https://github.com/tutur3u/platform/commit/743484666ce33c74b080b6f1d338c8cc63781c48))
* **mobile:** align expanded Apps search with its cards ([de154e6](https://github.com/tutur3u/platform/commit/de154e61c50feee9d76ca99e341eddb9af046078))
* **mobile:** allow closing authenticator status loading ([a9ca879](https://github.com/tutur3u/platform/commit/a9ca8791e8298af0e0e2c176db1dbfde1d870113))
* **mobile:** archive mail alerts after message load ([a61e455](https://github.com/tutur3u/platform/commit/a61e4559840c57e8f5bcbe77c92ea6489435f6a5))
* **mobile:** avoid duplicate Chat composer dock clearance ([d3ffd80](https://github.com/tutur3u/platform/commit/d3ffd8021092b525f5216e98e9f30ffaa2abe2b6))
* **mobile:** avoid duplicate profile activity announcements ([b8102fe](https://github.com/tutur3u/platform/commit/b8102feb8362afcea54629c4ad1900f3ef78ec3e))
* **mobile:** blend Mail message surfaces into app background ([2558e8d](https://github.com/tutur3u/platform/commit/2558e8d93e6d4586f46f9f580b619008dbfc8a5b))
* **mobile:** bound cache keys by encoded size ([1b7dcea](https://github.com/tutur3u/platform/commit/1b7dcea320401cb5288df27a9a127ea3320562d8))
* **mobile:** cancel hidden capture and guard shared calendar cache ([d3daf7a](https://github.com/tutur3u/platform/commit/d3daf7a5a5db986421dc59bbbb11a3ea4ed7c306))
* **mobile:** cancel reminders outside scheduled limit ([2e2a3e2](https://github.com/tutur3u/platform/commit/2e2a3e29c6494b45a4274492efee6913cce50890))
* **mobile:** clean up failed native microphone starts ([44fb0f9](https://github.com/tutur3u/platform/commit/44fb0f9237c9197060101a297e67200aab39d9f1))
* **mobile:** clear deleted Mail filters after metadata refresh ([b2497b5](https://github.com/tutur3u/platform/commit/b2497b5f71eb2852df8cddbdc4b186b4405ad340))
* **mobile:** clear inbox actions for nested Mail routes ([701bf18](https://github.com/tutur3u/platform/commit/701bf182c4245fa59f68ecdfa38abc9b431d1a14))
* **mobile:** coalesce scoped cache refreshes safely ([09f1ee1](https://github.com/tutur3u/platform/commit/09f1ee19d9fb8a8811a8c21dfbd65d4904613249)) ([#5389](https://github.com/tutur3u/platform/issues/5389)) ([fdb8077](https://github.com/tutur3u/platform/commit/fdb80779737a45ebbd67dbbcc2ea6ba35c8ada75))
* **mobile:** compact multi-day calendar layout ([93b59c2](https://github.com/tutur3u/platform/commit/93b59c229634b1b6bbbd31c9dcdd2a113bd79ee7)) ([#5474](https://github.com/tutur3u/platform/issues/5474)) ([0cf4c62](https://github.com/tutur3u/platform/commit/0cf4c621e1a3956918473c6330675197c72d07a3))
* **mobile:** configure Mail primary action and speed up archiving ([#5475](https://github.com/tutur3u/platform/issues/5475)) ([45bb143](https://github.com/tutur3u/platform/commit/45bb143937000156a5718736e80838588bee96f3))
* **mobile:** correct nested Mail spacing and search controls ([e444e01](https://github.com/tutur3u/platform/commit/e444e01d586920a9260e31b7c075507341710e40))
* **mobile:** expand Chat panes on tablet screens ([28a237d](https://github.com/tutur3u/platform/commit/28a237dd37f9093e79ab241c0bb962b4f3ee0c28))
* **mobile:** expand root layouts and clear hidden header space ([4cd9892](https://github.com/tutur3u/platform/commit/4cd98925f6b65fe093fd0145ef5aaf51979fdc80)) ([#5501](https://github.com/tutur3u/platform/issues/5501)) ([ab314ff](https://github.com/tutur3u/platform/commit/ab314ff67cfe8b8c7e9fa13d333c21f681996ccd))
* **mobile:** fill tablet work surfaces without empty rows ([57468b0](https://github.com/tutur3u/platform/commit/57468b03143048e9e66cd9c11473d4ad86a67442))
* **mobile:** finish tablet layouts and Meet caching ([#5397](https://github.com/tutur3u/platform/issues/5397)) ([1f37e59](https://github.com/tutur3u/platform/commit/1f37e59f86d8cf6258bdacbf81cec5a39dd45256))
* **mobile:** fit full calendar years across tablet layouts ([80f06af](https://github.com/tutur3u/platform/commit/80f06afe1bbb271fbec1937388bd51afbd10becd))
* **mobile:** fit Mail content and consolidate reader actions ([2b1abdc](https://github.com/tutur3u/platform/commit/2b1abdcb48304b02e2efa17617b534f109b13614)) ([#5502](https://github.com/tutur3u/platform/issues/5502)) ([49a54bd](https://github.com/tutur3u/platform/commit/49a54bd16d8d4c5f9d75969777dabfaa38264dfa))
* **mobile:** fit short calendar events and large text ([fae8055](https://github.com/tutur3u/platform/commit/fae8055c6391ad8bbe8b92ad0aad3e73ba556b8f))
* **mobile:** fit wide Mail newsletters to phone screens ([ed987c2](https://github.com/tutur3u/platform/commit/ed987c26acd324e48407967676252dae6d68bddf)) ([#5466](https://github.com/tutur3u/platform/issues/5466)) ([6ce7a7c](https://github.com/tutur3u/platform/commit/6ce7a7c7ec88f42a61680bafdbc0d5740a4c7879))
* **mobile:** float navigation over full-height content ([#5425](https://github.com/tutur3u/platform/issues/5425)) ([7c94df9](https://github.com/tutur3u/platform/commit/7c94df9d55a460b1636a8f1fac09ee3a53bfb2d3))
* **mobile:** float shell header and compact root surfaces ([44aff5c](https://github.com/tutur3u/platform/commit/44aff5c3e2b9a9932b7a5ab955712336a1405e96)) ([#5492](https://github.com/tutur3u/platform/issues/5492)) ([998d9de](https://github.com/tutur3u/platform/commit/998d9de15035905bbaa617348a53ceb25ea16e99))
* **mobile:** format Meet review endpoint path ([997ea7c](https://github.com/tutur3u/platform/commit/997ea7c74b563043fd8655f00eee005684ff638d))
* **mobile:** guard chat restoration and malformed inbox caches ([14f18a8](https://github.com/tutur3u/platform/commit/14f18a8d2f39ade05f33dd5a6b1eb601d1816099))
* **mobile:** handle concurrent mail actions and accessible message menus ([5fdb562](https://github.com/tutur3u/platform/commit/5fdb5629e8df901edda046bb45c61eeca9c05189))
* **mobile:** harden live recovery and credit sheet edge cases ([14f7a18](https://github.com/tutur3u/platform/commit/14f7a185f4236fd43d9c31a0d827eb40466dd7ed))
* **mobile:** harden live screen capture startup and frames ([63433b8](https://github.com/tutur3u/platform/commit/63433b853010f84835ff3206d6847591e1841d43))
* **mobile:** harden Meet sharing and room chat ([6722085](https://github.com/tutur3u/platform/commit/6722085beff8914b528be004acea9c8a3e847957))
* **mobile:** improve Mail reading and dark feedback ([12815d6](https://github.com/tutur3u/platform/commit/12815d638c44bb3d12c4570c22906fb26cdff510)) ([#5458](https://github.com/tutur3u/platform/issues/5458)) ([bbb8fcf](https://github.com/tutur3u/platform/commit/bbb8fcf0d9ded2b249014ca092b20d4e926d1e78))
* **mobile:** integrate dock actions and improve Mail navigation, caching, and swipes ([#5433](https://github.com/tutur3u/platform/issues/5433)) ([b9eef65](https://github.com/tutur3u/platform/commit/b9eef65e183dab4d5bec8ae8162bf438982cd21f))
* **mobile:** integrate dock actions and streamline Mail navigation and swipes ([e2fb55a](https://github.com/tutur3u/platform/commit/e2fb55a8d234da025569900b9ddd4fe32517dd8b))
* **mobile:** integrate floating navigation and primary actions ([#5424](https://github.com/tutur3u/platform/issues/5424)) ([afbbe68](https://github.com/tutur3u/platform/commit/afbbe68a36cf04ec244b07a4f1524f600ff7bc70))
* **mobile:** isolate calendar rollback and respect sheet dismissal ([dff88bc](https://github.com/tutur3u/platform/commit/dff88bc8fc5197a0f0b7f94b5789bf3ab28623f9))
* **mobile:** isolate late calendar create and pagination responses ([724c698](https://github.com/tutur3u/platform/commit/724c6987c12503d19cd6dc8a4f3c32b24412b874))
* **mobile:** keep Assistant voice recordings attached and sendable ([a73f83b](https://github.com/tutur3u/platform/commit/a73f83b6ab4e6707ab766bff73ba3ae8bd22c113)) ([#5485](https://github.com/tutur3u/platform/issues/5485)) ([311fa5b](https://github.com/tutur3u/platform/commit/311fa5b0e68c395b08fcba4d5c195cf8d49fde85))
* **mobile:** keep authenticator enrollment in its sheet ([5eb5315](https://github.com/tutur3u/platform/commit/5eb5315f109ca0c678490a102504d001c6315ff0))
* **mobile:** keep Chat usable in short landscape windows ([1b351de](https://github.com/tutur3u/platform/commit/1b351de31b18b727a0a834c3eb25101df095231b))
* **mobile:** keep fixed headers visible above dock ([6e19fb2](https://github.com/tutur3u/platform/commit/6e19fb272b99f9a3025942889d67454a73c18b75))
* **mobile:** keep home previews fresh and dock visibility aligned ([0e5f173](https://github.com/tutur3u/platform/commit/0e5f173bb9f3c069660a727087e3c9a05f177603))
* **mobile:** keep Meet editor reachable in landscape ([d6f1c0d](https://github.com/tutur3u/platform/commit/d6f1c0daa96b2aa24e7381302b5e098c472ec540))
* **mobile:** keep notification migration checks current ([8c03623](https://github.com/tutur3u/platform/commit/8c03623d8715648e575af7457341d19b30078739))
* **mobile:** keep wide emails readable on small screens ([0f0341f](https://github.com/tutur3u/platform/commit/0f0341fa720bb1ea3461a006c48763a3e821df0f)) ([#5462](https://github.com/tutur3u/platform/issues/5462)) ([9295f83](https://github.com/tutur3u/platform/commit/9295f83f7b8d062d76670ecdc8dc6eb8cebe5a90))
* **mobile:** localize Live recovery messages ([7066c3a](https://github.com/tutur3u/platform/commit/7066c3a4842ef265964702d9ce0646ca08339df7))
* **mobile:** localize Mail reader and inbox timestamps ([6056b47](https://github.com/tutur3u/platform/commit/6056b47b6a52fadcaf769d1f93c4fd9a8cbbd15d)) ([#5413](https://github.com/tutur3u/platform/issues/5413)) ([e11099f](https://github.com/tutur3u/platform/commit/e11099ff0cdbc98eb95809ad7587ccdabc3addf3))
* **mobile:** make Mail primary actions configurable and responsive ([7902ace](https://github.com/tutur3u/platform/commit/7902ace23fc21099dbd75a67aa7ec51cd4cde35a))
* **mobile:** make Mira retry feedback clear in dark mode ([03177d3](https://github.com/tutur3u/platform/commit/03177d307ebf7c4d9dbdb1f4cbc9b23acd0c7d0b))
* **mobile:** morph navigation items and island geometry together ([215458c](https://github.com/tutur3u/platform/commit/215458ccbf97fab055ceaa5bd4d985946fec9206)) ([#5427](https://github.com/tutur3u/platform/issues/5427)) ([949c417](https://github.com/tutur3u/platform/commit/949c417242466b8365e5906f82cdef46ed00aa5c))
* **mobile:** move conversation navigation into Chat toolbar ([77bef52](https://github.com/tutur3u/platform/commit/77bef52a435aacdc1dea0bbcd6232d4493095656))
* **mobile:** open Chat on conversation list ([b0fdf6e](https://github.com/tutur3u/platform/commit/b0fdf6e3743995cf19706fd29572c703c6bcfe5f)) ([#5503](https://github.com/tutur3u/platform/issues/5503)) ([fe76404](https://github.com/tutur3u/platform/commit/fe764040b41856b5bc4c61ee2299352137602912))
* **mobile:** open Mail push target before inbox refresh ([08f18aa](https://github.com/tutur3u/platform/commit/08f18aafd2d5a43617fcac8a60828b317e5c2b0f)) ([#5454](https://github.com/tutur3u/platform/issues/5454)) ([a4a9a35](https://github.com/tutur3u/platform/commit/a4a9a35beb8e40652ca8c5850c528de8f7fcf968))
* **mobile:** open scheduled reminders after cold launch ([49267f1](https://github.com/tutur3u/platform/commit/49267f1cb006d39b687d5cc728e11d97374f93dd))
* **mobile:** place Meet sheets above floating dock ([a860098](https://github.com/tutur3u/platform/commit/a8600987156e4b85f1270a719fe11ecee5f0685f))
* **mobile:** preserve app origins and refine navigation and audio input ([c2a2b31](https://github.com/tutur3u/platform/commit/c2a2b31525343a4c73c1ed038688c2c3eb1291a0)) ([#5420](https://github.com/tutur3u/platform/issues/5420)) ([71b04c0](https://github.com/tutur3u/platform/commit/71b04c04c7c1b773100c723f95d8fe440b83d6b1))
* **mobile:** preserve cache expiry during invalidation ([7c04655](https://github.com/tutur3u/platform/commit/7c04655d71cda2dd34ccb07c24b44c4d5c84c1e0))
* **mobile:** preserve calendar preferences per workspace ([9be2024](https://github.com/tutur3u/platform/commit/9be202452f150a8de2410dfa2a4f973811221410))
* **mobile:** preserve header clearance and fill notification pages ([63322cc](https://github.com/tutur3u/platform/commit/63322cc2da7afc8dfef00defcb18b06d2897d0f8))
* **mobile:** preserve live drafts and refresh saved conversations ([444b1fc](https://github.com/tutur3u/platform/commit/444b1fc92fee85a49bd377c1a47824decb0af531))
* **mobile:** preserve Mail drafts during back and save ([18796f8](https://github.com/tutur3u/platform/commit/18796f89b1082354a3576cd673d8135b00d8ffa1))
* **mobile:** preserve mail whitespace and thread expansion ([2552e79](https://github.com/tutur3u/platform/commit/2552e792acdb4568cd890c973888097212a1024f))
* **mobile:** preserve mailbox access and archive header actions ([a525937](https://github.com/tutur3u/platform/commit/a525937baea07d78fd55a376c82fe4815dabd980))
* **mobile:** preserve network results across cache failures ([f883098](https://github.com/tutur3u/platform/commit/f883098367837774704750b097bdd54a2296f828))
* **mobile:** preserve scoped mail cache and background metadata ([40d64f6](https://github.com/tutur3u/platform/commit/40d64f61c7940834929b845c6a00e58e65303197))
* **mobile:** preserve scroll access for clipped mail containers ([daef1a1](https://github.com/tutur3u/platform/commit/daef1a158a5355077e6a126641459245bdd1027c))
* **mobile:** publish iOS beta without ReplayKit extension ([#5480](https://github.com/tutur3u/platform/issues/5480)) ([f34e204](https://github.com/tutur3u/platform/commit/f34e204c157264e20b660bb4b2dc9a78b0efdbdd))
* **mobile:** read calendar viewport before provider creation ([e665be0](https://github.com/tutur3u/platform/commit/e665be0635414fd1c64440a5ac8af087f4518c7c))
* **mobile:** reconcile recovery with compact Mail release ([dfbaeb1](https://github.com/tutur3u/platform/commit/dfbaeb12d478f0d3031c0dd323bd4b98535ede91))
* **mobile:** recover Live history and invalid microphone input ([2bcb6c2](https://github.com/tutur3u/platform/commit/2bcb6c23a2baa5659930183a10aa42f5790515c0))
* **mobile:** recover task verification and Assistant sessions ([2836363](https://github.com/tutur3u/platform/commit/283636386088a2fdf3994bd605b5c5b4c233bd4c)) ([#5434](https://github.com/tutur3u/platform/issues/5434)) ([c9f1f6e](https://github.com/tutur3u/platform/commit/c9f1f6e990b604e5ce119a80b303863a045b6ad3))
* **mobile:** recover voice recording failures safely ([041d10d](https://github.com/tutur3u/platform/commit/041d10d137ecf19dda860ee28e9906ab3d20cd02))
* **mobile:** refine Mail feedback and cached inbox states ([91187bc](https://github.com/tutur3u/platform/commit/91187bc88b93ebee7ff61bbe11d11dd963bb7386)) ([#5460](https://github.com/tutur3u/platform/issues/5460)) ([05ed1cb](https://github.com/tutur3u/platform/commit/05ed1cbe95c81524ee0828b7f9c3e6817da2f55f))
* **mobile:** refine Mail reader actions and thread layout ([6143235](https://github.com/tutur3u/platform/commit/6143235fa04b6c68e686009a221477db4bf6c0d8)) ([#5494](https://github.com/tutur3u/platform/issues/5494)) ([fb75d69](https://github.com/tutur3u/platform/commit/fb75d6995cdb35c23a3c6672300d0e5b03f1692c))
* **mobile:** reject invalidated cache responses ([cc19910](https://github.com/tutur3u/platform/commit/cc19910349e02c7b968b279e0a1960123f09b754))
* **mobile:** remove redundant dashboard entrance delays ([f6d67ee](https://github.com/tutur3u/platform/commit/f6d67ee321e672d5c9e99eb7e5c7045695e80a4a))
* **mobile:** repair Live transport and Pro workspace access ([#5428](https://github.com/tutur3u/platform/issues/5428)) ([ce02703](https://github.com/tutur3u/platform/commit/ce02703ac5073af869f276cffd95087817bb3267))
* **mobile:** reserve full floating header height ([#5521](https://github.com/tutur3u/platform/issues/5521)) ([ffe46bd](https://github.com/tutur3u/platform/commit/ffe46bd669cb6ed8f572842b5f3c6a79938df0cb))
* **mobile:** resolve Meet analyzer and format issues ([6411d51](https://github.com/tutur3u/platform/commit/6411d51628a10ae934dfa5db6351e81461ae613d))
* **mobile:** resolve standalone recorder dependency in CI ([4ce1973](https://github.com/tutur3u/platform/commit/4ce1973d68e066f5fae77076914ac1e51de686a9))
* **mobile:** restore colorful design and repair app access ([a5b6ea3](https://github.com/tutur3u/platform/commit/a5b6ea3012e6f9d6a45de51c9a5c792747d6b9ff))
* **mobile:** restore Live turns using AI conversation identity ([a93f4b8](https://github.com/tutur3u/platform/commit/a93f4b8d8b521f6018a57bab2c74be7ec917c95c))
* **mobile:** restore Meet media and call exit controls ([8b9d27a](https://github.com/tutur3u/platform/commit/8b9d27a2d1de5caa4872506798bb8661bf186502)) ([#5497](https://github.com/tutur3u/platform/issues/5497)) ([f44bf94](https://github.com/tutur3u/platform/commit/f44bf945ccd08e91d7b0b93c1d2f0b18b3d8228c))
* **mobile:** restore v0.9.2 design, responsive loading, and app access ([#5390](https://github.com/tutur3u/platform/issues/5390)) ([30987f9](https://github.com/tutur3u/platform/commit/30987f9c1706445bafc24186129f4646d0363009))
* **mobile:** resume legacy Assistant conversations securely ([b74ae34](https://github.com/tutur3u/platform/commit/b74ae34893e0b48f9bd99edaf8a328a208cdf174))
* **mobile:** retain session through refresh transport errors ([a12bc82](https://github.com/tutur3u/platform/commit/a12bc827d2f990fe301d9cd1854d688c0e1f242c)) ([#5482](https://github.com/tutur3u/platform/issues/5482)) ([f87108b](https://github.com/tutur3u/platform/commit/f87108bb662f0dc46184fca950735a730a5785f6))
* **mobile:** retry saved Mira messages idempotently ([4ad0fd9](https://github.com/tutur3u/platform/commit/4ad0fd9ed98d90d4ad7a9d347c912011de825a42))
* **mobile:** retry saved Mira messages without duplication ([#5476](https://github.com/tutur3u/platform/issues/5476)) ([e8ee430](https://github.com/tutur3u/platform/commit/e8ee430b886c9738cd0a688af9ef211216e5c934))
* **mobile:** satisfy responsive layout analysis ([cc1bb28](https://github.com/tutur3u/platform/commit/cc1bb2844d46c519075411ae9fb2ca633e2221fa))
* **mobile:** scope cache mutation generations ([761f3a3](https://github.com/tutur3u/platform/commit/761f3a3c3a99b6e9ec8bd90ba9c49a1377254146))
* **mobile:** scroll Chat filters with conversation lists ([741ab8f](https://github.com/tutur3u/platform/commit/741ab8fc23a86da151091f6e7f384e88aa6f5fb6))
* **mobile:** send JSON for calendar deletion ([60b08c4](https://github.com/tutur3u/platform/commit/60b08c4737ad83728a0540dbacefe9fb2743068c))
* **mobile:** ship iOS beta without ReplayKit extension ([d376262](https://github.com/tutur3u/platform/commit/d376262234f0dfb074c552a57417edeb88cd675c))
* **mobile:** show beta changes for every patch version ([6f2ba67](https://github.com/tutur3u/platform/commit/6f2ba6736c4385f1c4f01dbaa55b01ecfc64a195)) ([#5488](https://github.com/tutur3u/platform/issues/5488)) ([94f9896](https://github.com/tutur3u/platform/commit/94f98963c11fdcb58ef1a5e00973e852037c2f6c))
* **mobile:** stabilize root chrome and align content widths ([e1c5bcf](https://github.com/tutur3u/platform/commit/e1c5bcf680fee701e7cc75b453150028398eafd5)) ([#5514](https://github.com/tutur3u/platform/issues/5514)) ([21b7cd6](https://github.com/tutur3u/platform/commit/21b7cd6761affadc8c5604f4d7c5a710cdb7a6de))
* **mobile:** streamline chat navigation and content clearance ([425f193](https://github.com/tutur3u/platform/commit/425f193fcd2fb09d89169926a5b6dd1d1ce85874)) ([#5513](https://github.com/tutur3u/platform/issues/5513)) ([22fd621](https://github.com/tutur3u/platform/commit/22fd6219da49a6b69e1e62342e5c00f179dbfc2d))
* **mobile:** surface Meet connection failures ([67dd190](https://github.com/tutur3u/platform/commit/67dd19055914ea233955ee4803ab1d992bd0d9f8))
* **mobile:** unify dock actions, mail reader and meeting navigation ([0567ed7](https://github.com/tutur3u/platform/commit/0567ed7d391d9ae7fa8a43b3270b0cd342a34f7e))
* **mobile:** unify dock actions, Mail reader and meeting navigation ([#5438](https://github.com/tutur3u/platform/issues/5438)) ([3d2aeaf](https://github.com/tutur3u/platform/commit/3d2aeaf23621e49613d9595c5bce4d1141fe7bf5))
* **mobile:** unify navigation, loading, and fullscreen flows ([5eb1747](https://github.com/tutur3u/platform/commit/5eb17472531da24c288ad6d2df302b1e687212df))
* **mobile:** unify navigation, Nova loading, and fullscreen flows ([#5414](https://github.com/tutur3u/platform/issues/5414)) ([58da311](https://github.com/tutur3u/platform/commit/58da311b1ed0b11d1deb128e3a2e9b3a926f2b06))
* **mobile:** update Gemini Live transport and workspace access ([8ea5889](https://github.com/tutur3u/platform/commit/8ea5889cfe55bf7e814f22eea4f4cc1fe41ca606))
* **mobile:** upload Assistant recordings with MP4 audio MIME ([3e44e5f](https://github.com/tutur3u/platform/commit/3e44e5f42cae97df03899a96c01d27cc55509b4a)) ([#5495](https://github.com/tutur3u/platform/issues/5495)) ([dca10e8](https://github.com/tutur3u/platform/commit/dca10e8ae937032724d0c805dbf434464abfe73d))
* **mobile:** use compact navigation in short windows ([82d0422](https://github.com/tutur3u/platform/commit/82d0422c8fda0c1c2a14ed6414c1a145dd4b1c5c))
* **mobile:** validate negotiated track metadata ([e6cf05f](https://github.com/tutur3u/platform/commit/e6cf05f62ea3fa5cd8cb747cf75f25d90f05a057))


### Performance Improvements

* **mobile:** cache Meet pages and adapt meeting layouts ([f7483c1](https://github.com/tutur3u/platform/commit/f7483c162f67dbb47cac533c320e108e3bf17e07))
* **mobile:** restore Mail and Assistant instantly with scoped caches ([#5399](https://github.com/tutur3u/platform/issues/5399)) ([97d5937](https://github.com/tutur3u/platform/commit/97d593755e1e7c157604d9ce754e98b0d1ea5d71))
* **mobile:** restore scoped Mail and Assistant views instantly ([fee6302](https://github.com/tutur3u/platform/commit/fee63025820699c72af55f9b7b65b5a5cc17abee))

## [0.12.0](https://github.com/tutur3u/platform/compare/mobile-v0.11.0...mobile-v0.12.0) (2026-09-25)


### Features

* **auth:** enforce required account MFA lifecycle ([e08f27d](https://github.com/tutur3u/platform/commit/e08f27dbc082f7d9c951bb0792357638f3dcfb0a)) ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))
* **desktop:** add managed beta updates and Microsoft Store packaging ([#5443](https://github.com/tutur3u/platform/issues/5443)) ([59d836f](https://github.com/tutur3u/platform/commit/59d836f6405d0167c7567717be3eb507c5351d30))
* **mail:** add personal thread snooze and mute ([50f7b88](https://github.com/tutur3u/platform/commit/50f7b884706c156cd9a10a2b5c38f3079615096e)) ([#5445](https://github.com/tutur3u/platform/issues/5445)) ([26e392c](https://github.com/tutur3u/platform/commit/26e392c283a31fab038f03294ced90f2e8174874))
* **mail:** deliver incoming email push notifications ([#5442](https://github.com/tutur3u/platform/issues/5442)) ([256ab93](https://github.com/tutur3u/platform/commit/256ab93d7e96273c0d351c26e48e87fb6496c3ba))
* **meet:** improve mobile meeting entry and ended review ([a889bd1](https://github.com/tutur3u/platform/commit/a889bd13ecf417fdfb308e1fce8d09443d715329))
* **meet:** improve tablet prejoin, listing, and ended review ([#5477](https://github.com/tutur3u/platform/issues/5477)) ([e507a8f](https://github.com/tutur3u/platform/commit/e507a8f5e45a6c308499090ab4ce0008369ac831))
* **meet:** show speaker-attributed mobile transcripts ([f078fb4](https://github.com/tutur3u/platform/commit/f078fb422ef2461801054a87304948ac058e7a7d)) ([#5498](https://github.com/tutur3u/platform/issues/5498)) ([7c4dd5a](https://github.com/tutur3u/platform/commit/7c4dd5a44cd161ff30c7bf5b65b7cdcadea2dd96))
* **mobile:** add consented native Live screen sharing ([b8c99e4](https://github.com/tutur3u/platform/commit/b8c99e46e203d819d902e8b4fe5333586bd21026)) ([#5444](https://github.com/tutur3u/platform/issues/5444)) ([7df297a](https://github.com/tutur3u/platform/commit/7df297ab6a2d5ecf96760355a2b99917f9b10926))
* **mobile:** add Meet prejoin and device controls ([d443582](https://github.com/tutur3u/platform/commit/d443582c7b678d262bdd21e37003b42a9b764373))
* **mobile:** add native Meet Mira reviews ([#5468](https://github.com/tutur3u/platform/issues/5468)) ([db3b60a](https://github.com/tutur3u/platform/commit/db3b60a374642342ff538c04965ad61537419e04))
* **mobile:** add native Meet prejoin and device controls ([#5463](https://github.com/tutur3u/platform/issues/5463)) ([1e2b658](https://github.com/tutur3u/platform/commit/1e2b65897d3ebfc3593d677f60b37631d5f2d967))
* **mobile:** add native Meet recording permission settings ([98f02c9](https://github.com/tutur3u/platform/commit/98f02c9237a82b450d58ceea12aefee84d82b0e6)) ([#5470](https://github.com/tutur3u/platform/issues/5470)) ([7fe6b7c](https://github.com/tutur3u/platform/commit/7fe6b7cabacbbc8099ec6342d5d5f6bbbbb67fc2))
* **mobile:** add private Mira chat in Meet ([14af2d4](https://github.com/tutur3u/platform/commit/14af2d438c7f6d123a69cc1156f8994d888c1faa)) ([#5464](https://github.com/tutur3u/platform/issues/5464)) ([8cb0e82](https://github.com/tutur3u/platform/commit/8cb0e82da990e7842705e9ece159bc13dd74e528))
* **mobile:** archive opened notifications quietly ([9685b0d](https://github.com/tutur3u/platform/commit/9685b0dd80ff5ba2349c915f9672ab5f5ae5b3b3)) ([#5467](https://github.com/tutur3u/platform/issues/5467)) ([e31cae8](https://github.com/tutur3u/platform/commit/e31cae8c430e849d6eb3bc9109abbea8fe785848))
* **mobile:** bring public Mira reviews into native Meet ([ea5fb63](https://github.com/tutur3u/platform/commit/ea5fb6377527b7357db63493e84560facd8f75d6))
* **mobile:** implement native Meet calls ([2ae13f2](https://github.com/tutur3u/platform/commit/2ae13f2d56510882c387b27859b9bf316414aeb7)) ([#5461](https://github.com/tutur3u/platform/issues/5461)) ([bd2a9e0](https://github.com/tutur3u/platform/commit/bd2a9e08e73913dc02ef9c3b22c6e91aa73c3391))
* **mobile:** modernize Chat list and message layout ([40fcfbc](https://github.com/tutur3u/platform/commit/40fcfbc986513bcf652d72cb2807e0f9aef99616)) ([#5496](https://github.com/tutur3u/platform/issues/5496)) ([3bb90cd](https://github.com/tutur3u/platform/commit/3bb90cd8af15059339bb12597e40d77eeed470f2))
* **mobile:** play room Mira Live audio natively ([7d5dd39](https://github.com/tutur3u/platform/commit/7d5dd39c0f5c81e0a9fff5e92c55663f2de87a09)) ([#5471](https://github.com/tutur3u/platform/issues/5471)) ([61a5767](https://github.com/tutur3u/platform/commit/61a57678b1d5be056479184e55bb6306f0250fe6))
* **mobile:** schedule task and calendar reminders ([bddfd23](https://github.com/tutur3u/platform/commit/bddfd231bdd3a778b931cf669b6bfbe6f45ba256)) ([#5486](https://github.com/tutur3u/platform/issues/5486)) ([67b2a68](https://github.com/tutur3u/platform/commit/67b2a6890cfe80b819f0fcc912e48d579d386ac0))
* **mobile:** simplify shell chrome and surface mail and meet on Home ([68bc6e6](https://github.com/tutur3u/platform/commit/68bc6e67219ed03db095a983b8d79bcc0ee7fa09)) ([#5484](https://github.com/tutur3u/platform/issues/5484)) ([58250ea](https://github.com/tutur3u/platform/commit/58250eaa11b5804f34b8fd199d3fc3f7f235ad53))
* **mobile:** streamline settings and show release history ([7885450](https://github.com/tutur3u/platform/commit/7885450a31a3630d7995b66c7b83804913304fae)) ([#5483](https://github.com/tutur3u/platform/issues/5483)) ([de3afa1](https://github.com/tutur3u/platform/commit/de3afa1fd973073ed67fb0903107f430402e491e))


### Bug Fixes

* **assistant:** preserve voice retries and saved replies ([9a5a44f](https://github.com/tutur3u/platform/commit/9a5a44fe8f7e58f382658de4bf03c9d17c2d7345)) ([#5517](https://github.com/tutur3u/platform/issues/5517)) ([8101e94](https://github.com/tutur3u/platform/commit/8101e949b0484786e0ec490502ab32d3ac3e7041))
* **assistant:** respect source size gate ([5603662](https://github.com/tutur3u/platform/commit/5603662c710c54efc6a9126666ed198b5e0f9f1b))
* **auth:** skip MFA enrollment without an authenticated user ([14e6837](https://github.com/tutur3u/platform/commit/14e6837acad77e16e2ca58a63d7a2b1863b14ec5))
* **calendar:** treat working locations as non-reminder events ([454e666](https://github.com/tutur3u/platform/commit/454e666a6465e3debd06260aedc1de7b96ab5d67)) ([#5511](https://github.com/tutur3u/platform/issues/5511)) ([6508ad6](https://github.com/tutur3u/platform/commit/6508ad681aaa174b186022fcbd526e20be682973))
* **desktop:** address beta updater review findings ([bf53a23](https://github.com/tutur3u/platform/commit/bf53a2304d6d2d561a2fcacc5ea2d83a9a45cf1e))
* **meet:** address review findings in mobile scheduling and room review ([f2a637c](https://github.com/tutur3u/platform/commit/f2a637c34d9019c04616606a50c6cd313b0ce68e))
* **meet:** complete native SFU negotiation ([a820f39](https://github.com/tutur3u/platform/commit/a820f392699daa02d6530fd5c1bf7a9327dc4c8e)) ([#5510](https://github.com/tutur3u/platform/issues/5510)) ([7683b66](https://github.com/tutur3u/platform/commit/7683b66741641e9b526a3fdb6f69f4a6aac274da))
* **meet:** guard schedule feedback after closing editor ([7a85add](https://github.com/tutur3u/platform/commit/7a85addea95dd935a101421946a0754b60337972))
* **meet:** satisfy transcript widget analysis ([0149e27](https://github.com/tutur3u/platform/commit/0149e272c83d53b8e15e9bef237dc3241405e526))
* **mobile:** address Mail review edge cases ([7434846](https://github.com/tutur3u/platform/commit/743484666ce33c74b080b6f1d338c8cc63781c48))
* **mobile:** archive mail alerts after message load ([a61e455](https://github.com/tutur3u/platform/commit/a61e4559840c57e8f5bcbe77c92ea6489435f6a5))
* **mobile:** cancel reminders outside scheduled limit ([2e2a3e2](https://github.com/tutur3u/platform/commit/2e2a3e29c6494b45a4274492efee6913cce50890))
* **mobile:** compact multi-day calendar layout ([93b59c2](https://github.com/tutur3u/platform/commit/93b59c229634b1b6bbbd31c9dcdd2a113bd79ee7)) ([#5474](https://github.com/tutur3u/platform/issues/5474)) ([0cf4c62](https://github.com/tutur3u/platform/commit/0cf4c621e1a3956918473c6330675197c72d07a3))
* **mobile:** configure Mail primary action and speed up archiving ([#5475](https://github.com/tutur3u/platform/issues/5475)) ([45bb143](https://github.com/tutur3u/platform/commit/45bb143937000156a5718736e80838588bee96f3))
* **mobile:** expand root layouts and clear hidden header space ([4cd9892](https://github.com/tutur3u/platform/commit/4cd98925f6b65fe093fd0145ef5aaf51979fdc80)) ([#5501](https://github.com/tutur3u/platform/issues/5501)) ([ab314ff](https://github.com/tutur3u/platform/commit/ab314ff67cfe8b8c7e9fa13d333c21f681996ccd))
* **mobile:** fit Mail content and consolidate reader actions ([2b1abdc](https://github.com/tutur3u/platform/commit/2b1abdcb48304b02e2efa17617b534f109b13614)) ([#5502](https://github.com/tutur3u/platform/issues/5502)) ([49a54bd](https://github.com/tutur3u/platform/commit/49a54bd16d8d4c5f9d75969777dabfaa38264dfa))
* **mobile:** fit wide Mail newsletters to phone screens ([ed987c2](https://github.com/tutur3u/platform/commit/ed987c26acd324e48407967676252dae6d68bddf)) ([#5466](https://github.com/tutur3u/platform/issues/5466)) ([6ce7a7c](https://github.com/tutur3u/platform/commit/6ce7a7c7ec88f42a61680bafdbc0d5740a4c7879))
* **mobile:** float shell header and compact root surfaces ([44aff5c](https://github.com/tutur3u/platform/commit/44aff5c3e2b9a9932b7a5ab955712336a1405e96)) ([#5492](https://github.com/tutur3u/platform/issues/5492)) ([998d9de](https://github.com/tutur3u/platform/commit/998d9de15035905bbaa617348a53ceb25ea16e99))
* **mobile:** format Meet review endpoint path ([997ea7c](https://github.com/tutur3u/platform/commit/997ea7c74b563043fd8655f00eee005684ff638d))
* **mobile:** harden live screen capture startup and frames ([63433b8](https://github.com/tutur3u/platform/commit/63433b853010f84835ff3206d6847591e1841d43))
* **mobile:** harden Meet sharing and room chat ([6722085](https://github.com/tutur3u/platform/commit/6722085beff8914b528be004acea9c8a3e847957))
* **mobile:** improve Mail reading and dark feedback ([12815d6](https://github.com/tutur3u/platform/commit/12815d638c44bb3d12c4570c22906fb26cdff510)) ([#5458](https://github.com/tutur3u/platform/issues/5458)) ([bbb8fcf](https://github.com/tutur3u/platform/commit/bbb8fcf0d9ded2b249014ca092b20d4e926d1e78))
* **mobile:** keep Assistant voice recordings attached and sendable ([a73f83b](https://github.com/tutur3u/platform/commit/a73f83b6ab4e6707ab766bff73ba3ae8bd22c113)) ([#5485](https://github.com/tutur3u/platform/issues/5485)) ([311fa5b](https://github.com/tutur3u/platform/commit/311fa5b0e68c395b08fcba4d5c195cf8d49fde85))
* **mobile:** keep fixed headers visible above dock ([6e19fb2](https://github.com/tutur3u/platform/commit/6e19fb272b99f9a3025942889d67454a73c18b75))
* **mobile:** keep home previews fresh and dock visibility aligned ([0e5f173](https://github.com/tutur3u/platform/commit/0e5f173bb9f3c069660a727087e3c9a05f177603))
* **mobile:** keep notification migration checks current ([8c03623](https://github.com/tutur3u/platform/commit/8c03623d8715648e575af7457341d19b30078739))
* **mobile:** keep wide emails readable on small screens ([0f0341f](https://github.com/tutur3u/platform/commit/0f0341fa720bb1ea3461a006c48763a3e821df0f)) ([#5462](https://github.com/tutur3u/platform/issues/5462)) ([9295f83](https://github.com/tutur3u/platform/commit/9295f83f7b8d062d76670ecdc8dc6eb8cebe5a90))
* **mobile:** make Mail primary actions configurable and responsive ([7902ace](https://github.com/tutur3u/platform/commit/7902ace23fc21099dbd75a67aa7ec51cd4cde35a))
* **mobile:** make Mira retry feedback clear in dark mode ([03177d3](https://github.com/tutur3u/platform/commit/03177d307ebf7c4d9dbdb1f4cbc9b23acd0c7d0b))
* **mobile:** open Chat on conversation list ([b0fdf6e](https://github.com/tutur3u/platform/commit/b0fdf6e3743995cf19706fd29572c703c6bcfe5f)) ([#5503](https://github.com/tutur3u/platform/issues/5503)) ([fe76404](https://github.com/tutur3u/platform/commit/fe764040b41856b5bc4c61ee2299352137602912))
* **mobile:** open Mail push target before inbox refresh ([08f18aa](https://github.com/tutur3u/platform/commit/08f18aafd2d5a43617fcac8a60828b317e5c2b0f)) ([#5454](https://github.com/tutur3u/platform/issues/5454)) ([a4a9a35](https://github.com/tutur3u/platform/commit/a4a9a35beb8e40652ca8c5850c528de8f7fcf968))
* **mobile:** open scheduled reminders after cold launch ([49267f1](https://github.com/tutur3u/platform/commit/49267f1cb006d39b687d5cc728e11d97374f93dd))
* **mobile:** place Meet sheets above floating dock ([a860098](https://github.com/tutur3u/platform/commit/a8600987156e4b85f1270a719fe11ecee5f0685f))
* **mobile:** preserve header clearance and fill notification pages ([63322cc](https://github.com/tutur3u/platform/commit/63322cc2da7afc8dfef00defcb18b06d2897d0f8))
* **mobile:** preserve mail whitespace and thread expansion ([2552e79](https://github.com/tutur3u/platform/commit/2552e792acdb4568cd890c973888097212a1024f))
* **mobile:** preserve scroll access for clipped mail containers ([daef1a1](https://github.com/tutur3u/platform/commit/daef1a158a5355077e6a126641459245bdd1027c))
* **mobile:** publish iOS beta without ReplayKit extension ([#5480](https://github.com/tutur3u/platform/issues/5480)) ([f34e204](https://github.com/tutur3u/platform/commit/f34e204c157264e20b660bb4b2dc9a78b0efdbdd))
* **mobile:** refine Mail feedback and cached inbox states ([91187bc](https://github.com/tutur3u/platform/commit/91187bc88b93ebee7ff61bbe11d11dd963bb7386)) ([#5460](https://github.com/tutur3u/platform/issues/5460)) ([05ed1cb](https://github.com/tutur3u/platform/commit/05ed1cbe95c81524ee0828b7f9c3e6817da2f55f))
* **mobile:** refine Mail reader actions and thread layout ([6143235](https://github.com/tutur3u/platform/commit/6143235fa04b6c68e686009a221477db4bf6c0d8)) ([#5494](https://github.com/tutur3u/platform/issues/5494)) ([fb75d69](https://github.com/tutur3u/platform/commit/fb75d6995cdb35c23a3c6672300d0e5b03f1692c))
* **mobile:** remove redundant dashboard entrance delays ([f6d67ee](https://github.com/tutur3u/platform/commit/f6d67ee321e672d5c9e99eb7e5c7045695e80a4a))
* **mobile:** resolve Meet analyzer and format issues ([6411d51](https://github.com/tutur3u/platform/commit/6411d51628a10ae934dfa5db6351e81461ae613d))
* **mobile:** restore Meet media and call exit controls ([8b9d27a](https://github.com/tutur3u/platform/commit/8b9d27a2d1de5caa4872506798bb8661bf186502)) ([#5497](https://github.com/tutur3u/platform/issues/5497)) ([f44bf94](https://github.com/tutur3u/platform/commit/f44bf945ccd08e91d7b0b93c1d2f0b18b3d8228c))
* **mobile:** retain session through refresh transport errors ([a12bc82](https://github.com/tutur3u/platform/commit/a12bc827d2f990fe301d9cd1854d688c0e1f242c)) ([#5482](https://github.com/tutur3u/platform/issues/5482)) ([f87108b](https://github.com/tutur3u/platform/commit/f87108bb662f0dc46184fca950735a730a5785f6))
* **mobile:** retry saved Mira messages idempotently ([4ad0fd9](https://github.com/tutur3u/platform/commit/4ad0fd9ed98d90d4ad7a9d347c912011de825a42))
* **mobile:** retry saved Mira messages without duplication ([#5476](https://github.com/tutur3u/platform/issues/5476)) ([e8ee430](https://github.com/tutur3u/platform/commit/e8ee430b886c9738cd0a688af9ef211216e5c934))
* **mobile:** satisfy responsive layout analysis ([cc1bb28](https://github.com/tutur3u/platform/commit/cc1bb2844d46c519075411ae9fb2ca633e2221fa))
* **mobile:** ship iOS beta without ReplayKit extension ([d376262](https://github.com/tutur3u/platform/commit/d376262234f0dfb074c552a57417edeb88cd675c))
* **mobile:** show beta changes for every patch version ([6f2ba67](https://github.com/tutur3u/platform/commit/6f2ba6736c4385f1c4f01dbaa55b01ecfc64a195)) ([#5488](https://github.com/tutur3u/platform/issues/5488)) ([94f9896](https://github.com/tutur3u/platform/commit/94f98963c11fdcb58ef1a5e00973e852037c2f6c))
* **mobile:** stabilize root chrome and align content widths ([e1c5bcf](https://github.com/tutur3u/platform/commit/e1c5bcf680fee701e7cc75b453150028398eafd5)) ([#5514](https://github.com/tutur3u/platform/issues/5514)) ([21b7cd6](https://github.com/tutur3u/platform/commit/21b7cd6761affadc8c5604f4d7c5a710cdb7a6de))
* **mobile:** streamline chat navigation and content clearance ([425f193](https://github.com/tutur3u/platform/commit/425f193fcd2fb09d89169926a5b6dd1d1ce85874)) ([#5513](https://github.com/tutur3u/platform/issues/5513)) ([22fd621](https://github.com/tutur3u/platform/commit/22fd6219da49a6b69e1e62342e5c00f179dbfc2d))
* **mobile:** surface Meet connection failures ([67dd190](https://github.com/tutur3u/platform/commit/67dd19055914ea233955ee4803ab1d992bd0d9f8))
* **mobile:** upload Assistant recordings with MP4 audio MIME ([3e44e5f](https://github.com/tutur3u/platform/commit/3e44e5f42cae97df03899a96c01d27cc55509b4a)) ([#5495](https://github.com/tutur3u/platform/issues/5495)) ([dca10e8](https://github.com/tutur3u/platform/commit/dca10e8ae937032724d0c805dbf434464abfe73d))
* **mobile:** validate negotiated track metadata ([e6cf05f](https://github.com/tutur3u/platform/commit/e6cf05f62ea3fa5cd8cb747cf75f25d90f05a057))

## [0.11.0](https://github.com/tutur3u/platform/compare/mobile-v0.10.1...mobile-v0.11.0) (2026-09-23)


### Features

* **infrastructure:** add web and mobile account recovery ([5e42191](https://github.com/tutur3u/platform/commit/5e42191a675b8edee62a62c58ae656e3a05d243f))
* **infrastructure:** add web and mobile internal account recovery ([#5440](https://github.com/tutur3u/platform/issues/5440)) ([0694318](https://github.com/tutur3u/platform/commit/06943180c538f9f294586555d5d776c2cf1ea69e))
* **mobile:** add persistent mail message appearance controls ([5fbc5a0](https://github.com/tutur3u/platform/commit/5fbc5a0eeec345a9c8ab5f30609d8b295ccd29f6))
* **mobile:** add persistent Mail message appearance controls ([#5430](https://github.com/tutur3u/platform/issues/5430)) ([596acd9](https://github.com/tutur3u/platform/commit/596acd9b218c4e24cc981596c77e1d2499f70ec8))
* **mobile:** add private profile activity and workspace sharing ([38b5d1b](https://github.com/tutur3u/platform/commit/38b5d1bec3a0296fbbcaf128c2c4f3bdd685b108))
* **mobile:** add private Profile activity and workspace sharing ([#5429](https://github.com/tutur3u/platform/issues/5429)) ([4285508](https://github.com/tutur3u/platform/commit/4285508854d8f602656b86551c0940ec67ef29c0))


### Bug Fixes

* **mobile:** adapt calendar defaults and agenda layout ([44611ee](https://github.com/tutur3u/platform/commit/44611eeb6b8e0249a39c3d03c591d4fb75c7c342)) ([#5426](https://github.com/tutur3u/platform/issues/5426)) ([d4ed218](https://github.com/tutur3u/platform/commit/d4ed2181c1b9ec222c29e667360d15865b8abe8b))
* **mobile:** avoid duplicate profile activity announcements ([b8102fe](https://github.com/tutur3u/platform/commit/b8102feb8362afcea54629c4ad1900f3ef78ec3e))
* **mobile:** blend Mail message surfaces into app background ([2558e8d](https://github.com/tutur3u/platform/commit/2558e8d93e6d4586f46f9f580b619008dbfc8a5b))
* **mobile:** cancel hidden capture and guard shared calendar cache ([d3daf7a](https://github.com/tutur3u/platform/commit/d3daf7a5a5db986421dc59bbbb11a3ea4ed7c306))
* **mobile:** clean up failed native microphone starts ([44fb0f9](https://github.com/tutur3u/platform/commit/44fb0f9237c9197060101a297e67200aab39d9f1))
* **mobile:** fit short calendar events and large text ([fae8055](https://github.com/tutur3u/platform/commit/fae8055c6391ad8bbe8b92ad0aad3e73ba556b8f))
* **mobile:** float navigation over full-height content ([#5425](https://github.com/tutur3u/platform/issues/5425)) ([7c94df9](https://github.com/tutur3u/platform/commit/7c94df9d55a460b1636a8f1fac09ee3a53bfb2d3))
* **mobile:** handle concurrent mail actions and accessible message menus ([5fdb562](https://github.com/tutur3u/platform/commit/5fdb5629e8df901edda046bb45c61eeca9c05189))
* **mobile:** harden live recovery and credit sheet edge cases ([14f7a18](https://github.com/tutur3u/platform/commit/14f7a185f4236fd43d9c31a0d827eb40466dd7ed))
* **mobile:** integrate dock actions and improve Mail navigation, caching, and swipes ([#5433](https://github.com/tutur3u/platform/issues/5433)) ([b9eef65](https://github.com/tutur3u/platform/commit/b9eef65e183dab4d5bec8ae8162bf438982cd21f))
* **mobile:** integrate dock actions and streamline Mail navigation and swipes ([e2fb55a](https://github.com/tutur3u/platform/commit/e2fb55a8d234da025569900b9ddd4fe32517dd8b))
* **mobile:** integrate floating navigation and primary actions ([#5424](https://github.com/tutur3u/platform/issues/5424)) ([afbbe68](https://github.com/tutur3u/platform/commit/afbbe68a36cf04ec244b07a4f1524f600ff7bc70))
* **mobile:** localize Live recovery messages ([7066c3a](https://github.com/tutur3u/platform/commit/7066c3a4842ef265964702d9ce0646ca08339df7))
* **mobile:** morph navigation items and island geometry together ([215458c](https://github.com/tutur3u/platform/commit/215458ccbf97fab055ceaa5bd4d985946fec9206)) ([#5427](https://github.com/tutur3u/platform/issues/5427)) ([949c417](https://github.com/tutur3u/platform/commit/949c417242466b8365e5906f82cdef46ed00aa5c))
* **mobile:** preserve app origins and refine navigation and audio input ([#5420](https://github.com/tutur3u/platform/issues/5420)) ([71b04c0](https://github.com/tutur3u/platform/commit/71b04c04c7c1b773100c723f95d8fe440b83d6b1))
* **mobile:** preserve calendar preferences per workspace ([9be2024](https://github.com/tutur3u/platform/commit/9be202452f150a8de2410dfa2a4f973811221410))
* **mobile:** preserve live drafts and refresh saved conversations ([444b1fc](https://github.com/tutur3u/platform/commit/444b1fc92fee85a49bd377c1a47824decb0af531))
* **mobile:** preserve mailbox access and archive header actions ([a525937](https://github.com/tutur3u/platform/commit/a525937baea07d78fd55a376c82fe4815dabd980))
* **mobile:** read calendar viewport before provider creation ([e665be0](https://github.com/tutur3u/platform/commit/e665be0635414fd1c64440a5ac8af087f4518c7c))
* **mobile:** reconcile recovery with compact Mail release ([dfbaeb1](https://github.com/tutur3u/platform/commit/dfbaeb12d478f0d3031c0dd323bd4b98535ede91))
* **mobile:** recover Live history and invalid microphone input ([2bcb6c2](https://github.com/tutur3u/platform/commit/2bcb6c23a2baa5659930183a10aa42f5790515c0))
* **mobile:** recover task verification and Assistant sessions ([2836363](https://github.com/tutur3u/platform/commit/283636386088a2fdf3994bd605b5c5b4c233bd4c)) ([#5434](https://github.com/tutur3u/platform/issues/5434)) ([c9f1f6e](https://github.com/tutur3u/platform/commit/c9f1f6e990b604e5ce119a80b303863a045b6ad3))
* **mobile:** repair Live transport and Pro workspace access ([#5428](https://github.com/tutur3u/platform/issues/5428)) ([ce02703](https://github.com/tutur3u/platform/commit/ce02703ac5073af869f276cffd95087817bb3267))
* **mobile:** resolve standalone recorder dependency in CI ([4ce1973](https://github.com/tutur3u/platform/commit/4ce1973d68e066f5fae77076914ac1e51de686a9))
* **mobile:** restore Live turns using AI conversation identity ([a93f4b8](https://github.com/tutur3u/platform/commit/a93f4b8d8b521f6018a57bab2c74be7ec917c95c))
* **mobile:** resume legacy Assistant conversations securely ([b74ae34](https://github.com/tutur3u/platform/commit/b74ae34893e0b48f9bd99edaf8a328a208cdf174))
* **mobile:** unify dock actions, mail reader and meeting navigation ([0567ed7](https://github.com/tutur3u/platform/commit/0567ed7d391d9ae7fa8a43b3270b0cd342a34f7e))
* **mobile:** unify dock actions, Mail reader and meeting navigation ([#5438](https://github.com/tutur3u/platform/issues/5438)) ([3d2aeaf](https://github.com/tutur3u/platform/commit/3d2aeaf23621e49613d9595c5bce4d1141fe7bf5))
* **mobile:** update Gemini Live transport and workspace access ([8ea5889](https://github.com/tutur3u/platform/commit/8ea5889cfe55bf7e814f22eea4f4cc1fe41ca606))

## [0.10.1](https://github.com/tutur3u/platform/compare/mobile-v0.10.0...mobile-v0.10.1) (2026-09-20)


### Bug Fixes

* **mobile:** adapt Assistant starters to tablet layouts ([0c9e17c](https://github.com/tutur3u/platform/commit/0c9e17c881f3d8bfc8ab2e7bb42efcb1fd2f376a))
* **mobile:** unify navigation, loading, and fullscreen flows ([5eb1747](https://github.com/tutur3u/platform/commit/5eb17472531da24c288ad6d2df302b1e687212df))
* **mobile:** unify navigation, Nova loading, and fullscreen flows ([#5414](https://github.com/tutur3u/platform/issues/5414)) ([58da311](https://github.com/tutur3u/platform/commit/58da311b1ed0b11d1deb128e3a2e9b3a926f2b06))

## [0.10.0](https://github.com/tutur3u/platform/compare/mobile-v0.9.2...mobile-v0.10.0) (2026-09-20)


### Features

* **auth:** add trusted mobile authenticators and login approvals ([55e4d79](https://github.com/tutur3u/platform/commit/55e4d792bde2c543c3be8204a980fa99069527e4))
* **auth:** trusted mobile authenticators and desktop login approvals ([#5400](https://github.com/tutur3u/platform/issues/5400)) ([4e9e9d2](https://github.com/tutur3u/platform/commit/4e9e9d20fd6a65c07b9f83008ef5ccd7c4d60d7f))
* **desktop:** add secure beta distributions and download page ([b034081](https://github.com/tutur3u/platform/commit/b034081273ee5967924bc319c0c9f99b406148c1)) ([#5405](https://github.com/tutur3u/platform/issues/5405)) ([105af8a](https://github.com/tutur3u/platform/commit/105af8aa003a791034fe1a0719dc2663a4b83e56))
* **infrastructure:** authenticate native Calendar gateway ([e225ec7](https://github.com/tutur3u/platform/commit/e225ec73f3f5dd958bbe7dacab986271e877728e))
* **mobile:** add workspace Mail client ([6b1054b](https://github.com/tutur3u/platform/commit/6b1054bf37479570118ee70c5301ca452a5d03ee)) ([#5388](https://github.com/tutur3u/platform/issues/5388)) ([ebfed37](https://github.com/tutur3u/platform/commit/ebfed377ce643a48c470553b40bff6ca8def5fd8))
* **mobile:** compact Mail and render isolated HTML ([7d0e4f8](https://github.com/tutur3u/platform/commit/7d0e4f8cf800ad8fd588002279b3d5ecdb6d40b6)) ([#5396](https://github.com/tutur3u/platform/issues/5396)) ([9545e89](https://github.com/tutur3u/platform/commit/9545e89822ee4f71563a2be9ee491ff3c9d484b6))
* **mobile:** simplify navigation and keep cached screens responsive ([583bec6](https://github.com/tutur3u/platform/commit/583bec69a1a5fcce050a0950bedfd5919a9807ee))


### Bug Fixes

* **auth:** preserve enrollment recovery across dismissible setup ([521f8e8](https://github.com/tutur3u/platform/commit/521f8e8316283322b3af1577ff0d0a5bcd90b200))
* **auth:** repair mobile authenticator enrollment and setup sheet ([153321f](https://github.com/tutur3u/platform/commit/153321f1e9601126133c181f430fdb7bbedff9d4)) ([#5407](https://github.com/tutur3u/platform/issues/5407)) ([d0a95fd](https://github.com/tutur3u/platform/commit/d0a95fdd2a3768e5d185bfc135121b6c51834a6d))
* **calendar:** restore background sync and mobile refresh ([#5402](https://github.com/tutur3u/platform/issues/5402)) ([98a6a29](https://github.com/tutur3u/platform/commit/98a6a2963f26eab0bf785829a76f04f892c05efd))
* **calendar:** restore server sync and mobile freshness ([26c6f51](https://github.com/tutur3u/platform/commit/26c6f5114ac1605071b077d63550a73082c38ec4))
* **ci:** enable and verify signed mobile beta releases ([#5387](https://github.com/tutur3u/platform/issues/5387)) ([3b34df6](https://github.com/tutur3u/platform/commit/3b34df69b5565924180b18b3a41152a8bb80366e))
* **ci:** verify signed mobile beta releases ([f6985a6](https://github.com/tutur3u/platform/commit/f6985a6fb462c40629c7a719ef135f7aecd8c476))
* **mobile:** accommodate larger navigation labels ([d49e0b0](https://github.com/tutur3u/platform/commit/d49e0b00543be6d31ca95d7171cb3f3bb42f645c))
* **mobile:** adapt shell and boards to tablet windows ([1990cb6](https://github.com/tutur3u/platform/commit/1990cb625bfc318a47af2343ad364b40fb4ebcc5)) ([#5395](https://github.com/tutur3u/platform/issues/5395)) ([9be8a79](https://github.com/tutur3u/platform/commit/9be8a79eae646c08dc596a65839a258c08739546))
* **mobile:** allow closing authenticator status loading ([a9ca879](https://github.com/tutur3u/platform/commit/a9ca8791e8298af0e0e2c176db1dbfde1d870113))
* **mobile:** avoid duplicate Chat composer dock clearance ([d3ffd80](https://github.com/tutur3u/platform/commit/d3ffd8021092b525f5216e98e9f30ffaa2abe2b6))
* **mobile:** bound cache keys by encoded size ([1b7dcea](https://github.com/tutur3u/platform/commit/1b7dcea320401cb5288df27a9a127ea3320562d8))
* **mobile:** clear deleted Mail filters after metadata refresh ([b2497b5](https://github.com/tutur3u/platform/commit/b2497b5f71eb2852df8cddbdc4b186b4405ad340))
* **mobile:** clear inbox actions for nested Mail routes ([701bf18](https://github.com/tutur3u/platform/commit/701bf182c4245fa59f68ecdfa38abc9b431d1a14))
* **mobile:** coalesce scoped cache refreshes safely ([09f1ee1](https://github.com/tutur3u/platform/commit/09f1ee19d9fb8a8811a8c21dfbd65d4904613249)) ([#5389](https://github.com/tutur3u/platform/issues/5389)) ([fdb8077](https://github.com/tutur3u/platform/commit/fdb80779737a45ebbd67dbbcc2ea6ba35c8ada75))
* **mobile:** correct nested Mail spacing and search controls ([e444e01](https://github.com/tutur3u/platform/commit/e444e01d586920a9260e31b7c075507341710e40))
* **mobile:** expand Chat panes on tablet screens ([28a237d](https://github.com/tutur3u/platform/commit/28a237dd37f9093e79ab241c0bb962b4f3ee0c28))
* **mobile:** fill tablet work surfaces without empty rows ([57468b0](https://github.com/tutur3u/platform/commit/57468b03143048e9e66cd9c11473d4ad86a67442))
* **mobile:** finish tablet layouts and Meet caching ([#5397](https://github.com/tutur3u/platform/issues/5397)) ([1f37e59](https://github.com/tutur3u/platform/commit/1f37e59f86d8cf6258bdacbf81cec5a39dd45256))
* **mobile:** fit full calendar years across tablet layouts ([80f06af](https://github.com/tutur3u/platform/commit/80f06afe1bbb271fbec1937388bd51afbd10becd))
* **mobile:** guard chat restoration and malformed inbox caches ([14f18a8](https://github.com/tutur3u/platform/commit/14f18a8d2f39ade05f33dd5a6b1eb601d1816099))
* **mobile:** keep authenticator enrollment in its sheet ([5eb5315](https://github.com/tutur3u/platform/commit/5eb5315f109ca0c678490a102504d001c6315ff0))
* **mobile:** keep Chat usable in short landscape windows ([1b351de](https://github.com/tutur3u/platform/commit/1b351de31b18b727a0a834c3eb25101df095231b))
* **mobile:** keep Meet editor reachable in landscape ([d6f1c0d](https://github.com/tutur3u/platform/commit/d6f1c0daa96b2aa24e7381302b5e098c472ec540))
* **mobile:** move conversation navigation into Chat toolbar ([77bef52](https://github.com/tutur3u/platform/commit/77bef52a435aacdc1dea0bbcd6232d4493095656))
* **mobile:** preserve cache expiry during invalidation ([7c04655](https://github.com/tutur3u/platform/commit/7c04655d71cda2dd34ccb07c24b44c4d5c84c1e0))
* **mobile:** preserve Mail drafts during back and save ([18796f8](https://github.com/tutur3u/platform/commit/18796f89b1082354a3576cd673d8135b00d8ffa1))
* **mobile:** preserve network results across cache failures ([f883098](https://github.com/tutur3u/platform/commit/f883098367837774704750b097bdd54a2296f828))
* **mobile:** preserve scoped mail cache and background metadata ([40d64f6](https://github.com/tutur3u/platform/commit/40d64f61c7940834929b845c6a00e58e65303197))
* **mobile:** reject invalidated cache responses ([cc19910](https://github.com/tutur3u/platform/commit/cc19910349e02c7b968b279e0a1960123f09b754))
* **mobile:** restore colorful design and repair app access ([a5b6ea3](https://github.com/tutur3u/platform/commit/a5b6ea3012e6f9d6a45de51c9a5c792747d6b9ff))
* **mobile:** restore v0.9.2 design, responsive loading, and app access ([#5390](https://github.com/tutur3u/platform/issues/5390)) ([30987f9](https://github.com/tutur3u/platform/commit/30987f9c1706445bafc24186129f4646d0363009))
* **mobile:** scope cache mutation generations ([761f3a3](https://github.com/tutur3u/platform/commit/761f3a3c3a99b6e9ec8bd90ba9c49a1377254146))
* **mobile:** scroll Chat filters with conversation lists ([741ab8f](https://github.com/tutur3u/platform/commit/741ab8fc23a86da151091f6e7f384e88aa6f5fb6))
* **mobile:** use compact navigation in short windows ([82d0422](https://github.com/tutur3u/platform/commit/82d0422c8fda0c1c2a14ed6414c1a145dd4b1c5c))


### Performance Improvements

* **mobile:** cache Meet pages and adapt meeting layouts ([f7483c1](https://github.com/tutur3u/platform/commit/f7483c162f67dbb47cac533c320e108e3bf17e07))
* **mobile:** restore Mail and Assistant instantly with scoped caches ([#5399](https://github.com/tutur3u/platform/issues/5399)) ([97d5937](https://github.com/tutur3u/platform/commit/97d593755e1e7c157604d9ce754e98b0d1ea5d71))
* **mobile:** restore scoped Mail and Assistant views instantly ([fee6302](https://github.com/tutur3u/platform/commit/fee63025820699c72af55f9b7b65b5a5cc17abee))

## [0.9.2](https://github.com/tutur3u/platform/compare/mobile-v0.9.1...mobile-v0.9.2) (2026-09-03)


### Bug Fixes

* **mobile:** remove redundant bridge imports ([3319a48](https://github.com/tutur3u/platform/commit/3319a485f112e946efb3ed31b44226955815f44c))

## [0.9.1](https://github.com/tutur3u/platform/compare/mobile-v0.9.0...mobile-v0.9.1) (2026-08-25)


### Bug Fixes

* **mobile:** preserve analyzer compatibility ([946f705](https://github.com/tutur3u/platform/commit/946f705bbe33c61a1835edc2bd23b9f249a1c420))
* **mobile:** refresh Firebase iOS pods ([d30bc35](https://github.com/tutur3u/platform/commit/d30bc352fb9fadc7c83f0b2ef89a4f878e1e5a0e))

## [0.9.0](https://github.com/tutur3u/platform/compare/mobile-v0.8.1...mobile-v0.9.0) (2026-08-04)


### Features

* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))

## [0.8.1](https://github.com/tutur3u/platform/compare/mobile-v0.8.0...mobile-v0.8.1) (2026-07-21)


### Bug Fixes

* **quality:** address AI findings ([c24f827](https://github.com/tutur3u/platform/commit/c24f8278ac03c927683c5a3af193ce77c736f3ec))

## [0.8.0](https://github.com/tutur3u/platform/compare/mobile-v0.7.0...mobile-v0.8.0) (2026-07-18)


### Features

* **inventory:** add sales periods and mobile commerce ([fa442c9](https://github.com/tutur3u/platform/commit/fa442c9eb06321d91f76b33ee111907d10c85eb7))
* **inventory:** unify commerce currency and sales periods ([2042bc5](https://github.com/tutur3u/platform/commit/2042bc5a7d4f347d1f610432f379da42f3aa2b8b))
* **mobile:** revamp app lock experience ([22b300b](https://github.com/tutur3u/platform/commit/22b300b73a94fdf44cd334dcdbfd0760ab46ed71))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))


### Bug Fixes

* **inventory:** improve sales period workflows ([2a7cad5](https://github.com/tutur3u/platform/commit/2a7cad54b5af7bdcdcaf4233508eed91d5cd6832))
* **mobile:** compact navigation and biometric lock ([5fa1589](https://github.com/tutur3u/platform/commit/5fa15898dd6b6798154abacab636c035b2f7e13c))
* **mobile:** harden finance and inventory experiences ([0f1e7a0](https://github.com/tutur3u/platform/commit/0f1e7a061aa46ff7019dd3e1cae3877a7e4d863a))
* **mobile:** refine compact navigation and page hierarchy ([e422c19](https://github.com/tutur3u/platform/commit/e422c19ded312575f63ab3560397c8fba8d73c77))
* **mobile:** require signed native release builds ([55cedc3](https://github.com/tutur3u/platform/commit/55cedc3ca8bc189030f8b0f514926fed472ffd12))
* **mobile:** restore tasks bearer access ([2aedf84](https://github.com/tutur3u/platform/commit/2aedf8439f6d989ebf9bb69f83f74f1b25e5b06e))
* **mobile:** route APIs to satellite owners ([2f2222f](https://github.com/tutur3u/platform/commit/2f2222f342c484d062cecc3a481bf5995a8c2217))
* **mobile:** simplify dense navigation and calendar events ([dca28dd](https://github.com/tutur3u/platform/commit/dca28dd2c3b7f7ae623b9355a09178eb76d82184))
* **mobile:** stabilize navigation and QR login ([4e208a1](https://github.com/tutur3u/platform/commit/4e208a1dabbd69d5c641a19a12e47d7691c26a9c))
* **mobile:** stabilize workspace selection and inventory cache ([229af0d](https://github.com/tutur3u/platform/commit/229af0d85f7bfe72c25c4fddda34bdde27d5e2e1))

## [0.7.0](https://github.com/tutur3u/platform/compare/mobile-v0.6.1...mobile-v0.7.0) (2026-06-17)


### Features

* **mobile:** add finance wallet checkpoints ([b7a1fef](https://github.com/tutur3u/platform/commit/b7a1fefd12ac136b76ac66254af1a22176f23ef1))


### Bug Fixes

* **mobile:** block app during lock state load ([0a62d57](https://github.com/tutur3u/platform/commit/0a62d578c71f6b8922145faef3fcc61aa7dfa4d0))
* **mobile:** block startup before version check ([22485a2](https://github.com/tutur3u/platform/commit/22485a2be78d1424e75d041adb528893247835d0))
* **mobile:** bound task timeline date span ([df2775e](https://github.com/tutur3u/platform/commit/df2775e20e66dcff6238c118739b7baa52b0b647))
* **mobile:** bound time tracker history dates ([0d2f97e](https://github.com/tutur3u/platform/commit/0d2f97e831a192755cc8cec189af609ef93940d2))
* **mobile:** defer task video playback ([4bcee60](https://github.com/tutur3u/platform/commit/4bcee6013e885fbfbe6f1a0144e6bebf74cf36c4))
* **mobile:** encrypt offline cache boxes ([62a2e63](https://github.com/tutur3u/platform/commit/62a2e63cb561e9351e6014a33779527bd9cfbefc))
* **mobile:** harden task description converters ([01018f2](https://github.com/tutur3u/platform/commit/01018f2c3cbf980fddbe89da1942d9ae800bc8e2))
* **mobile:** ignore forged notification payloads ([056f900](https://github.com/tutur3u/platform/commit/056f9006636122c6a5f5ed275ba89bf13181b3c1))
* **mobile:** lazy build portfolio items ([7e08dc8](https://github.com/tutur3u/platform/commit/7e08dc862b0e5c3b97124e49efe683476fb08478))
* **mobile:** preserve malformed task descriptions ([0702c3d](https://github.com/tutur3u/platform/commit/0702c3daa472df793fd944556d309d1b4f79cabd))
* **mobile:** prevent app-link opt-out loops ([6feffd6](https://github.com/tutur3u/platform/commit/6feffd638eab096003e54a994f4224b286df5fcb))
* **mobile:** refresh shell action callbacks ([eeb38e3](https://github.com/tutur3u/platform/commit/eeb38e39a91fca0904d447b7b37781302571a611))
* **mobile:** require native Apple sign-in ([fdef606](https://github.com/tutur3u/platform/commit/fdef606bef37f031cd10ff29464e795760ee0e04))
* **mobile:** scope calendar cache by workspace ([54ec332](https://github.com/tutur3u/platform/commit/54ec332957d75b258fc422ccd5e27920bbb4e44b))
* **mobile:** tolerate malformed task tables ([26a4cfe](https://github.com/tutur3u/platform/commit/26a4cfe15584785c1513a2d62dc0eee677291a84))
* **mobile:** validate request deep links ([c6c201c](https://github.com/tutur3u/platform/commit/c6c201c80eb6ca57c86ebfc4a7b17a5799a26b2a))
* **tasks:** secure realtime task channels ([6d98d16](https://github.com/tutur3u/platform/commit/6d98d16baa9ecf68bdd47ce3ce6dc1ff2e2bca84))
* **tasks:** secure realtime task channels ([03dc6d6](https://github.com/tutur3u/platform/commit/03dc6d66666d1d3ae422f91cb94285367a8c1071))

## [0.6.1](https://github.com/tutur3u/platform/compare/mobile-v0.6.0...mobile-v0.6.1) (2026-06-13)


### Bug Fixes

* **ci:** restore mobile and auth callback jobs ([65f0b0a](https://github.com/tutur3u/platform/commit/65f0b0af0d054129198b894155d0feefb4a941b0))
* **mobile:** restore windows ci build ([cb4ae6d](https://github.com/tutur3u/platform/commit/cb4ae6ddd02f4a6d41cd73d7c490500a1c1757ab))
* **tasks:** sync task realtime with broadcasts ([8c56154](https://github.com/tutur3u/platform/commit/8c56154e517797dcac0ec0971d8a474b50292706))

## [0.6.0](https://github.com/tutur3u/platform/compare/mobile-v0.5.2...mobile-v0.6.0) (2026-06-10)


### Features

* **mobile:** add deployment vault CI flow ([b1d21eb](https://github.com/tutur3u/platform/commit/b1d21eb1e30d74b412e4687b095004c21cf03dd1))

## [0.5.2](https://github.com/tutur3u/platform/compare/mobile-v0.5.1...mobile-v0.5.2) (2026-06-10)


### Bug Fixes

* **mobile:** pin connectivity for Apple CI ([6ff00bb](https://github.com/tutur3u/platform/commit/6ff00bbeacf59ef8f26eb1910d4650bea8ba12e9))
* **mobile:** pin device info for Apple CI ([5219ee1](https://github.com/tutur3u/platform/commit/5219ee18aedb9feeabb955676443d9a4b80ede86))

## [0.5.1](https://github.com/tutur3u/platform/compare/mobile-v0.5.0...mobile-v0.5.1) (2026-06-03)


### Bug Fixes

* **mobile:** fail closed on logout errors ([27a89d8](https://github.com/tutur3u/platform/commit/27a89d89ad6ab0fffbfc0faaa815bb01ba037d42))
* **mobile:** keep workspace secrets off disk ([bf0a7e4](https://github.com/tutur3u/platform/commit/bf0a7e4867b623749781dac854937228316091eb))
* **mobile:** neutralize crm csv formulas ([5290f81](https://github.com/tutur3u/platform/commit/5290f81efb0a2c495ebcce98056f9264e0543695))
* **mobile:** redact auth account secrets ([eb1c03c](https://github.com/tutur3u/platform/commit/eb1c03c1b8405f410e7770873ac5c271789ec936))
