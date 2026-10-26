import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
export const loadPublisherMap = () =>
  JSON.parse(read('infra/cloudflare/edge-security/publishers.json'));
export const loadDnsInventory = () =>
  JSON.parse(read('infra/cloudflare/edge-security/inventory/hosts.json')).hosts;
const reviewedMachines = [
  {
    host: 'meet-realtime.tuturuuu.com',
    exact: [
      '/health',
      '/realtime',
      '/room-state',
      '/room-device',
      '/room-service',
      '/channels',
      '/channels/publish',
      '/channels/document',
      '/collaboration',
      '/collaboration/seed',
      '/collaboration/checkpoint',
      '/collaboration/runner-files',
    ],
    prefixes: [],
  },
  {
    host: 'colab.tuturuuu.com',
    exact: ['/auth/login', '/auth/callback'],
    prefixes: [],
  },
];
export const authExcludedPaths = [
  '/api/auth/refresh-app-session',
  '/api/auth/verify-app-token',
  '/api/v1/auth/cross-app-session/refresh',
  '/api/v1/auth/cross-app-token/verify',
  '/api/v1/auth/mfa/mobile/approvals',
];
export const authExcludedPrefixes = ['/api/v1/auth/qr-login/challenges/'];

export function deriveWorkerConfigPaths(catalog = loadPublisherMap()) {
  assert.equal(catalog.version, 1);
  assert.deepEqual(catalog.sourceAuthorities, [
    'tuturuuu.ts',
    'tuturuuu.ci.ts',
    'scripts/ci/production-publication-policy.ts',
  ]);
  const canonicalTargets = read('tuturuuu.ts');
  const maintenance = catalog.maintenanceWorkers;
  assert.equal(maintenance?.length, 1, 'Maintenance origin omitted');
  const hive = maintenance[0];
  assert.equal(hive.host, 'hive.tuturuuu.com');
  assert.equal(hive.worker, 'tuturuuu-hive-maintenance');
  const evidence = JSON.parse(
    read(`infra/cloudflare/edge-security/${hive.liveEvidence}`)
  ).hive;
  assert.equal(evidence.status, 200);
  assert.equal(evidence.routesStatus, 200);
  assert.equal(evidence.worker, hive.worker);
  assert.equal(evidence.workersDev, hive.workersDev);
  assert.equal(evidence.previewUrls, hive.previewUrls);
  assert.equal(typeof hive.workersDev, 'boolean');
  assert.equal(typeof hive.previewUrls, 'boolean');
  assert(
    evidence.routes.some(
      (route) =>
        route.pattern === `${hive.host}/*` && route.script === hive.worker
    ),
    'Maintenance origin lacks live route evidence'
  );
  const hosts = catalog.workers.map((worker) => worker.host);
  assert.equal(new Set(hosts).size, hosts.length);
  for (const required of [
    'meet.tuturuuu.com',
    'meet-realtime.tuturuuu.com',
    'colab.tuturuuu.com',
    'lettin.tuturuuu.com',
    'parley.tuturuuu.com',
  ])
    assert(hosts.includes(required), 'Canonical Worker omitted');
  for (const worker of catalog.workers) {
    assert(!worker.host.startsWith('finance'), 'Finance custody excluded');
    assert(
      /^apps\/[a-z-]+\/(?:void\.config\.ts|wrangler\.jsonc)$/.test(
        worker.configPath
      )
    );
    assert(/^[a-z-]+-cloudflare\.yaml$/.test(worker.workflow));
    assert(
      canonicalTargets.includes(worker.workflow),
      'Publisher missing from canonical targets'
    );
    assert(read(`.github/workflows/${worker.workflow}`).length > 0);
    const config = read(worker.configPath);
    assert(
      config.includes(worker.host) && config.includes(worker.worker),
      'Host/publisher config identity mismatch'
    );
  }
  assert(
    catalog.legacyAliases.some(
      (alias) =>
        alias.host === 'meet-vercel-rollback.tuturuuu.com' &&
        alias.originLockRequired
    )
  );
  return [...new Set(catalog.workers.map((worker) => worker.configPath))];
}

export function eligibleVercelHosts(
  catalog = loadPublisherMap(),
  inventory = loadDnsInventory()
) {
  const workerHosts = new Set(
    [...catalog.workers, ...catalog.maintenanceWorkers].map(
      (worker) => worker.host
    )
  );
  return catalog.vercelOrigins
    .filter(
      (origin) =>
        origin.provider === 'vercel' &&
        origin.providerVerified === true &&
        !workerHosts.has(origin.host) &&
        !origin.host.startsWith('finance') &&
        inventory.some(
          (row) => row.host === origin.host && row.proxied === true
        )
    )
    .map((origin) => origin.host)
    .sort();
}

export function validateCatalogBindings(
  policy,
  inventory = loadDnsInventory()
) {
  const known = new Map(inventory.map((entry) => [entry.host, entry]));
  assert(
    policy.candidateApplicationHosts.every((host) => known.has(host)),
    'Candidate host missing from DNS inventory'
  );
  assert.deepEqual(
    [...policy.applicationHosts].sort(),
    policy.candidateApplicationHosts
      .filter((host) => known.get(host)?.proxied === true)
      .sort(),
    'Application selectors must match the admitted proxied DNS inventory'
  );
  assert(
    policy.rateLimit.hosts.every(
      (host) =>
        policy.applicationHosts.includes(host) &&
        known.get(host)?.proxied === true
    ),
    'Auth rate host must be an inventoried proxied application'
  );
  assert(
    isDeepStrictEqual(policy.serviceMachines, reviewedMachines),
    'Service machine routes differ from reviewed contract'
  );
  assert.deepEqual(policy.rateLimit.excludedExactPaths, authExcludedPaths);
  assert.deepEqual(policy.rateLimit.excludedPrefixes, authExcludedPrefixes);
  for (const flag of [
    'serverSideRefreshAcceptanceRequired',
    'pollingAcceptanceRequired',
    'measuredPerIpP99Required',
  ])
    assert.equal(policy.rateLimit[flag], true);
}

