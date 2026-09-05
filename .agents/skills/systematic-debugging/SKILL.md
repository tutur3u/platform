---
name: systematic-debugging
description: "Investigate bugs and failing tests when the cause is unclear or an attempted fix has failed."
---

# Evidence-Driven Debugging

Find the failing boundary before changing behavior. Use the error, a reproducible
case, recent changes, and a nearby working example to form a testable explanation.
For a clear local defect, this can be a short inspection; a multi-service failure
may need targeted diagnostics. Never dump secrets or raw sensitive payloads.

Test the smallest useful hypothesis and update it from the result. Avoid piling
speculative fixes onto unexplained failures. Repeated failure is a reason to change
the investigation, inspect architecture or environment, and gather new evidence;
it is not an automatic requirement to stop after a fixed number of attempts.

Implement the fix within the authorized scope. Add a regression test when it captures
meaningful behavior and rerun affected checks. An emergency mitigation can be useful
while the root cause remains under investigation; label it accurately. Stop for user
input only when progress requires a missing decision, permission, or external access.

Read these techniques only when the failure calls for them:

- [root-cause-tracing.md](root-cause-tracing.md): trace an invalid value through callers.
- [condition-based-waiting.md](condition-based-waiting.md): diagnose timing-dependent tests.
- [defense-in-depth.md](defense-in-depth.md): choose validation boundaries after identifying a cause.

Report what failed, why the change addresses it, and what was actually verified.
