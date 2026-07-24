# Changelog

## [0.3.0](https://github.com/tutur3u/platform/compare/auth-v0.2.5...auth-v0.3.0) (2026-07-24)


### Features

* **offline:** own service worker runtime and refresh dependencies ([ae44477](https://github.com/tutur3u/platform/commit/ae44477603c39f0513244514771653287338a89f))

## [0.2.5](https://github.com/tutur3u/platform/compare/auth-v0.2.4...auth-v0.2.5) (2026-07-18)


### Bug Fixes

* **mobile:** restore tasks bearer access ([2aedf84](https://github.com/tutur3u/platform/commit/2aedf8439f6d989ebf9bb69f83f74f1b25e5b06e))

## [0.2.4](https://github.com/tutur3u/platform/compare/auth-v0.2.3...auth-v0.2.4) (2026-07-03)


### Bug Fixes

* **infrastructure:** restore canonical auth host access ([9f6715f](https://github.com/tutur3u/platform/commit/9f6715fb1c5a89598556cba33b16938b76995fc6))

## [0.2.3](https://github.com/tutur3u/platform/compare/auth-v0.2.2...auth-v0.2.3) (2026-06-17)


### Bug Fixes

* **auth:** consume external app refresh tokens ([7f5a4ab](https://github.com/tutur3u/platform/commit/7f5a4ab250214018ca34e61b7084fd55865c17bc))
* **auth:** enforce MFA for satellite Supabase sessions ([fff184e](https://github.com/tutur3u/platform/commit/fff184e754326fd3b91dac3e68263795aa386325))
* **auth:** reject unsafe verify-token redirects ([1a1db96](https://github.com/tutur3u/platform/commit/1a1db960b0570af7f311afe25a62a24515b4a188))
* **auth:** restrict Portless return ports ([7977bfc](https://github.com/tutur3u/platform/commit/7977bfc074a211a20b3bf133fe78cf94ff8c1d33))

## [0.2.2](https://github.com/tutur3u/platform/compare/auth-v0.2.1...auth-v0.2.2) (2026-06-13)


### Bug Fixes

* **auth:** allow local portless e2e auth ([928da7d](https://github.com/tutur3u/platform/commit/928da7d75ff72298bd1f0d2af6872e951decae3b))

## [0.2.1](https://github.com/tutur3u/platform/compare/auth-v0.2.0...auth-v0.2.1) (2026-06-10)


### Bug Fixes

* **chat:** harden production auth handoff ([8d2ba61](https://github.com/tutur3u/platform/commit/8d2ba61d817bb98f8b4b5880ea8ac802006e4a51))

## [0.2.0](https://github.com/tutur3u/platform/compare/auth-v0.1.1...auth-v0.2.0) (2026-06-08)


### Features

* **auth:** share Supabase cookies across apps ([f72ec8e](https://github.com/tutur3u/platform/commit/f72ec8e7a35f13a301b95b2aa916aefbc5848e6e))


### Bug Fixes

* **auth:** clear duplicate shared supabase cookies ([32fbd04](https://github.com/tutur3u/platform/commit/32fbd046a30fadba98eba278107c334aafcd7bde))
* **auth:** preserve satellite Supabase sessions ([a8b49bb](https://github.com/tutur3u/platform/commit/a8b49bb2d29f42b4a0267aadd5d2e2fd1074aeab))
* **auth:** standardize satellite Supabase sessions ([4a96fa2](https://github.com/tutur3u/platform/commit/4a96fa24e680937dc7ae44474cfef51329e314f9))
* **auth:** support supabase-first satellite sessions ([b014fcf](https://github.com/tutur3u/platform/commit/b014fcf6db8218a1b54fd79f5e13629f66cad090))
* **ci:** unblock e2e docker builds ([7a09469](https://github.com/tutur3u/platform/commit/7a09469822261d1b82e07d969c4e61885a54d5f6))

## [0.1.1](https://github.com/tutur3u/platform/compare/auth-v0.1.0...auth-v0.1.1) (2026-06-03)


### Bug Fixes

* **auth:** normalize satellite login redirects ([fbf45da](https://github.com/tutur3u/platform/commit/fbf45dab3dc03397aa5eb225e1ba913905e94d9f))
* **auth:** require refresh tokens for cross-app refresh ([debfd34](https://github.com/tutur3u/platform/commit/debfd348484414e36ec330d61ce3ea1f3174fe4f))
