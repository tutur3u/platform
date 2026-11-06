// The six apps programming-app-builds.yaml covers, by turbo package suffix (@tuturuuu/<name>).
// Input is the affected-apps JSON (SELECTION env). Output is the programming app list.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PROGRAMMING_APPS = ['web', 'learn', 'infrastructure', 'mail', 'contacts', 'tasks'];

export function selectProgrammingApps(selection) {
  if (!selection || typeof selection !== 'object' || !Array.isArray(selection.apps)) {
    throw new Error('affected-apps selection must include an apps array');
  }
  const names = selection.apps.map((dir) => String(dir).replace(/^apps\//, ''));
  if (selection.mode === 'all') return [...PROGRAMMING_APPS];
  return PROGRAMMING_APPS.filter((name) => names.includes(name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const selection = JSON.parse(process.env.SELECTION ?? '');
  const apps = selectProgrammingApps(selection);
  // Empty affected output is suspicious only when code changed and the calculator
  // returned no workspaces. A change outside these six apps selects nothing.
  const codeChanged = process.env.CODE_CHANGED === 'true' && selection.mode !== 'all' && selection.apps.length === 0;
  const body = `mode=${selection.mode}\napps=${JSON.stringify(apps)}\ncode_changed=${codeChanged}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, body);
  process.stdout.write(`${JSON.stringify(apps)}\n`);
}
