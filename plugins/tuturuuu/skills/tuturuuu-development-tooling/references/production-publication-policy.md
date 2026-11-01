# Protected production publication

Wave-1 publication uses the validated `productionPublicationPolicy` in
`tuturuuu.ci.ts`. Missing/invalid records or unknown publisher identities hold;
releasing a protected app requires explicit admission for every surface. Meet
admission covers both `frontend` and `realtime-do`; the other protected apps use
`frontend`. Known unrelated publishers keep their existing selection, and
Supabase production migration eligibility keeps its existing gates.

Keep the shared dependency-free policy check ahead of credential-bearing
publication setup in direct legacy and native workflows, as well as the planner.
Require `needs.production-policy.outputs.allowed == 'true'` on each publisher;
absent output or a failed policy job must never publish. An explicit hold reports
"held for wave-1 cutover" in logs and the summary and skips the publishing job.
Retain native-source legacy Vercel rejection after admission as defense in depth.

Run `ttr resources run -- node --test scripts/ci/production-publication-policy.test.js`
for planner mutations, actual CLI outputs and publisher job dependencies. Keep
negative cases for removed/empty/malformed records, unknown names and incomplete
Meet surface admission. Verify normal unrelated selection and explicit admission
as positive controls. Use scoped workflow parsing/actionlint without dispatching.

Old-source reruns retain their original policy. A source fix cannot retrofit an
already-admitted run. Release-owner reconciliation and hosted acceptance remain
separate from these source checks; see
`tutur3u/internal-docs: docs-internal/build/devops/wave1-native-cutover.mdx` for the cutover gates.
