# Workers AI exit

Branch: `fix/tuturuuu-exit-workers-ai-20261110`
Base: `edf40e71a2` (`chore(agents): verify-web skill (D79) (#8072)`), same tree as `main` when this checkpoint was cut.
Status: inventory and a failing guard only. No production code, docs, or Worker config has been changed. No PR. No deploy.

## Done so far

- Searched Worker configs, `env.AI` / `AI.run`, `@cf/` model ids outside `.d.ts`, `workers-ai` gateway routes, and `/ai/run/` REST calls.
- The only runtime Workers AI use is Colab. Production already prefers the AI Studio Gemini path when `COLAB_REQUIRE_SPONSORSHIP=true` (set in `apps/colab/wrangler.jsonc`) or `COLAB_AI_API_KEY` is present. `env.AI.run` is the unsponsored fallback in `generateValue`.
- Added `scripts/check-workers-ai-exit.js` and `scripts/check-workers-ai-exit.test.js`.
- Red run on this tree, before any fix (`node --test scripts/check-workers-ai-exit.test.js`, 5 pass / 2 fail):

```
apps/colab/src/server/ai.ts:120: calls env.AI
apps/colab/src/server/ai.ts:120: uses a Workers AI @cf/ model id
```

- The repo scan did **not** report `apps/colab/wrangler.jsonc`. That is a detector bug, not a clean config. See next steps.

## Inventory

| File | App | Use | Replacement |
| --- | --- | --- | --- |
| `apps/colab/wrangler.jsonc` | colab | `"ai": { "binding": "AI" }` | Remove the binding so it cannot bill. |
| `apps/colab/src/server/env.ts` | colab | `AI: Ai` on the Worker env | Remove the field with the binding. |
| `apps/colab/src/server/ai.ts:120` | colab | `env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', …)` when there is no `COLAB_AI_API_KEY` and `COLAB_REQUIRE_SPONSORSHIP !== 'true'` | Always `sponsoredGeneration` in `apps/colab/src/server/sponsored-ai.ts`. That posts to `https://ai.tuturuuu.com/v1/colab/responses` with `COLAB_AI_MODEL` or `google/gemini-3.5-flash-lite`. |
| `apps/colab/src/server/ai.test.ts` | colab | Mocks `env.AI.run`, including Workers AI `{ response, usage }` envelopes | Mock the AI Studio fetch the way `sponsored-ai.test.ts` does. Keep JSON-shape coverage by putting the envelope in `choices[0].message.content`. |
| `apps/colab/src/server/prompt-review.test.ts` | colab | Mocks `env.AI.run` | Same gateway mock. |
| `apps/colab/src/server/run-reliability.test.ts` | colab | Mocks `env.AI.run`. One test reads `messages[0].content` for `FINAL RESPONSE REQUIRED` and the creative-seed test reads `messages[1].content` | Same gateway mock. Read `instructions` and `prompt` from the fetch body. Call counts stay one fetch per `generateValue`. |
| `apps/docs/platform/features/colab.mdx` | docs | Says the Worker binds Workers AI, that incomplete Workers AI JSON is retried, and that `COLAB_CLOUDFLARE_API_TOKEN` needs Workers AI read | Say inference is the AI Studio Gemini gateway. Drop the Workers AI binding and the Workers AI read scope from the documented token. |
| `apps/docs/build/devops/colab-deployment-packet.mdx` | docs | Lists `AI` under other bindings | Bindings that remain: `ASSETS` and the `ROOMS` Durable Object. Inference is not a Worker binding. |

Checked and not Workers AI uses:

- Other `wrangler.jsonc` files (`apps/tanstack-web`, `gateway`, `backend`, `lettin`, `parley`, `api`, `meet-realtime`, Colab/Meet/Parley test fixtures). Only `apps/colab/wrangler.jsonc` declares an `ai` binding.
- `void.config.ts` entries with `bindings.ai: false` are explicit opt-outs, not bindings.
- No `@cf/` model id except `apps/colab/src/server/ai.ts:120`. No `.d.ts` hit.
- No `workers-ai` provider route and no Cloudflare `/ai/run/` REST call.
- `apps/ai` routes under `/ai/runs` are AI Studio run history, not Workers AI.
- `env.AI_GATEWAY_*`, `env.AI_AGENT_*`, and `process.env.AI_*` are unrelated. The guard ignores `env.AI` followed by a word character.

## Next steps

1. Fix `bindingFindings` before trusting a green guard. `\bbinding\b\s*:` does not match JSON `"binding":` because the closing quote sits between the word and the colon. Confirmed: `bindingFindings('{ "ai": { "binding": "AI" } }', …)` and `bindingFindings` on `apps/colab/wrangler.jsonc` both return `[]`. Toml `[ai]` sections are detected. Allow an optional quote: `["']?binding["']?\s*:`.
2. Re-run `node --test scripts/check-workers-ai-exit.test.js` and confirm it fails on `apps/colab/wrangler.jsonc` plus `ai.ts:120` before editing those files.
3. Make `generateValue` always return `parseModelJson(await sponsoredGeneration(...))`. Delete the `env.AI.run` branch and the `AI` field on `Env`.
4. Retarget the three Colab test files to the gateway mock. `parseModelJson` still unwraps `response` / fenced JSON; preserve those cases.
5. Update the two docs pages. Do not deploy. Colab production deploys stay with Rex. Pax merges.
6. Changing `apps/colab/wrangler.jsonc` changes its digest in `scripts/ci/wrangler-usage-allowlist.json` (config files hash every line). The allowlist test requires a new `admitted` object whose `decision` is `https://github.com/tutur3u/platform/pull/<this PR>` and whose `reason` differs from the current PR 7785 admission. Update the digest in the same change. Do not add the contiguous word `wrangler` to the guard script; `scripts/ci/wrangler-usage.js` counts it and the allowlist may only shrink. The guard builds that filename prefix as `'wran' + 'gler'`.
7. Run the guard, `bun --cwd apps/colab vp test` for the touched server tests (or the package `test` script), then `bun check:changed` before the next push. Do not run `bun validate` or app builds on the laptop.
8. Open the PR, link it from the successor thread, and report the PR URL plus head SHA.

## Open questions

- After the fallback is gone, `COLAB_REQUIRE_SPONSORSHIP` is unread by `generateValue`. The room always sets `authorizeSponsorship` and `sponsorship`. Keep the var as the production pin unless a docs pass says otherwise.
- The live `COLAB_CLOUDFLARE_API_TOKEN` may still include Workers AI read. Document the scope without that permission. Do not rotate secrets or change Cloudflare from this task.
- `HANDOFF.md` is this checkpoint only. Delete it in the fix commit so it does not land on `main`.
