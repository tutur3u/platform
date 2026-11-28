// The production fleet: every directory under apps/ has exactly one entry, so
// no app can be left out of production publication without anyone noticing.
// fleet-freshness.mjs reads this registry after every production publication
// round and fails the run when an active app is stale.
//
// Classes:
// - auto: serving-workers-production.yaml publishes it on every production push
//   (the keys of SERVING_WORKERS, nothing else).
// - special: a reviewed publisher of its own. `identity` is a public
//   build-info URL, or null when the app has none (reported, never guessed).
// - held: a deliberate hold with a reason and an owner, reported as
//   "held by policy", never as stale.
// - manual: no automatic publisher yet. Each one carries the slice that
//   automates it and an `until` date; after that date the app counts as stale.
// - inactive: paused or not a Worker; listed and never probed.
import { SERVING_WORKERS } from './serving-workers-apps.mjs';

const site = (host) => `https://${host}/api/build-info`;

const auto = Object.fromEntries(
  Object.entries(SERVING_WORKERS).map(([app, { worker, origins }]) => [
    app,
    { class: 'auto', worker, identity: `${origins[0]}/api/build-info` },
  ])
);

// `pipeline` is the top-level workflow whose production run publishes the app;
// while that run is still going, a not-yet-fresh app is PENDING, not STALE.
const special = (
  publisher,
  identity = null,
  workflow = null,
  pipeline = null
) => ({
  class: 'special',
  publisher,
  identity,
  workflow,
  pipeline,
});

const held = (reason, owner) => ({ class: 'held', reason, owner });

const manual = (slice, until, identity = null, workflow = null) => ({
  class: 'manual',
  slice,
  until,
  identity,
  workflow,
});

const inactive = (reason) => ({ class: 'inactive', reason });

// Target dates for each automation slice. Moving one needs the release
// owner's ACK in the same change.
const S1 = '2026-11-27';
const S2 = '2026-11-28';
const S3 = '2026-11-29';
const S4 = '2026-11-30';
const S4B = '2026-12-01';
const S6 = '2026-12-08';

