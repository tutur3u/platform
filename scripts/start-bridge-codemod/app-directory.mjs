import { readFileSync } from 'node:fs';

// App keys whose directory under apps/ differs from the key (for example the
// infrastructure key lives in apps/admin). Runtime identities keep the key.
const APP_DIRECTORIES = JSON.parse(
  readFileSync(new URL('../app-directories.json', import.meta.url), 'utf8')
);

/** The directory name under apps/ for an app key. */
export function appDirectory(app) {
  const directory = APP_DIRECTORIES[app];
  return typeof directory === 'string' && app !== '$comment' ? directory : app;
}
