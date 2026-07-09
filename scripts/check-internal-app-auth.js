#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REGISTERED_APPS = [
  'calendar',
  'cms',
  'drive',
  'finance',
  'hive',
  'inventory',
  'storefront',
  'learn',
  'mind',
  'nova',
  'pay',
  'rewise',
  'tasks',
  'teach',
  'track',
];
const REGISTERED_APP_TARGETS = {
  calendar: 'calendar',
  cms: 'cms',
  drive: 'drive',
  finance: 'finance',
  hive: 'hive',
  inventory: 'inventory',
  storefront: 'storefront',
  learn: 'learn',
  mind: 'mind',
  nova: 'nova',
  pay: 'pay',
  rewise: 'rewise',
  tasks: 'tasks',
  teach: 'teach',
  track: 'track',
};
const COMPATIBLE_SESSION_FALLBACK_FILES = new Set([
  'apps/calendar/src/lib/api-auth.ts',
  'apps/finance/src/app/api/workspaces/[wsId]/transactions/import/money-lover/route.ts',
  'apps/finance/src/app/api/workspaces/[wsId]/wallets/migrate/route.ts',
  'apps/hive/src/lib/api-auth.ts',
  'apps/hive/src/lib/hive-page-context.ts',
  'apps/inventory/src/__tests__/products-routes.test.ts',
  'apps/inventory/src/app/api/v1/workspaces/[wsId]/integrations/sepay/shared.ts',
  'apps/inventory/src/app/api/v1/workspaces/[wsId]/products/count/route.ts',
  'apps/inventory/src/app/api/v1/workspaces/[wsId]/products/options/route.test.ts',
  'apps/inventory/src/app/api/v1/workspaces/[wsId]/products/options/route.ts',
  'apps/inventory/src/app/api/v1/workspaces/[wsId]/products/route.ts',
  'apps/inventory/src/lib/api-auth.ts',
  'apps/learn/src/lib/api-auth.ts',
  'apps/mind/src/lib/api-auth.ts',
  'apps/pay/src/app/[locale]/[wsId]/billing/actions.ts',
  'apps/pay/src/app/[locale]/[wsId]/billing/page.tsx',
  'apps/pay/src/app/api/payment/credit-packs/checkouts/route.ts',
  'apps/pay/src/app/api/payment/customer-portal/subscriptions/[subscriptionId]/route.ts',
  'apps/pay/src/app/api/payment/orders/[orderId]/invoice/route.ts',
  'apps/pay/src/app/api/payment/seats/route.ts',
  'apps/pay/src/app/api/payment/subscriptions/[subscriptionId]/change/route.ts',
  'apps/pay/src/app/api/payment/subscriptions/[subscriptionId]/checkouts/route.ts',
  'apps/pay/src/app/api/payment/subscriptions/[subscriptionId]/preview/route.ts',
  'apps/pay/src/app/api/v1/workspaces/[wsId]/billing/route.ts',
  'apps/teach/src/lib/api-auth.ts',
]);
const CHECKED_SUPABASE_AUTH_FALLBACK_FILES = new Set([
  'apps/hive/src/app/api/v1/hive/_shared.ts',
]);
const FORBIDDEN_PATTERNS = [
  {
    allowedFiles: COMPATIBLE_SESSION_FALLBACK_FILES,
    pattern: /@tuturuuu\/supabase\/next\/auth-session-user/u,
    message: 'Use @tuturuuu/auth/app-session instead of Supabase session auth.',
  },
  {
    pattern: /@tuturuuu\/utils\/user-helper/u,
    message:
      'Registered app code must resolve actors from Tuturuuu app-session auth, not Supabase-backed user helpers.',
  },
  {
    pattern: /@tuturuuu\/supabase\/next\/auth-browser/u,
    message: 'Satellite logout must clear the Tuturuuu app-session cookie.',
  },
  {
    allowedFiles: CHECKED_SUPABASE_AUTH_FALLBACK_FILES,
    pattern:
      /supabase\.auth\.(getUser|setSession|signOut|exchangeCodeForSession|signInWithOtp|signUp|verifyOtp|updateUser)/u,
    message:
      'Registered app auth surfaces must not call supabase.auth.* directly.',
  },
];

function walkFiles(targetPath) {
  const absolutePath = path.join(ROOT, targetPath);

  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    return [targetPath];
  }

  return fs.readdirSync(absolutePath).flatMap((entry) => {
    const childPath = path.join(targetPath, entry);
    const childStat = fs.statSync(path.join(ROOT, childPath));

    if (childStat.isDirectory()) {
      return walkFiles(childPath);
    }

    return /\.(ts|tsx)$/u.test(entry) ? [childPath] : [];
  });
}

