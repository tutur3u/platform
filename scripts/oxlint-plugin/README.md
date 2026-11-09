# Review rules

Run the project rules against explicit source files with the pinned Oxlint:

```sh
node_modules/.bin/oxlint --config scripts/oxlint-plugin/config.json path/to/source.ts
```

The three rules check test wall-clock reads and timers, suppression comments without
a nonempty `-- reason`, and literal runtime app destinations. Existing repository
lint remains a separate command; this config supplies the additional review rules.

Origin checks cover direct `fetch` arguments and named API endpoint/base-URL
defaults in app and package source. Metadata URLs, code-example strings, synthetic
Requests, explicit host policy and URL-resolver inputs retain their distinct roles.
The rule performs syntactic checks, so indirect destinations passed through arbitrary
helpers require source review. A supported app subdomain is not itself retired or
an authorization error. Resolve a reported destination through existing helpers or
bindings while preserving the destination's authorization policy.

Test code uses explicit dates, injected clocks or fake-timer controls rather than
reading wall-clock time or polling real timers. A justified lint suppression must
state its reason. The plugin does not change network or authentication behavior.

Run the RuleTester files with Node, since the pinned RuleTester rejects Bun:

```sh
node --test --test-concurrency=1 scripts/oxlint-plugin/tests/*.test.mjs
```
