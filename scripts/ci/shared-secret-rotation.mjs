// Rotation facts per shared secret, printed by
// `node scripts/ci/shared-secret.mjs plan <secret> <environment> [scope]`.
// Each entry records whether the verifier accepts more than one value, where
// the current value can be read (if anywhere), the no-outage order, what users
// notice, and consumers outside the target table. Names and facts only.

// Cloudflare serves tuturuuu.com and rollback means a previous Cloudflare
// version; every destination is a Worker secret.

export const ROTATION = Object.freeze({
  ABUSE_GUARD_SECRET: {
    dualAccept:
      'yes on the verifier: tuturuuu-abuse-guard reads ABUSE_GUARD_SECRETS as a comma list (current first). The mint writes a single value, so no overlap is kept.',
    source: 'none readable (Worker secret)',
    order: ['Mint with shared-secret-write (guard + web Workers in one job).'],
    impact:
      'Between the guard write and each web Worker write (seconds, one job), signed guard calls from a not-yet-written Worker are rejected: most families fail open to the local limiter; the replay family fails closed, so a CLI or app-coordination refresh in that window fails and is retried. ±60 s signature skew.',
  },
  WEB_MULTI_ACCOUNT_SESSION_SECRET: {
    dualAccept: 'no: one key derives the device-cookie HMAC and vault keys.',
    source: 'none readable (Worker secret)',
    order: [
      'Mint with shared-secret-write once every web Worker that serves the account routes is opted in, so all of them switch in one job.',
    ],
    impact:
      'Every saved/linked account in the multi-account switcher is dropped (device cookie and vault no longer verify); users stay signed in to their current account and must re-add the others. Workers holding different values drop them on each hop, so never write a subset.',
  },
  ABUSE_GUARD_KEY_PEPPER: {
    dualAccept:
      'no: a single client-side HMAC pepper for bucket keys (the guard Worker never sees it).',
    source: 'none readable (Worker secret)',
    order: ['Mint with shared-secret-write (cms/nova/rewise + web Workers).'],
    impact:
      'All rate-limit, quota and replay-fence buckets restart from zero; old Durable Object rows expire by TTL. While consumers disagree, one subject is counted in separate buckets per app. Nothing fails outright.',
  },
  CLOUDFLARE_COORDINATION_TOKEN: {
    dualAccept: 'no: tuturuuu-coordination checks one COORDINATION_TOKEN.',
    source: 'none readable (Worker secret)',
    order: [
      'Mint with shared-secret-write (coordination + infrastructure and calendar senders + web Workers in one job).',
    ],
    impact:
      'Between the coordination write and each sender write (seconds, one job), that sender fails closed: MFA authenticator registration and reset, web device MFA and calendar meeting requests answer 503, and internal-account MFA-policy and password-recovery requests answer 500.',
  },
  MASTERMIND_STORE_TOKEN: {
    dualAccept:
      'yes on the verifier: MASTERMIND_STORE_TOKENS is a comma list. The mint writes a single value, so no overlap is kept.',
    source:
      'operator Keychain copy tuturuuu/mastermind-store/<NAME> on the store operator Mac (not on every host)',
    order: [
      'Preferred: copy the Keychain value to the web Workers with `write workers MASTERMIND_STORE_TOKEN production web` (operator run). No rotation.',
      'Otherwise mint with shared-secret-write; update the Keychain copy.',
    ],
    impact:
      'Mint only: fleet and push-event routes on a not-yet-written web Worker answer 503 for the seconds of the job; the phone keeps its last snapshot with a refresh warning; push events retry.',
  },
  MASTERMIND_SHIP_CHECK_TOKEN: {
    dualAccept:
      'no: Cron Control compares one bearer; the mint writes both sides in one run.',
    source: 'none outside the Workers: shared-secret-write mints it',
    order: [
      'Mint with shared-secret-write (Cron Control and the web Workers in one run).',
    ],
    impact:
      'Mastermind Ship Check now answers failed for the seconds between the two writes; the two-minute collector is unaffected.',
  },
  MEET_REALTIME_TOKEN_SECRET: {
    dualAccept: 'no: a bare HMAC with one secret on every issuer and verifier.',
    source:
      'GitHub environment secret MEET_REALTIME_TOKEN_SECRET in meet-cloudflare-production (the one the meet deploy uses while MEET_DEDICATED_PRODUCTION_ENV_READY is true)',
    order: [
      'Copy the GitHub-held value to the web Workers (scope web). No rotation.',
    ],
    impact:
      'Copy: none. A rotation would also need both meet GitHub environments updated (the next meet/parley deploy republishes from them) and would fail in-flight join tokens (10 min), live/ticket tokens (60-120 s), drop guests (12 h cookie) and change deterministic form response ids.',
  },
  CRON_CONTROL_DELIVERY_TOKEN: {
    dualAccept:
      'no slot; the web route also accepts CRON_SECRET and SUPABASE_SECRET_KEY.',
    source: 'repository secret CRON_CONTROL_DELIVERY_TOKEN',
    order: [
      'Copy the GitHub-held value to the web Workers (scope web). No rotation.',
    ],
    impact:
      'Copy: none. A rotation must also update the repository secret (the cron-control deploy republishes it) and delays immediate notifications until both sides match.',
  },
  TUTURUUU_DEVBOX_CONTROL_TOKEN: {
    dualAccept:
      'no: tuturuuu-devbox-control checks one DEVBOX_CONTROL_INTERNAL_TOKEN.',
    source: 'repository secret DEVBOX_CONTROL_INTERNAL_TOKEN',
    order: [
      'Copy the GitHub-held value to the web Workers (scope web). No rotation.',
    ],
    impact:
      'Copy: none. A rotation must also update the repository secret and the learn/storage senders; failures only slow devbox wake-ups (runners poll).',
  },
  MASTERMIND_FLEET_PUBLISHER_SECRET: {
    dualAccept: 'yes: MASTERMIND_FLEET_PUBLISHER_SECRET_NEXT.',
    source:
      'publisher host file ~/.local/share/fleet-sync/publisher-secret (mode 0600) on the orchestrator Mac',
    order: [
      'Copy: on the publisher host, pipe the file to `write workers MASTERMIND_FLEET_PUBLISHER_SECRET production web`.',
      'If the file is unavailable: set the new value as _NEXT on the web Workers, switch the publisher, then promote.',
    ],
    impact:
      'Copy: none. Mismatch: publishes are rejected and the phone fleet view goes stale (warning after 5 min).',
  },
  MASTERMIND_PUSH_HMAC_SECRET: {
    dualAccept:
      'yes: MASTERMIND_PUSH_HMAC_SECRET_NEXT (four-step procedure in mastermind-push-events).',
    source: 'the external push hub configuration (not in this repository)',
    order: [
      'Copy from the hub configuration to the web Workers (operator run, scope web).',
      'If unavailable: follow the _NEXT procedure on the web Workers.',
    ],
    impact: 'Mismatch: owner push notifications are not delivered (401).',
  },
});

export function formatRotationPlan(plan) {
  const facts = ROTATION[plan.secret];
  const lines = [
    `${plan.secret} (${plan.environment}, mode ${plan.mode}, scope ${plan.scope})`,
  ];
  for (const worker of plan.workers)
    lines.push(`  ${worker.group} ${worker.name}: ${worker.binding}`);
  if (plan.workers.every((worker) => worker.group !== 'web'))
    lines.push(
      '  (no web Worker activated: mark it activated in apps/web/cloudflare/vinext/families.json)'
    );
  if (facts) {
    lines.push(`dual-accept: ${facts.dualAccept}`);
    lines.push(`readable source: ${facts.source}`);
    facts.order.forEach((step, index) =>
      lines.push(`step ${index + 1}: ${step}`)
    );
    lines.push(`users notice: ${facts.impact}`);
    if (facts.outOfReach) lines.push(`also update: ${facts.outOfReach}`);
  }
  return lines.join('\n');
}
