import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const calendarDirectory = fileURLToPath(
  new URL('../../apps/calendar', import.meta.url)
);

export function calendarFixture(t, prefix, workspace = calendarDirectory) {
  const parent = join(workspace, 'tmp');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
