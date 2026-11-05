import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { calculate } from './affected-apps.mjs';

// Decide whether a per-app workflow's heavy jobs should run.
//
// Only pull_request runs are ever skipped. Every other event (push, deploy,
// workflow_dispatch, ...) and every uncertain case resolves to run=true, so a
// bug here can only cost CI minutes, never hide a build.
export function decide({ eventName, apps, result, appExists = () => true }) {
  if (eventName !== 'pull_request') return { run: true, reason: 'not a pull request' };
  const wanted = String(apps ?? '').split(',').map((app) => app.trim()).filter(Boolean);
  if (wanted.length === 0) return { run: true, reason: 'no app configured' };
  const unknown = wanted.find((app) => !appExists(app));
  if (unknown) return { run: true, reason: `unknown app ${unknown}` };
  if (!result || typeof result !== 'object' || !Array.isArray(result.apps) || (result.mode !== 'all' && result.mode !== 'affected')) {
    return { run: true, reason: 'affected app calculation returned an invalid result' };
  }
  if (result.mode === 'all') return { run: true, reason: `all apps selected: ${result.reason ?? 'fail-safe'}` };
  const hit = wanted.find((app) => result.apps.includes(`apps/${app}`));
  return hit ? { run: true, reason: `${hit} affected` } : { run: false, reason: `${wanted.join(',')} not affected` };
}

function fetchBase(baseRef, cwd) {
  execFileSync('git', ['fetch', '--no-tags', '--quiet', 'origin', `${baseRef}:refs/remotes/origin/${baseRef}`], {
    cwd, stdio: 'ignore', timeout: 120_000,
  });
}

export function gate(env = process.env, { cwd = process.cwd() } = {}) {
  try {
    const eventName = env.EVENT_NAME ?? '';
    if (eventName !== 'pull_request') return decide({ eventName, apps: env.APP });
    const baseRef = env.BASE_REF;
    if (!baseRef) return { run: true, reason: 'base ref missing' };
    fetchBase(baseRef, cwd);
    const result = calculate({ base: `origin/${baseRef}`, cwd });
    return decide({
      eventName,
      apps: env.APP,
      result,
      appExists: (app) => /^[A-Za-z0-9_.-]+$/u.test(app) && existsSync(path.join(cwd, 'apps', app, 'package.json')),
    });
  } catch (error) {
    return { run: true, reason: `gate error: ${String(error?.message ?? error).split('\n')[0].slice(0, 160)}` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let decision;
  try { decision = gate(); } catch { decision = { run: true, reason: 'gate error' }; }
  const reason = decision.reason.replace(/[\r\n]+/gu, ' ');
  console.log(`affected-gate: run=${decision.run} (${reason})`);
  try {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\nreason=${reason}\n`);
  } catch { /* output failure falls back to the action's default */ }
}
