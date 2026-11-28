#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  codeOnly,
  isGeneratedLegacyWrapper,
  reexportTargets,
  resolveModule,
} = require('./security-route-source');

// Helpers that wrap or guard the handler themselves; a call site is enough.
const CALL_HELPERS = [
  'getPermissions',
  'withSessionAuth',
  'withWorkspaceAuth',
  'requireWorkspacePermission',
];

// Helpers that return a denial instead of throwing. They count only when the
// denial is returned: `if (denied) return denied;` for a Response-or-null
// result, `if (!auth.ok) return auth.response;` for an `{ ok }` result,
// `if (auth.response) return auth.response;` for a `{ response }` result, or
// `if ('error' in auth) return auth.error;` / `if (auth.error) return auth.error;`.
const ENFORCED_RESULT_HELPERS = [
  'authorizeCalendarEventManagement',
  'authorizeFleetPublisher',
  'authorizeInfrastructureAdminRequest',
  'authorizeInfrastructureCron',
  'authorizeInfrastructureWorkspaceSecretsRequest',
  'getFinanceRouteContext',
  'requireExternalAppWorkspaceMembersAccess',
  'requireFinanceStatsAccess',
  'requireLearnerWorkspace',
  'requireQaOperator',
  'requireSepayAccess',
  'requireTaskProgressRowAccess',
  'requireUpskiiAppCredentials',
  'requireWorkspaceExternalProjectAccess',
  'resolveLmsStaffAccess',
  'resolveLmsViewAccess',
  'resolveWorkspaceRouteAccess',
];