export function validateRolloutPrerequisites(policy, exactKeys) {
  exactKeys(
    policy.urlNormalization,
    ['type', 'scope', 'reReadBeforeApply'],
    'urlNormalization'
  );
  assert.equal(policy.urlNormalization.type, 'cloudflare');
  assert.equal(policy.urlNormalization.scope, 'both');
  assert.equal(policy.urlNormalization.reReadBeforeApply, true);
  exactKeys(
    policy.originLock,
    [
      'requiredBeforeEnforcement',
      'workersDev',
      'previewUrls',
      'workerConfigPaths',
      'vercel',
      'reReadBeforeApply',
      'publisherMap',
      'liveWorkerSubdomainGetRequired',
    ],
    'originLock'
  );
  for (const flag of [
    'requiredBeforeEnforcement',
    'reReadBeforeApply',
    'liveWorkerSubdomainGetRequired',
  ])
    assert.equal(policy.originLock[flag], true);
  assert.equal(policy.originLock.workersDev, false);
  assert.equal(policy.originLock.previewUrls, false);
  assert.equal(policy.originLock.publisherMap, 'publishers.json');
  assert.deepEqual(
    policy.originLock.workerConfigPaths,
    deriveWorkerConfigPaths()
  );
  const vercel = policy.originLock.vercel;
  exactKeys(
    vercel,
    [
      'requireCloudflareSourceNetwork',
      'requireEdgeInjectedSecret',
      'secretHeader',
      'overwriteClientHeader',
      'protectAllDeploymentAliases',
      'aliasPattern',
      'proxiedOriginHosts',
      'secretPlaceholders',
      'readersAcknowledged',
      'rotationOrder',
      'readerEvidenceRequired',
      'compromiseProcedureRequired',
    ],
    'originLock.vercel'
  );
  for (const flag of [
    'requireCloudflareSourceNetwork',
    'requireEdgeInjectedSecret',
    'overwriteClientHeader',
    'protectAllDeploymentAliases',
    'readerEvidenceRequired',
    'compromiseProcedureRequired',
  ])
    assert.equal(vercel[flag], true);
  assert.equal(vercel.secretHeader, 'x-tuturuuu-edge-origin');
  assert.notEqual(vercel.secretHeader, policy.probe.header);
  assert.equal(vercel.aliasPattern, '<app>-tuturuuu.vercel.app');
  assert.deepEqual(vercel.proxiedOriginHosts, eligibleVercelHosts());
  assert(
    vercel.proxiedOriginHosts.every((host) =>
      policy.applicationHosts.includes(host)
    ),
    'Origin header target must be an admitted proxied app'
  );
  assert(
    isDeepStrictEqual(vercel.secretPlaceholders, [
      '__EDGE_ORIGIN_SECRET_CURRENT_REQUIRED__',
      '__EDGE_ORIGIN_SECRET_NEXT_REQUIRED__',
    ]),
    'Origin secrets must remain placeholders'
  );
  assert.deepEqual(vercel.readersAcknowledged, [
    'Cloudflare ruleset-read token holders',
    'Vercel Developer and Viewer WAF-condition readers',
  ]);
  assert.deepEqual(vercel.rotationOrder, [
    'vercel-accepts-current-and-next',
    'cloudflare-switches-to-next',
    'vercel-drops-current',
  ]);
  exactKeys(
    policy.entrypointCustody,
    [
      'reReadBeforeApply',
      'preserveForeignRules',
      'captureRuleIdsAndPositions',
      'skipBeforeBlockOrChallenge',
      'financeOwnerApprovalRequired',
    ],
    'entrypointCustody'
  );
  for (const flag of Object.values(policy.entrypointCustody))
    assert.equal(flag, true);
  exactKeys(
    policy.behaviorAcknowledgements,
    [
      'browserBicAlreadyOn',
      'machineSecurityLevelOffBypassesUnderAttack',
      'sbfmSkipDoesNotProveAllAiPolicyBypass',
    ],
    'behaviorAcknowledgements'
  );
  for (const flag of Object.values(policy.behaviorAcknowledgements))
    assert.equal(flag, true);
  exactKeys(
    policy.framingHeaders,
    [
      'appOwnedHeadersRequired',
      'perHostEvidenceRequired',
      'managedTransformEndState',
      'financeScopedExceptionSeparateCustody',
      'rollbackRequired',
    ],
    'framingHeaders'
  );
  assert.equal(
    policy.framingHeaders.managedTransformEndState,
    'off-after-every-app-acceptance'
  );
  for (const flag of [
    'appOwnedHeadersRequired',
    'perHostEvidenceRequired',
    'financeScopedExceptionSeparateCustody',
    'rollbackRequired',
  ])
    assert.equal(policy.framingHeaders[flag], true);
}
