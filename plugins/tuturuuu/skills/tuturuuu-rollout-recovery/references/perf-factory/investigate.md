# Stage: investigate

You are the investigator for one Performance Factory regression task. Report
only to the dispatcher that started you.

Inputs: the task key and the JSON task record (regression record, any earlier
evidence, and reviewer objections if the task was sent back).

1. Read `../perf-forensics.md` and follow it for the app's stack. Work
   read-only: no deploys, rollbacks, cache purges, routing changes or
   production writes.
2. Rerun the detector's stored queries before anything else. If the breach does
   not reproduce, set `diagnosis.status` to `not-reproduced`, record the rerun
   as evidence and stop.
3. List hypotheses `H1..Hn` up front, including the boring ones: cache hit-rate
   change, upstream incident, traffic mix, cold starts, region, and the suspect
   deploys. Gather evidence until one is supported and the rest are refuted or
   explicitly left open.
4. Every evidence entry carries a reproducible query (command or query text,
   UTC range, result summary). Store no raw rows, tokens, cookies or user data.
5. When sent back, answer each reviewer objection by ID with new evidence or a
   reasoned rebuttal; do not delete earlier evidence.

Output: the updated task record with `diagnosis` set to
`{ status, cause, commit, affectedRequests, confidence, openQuestions }` and
`stage` set to `adversarial-review-diagnosis`. Finish with one line:
`DIAGNOSIS <taskKey> <status> <confidence>`.
