// Builds a disposable miniature repository for codemod tests. Fixtures are
// written at test time so they never enter lint, type-check or guard scans.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** Repository files copied verbatim so edits run against real anchors. */
export const REAL_FILES = [
  'tuturuuu.ci.ts',
  'biome.json',
  'scripts/ci/production-publication-policy.ts',
  'scripts/ci/production-publication-policy.test.js',
];

/** A Vercel production workflow shaped like the real per-app publishers. */
export const VERCEL_WORKFLOW = [
  'name: Vercel Demo Production Deployment',
  'jobs:',
  '  Deploy-Production:',
  "    if: github.ref == 'refs/heads/production'",
  '    environment: vercel-production-demo',
  '    runs-on: ubuntu-latest',
  '',
].join('\n');

export const DEMO_FILES = {
  'package.json': `${JSON.stringify(
    {
      name: '@tuturuuu/demo',
      private: true,
      scripts: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion
        'dev:app': 'next dev -p ${PORT:-7899} --turbopack',
        build: 'next build --turbopack',
      },
      dependencies: { next: '^16.4.0', react: '^19.2.8' },
    },
    null,
    2
  )}\n`,
  'src/proxy.ts': 'export async function proxy() {}\n',
  'tsconfig.json': `${JSON.stringify({ include: ['src'], exclude: ['node_modules'] }, null, 2)}\n`,
  'src/i18n/routing.ts': "export const defaultLocale = 'vi' as const;\n",
  'src/app/[locale]/layout.tsx':
    "import type { Metadata } from 'next';\nimport { Providers } from '@/components/providers';\nexport default function Layout({ children }) { return <Providers>{children}</Providers>; }\n",
  'src/components/providers.tsx':
    "'use client';\nimport Link from 'next/link';\nexport function Providers({ children }) { return <>{children}</>; }\n",
  'src/app/[locale]/page.tsx':
    "import { getTranslations } from 'next-intl/server';\nexport default async function Page() { return null; }\n",
  'src/app/[locale]/notes/page.tsx':
    "import { NoteForm } from './note-form';\nexport default function Page() { return <NoteForm />; }\n",
  'src/app/[locale]/notes/note-form.tsx':
    "'use client';\nimport { saveNote } from './actions';\nexport function NoteForm() { return <form action={saveNote} />; }\n",
  'src/app/[locale]/notes/actions.ts':
    "'use server';\nexport async function saveNote() {}\n",
  'src/app/[locale]/og/page.tsx':
    "import { ImageResponse } from 'next/og';\nimport type { NextPage } from 'next/types';\nexport default function Page() { return null; }\n",
  'src/app/api/build-info/route.ts':
    'export function GET() { return Response.json({}); }\n',
  'public/favicon.ico': 'icon',
  'public/robots.txt': 'User-agent: *\n',
};

export function writeTree(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

export function createFixtureRepo(t, app = 'demo', files = DEMO_FILES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-bridge-codemod-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relative of REAL_FILES) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, relative), target);
  }
  writeTree(path.join(root, 'apps', app), files);
  writeTree(root, {
    [`.github/workflows/vercel-production-${app}.yaml`]: VERCEL_WORKFLOW,
  });
  return root;
}

/** Deterministic stand-in for the bridge's `planRegistries`. */
export function fakeCodegen(errors = []) {
  return (appRoot, config) => ({
    errors,
    generated: [
      { path: config.api.out, content: `// api ${path.basename(appRoot)}\n` },
      {
        path: config.pages.out,
        content: `// pages ${path.basename(appRoot)}\n`,
      },
    ],
  });
}
