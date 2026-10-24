# Changelog

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
