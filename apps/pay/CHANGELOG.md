# Changelog

## [0.18.0](https://github.com/tutur3u/platform/compare/pay-v0.17.0...pay-v0.18.0) (2026-09-25)


### Features

* **auth:** enforce required account MFA lifecycle ([e08f27d](https://github.com/tutur3u/platform/commit/e08f27dbc082f7d9c951bb0792357638f3dcfb0a)) ([#5448](https://github.com/tutur3u/platform/issues/5448)) ([d7a5ed4](https://github.com/tutur3u/platform/commit/d7a5ed453963e619bd1dc3bd8c8a18c5e027317c))
* **parley:** add private multiplayer training and shared AI Hub billing ([#5505](https://github.com/tutur3u/platform/issues/5505)) ([038e05c](https://github.com/tutur3u/platform/commit/038e05c69a0e4a080f62d6441ae4dd2b15721dba))
* **parley:** share Meet runtime and integrate private training with AI Hub billing ([66d40e2](https://github.com/tutur3u/platform/commit/66d40e23a8110bd43be652e1181205cf50e506ab))

## [0.17.0](https://github.com/tutur3u/platform/compare/pay-v0.16.0...pay-v0.17.0) (2026-09-20)


### Features

* **finance:** clarify category charts and add promotions management ([88f85ea](https://github.com/tutur3u/platform/commit/88f85eaadb722b42b99537be3c75fabb1715bf09)) ([#5384](https://github.com/tutur3u/platform/issues/5384)) ([b6fd666](https://github.com/tutur3u/platform/commit/b6fd666bccca6aa929166210fb1c6abdb91c1448))
* **lettin:** add Cloudflare worldbuilding satellite ([0c8cc22](https://github.com/tutur3u/platform/commit/0c8cc22168477440e326bdec08427daf9721d9bf)) ([#5351](https://github.com/tutur3u/platform/issues/5351)) ([2631103](https://github.com/tutur3u/platform/commit/263110318bb9bab6d26a1bdd539fc52a40b25bec))
* **pricing:** add full app comparison and evolving pitch deck ([c967e8d](https://github.com/tutur3u/platform/commit/c967e8d2db75fc65159c7dcb31ed1b27673ae924))
* **pricing:** compare every app and add an evolving pitch deck ([#5335](https://github.com/tutur3u/platform/issues/5335)) ([962ed75](https://github.com/tutur3u/platform/commit/962ed75e086eb85a06a878720a5d30b747e7ba82))


### Bug Fixes

* **billing:** confirm paid changes through supported Polar updates ([eedbd48](https://github.com/tutur3u/platform/commit/eedbd48744e3ff7e52a852ed562ca041980c8251))
* **billing:** distinguish list rates from existing subscriber charges ([67006b6](https://github.com/tutur3u/platform/commit/67006b6defffb8b1ae1f679189d9947f018cfe10))
* **billing:** fail closed on unknown usage and subscription capacity ([#5333](https://github.com/tutur3u/platform/issues/5333)) ([a308a89](https://github.com/tutur3u/platform/commit/a308a8996f17a81c76c8fb0d498a14d8dbf289c3))
* **billing:** ignore stale subscription projections ([eab1e90](https://github.com/tutur3u/platform/commit/eab1e909c291d5288648daa20c384f965b4c9632))
* **billing:** reconcile paid updates before refreshing billing ([c055216](https://github.com/tutur3u/platform/commit/c05521670c87c698c3efb054845c117a63284819))
* **billing:** reconcile plan seats through reviewed checkout ([6f8e23a](https://github.com/tutur3u/platform/commit/6f8e23ac194e69f9d7e4daac06f1981a63af3fe4))
* **billing:** reconcile seat changes with ordered provider snapshots ([b89ca76](https://github.com/tutur3u/platform/commit/b89ca76a6dac265f6c426289eadf707cad2d0226))
* **billing:** refresh pending subscription projections safely ([f571fff](https://github.com/tutur3u/platform/commit/f571fffcc3eaa4825932e714aab40a8c2d9d83f1))
* **billing:** reject unavailable provider budgets at request boundaries ([5fb8a9c](https://github.com/tutur3u/platform/commit/5fb8a9c5351488bca1fdf4d66b887ccece9665af))
* **billing:** reserve invited seats in plan transitions ([9c9bcd0](https://github.com/tutur3u/platform/commit/9c9bcd06c5eaf8fe788c9c97541a162c9f709624))
* **deps:** align React types and published consumer ranges ([3612cd8](https://github.com/tutur3u/platform/commit/3612cd81723fb5a6982152688227ed21bc4095fd))
* **deps:** preserve React peer compatibility and clarify audit ([777b9ed](https://github.com/tutur3u/platform/commit/777b9ed7f42095bb9361e6bed94d989310c222de))
* **finance:** complete invoice loading recovery ([5f4cd04](https://github.com/tutur3u/platform/commit/5f4cd049ab462e774d09c7060878bdedda164d12))
* **finance:** recover stalled invoice loading ([e943337](https://github.com/tutur3u/platform/commit/e94333766ddf942f9c44347d6f7fc982f4f828a8))
* **finance:** restrict promotion forwarding and clarify chart labels ([30d3f05](https://github.com/tutur3u/platform/commit/30d3f053df12360beab94cbdcb0a9fd3a84d38f7))
* **pay:** handle invoice history access failures safely ([2de8b48](https://github.com/tutur3u/platform/commit/2de8b48eac2524c6b04c3a63bd324c972eb23a35))
* **pay:** handle missing checkout references ([f1d00d8](https://github.com/tutur3u/platform/commit/f1d00d85d06fbd205eac96edefaf1ffe25752fac))
* **payment:** protect webhook ingress and restore order cron ([e059fc7](https://github.com/tutur3u/platform/commit/e059fc74f4eff9e938823b1bd02b42093adc632e))
* **payment:** restore catalog webhook delivery and guard publication ([3300a82](https://github.com/tutur3u/platform/commit/3300a8225cf3f9d083e223339d628fb0989e0f35)) ([#5342](https://github.com/tutur3u/platform/issues/5342)) ([b5f61ec](https://github.com/tutur3u/platform/commit/b5f61ec25617b09245c117e47081544edafa454a))
* **pay:** verify checkout receipts and use Polar invoice history ([1c36fca](https://github.com/tutur3u/platform/commit/1c36fca078635cb7674013169b5ef22f8c080e7e)) ([#5341](https://github.com/tutur3u/platform/issues/5341)) ([a7a7d15](https://github.com/tutur3u/platform/commit/a7a7d15dc9fa6c3c96a9d44d730134097afcd222))
* **pricing:** align localized amounts and plan change previews ([e0e7e3d](https://github.com/tutur3u/platform/commit/e0e7e3d0a07e43e298e9adae39a5a441b0945ab9))
* **pricing:** enforce checkout transitions and align catalog presentation ([acc1a0d](https://github.com/tutur3u/platform/commit/acc1a0d5430a156a5ca4729fa5ed1b95697e6292))
* **pricing:** reconcile live catalog displays and tier comparisons ([3aa65c2](https://github.com/tutur3u/platform/commit/3aa65c2221d0d099ff5bd50de0c90bb4237d1bbd))
* **ui:** repair checklist caret and status controls ([a6472ce](https://github.com/tutur3u/platform/commit/a6472ce49c557992966e31ed2e92e2d7cb65b573)) ([#5350](https://github.com/tutur3u/platform/issues/5350)) ([c534362](https://github.com/tutur3u/platform/commit/c534362b5a68965a13403056568f975852213f45))

## [0.16.0](https://github.com/tutur3u/platform/compare/pay-v0.15.2...pay-v0.16.0) (2026-09-07)


### Features

* **calendar:** add installable apps and bounded PWA caching ([f4b2a1c](https://github.com/tutur3u/platform/commit/f4b2a1cf7943783fddc45f537df73589f19594f6))
* **colab:** launch multiplayer prompt workshops on Cloudflare ([7a4a3f9](https://github.com/tutur3u/platform/commit/7a4a3f9b4a12a0d7439cdb296398a21c0cd8939f))


### Bug Fixes

* **calendar:** harden PWA lifecycle and cache retention ([14565c0](https://github.com/tutur3u/platform/commit/14565c0106e74b947e152fd8bb787de7f70bc54d))
* **calendar:** recover failed syncs and redesign calendar views ([7d22948](https://github.com/tutur3u/platform/commit/7d22948095a29d236f698d42dde362fc38311dd0))
* **calendar:** recover failed syncs and redesign calendar views ([#5230](https://github.com/tutur3u/platform/issues/5230)) ([e52605d](https://github.com/tutur3u/platform/commit/e52605d671f921b1564746afcdedf2478deee78e))
* **tasks:** preserve task and calendar drafts until saves finish ([34b4902](https://github.com/tutur3u/platform/commit/34b4902b0382a3aa9e10249a0d83205c9a530878))
* **tasks:** recover partial saves and display actionable errors ([c4887c9](https://github.com/tutur3u/platform/commit/c4887c98377fd8493f3e6ae4219763d8872e2a5b))

## [0.15.2](https://github.com/tutur3u/platform/compare/pay-v0.15.1...pay-v0.15.2) (2026-08-29)


### Performance Improvements

* **vercel:** serve every monorepo app from one function region ([4f0bf52](https://github.com/tutur3u/platform/commit/4f0bf52450899267b4ac9cd2bdecfcf07e3ea427))
* **vercel:** serve every monorepo app from one function region ([#5172](https://github.com/tutur3u/platform/issues/5172)) ([b09d4bd](https://github.com/tutur3u/platform/commit/b09d4bd520a7543d6b88140715d8cc0b5c461711))

## [0.15.1](https://github.com/tutur3u/platform/compare/pay-v0.15.0...pay-v0.15.1) (2026-08-21)


### Bug Fixes

* **ci:** complete dependency and Rust validation ([61e4c12](https://github.com/tutur3u/platform/commit/61e4c12ec3c90707dde63ed7469854519b3688c8))

## [0.15.0](https://github.com/tutur3u/platform/compare/pay-v0.14.0...pay-v0.15.0) (2026-08-20)


### Features

* **tasks:** explain sorted drag ordering ([49350ad](https://github.com/tutur3u/platform/commit/49350ad5160de432eca0d42e582f9e54816fae11))

## [0.14.0](https://github.com/tutur3u/platform/compare/pay-v0.13.2...pay-v0.14.0) (2026-08-14)


### Features

* **workspaces:** revamp invitation access flow ([7ea94af](https://github.com/tutur3u/platform/commit/7ea94afc2c5e14af1c83d1478ad9c006268b13c0))
* **workspaces:** support multi-role invitations ([f6f78ba](https://github.com/tutur3u/platform/commit/f6f78bac6c2120fd70c09e85c075c4206be4f897))


### Bug Fixes

* **satellites:** preserve workspace actors ([e268b8d](https://github.com/tutur3u/platform/commit/e268b8d587f3d4d3025a16c3e001ff5dbb16200b))
* **workspaces:** manage roles for pending invites ([2466f6c](https://github.com/tutur3u/platform/commit/2466f6cbbd447207d87eb0e0d78b3c713b02b739))

## [0.13.2](https://github.com/tutur3u/platform/compare/pay-v0.13.1...pay-v0.13.2) (2026-08-11)


### Bug Fixes

* **i18n:** preserve prerender locale fallback ([3a09b07](https://github.com/tutur3u/platform/commit/3a09b070abda729649f269310a70db78f9b3a1cc))

## [0.13.1](https://github.com/tutur3u/platform/compare/pay-v0.13.0...pay-v0.13.1) (2026-08-11)


### Bug Fixes

* **i18n:** keep locale roots prerenderable ([d0eb02c](https://github.com/tutur3u/platform/commit/d0eb02c452c4ad125907f4c67b24797782caf907))
* **i18n:** keep request locale build-safe ([cc575a2](https://github.com/tutur3u/platform/commit/cc575a2e951ef8fb46a4b8593d0dcfcbe03cd4e7))

## [0.13.0](https://github.com/tutur3u/platform/compare/pay-v0.12.0...pay-v0.13.0) (2026-08-07)


### Features

* **platform:** expose the running build over HTTP for every app ([7b90d42](https://github.com/tutur3u/platform/commit/7b90d425a38048a1bf317b46f0da78225474f0e5))

## [0.12.0](https://github.com/tutur3u/platform/compare/pay-v0.11.0...pay-v0.12.0) (2026-08-06)


### Features

* **chat:** add external parity reconciliation ([#5086](https://github.com/tutur3u/platform/issues/5086)) ([5ef796f](https://github.com/tutur3u/platform/commit/5ef796f7812ec6a9f9a62193ba21633cd2503001))

## [0.11.0](https://github.com/tutur3u/platform/compare/pay-v0.10.0...pay-v0.11.0) (2026-08-04)


### Features

* **onboarding:** connect product guidance across apps ([68cf626](https://github.com/tutur3u/platform/commit/68cf626c9650e5044b6c123f9423a6cebf1bba9a))

## [0.10.0](https://github.com/tutur3u/platform/compare/pay-v0.9.0...pay-v0.10.0) (2026-07-28)


### Features

* **apps:** add resilient error recovery shells ([f0f514d](https://github.com/tutur3u/platform/commit/f0f514d2b1712ea76c6845801fa2803369418a63))
* **git:** add fast repository satellite ([51982ae](https://github.com/tutur3u/platform/commit/51982ae8618bb7463e30c97f6e731551ec673660))


### Bug Fixes

* **ai:** restore workspace settings and translations ([45b3c4f](https://github.com/tutur3u/platform/commit/45b3c4faeb86ef669d28f530d8e5b614b02d2c0a))

## [0.9.0](https://github.com/tutur3u/platform/compare/pay-v0.8.0...pay-v0.9.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **pay:** restore AI credit wallet loading ([9b3aa65](https://github.com/tutur3u/platform/commit/9b3aa65759c50cff972a72bf1cf09917d4992e19))
* **pay:** serve AI credits from Pay ([cb9a9b5](https://github.com/tutur3u/platform/commit/cb9a9b5d112c17562dea73fd259ea8a03ac08563))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.8.0](https://github.com/tutur3u/platform/compare/pay-v0.7.1...pay-v0.8.0) (2026-07-27)


### Features

* **ai:** add workspace AI Studio and legal coverage ([6de4e39](https://github.com/tutur3u/platform/commit/6de4e395cc5568f4943604ac667e3cebf324be13))
* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))
* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))
* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **pay:** restore AI credit wallet loading ([9b3aa65](https://github.com/tutur3u/platform/commit/9b3aa65759c50cff972a72bf1cf09917d4992e19))
* **pay:** serve AI credits from Pay ([cb9a9b5](https://github.com/tutur3u/platform/commit/cb9a9b5d112c17562dea73fd259ea8a03ac08563))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))
* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.7.1](https://github.com/tutur3u/platform/compare/pay-v0.7.0...pay-v0.7.1) (2026-07-27)


### Bug Fixes

* **satellites:** stop authorizing app-session callers with the cookie client ([b0d0242](https://github.com/tutur3u/platform/commit/b0d0242c211959cb3c676695149bb3692e566e71))

## [0.7.0](https://github.com/tutur3u/platform/compare/pay-v0.6.0...pay-v0.7.0) (2026-07-25)


### Features

* **forms:** merge satellite migration ([e739f1b](https://github.com/tutur3u/platform/commit/e739f1bead568905458a42373ae24d13cd778907))
* **forms:** migrate product to satellite app ([51b9392](https://github.com/tutur3u/platform/commit/51b93928f1a12ebd4f4c753595fb33902ebfa66c))
* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))
* **reports:** add periodic reporting automation ([ec7bd5e](https://github.com/tutur3u/platform/commit/ec7bd5e10abb137e217d1dcf143624530276392f))


### Bug Fixes

* **ci:** stabilize satellite dependency installs ([8e8d05a](https://github.com/tutur3u/platform/commit/8e8d05a1ec2fa6830bb989b902fc8a880da6bf8e))
* **settings:** repair satellite workspace management ([63614cd](https://github.com/tutur3u/platform/commit/63614cdd1550cbf7084724dbed728e798b6f979c))

## [0.6.0](https://github.com/tutur3u/platform/compare/pay-v0.5.0...pay-v0.6.0) (2026-07-21)


### Features

* **satellite:** add workspace management to app settings ([68df8c3](https://github.com/tutur3u/platform/commit/68df8c337c36d70b5b5770fc8ad43ce9e450add8))
* **satellite:** refine app picker header controls ([89b860d](https://github.com/tutur3u/platform/commit/89b860d7e93e4edda463a805b6e5726741c70785))


### Bug Fixes

* **pay:** restore AI credit wallet loading ([9b3aa65](https://github.com/tutur3u/platform/commit/9b3aa65759c50cff972a72bf1cf09917d4992e19))
* **pay:** serve AI credits from Pay ([cb9a9b5](https://github.com/tutur3u/platform/commit/cb9a9b5d112c17562dea73fd259ea8a03ac08563))
* resolve code quality findings ([63f10b5](https://github.com/tutur3u/platform/commit/63f10b5ec22a4194f48f448ee2b1b088b5da8f08))

## [0.5.0](https://github.com/tutur3u/platform/compare/pay-v0.4.0...pay-v0.5.0) (2026-07-18)


### Features

* **satellite:** clarify app picker ([6549e6b](https://github.com/tutur3u/platform/commit/6549e6bde4da9e1c44f88a7c1782dbd8778c54d7))
* **seo:** standardize app metadata ([6523d91](https://github.com/tutur3u/platform/commit/6523d91fedf38e19804d10ea3b82890db180bc6f))

## [0.4.0](https://github.com/tutur3u/platform/compare/pay-v0.3.0...pay-v0.4.0) (2026-07-13)


### Features

* **platform:** complete satellite app cutover ([b9ac2ef](https://github.com/tutur3u/platform/commit/b9ac2ef8be678a42c1f09f3bef1a05750dc2cba3))

## [0.3.0](https://github.com/tutur3u/platform/compare/pay-v0.2.0...pay-v0.3.0) (2026-07-11)


### Features

* **pay:** complete payment ownership migration ([e79e421](https://github.com/tutur3u/platform/commit/e79e42107fb3ee34e2cae2703ec33570da6ce950))
* **pay:** host the billing surface on pay; redirect web /billing ([5162706](https://github.com/tutur3u/platform/commit/5162706bc1de154f8dbfc2ac2aa82b4423fb8a8c))
* **pay:** move payment + billing API routes into apps/pay ([8a932e9](https://github.com/tutur3u/platform/commit/8a932e917f4a1becaa0564794a643fcd9cff7300))
* **pay:** scaffold apps/pay satellite (pay.tuturuuu.com, port 7826) ([3d6e45c](https://github.com/tutur3u/platform/commit/3d6e45cca6a315fe67213e438144b73103bae2f5))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))

## [0.2.0](https://github.com/tutur3u/platform/compare/pay-v0.1.0...pay-v0.2.0) (2026-07-11)


### Features

* **pay:** complete payment ownership migration ([e79e421](https://github.com/tutur3u/platform/commit/e79e42107fb3ee34e2cae2703ec33570da6ce950))
* **pay:** host the billing surface on pay; redirect web /billing ([5162706](https://github.com/tutur3u/platform/commit/5162706bc1de154f8dbfc2ac2aa82b4423fb8a8c))
* **pay:** move payment + billing API routes into apps/pay ([8a932e9](https://github.com/tutur3u/platform/commit/8a932e917f4a1becaa0564794a643fcd9cff7300))
* **pay:** scaffold apps/pay satellite (pay.tuturuuu.com, port 7826) ([3d6e45c](https://github.com/tutur3u/platform/commit/3d6e45cca6a315fe67213e438144b73103bae2f5))


### Bug Fixes

* **apps:** opt authed pages and GET routes into request-time rendering under cacheComponents ([9496ec3](https://github.com/tutur3u/platform/commit/9496ec37deaa3bfd6796a5fd0506f8d942d26c0e))


### Performance Improvements

* **ci:** enable repository-wide remote caching ([6250f91](https://github.com/tutur3u/platform/commit/6250f91d745ef987a4fc86c797aedf41542f421b))
