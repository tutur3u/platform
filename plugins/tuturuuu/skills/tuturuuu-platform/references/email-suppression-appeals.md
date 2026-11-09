# Email suppression appeals

The product and operation contract lives in
[Mail](../../../../../apps/docs/platform/applications/mail.mdx#workspace-suppression-appeals-internal-candidate).
Keep that page authoritative for recipient bootstrap, transport grants, budgets,
provider uncertainty, feedback, and report routing.

For changes, trace the admin request through the stored appeal, fresh confirmed
recipient identity, bootstrap claim, exact provider lookup, dispatch claim,
explicit recipient POST, and grant-bound report queue. Check actual callers before
assuming a shared checker is the final sender gate: periodic report automation
performs its own earlier blacklist check.

Run the three PGlite test files with their shared fixture, the web appeal tests,
and email-service appeal/sender tests. PGlite returns timestamp values as Date
objects; preserve milliseconds with getTime() when constructing protocol claims.
A passing fixture must reject an altered expiry rather than rounding the protocol.

Use the resource queue and an authorized fleet checkout for builds and broad
checks. Validate a clean exact head. Local provider ports must be synthetic;
source review does not grant provider operations, credentials or real messages.
Verify the send kill fence and separately verify authenticated late feedback after
sending is stopped. Retain the original UNKNOWN operation across retries.

Negative feedback must correlate with the durable random dispatch tag and exact
stored sender/configuration/recipient/workspace before relying on a saved SES
message ID. Exercise feedback before the response mark and after response-loss
UNKNOWN, including after the send stop fence. Persist and revoke atomically;
known-message mismatches still fail. Feedback observation never grants resend or
changes the original UNKNOWN disposition.