export const PRODUCTION_FLEET = {
  ...auto,

  web: special(
    'web manual driver; vercel-production.yaml Verify-Production',
    site('tuturuuu.com'),
    'web-cloudflare-production.yaml'
  ),
  gateway: special('web-opennext.yaml gateway job'),
  tasks: special(
    'vercel-production.yaml deploy-tasks -> tasks-cloudflare.yaml publish',
    site('tasks.tuturuuu.com'),
    'tasks-cloudflare.yaml',
    'vercel-production.yaml'
  ),
  mastermind: special(
    'vercel-production.yaml deploy-mastermind-cloudflare (behind Access)'
  ),
  meet: special(
    'meet-cloudflare.yaml exact-release admission and Meet deployer',
    site('meet.tuturuuu.com'),
    'meet-cloudflare.yaml',
    'vercel-production.yaml'
  ),
  'meet-realtime': special('ships with meet (meet-cloudflare.yaml)'),
  'cron-control': special('cron-control-cloudflare.yaml and the Cron driver'),
  coordination: special('vercel-production.yaml deploy-coordination'),
  'devbox-control': special('vercel-production.yaml deploy-devbox-control'),
  'deploy-coordinator': special(
    'vercel-production.yaml deploy-deploy-coordinator'
  ),

  lettin: held('R2 timeout fix pending qualification', 'Lettin owner'),
  colab: held('dedicated release owner', 'Colab owner'),
  parley: held('R2 timeout fix pending qualification', 'Parley owner'),
  track: held('dedicated release owner', 'Track owner'),
  mind: held('dedicated release owner', 'Mind owner'),
  drive: held('native Switch cutover', 'Drive /drive lead'),
  contacts: held('wave-2 cutover', 'Contacts owner'),
  whiteboards: held('wave-1 cutover', 'Whiteboards owner'),

  admin: manual('S1', S1),
  mail: manual('S2', S2, site('mail.tuturuuu.com'), 'mail-cloudflare.yaml'),
  apps: manual('S2', S2, site('apps.tuturuuu.com'), 'apps-cloudflare.yaml'),
  finance: manual(
    'S2',
    S2,
    site('finance.tuturuuu.com'),
    'finance-cloudflare.yaml'
  ),
  calendar: manual(
    'S3',
    S3,
    site('calendar.tuturuuu.com'),
    'calendar-cloudflare.yaml'
  ),
  forms: manual('S4', S4, site('forms.tuturuuu.com'), 'forms-cloudflare.yaml'),
  inventory: manual(
    'S4',
    S4,
    site('inventory.tuturuuu.com'),
    'inventory-cloudflare.yaml'
  ),
  pay: manual('S4', S4, site('pay.tuturuuu.com'), 'pay-cloudflare.yaml'),
  chat: manual('S4', S4, site('chat.tuturuuu.com'), 'chat-cloudflare.yaml'),
  cms: manual('S4', S4, site('cms.tuturuuu.com'), 'cms-cloudflare.yaml'),
  storefront: manual(
    'S4',
    S4,
    site('store.tuturuuu.com'),
    'storefront-cloudflare.yaml'
  ),
  rewise: manual(
    'S4',
    S4,
    site('rewise.tuturuuu.com'),
    'rewise-cloudflare.yaml'
  ),
  ai: manual('S4', S4, site('ai.tuturuuu.com'), 'ai-cloudflare.yaml'),
  git: manual('S4', S4, site('git.tuturuuu.com'), 'git-cloudflare.yaml'),
  shortener: manual('S4b', S4B, site('ttr.gg'), 'shortener-cloudflare.yaml'),
  hive: manual('S6', S6),
  playground: manual('S6', S6),
  external: manual('S6', S6),
  workspace: manual('S6', S6),
  marketing: manual('S6', S6),
  'abuse-guard': manual('S6', S6),
  'mastermind-store': manual('S6', S6),
  'chat-realtime': manual('S6', S6),
  api: manual('S6', S6),
  'status-api': manual('S6', S6),
  'turbo-cache': manual('S6', S6),
  'ops-hub': manual('S6', S6),
  auth: manual('S6', S6),
  supermemory: manual('S6', S6),
  'workspace-domains': manual('S6', S6),
  'workspace-secrets': manual('S6', S6),
  'playground-execution': manual('S6', S6),
  'sso-signer': manual('S6', S6),
  'cms-renderer': manual('S6', S6),
  'storage-unzip-proxy': manual('S6', S6),

  backend: inactive('paused runtime (AGENTS.md)'),
  'tanstack-web': inactive('paused runtime (AGENTS.md)'),
  database: inactive('local Supabase project, not a Worker'),
  'fleet-status': inactive('disabled and unrouted; deployment requires ACK'),
  worlds: inactive(
    'hostname activation and first publication pending approval'
  ),
  redis: inactive('local infrastructure, not a Worker'),
  mobile: inactive('store releases, not a Worker'),
  docs: inactive('Mintlify, not a Worker'),
  discord: inactive('Modal deployment (discord-modal-deploy.yml)'),
  'hive-realtime': inactive('Docker support image'),
  'vault-witness': inactive(
    'dedicated Cloudflare account; never on the shared publish token'
  ),
};

export const FLEET_CLASSES = ['auto', 'special', 'held', 'manual', 'inactive'];

/** Problems with the registry itself; empty when it is consistent. */
export function registryProblems({ appDirs, excluded, policyHeld }) {
  const problems = [];
  const entries = Object.keys(PRODUCTION_FLEET);
  for (const dir of appDirs)
    if (!Object.hasOwn(PRODUCTION_FLEET, dir))
      problems.push(`apps/${dir} has no production fleet entry`);
  for (const app of entries)
    if (!appDirs.includes(app))
      problems.push(`${app} has a fleet entry but no apps/${app} directory`);
  for (const [app, entry] of Object.entries(PRODUCTION_FLEET)) {
    if (!FLEET_CLASSES.includes(entry.class))
      problems.push(`${app}: unknown class ${entry.class}`);
    if (entry.class === 'auto' && !Object.hasOwn(SERVING_WORKERS, app))
      problems.push(`${app}: auto but not a serving Worker`);
    if (entry.class === 'manual' && !/^\d{4}-\d{2}-\d{2}$/.test(entry.until))
      problems.push(`${app}: manual entry needs an ISO until date`);
  }
  for (const app of Object.keys(SERVING_WORKERS))
    if (PRODUCTION_FLEET[app]?.class !== 'auto')
      problems.push(`${app}: serving Worker not classed auto`);
  // The fleet's held set must agree with the planner and publication policy.
  const heldApps = new Set(
    entries.filter((app) => PRODUCTION_FLEET[app].class === 'held')
  );
  for (const app of [...excluded, ...policyHeld])
    if (!heldApps.has(app))
      problems.push(`${app}: held in tuturuuu.ci.ts but not in the fleet`);
  for (const app of heldApps)
    if (!excluded.includes(app) && !policyHeld.includes(app))
      problems.push(`${app}: held in the fleet but published by the planner`);
  return problems;
}
