#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REGISTERED_APPS = [
  'calendar',
  'cms',
  'finance',
  'hive',
  'learn',
  'nova',
  'rewise',
  'tasks',
  'teach',
  'track',
];
const FORBIDDEN_PATTERNS = [
  {
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

  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(source)) {
      failures.push(`${filePath}: ${message}`);
    }
  }
}

const verifierSource = fs.readFileSync(
  path.join(ROOT, 'packages/auth/src/cross-app/index.ts'),
  'utf8'
);

if (/supabase\.auth\.setSession/u.test(verifierSource)) {
  failures.push(
    'packages/auth/src/cross-app/index.ts: Shared verifier must trust the HttpOnly app-session cookie instead of setting Supabase sessions.'
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
