import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  type createLocalSupabaseEnv,
  type DevboxSupabaseEnvKey,
  getDevboxSupabaseEnvKeysForApp,
  upsertDevboxEnvContent,
} from '@tuturuuu/devbox';

export interface DevboxSetupEnvTarget {
  app: string;
  keys: DevboxSupabaseEnvKey[];
  path: string;
  status: 'created' | 'unchanged' | 'updated';
}

async function readTextIfExists(pathname: string) {
  try {
    return await readFile(pathname, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function declaresSupabaseEnv(content: string | null) {
  return /\b(?:NEXT_PUBLIC_SUPABASE_|SUPABASE_|DOCKER_INTERNAL_SUPABASE_)/u.test(
    content ?? ''
  );
}

export async function writeLocalSupabaseEnvFiles({
  checkoutDir,
  env,
}: {
  checkoutDir: string;
  env: ReturnType<typeof createLocalSupabaseEnv>;
}) {
  const appsDir = join(checkoutDir, 'apps');
  const entries = await readdir(appsDir, { withFileTypes: true });
  const targets: DevboxSetupEnvTarget[] = [];

  for (const entry of entries.toSorted((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!entry.isDirectory()) continue;

    const appDir = join(appsDir, entry.name);
    const exampleContent = await readTextIfExists(join(appDir, '.env.example'));
    const envLocalPath = join(appDir, '.env.local');
    const envLocalContent = await readTextIfExists(envLocalPath);
    if (
      !declaresSupabaseEnv(exampleContent) &&
      !declaresSupabaseEnv(envLocalContent)
    ) {
      continue;
    }

    const keys = getDevboxSupabaseEnvKeysForApp({
      envLocalContent: envLocalContent ?? '',
      exampleContent: exampleContent ?? '',
    });
    if (keys.length === 0) continue;

    const nextContent = upsertDevboxEnvContent({
      content: envLocalContent ?? '',
      env,
      keys,
    });
    const status =
      envLocalContent === null
        ? 'created'
        : envLocalContent === nextContent
          ? 'unchanged'
          : 'updated';

    if (status !== 'unchanged') {
      await writeFile(envLocalPath, nextContent, { mode: 0o600 });
    }

    targets.push({
      app: entry.name,
      keys,
      path: relative(checkoutDir, envLocalPath),
      status,
    });
  }

  return targets;
}