const files = [
  ...REGISTERED_APPS.flatMap((app) => walkFiles(`apps/${app}/src`)),
  ...walkFiles('packages/satellite/src'),
].filter((filePath, index, all) => all.indexOf(filePath) === index);

const failures = [];

for (const filePath of files) {
  const source = fs.readFileSync(path.join(ROOT, filePath), 'utf8');

  for (const { allowedFiles, pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(source) && !allowedFiles?.has(filePath)) {
      failures.push(`${filePath}: ${message}`);
    }
  }
}

const verifierSource = fs.readFileSync(
  path.join(ROOT, 'packages/auth/src/cross-app/index.ts'),
  'utf8'
);
const crossAppServerSource = fs.readFileSync(
  path.join(ROOT, 'packages/auth/src/cross-app/server.ts'),
  'utf8'
);
const cliVerifySource = fs.readFileSync(
  path.join(ROOT, 'apps/web/src/legacy-api-routes/cli/auth/verify/route.ts'),
  'utf8'
);
const cliRefreshSource = fs.readFileSync(
  path.join(ROOT, 'apps/web/src/legacy-api-routes/cli/auth/refresh/route.ts'),
  'utf8'
);
const hiveSharedPath = 'apps/hive/src/app/api/v1/hive/_shared.ts';
const hiveSharedSource = fs.readFileSync(
  path.join(ROOT, hiveSharedPath),
  'utf8'
);
const internalApiClientSource = fs.readFileSync(
  path.join(ROOT, 'packages/internal-api/src/client.ts'),
  'utf8'
);
const appSessionSource = fs.readFileSync(
  path.join(ROOT, 'packages/auth/src/app-session.ts'),
  'utf8'
);
const authIndexSource = fs.readFileSync(
  path.join(ROOT, 'packages/auth/src/index.ts'),
  'utf8'
);
const supabaseServerSource = fs.readFileSync(
  path.join(ROOT, 'packages/supabase/src/next/server.ts'),
  'utf8'
);
const webApiAuthSource = fs.readFileSync(
  path.join(ROOT, 'apps/web/src/lib/api-auth.ts'),
  'utf8'
);

if (/supabase\.auth\.setSession/u.test(verifierSource)) {
  failures.push(
    'packages/auth/src/cross-app/index.ts: Shared verifier must trust the HttpOnly app-session cookie instead of setting Supabase sessions.'
  );
}

