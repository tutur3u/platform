# Control placement and latency

`ABUSE_GUARD_CONTROL_ID` defaults to `v1`. Only `v2` opts into a distinct
`control:v2` object with `ABUSE_GUARD_LOCATION_HINT` (default `apac`). Invalid
versions fail admission closed; invalid hints omit the placement hint for both
subjects and control. Location hints influence creation, not relocation.

V2 first use runs behind the Durable Object concurrency barrier. It performs one
v1 state read, bounded to one second, and persists fresh v2 state before serving
requests. A valid open v1 permits open v2; operator STOP, any family STOP,
malformed state, timeout or read error initializes v2 STOPPED. Storage failure
prevents initialization and service. Existing v2 state is never overwritten on
restart. A failed read latches STOP until explicit operator resume; recovery
alone never resumes admission. No migration endpoint or retry loop exists.

Activate only at a UTC day boundary: daily usage counters are not copied.
Fair-admission windows also restart empty; this requires release-authority
approval before activation. V1 storage remains intact. Rollback selects `v1`;
subsequent stop/resume changes on one version do not update the other, so inspect
and reconcile its stop state before switching. No new secret is required.

## Measurement

- M1: operator-authenticated `GET /control/state` at low bounded frequency
  measures the control path with no subject call. Compare warm and cold probes.
- M2: operator-authenticated `GET /control/diag` returns exactly `workerColo`
  and `controlColo`. Missing/unavailable colo is `null`. The control object calls
  the fixed public trace endpoint at most once per instance (two-second timeout,
  no redirects or retries), retaining only `colo=`. No trace body is returned.
- M3: `/v1/rpc` responses include integer-only
  `Server-Timing: admit;dur=<ms>, subject;dur=<ms>`. Admission includes bootstrap
  and failed admission time; subject time includes hashing and all subject calls.
  Rejected requests that never reach a phase report zero for that phase.
- Each HTTP RPC emits at most one non-blocking Analytics Engine datapoint to
  `abuse_guard_metrics`: blobs `[family, outcome]`, doubles
  `[admitMs, subjectMs, totalMs]`. Invalid/unverified families are `unknown`.
  Binding RPCs emit after validation. The binding is optional; absence or write
  failure has no effect on admission, and no retry is scheduled. No key,
  partition, principal or IP is recorded.

For the proxy timeout-exceedance estimate, query the dataset with sampling weights:

```sql
SELECT
  SUM(IF(double3 > 750, _sample_interval, 0)) / SUM(_sample_interval) AS fallback_rate
FROM abuse_guard_metrics
WHERE blob1 = 'proxy' AND timestamp > NOW() - INTERVAL '1' HOUR
```

This is the guard-side latency estimate of fallback rate; client network time,
client cancellations and transport failures require caller-side correlation for
an exact fallback rate. Compare matched windows before and after activation.
Sharding and proxy timeout changes are separate follow-up changes.

## Regression coverage

`src/latency.test.ts` covers flag defaults, hints, bounded fail-closed bootstrap,
colo parsing and telemetry shape. `src/worker.test.ts` exercises operator auth,
exact diagnostic fields, integer timing headers, durable stop inheritance and
explicit resume in local workerd. Trace requests use an outbound fixture;
placement is asserted at the namespace API boundary, not as hosted placement
proof. Hosted colo/latency acceptance remains required before activation.
