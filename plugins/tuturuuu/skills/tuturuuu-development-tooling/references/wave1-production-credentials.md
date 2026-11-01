# Wave-1 production credential admission

Held wave-1 publishers must resolve the shared publication policy before any
production secret use, including validation action inputs and public build
configuration sourced from secrets. Credential-bearing jobs require a direct
policy dependency and explicit admission. Validation that runs while held uses
fixtures and empty cache inputs. Pass remote-cache inputs only to the composite
wrapper's command step.

When a production-only policy job is skipped on PR/main, preserve validation with
an explicit status condition and successful validation prerequisites. A policy
failure or missing output must not admit a production credential-bearing job.

Run `node --test scripts/ci/production-publisher-secrets.test.js` for the parsed-YAML
credential boundary and original Meet independent-validation negative control.
See the [cutover runbook](https://github.com/tutur3u/internal-docs/blob/main/docs-internal/build/devops/wave1-native-cutover.mdx)
for publication scope and remaining release gates.