if (/sessionKind:\s*['"]supabase['"]/u.test(cliVerifySource)) {
  failures.push(
    'apps/web/src/legacy-api-routes/cli/auth/verify/route.ts: CLI login must return Tuturuuu-managed app-session JWTs, not Supabase Auth sessions.'
  );
}

if (/createDetachedClient|auth\.refreshSession/u.test(cliRefreshSource)) {
  failures.push(
    'apps/web/src/legacy-api-routes/cli/auth/refresh/route.ts: CLI refresh must rotate Tuturuuu-managed JWTs instead of calling Supabase Auth refresh.'
  );
}

if (/generateLink|verifyOtp|createDetachedClient/u.test(crossAppServerSource)) {
  failures.push(
    'packages/auth/src/cross-app/server.ts: Cross-app verification must not mint Supabase sessions with magic links or OTP verification.'
  );
}

const hiveAppSessionIndex = hiveSharedSource.indexOf('verifyAppSessionToken');
const hiveSupabaseUserIndex = hiveSharedSource.indexOf('supabase.auth.getUser');

if (
  hiveAppSessionIndex === -1 ||
  !/targetApp:\s*['"]hive['"]/u.test(hiveSharedSource)
) {
  failures.push(
    `${hiveSharedPath}: Hive gateway APIs must resolve Tuturuuu app-session JWTs for target app hive.`
  );
}

if (
  hiveSupabaseUserIndex !== -1 &&
  (hiveAppSessionIndex === -1 || hiveSupabaseUserIndex < hiveAppSessionIndex)
) {
  failures.push(
    `${hiveSharedPath}: Hive gateway APIs must check Tuturuuu app-session auth before Supabase Auth fallback.`
  );
}

if (
  !/createAdminClient\(\{\s*noCookie:\s*true\s*\}\)/u.test(hiveSharedSource)
) {
  failures.push(
    `${hiveSharedPath}: Hive admin checks must use noCookie admin clients for app-session requests.`
  );
}

if (
  !/tuturuuu_app_session/u.test(internalApiClientSource) ||
  !/sanitizeForwardedCookieHeader/u.test(internalApiClientSource) ||
  !/SUPABASE_AUTH_COOKIE_PATTERN/u.test(internalApiClientSource)
) {
  failures.push(
    'packages/internal-api/src/client.ts: Forwarded app-session internal API auth must strip Supabase auth cookies.'
  );
}

if (
  !/SUPABASE_AUTH_COOKIE_PATTERN/u.test(appSessionSource) ||
  !/clearSupabaseAuthCookies/u.test(appSessionSource)
) {
  failures.push(
    'packages/auth/src/app-session.ts: Registered apps must share app-session Supabase auth cookie cleanup.'
  );
}

if (
  /@tuturuuu\/supabase\/next\/server/u.test(appSessionSource) ||
  /getSupabaseSessionUser/u.test(appSessionSource)
) {
  failures.push(
    'packages/auth/src/app-session.ts: Public app-session exports must not import Supabase server helpers that depend on next/headers.'
  );
}

if (/\bsupabase-session-user\b/u.test(authIndexSource)) {
  failures.push(
    'packages/auth/src/index.ts: Server-only Supabase session helpers must not be exported from the @tuturuuu/auth root entry.'
  );
}

const registeredProxyPaths = [
  'apps/calendar/src/proxy.ts',
  'apps/cms/src/proxy.ts',
  'apps/drive/src/proxy.ts',
  'apps/finance/src/proxy.ts',
  'apps/hive/src/proxy.ts',
  'apps/inventory/src/proxy.ts',
  'apps/storefront/src/proxy.ts',
  'apps/learn/src/proxy.ts',
  'apps/mind/src/proxy.ts',
  'apps/nova/src/proxy.ts',
  'apps/pay/src/proxy.ts',
  'apps/rewise/src/proxy.ts',
  'apps/tasks/src/proxy.ts',
  'apps/teach/src/proxy.ts',
  'apps/track/src/proxy.ts',
];

for (const proxyPath of registeredProxyPaths) {
  const proxySource = fs.readFileSync(path.join(ROOT, proxyPath), 'utf8');
  if (!/clearSupabaseAuthCookies/u.test(proxySource)) {
    failures.push(
      `${proxyPath}: Registered app proxies must expire stale Supabase auth cookies when using app-session auth.`
    );
  }
}

const registeredAppConstantPaths = [
  ['apps/calendar/src/constants/common.ts', REGISTERED_APP_TARGETS.calendar],
  ['apps/cms/src/constants/common.ts', REGISTERED_APP_TARGETS.cms],
  ['apps/drive/src/constants/common.ts', REGISTERED_APP_TARGETS.drive],
  ['apps/finance/src/constants/common.ts', REGISTERED_APP_TARGETS.finance],
  ['apps/hive/src/constants/common.ts', REGISTERED_APP_TARGETS.hive],
  ['apps/inventory/src/constants/common.ts', REGISTERED_APP_TARGETS.inventory],
  [
    'apps/storefront/src/constants/common.ts',
    REGISTERED_APP_TARGETS.storefront,
  ],
  ['apps/learn/src/constants/common.ts', REGISTERED_APP_TARGETS.learn],
  ['apps/mind/src/constants/common.ts', REGISTERED_APP_TARGETS.mind],
  ['apps/nova/src/constants/common.ts', REGISTERED_APP_TARGETS.nova],
  ['apps/pay/src/constants/common.ts', REGISTERED_APP_TARGETS.pay],
  ['apps/rewise/src/constants/common.ts', REGISTERED_APP_TARGETS.rewise],
  ['apps/tasks/src/constants/common.ts', REGISTERED_APP_TARGETS.tasks],
  ['apps/teach/src/constants/common.ts', REGISTERED_APP_TARGETS.teach],
  ['apps/track/src/constants/common.ts', REGISTERED_APP_TARGETS.track],
];

for (const [constantPath, appName] of registeredAppConstantPaths) {
  const constantsSource = fs.readFileSync(
    path.join(ROOT, constantPath),
    'utf8'
  );

  if (!/resolveInternalAppUrl/u.test(constantsSource)) {
    failures.push(
      `${constantPath}: Registered app URL constants must reject generic env URLs that point at another internal app.`
    );
  }

  if (
    !new RegExp(`appName:\\s*['"]${appName}['"]`, 'u').test(constantsSource)
  ) {
    failures.push(
      `${constantPath}: Registered app URL constants must resolve the app host for target ${appName}.`
    );
  }

  if (
    /process\.env\.(?:BASE_URL|TTR_URL|API_URL)\s*\|\|\s*(?:process\.env\.NODE_ENV\s*===\s*['"]production['"]|PROD_MODE)/u.test(
      constantsSource
    )
  ) {
    failures.push(
      `${constantPath}: Registered app URL constants must not rely on ||/?: auth-origin precedence.`
    );
  }
}

const internalDomainsSource = fs.readFileSync(
  path.join(ROOT, 'packages/utils/src/internal-domains.ts'),
  'utf8'
);

if (
  !/name:\s*['"]calendar['"],\s*url:\s*['"]http:\/\/localhost:7806['"]/su.test(
    internalDomainsSource
  )
) {
  failures.push(
    'packages/utils/src/internal-domains.ts: Calendar dev auth return URLs must use the app dev port 7806.'
  );
}

if (
  !/requestHasAppSessionAuth/u.test(supabaseServerSource) ||
  !/createNoCookieAnonProxyClient/u.test(supabaseServerSource)
) {
  failures.push(
    'packages/supabase/src/next/server.ts: App-session requests must not fall back to Supabase cookie-backed clients.'
  );
}

for (const app of REGISTERED_APPS) {
  const targetApp = REGISTERED_APP_TARGETS[app];
  const verifierPath = `apps/${app}/src/app/api/auth/verify-app-token/route.ts`;
  const verifierAbsolutePath = path.join(ROOT, verifierPath);

  if (!fs.existsSync(verifierAbsolutePath)) {
    failures.push(
      `${verifierPath}: Registered apps must expose a local cross-app token verifier.`
    );
    continue;
  }

  const verifierRouteSource = fs.readFileSync(verifierAbsolutePath, 'utf8');

  if (
    !new RegExp(`createPOST\\(['"]${targetApp}['"]`, 'u').test(
      verifierRouteSource
    )
  ) {
    failures.push(
      `${verifierPath}: Cross-app verifier must mint app-session cookies for target app ${targetApp}.`
    );
  }

  if (
    !/verificationBaseUrl:\s*(?:WEB_APP_URL|TTR_URL)/u.test(verifierRouteSource)
  ) {
    failures.push(
      `${verifierPath}: Cross-app verifier must delegate token validation to the central Web verifier so the Web-issued app-session cookie is set.`
    );
  }
}

const tasksSourceFiles = walkFiles('apps/tasks/src');
for (const filePath of tasksSourceFiles) {
  const source = fs.readFileSync(path.join(ROOT, filePath), 'utf8');

  if (/targetApp:\s*['"]tudo['"]/u.test(source)) {
    failures.push(
      `${filePath}: Tasks app-session target must use the registered app name "tasks", not the legacy app name "tudo".`
    );
  }
}

const withSessionAuthStart = webApiAuthSource.indexOf(
  'export function withSessionAuth'
);
const withSessionAuthSource =
  withSessionAuthStart === -1
    ? ''
    : webApiAuthSource.slice(withSessionAuthStart);
const appSessionAuthIndex = withSessionAuthSource.indexOf(
  'allowAppSessionAuth'
);
const fallbackSupabaseIndex = withSessionAuthSource.indexOf(
  'const supabase = (await createClient(request))'
);

if (
  appSessionAuthIndex === -1 ||
  fallbackSupabaseIndex === -1 ||
  fallbackSupabaseIndex < appSessionAuthIndex
) {
  failures.push(
    'apps/web/src/lib/api-auth.ts: withSessionAuth must resolve app-session JWTs before creating Supabase request clients.'
  );
}

const appSessionAwareWebRoutes = [
  'apps/web/src/legacy-api-routes/v1/ai/chats/route.ts',
  'apps/web/src/legacy-api-routes/v1/ai/chats/[chatId]/route.ts',
  'apps/web/src/legacy-api-routes/v1/cms/workspaces/route.ts',
  'apps/web/src/legacy-api-routes/v1/nova/me/team/route.ts',
];

for (const routePath of appSessionAwareWebRoutes) {
  const routeSource = fs.readFileSync(path.join(ROOT, routePath), 'utf8');
  if (!/withSessionAuth/u.test(routeSource)) {
    failures.push(
      `${routePath}: Registered app internal API routes must use the shared session auth wrapper.`
    );
  }
  if (!/allowAppSessionAuth:\s*true/u.test(routeSource)) {
    failures.push(
      `${routePath}: Registered app internal API routes must opt into Tuturuuu app-session auth.`
    );
  }
}

const rewiseNewChatRouteSource = fs.readFileSync(
  path.join(ROOT, 'apps/rewise/src/app/api/ai/chat/google/new/route.ts'),
  'utf8'
);

if (
  !/resolveGatewayAuth/u.test(rewiseNewChatRouteSource) ||
  !/targetApp:\s*['"]rewise['"]/u.test(rewiseNewChatRouteSource)
) {
  failures.push(
    'apps/rewise/src/app/api/ai/chat/google/new/route.ts: Rewise chat creation must verify app-session tokens for target app rewise.'
  );
}

if (failures.length > 0) {
  console.error('Internal app auth guard failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Registered app sources use Tuturuuu app-session auth.');
