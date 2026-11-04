# Cloudflare safety wiring generator

Run `python3 scripts/cf-migration/app-safety.py <app>` from the repository root
in the app owner's branch, after its Start wiring exists. This is the tracked
source of the former temporary `cf-safety-edit.py` generator. It changes only
the named app. Review its output before committing; it does not deploy or run
builds.

Keep a retained Next `build:legacy` script before running it. Generated Vercel
commands build workspace dependencies before invoking that legacy build.
Runtime templates substitute only `__APP_ID__`; credential identifiers such as
`TUTURUUU_APP_COORDINATION_SECRET` must remain literal. Never replace every
occurrence of `APP` in a template or in already-rendered binding names.

Run `python3 scripts/cf-migration/app-safety.test.py` for isolated generation
checks covering the six affected app names, retained legacy scripts and refusal
when no legacy Next build exists. These checks use temporary files only and do
not install dependencies, build apps or run Workers.