// Intentionally unauthenticated or cryptographically signed public routes,
// each pinned by exact file SHA-256 digest and a verified reason. Any edit to
// a pinned file changes its digest and flags it for re-review.
const PUBLIC_ROUTE_ALLOWLIST = {
  'apps/calendar/src/app/api/v1/calendar/invitations/rsvp/route.ts': {
    digest: 'dd915fb1747b3309bab87579b99383671f565795a6c1c182174e06722878d02e',
    reason:
      'Public calendar invitation RSVP token flow with rate limiting and token lookup.',
  },
  'apps/calendar/src/app/api/v1/calendar/invitations/unsubscribe/route.ts': {
    digest: 'abd81203fb9b2df0a9b4d348656165bc3be61bbe9be5e318cbda6a2d920fcca6',
    reason:
      'Public calendar invitation unsubscribe token flow with rate limiting and token lookup.',
  },
  'apps/forms/src/app/api/v1/shared/forms/[shareCode]/route.ts': {
    digest: 'b64828d48ed63a6d9a81ee28a1c8106f022c15db9197832e9795282a7723bccb',
    reason:
      'Public shared-form snapshot and Turnstile-verified submission by share code.',
  },
  'apps/git/src/app/api/build-info/route.ts': {
    digest: '4d662e31f44ef89eedc2056b1506df29170d9fb3caf609637808c71d5b6a7c82',
    reason:
      'Public build-info metadata endpoint via createPublicBuildInfoHandler.',
  },
  'apps/mail/src/app/api/v1/webhooks/mail/cloudflare/route.ts': {
    digest: 'f1b85069a2a598724785c3be4687f138f1e7bf21bbf29d00cc5bda5458911869',
    reason:
      'Cloudflare inbound mail webhook verified via HMAC-SHA256 signature and 5-minute window.',
  },
  'apps/mail/src/app/api/v1/webhooks/mail/ses/route.ts': {
    digest: '4ae9c71106004f0971e27481711e33a4de5ebbe786d5ce7cc376196d5af79d66',
    reason:
      'AWS SNS/SES webhook verified via SNS envelope signature and pinned topic ARN.',
  },
  'apps/meet/src/app/api/meet-call/[meetingId]/guest/human-check/route.ts': {
    digest: 'ce35537f464d0e92f369b5b21fe3c2d369ed33246699dd4b36d962e37c895a51',
    reason:
      'Public Meet guest join human-check challenge with guest budget limits.',
  },
  'apps/meet/src/app/api/meet-call/[meetingId]/guest/human-check/verify/route.ts':
    {
      digest:
        'e1c74feda8e06552b19401d006d2b11b69b870fd0cbb3057affb3911044e15e8',
      reason:
        'Public Meet guest join human-check verification via verifyJigsawAttempt.',
    },
  'apps/meet/src/app/api/meet-call/[meetingId]/guest/route.ts': {
    digest: 'c671c2f6007fdcf471b849191527183ed8bb79d4f811614751b95882493eb024',
    reason:
      'Public Meet guest join endpoint with Turnstile verification and rate limits.',
  },
  'apps/pay/src/app/api/payment/webhooks/route.ts': {
    digest: '1cf508d91045a8fd546004c5edeb20a20c2489102af70b40c07afbcea5692e65',
    reason:
      'Polar payment webhook verified fail-closed via POLAR_WEBHOOK_SECRET.',
  },
  'apps/web/src/app/api/v1/auth/accounts/logout/route.ts': {
    digest: '42c748c3c367e6baf4459598873328d9465745376341877e1810887bcd9b66af',
    reason:
      'Logout mutation guarded by first-party origin allowlist and JSON content-type check.',
  },
  'apps/web/src/app/api/v1/auth/external-app-logo/[appId]/[version]/route.ts': {
    digest: '024872e777275bfbb975f294aae2ab89cf33eb3a4ecf34243755e1fb2d0295d1',
    reason: 'Public external-app logo proxy validated against app registry.',
  },
  'apps/web/src/app/api/v1/auth/login-view/route.ts': {
    digest: '792fa9689525ff16d98882e0e0112e3cdb268b14178ac3a111d263c2375cd0a3',
    reason: 'Public login-view configuration read.',
  },
  'apps/web/src/app/api/v1/mastermind/push-events/route.ts': {
    digest: 'f9d419ced2b5e54cac74cd1579002f02f28771addd5518898eaae6dec4910471',
    reason:
      'Mastermind push webhook verified via HMAC-SHA256 timingSafeEqual signature and 5-minute skew.',
  },
  'apps/web/src/app/api/v1/public/bill-splits/settlement/route.ts': {
    digest: '1ba0753f4a0f9bb174f8ea2077a403a896d1371ec8f2ebf3754d09dd374ebee1',
    reason:
      'Public bill-split settlement status-link digest lookup with Turnstile verification.',
  },
  'apps/web/src/app/api/v1/public/pricing/route.ts': {
    digest: '665664c33cce1791f9fd2e1c77d42ec37c4a74b36d3c525f1be42208a0331f2f',
    reason: 'Public pricing catalog read.',
  },
  'apps/web/src/app/api/v1/public/user-profile-links/[code]/avatar/route.ts': {
    digest: '3564908a49eabbc9aa5ed05a171495377ae2db4ac7f5c437dcd80ae46643b377',
    reason:
      'Capability-token public profile-link avatar read enforcing link status and allowed fields.',
  },
  'apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/delivery/version/route.ts':
    {
      digest:
        'e4e3919fd15f6b0ddb626b3a822cac6566f4e39c2b6ff30a8d191ab6dece6524',
      reason:
        'Intentionally unauthenticated published external-project delivery version read.',
    },
  'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route.ts':
    {
      digest:
        'aefaed64df85a3b6004c143c7205dd143426c3e97e784517c1d2439655e619f8',
      reason:
        'Signed WebGL extraction callback verified via proxy token and HMAC before writes.',
    },
  'apps/workspace/src/app/api/build-info/route.ts': {
    digest: 'bf32c872a3a08b86c560de06e0969705acaab112f1c02c4e3299cdb9443c568e',
    reason:
      'Public build-info metadata endpoint via createPublicBuildInfoHandler.',
  },
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function callsHelper(code) {
  return new RegExp(
    `\\b(?:${CALL_HELPERS.join('|')})(?:<[^<>]+>)?\\s*\\(`
  ).test(code);
}

function enforcesResultHelper(code) {
  const assignment = new RegExp(
    `\\b(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:${ENFORCED_RESULT_HELPERS.join('|')})\\s*\\(`,
    'g'
  );
  for (const match of code.matchAll(assignment)) {
    const name = escapeRegExp(match[1]);
    const rest = code.slice(match.index + match[0].length);
    const deniedReturn = new RegExp(
      `\\bif\\s*\\(\\s*${name}\\s*\\)\\s*\\{?\\s*return\\s+${name}(?!\\.)\\b`
    );
    const okReturn = new RegExp(
      `\\bif\\s*\\(\\s*!\\s*${name}\\.ok\\s*\\)\\s*\\{?\\s*return\\s+${name}\\.response(?!\\.)\\b`
    );
    const responseReturn = new RegExp(
      `\\bif\\s*\\(\\s*${name}\\.response\\s*\\)\\s*\\{?\\s*return\\s+${name}\\.response(?!\\.)\\b`
    );
    const errorReturn = new RegExp(
      `\\bif\\s*\\(\\s*${name}\\.error\\s*\\)\\s*\\{?\\s*return\\s+${name}\\.error(?!\\.)\\b`
    );
    if (
      deniedReturn.test(rest) ||
      okReturn.test(rest) ||
      responseReturn.test(rest) ||
      errorReturn.test(rest)
    )
      return true;
  }
  return false;
}

function missingPermissionHelper(source) {
  const code = codeOnly(source);
  return !callsHelper(code) && !enforcesResultHelper(code);
}

// Follows pure re-export routes (up to a small depth) to the module that
// actually runs, so the helper check applies to the delegated handler. An
// unresolvable target stays a finding.
function routeIsGuarded(root, file, source, depth = 0) {
  if (depth === 0 && Object.hasOwn(PUBLIC_ROUTE_ALLOWLIST, file)) {
    const entry = PUBLIC_ROUTE_ALLOWLIST[file];
    return Boolean(entry?.reason?.trim()) && entry.digest === digest(source);
  }
  if (isGeneratedLegacyWrapper(root, file, source)) return true;
  const targets = reexportTargets(source);
  if (!targets) return !missingPermissionHelper(source);
  if (depth >= 3) return false;
  return targets.every((specifier) => {
    const target = resolveModule(root, file, specifier);
    if (!target) return false;
    const targetSource = fs.readFileSync(path.join(root, target), 'utf8');
    return routeIsGuarded(root, target, targetSource, depth + 1);
  });
}

function digest(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}
function inventory(root = process.cwd()) {
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--',
      'apps/*/src/app/api/**/route.*',
      'apps/*/src/legacy-api-routes/**/route.*',
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
    .trim()
    .split('\n');
  return files
    .filter((file) =>
      /^apps\/(?!backend\/|tanstack-web\/)[^/]+\/src\/(?:app\/api\/|legacy-api-routes\/).*\/route\.[cm]?[jt]sx?$/.test(
        file
      )
    )
    .flatMap((file) => {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      return routeIsGuarded(root, file, source)
        ? []
        : [{ file, digest: digest(source) }];
    });
}
function newFindings(entries, baseline) {
  return entries.filter(
    (entry) =>
      !baseline.some(
        (old) => old.file === entry.file && old.digest === entry.digest
      )
  );
}
if (require.main === module) {
  try {
    const [output, ...extra] = process.argv.slice(2);
    if (
      extra.length ||
      (output?.startsWith('--') && output !== '--write-baseline')
    ) {
      throw new Error(
        'Usage: security-route-permissions.js [report-path | --write-baseline]'
      );
    }
    const baselinePath = path.join(__dirname, 'security-route-baseline.json');
    const entries = inventory();
    if (output === '--write-baseline') {
      fs.writeFileSync(baselinePath, `${JSON.stringify(entries, null, 2)}\n`);
      console.log(
        `Route permission baseline: ${entries.length} entries written.`
      );
      return;
    }
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const findings = newFindings(entries, baseline);
    if (output) {
      fs.writeFileSync(output, `${JSON.stringify({ findings }, null, 2)}\n`);
    }
    for (const finding of findings)
      console.error(
        finding.file +
          ': permission helper not found; inspect delegation or add authorization.'
      );
    console.log(
      `Route permission inventory: ${findings.length} new finding(s).`
    );
    process.exitCode = findings.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = {
  CALL_HELPERS,
  ENFORCED_RESULT_HELPERS,
  PUBLIC_ROUTE_ALLOWLIST,
  codeOnly,
  missingPermissionHelper,
  routeIsGuarded,
  inventory,
  newFindings,
};
