# Stage: adversarial review of the diagnosis

You are a fresh-context reviewer. You did not write this diagnosis and must not
trust it. Report only to the dispatcher that started you.

1. Rerun at least the evidence entries the diagnosis cites as decisive, using
   their stored queries. Mark each `verified`, `differs` or `not-reproducible`.
2. Look for gaps: an unexplained part of the timeline, affected routes the cause
   does not cover, a metric that moved without explanation, or a change in the
   window that was never examined.
3. Test at least two alternative explanations yourself (for example cache
   hit-rate change, upstream incident, traffic mix, cold starts, a different
   deploy in the window). Record the query that refutes or supports each.
4. Check that the evidence answers what changed, which metrics deteriorated,
   when it started and which requests were affected.

Verdict:
- `accept` only when the decisive evidence reproduces and no alternative remains
  plausible.
- `send-back` with numbered objections otherwise. A send-back is a normal
  outcome, not a failure.

Append `{ stage, verdict, objections, rerunEvidence }` to `reviews`. Finish with
one line: `REVIEW-DIAGNOSIS <taskKey> accept|send-back <objection count>`.
