const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_LOCALE = 'en';
const MANIFEST_PATH = path.join(
  ROOT_DIR,
  'apps/tanstack-web/migration/route-manifest.json'
);
const PUBLIC_SPEC_PATH = path.join(
  ROOT_DIR,
  'apps/web/e2e/public-marketing-routes.noauth.spec.ts'
);

const TANSTACK_ROOT_REDIRECT_PATHS = [
  '/pricing',
  '/products/meet-together',
  '/qr-generator',
  '/tools/random',
];

const AUTH_GATED_MARKETING_ROUTE_PATHS = new Set([
  '/:locale/account/delete',
  '/:locale/logout',
  '/:locale/users/:handle',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isMigratedPublicTanStackPage(route) {
  if (
    route.kind !== 'page' ||
    route.status !== 'migrated' ||
    route.targetOwner !== 'tanstack-start'
  ) {
    return false;
  }

  const sourceFile = route.sourceFile ?? '';

  if (sourceFile.includes('/(auth)/') || sourceFile.includes('/(dashboard)/')) {
    return false;
  }

  if (AUTH_GATED_MARKETING_ROUTE_PATHS.has(route.routePath)) {
    return false;
  }

  return (
    route.routePath === '/~offline' ||
    sourceFile.includes('/(marketing)/') ||
    sourceFile.startsWith('apps/web/src/app/[locale]/ui/')
  );
}

function coverageExamplesForRoute(routePath) {
  if (routePath === '/~offline') {
    return ['/~offline'];
  }

  if (routePath === '/:locale') {
    return [`/${DEFAULT_LOCALE}`];
  }

  if (routePath === '/:locale/calendar/meet-together/*slug?') {
    return [
      `/${DEFAULT_LOCALE}/calendar/meet-together`,
      `/${DEFAULT_LOCALE}/calendar/meet-together/plans/summer`,
    ];
  }

  if (routePath === '/:locale/changelog/:slug') {
    return [`/${DEFAULT_LOCALE}/changelog/__e2e_missing_changelog_slug__`];
  }

  if (routePath === '/:locale/ai/chats/:chatId') {
    return [`/${DEFAULT_LOCALE}/ai/chats/__e2e_missing_chat_id__`];
  }

  if (routePath === '/:locale/documents/:documentId') {
    return [`/${DEFAULT_LOCALE}/documents/__e2e_missing_document_id__`];
  }

  if (routePath === '/:locale/share/:type/:resourceId') {
    return [`/${DEFAULT_LOCALE}/share/course/__e2e_missing_course_id__`];
  }

  if (routePath === '/:locale/share/:type/:resourceId/modules/:moduleId') {
    return [
      `/${DEFAULT_LOCALE}/share/course/__e2e_missing_course_id__/modules/__e2e_missing_module_id__`,
    ];
  }

  if (routePath === '/:locale/ui/components/:componentId') {
    return [`/${DEFAULT_LOCALE}/ui/components/button`];
  }

  const pathWithoutLocale = routePath.replace('/:locale', '');
  if (pathWithoutLocale.includes(':') || pathWithoutLocale.includes('*')) {
    return null;
  }

  return [routePath.replace('/:locale', `/${DEFAULT_LOCALE}`)];
}

function expressionToPathname(expression) {
  const trimmed = expression.trim();
  const quote = trimmed[0];

  if (!['`', '"', "'"].includes(quote) || trimmed.at(-1) !== quote) {
    return null;
  }

  let value = trimmed.slice(1, -1);

  if (quote === '`') {
    value = value.replace(/\$\{DEFAULT_LOCALE\}/gu, DEFAULT_LOCALE);
    if (/\$\{/u.test(value)) {
      return null;
    }
  }

  try {
    return new URL(value, 'https://tanstack-e2e.localhost').pathname;
  } catch {
    return null;
  }
}

function extractCoveredPathnames(specSource) {
  const pathExpressions = [
    /\bpath:\s*([`'"][^`'"\n]+[`'"])/gu,
    /\bpage\.goto\(\s*([`'"][^`'"\n]+[`'"])/gu,
  ];
  const paths = new Set();

  for (const regex of pathExpressions) {
    for (const match of specSource.matchAll(regex)) {
      const pathname = expressionToPathname(match[1]);
      if (pathname) {
        paths.add(pathname);
      }
    }
  }

  return paths;
}

test('migrated public TanStack pages stay represented in no-auth E2E coverage', () => {
  const manifest = readJson(MANIFEST_PATH);
  const specSource = fs.readFileSync(PUBLIC_SPEC_PATH, 'utf8');
  const coveredPathnames = extractCoveredPathnames(specSource);
  const requiredPathnames = new Map();
  const unmappedDynamicRoutes = [];

  const publicRoutes = manifest.routes
    .filter(isMigratedPublicTanStackPage)
    .sort((a, b) => a.routePath.localeCompare(b.routePath));

  for (const route of publicRoutes) {
    const examples = coverageExamplesForRoute(route.routePath);

    if (!examples) {
      unmappedDynamicRoutes.push(route.routePath);
      continue;
    }

    for (const example of examples) {
      const pathname = expressionToPathname(JSON.stringify(example));
      requiredPathnames.set(pathname, route.routePath);
    }
  }

  assert.deepEqual(
    unmappedDynamicRoutes,
    [],
    'Add explicit no-auth E2E examples for new public dynamic migrated routes.'
  );

  for (const pathname of TANSTACK_ROOT_REDIRECT_PATHS) {
    requiredPathnames.set(pathname, 'TanStack root redirect');
  }

  const missingPathnames = [...requiredPathnames.entries()]
    .filter(([pathname]) => !coveredPathnames.has(pathname))
    .map(([pathname, routePath]) => `${pathname} (${routePath})`);

  assert.deepEqual(
    missingPathnames,
    [],
    'Every migrated public TanStack page needs a no-auth Playwright route example.'
  );
});
