import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { affectedResult, planFromEnv } from './ci-plan.mjs';

// Decide whether a per-app workflow's heavy jobs should run.
//
// Pull requests and pushes to main can skip when the diff plan is certain and
// the app is absent. Every other event, a missing base, and every uncertain
// plan resolve to run=true, so a bug here can only cost CI minutes.
export function decide({
  eventName,
  ref,
  apps,
  result,
  appExists = () => true,
}) {
  const mainPush = eventName === 'push' && ref === 'refs/heads/main';
  if (eventName !== 'pull_request' && !mainPush)
    return { run: true, reason: 'not a pull request' };
  const wanted = String(apps ?? '')
    .split(',')
    .map((app) => app.trim())
    .filter(Boolean);
  if (wanted.length === 0) return { run: true, reason: 'no app configured' };
  const unknown = wanted.find((app) => !appExists(app));
  if (unknown) return { run: true, reason: `unknown app ${unknown}` };
  if (
    !result ||
    typeof result !== 'object' ||
    !Array.isArray(result.apps) ||
    result.apps.some(
      (app) => typeof app !== 'string' || !/^apps\/[A-Za-z0-9_.-]+$/u.test(app)
    ) ||
    (result.mode !== 'all' && result.mode !== 'affected')
  ) {
    return {
      run: true,
      reason: 'affected app calculation returned an invalid result',
    };
  }
  if (result.mode === 'all')
    return {
      run: true,
      reason: `all apps selected: ${result.reason ?? 'fail-safe'}`,
    };
  const hit = wanted.find((app) => result.apps.includes(`apps/${app}`));
  return hit
    ? { run: true, reason: `${hit} affected` }
    : { run: false, reason: `${wanted.join(',')} not affected` };
}

export function gate(
  env = process.env,
  { cwd = process.cwd(), extraEdges } = {}
) {
  try {
    const eventName = env.EVENT_NAME ?? '';
    const ref = env.REF ?? '';
    const mainPush = eventName === 'push' && ref === 'refs/heads/main';
    if (eventName !== 'pull_request' && !mainPush)
      return decide({ eventName, ref, apps: env.APP });
    const result = affectedResult(planFromEnv(env, { cwd, extraEdges }));
    return decide({
      eventName,
      ref,
      apps: env.APP,
      result,
      appExists: (app) =>
        /^[A-Za-z0-9_.-]+$/u.test(app) &&
        existsSync(path.join(cwd, 'apps', app, 'package.json')),
    });
  } catch (error) {
    return {
      run: true,
      reason: `gate error: ${String(error?.message ?? error)
        .split('\n')[0]
        .slice(0, 160)}`,
    };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let decision;
  try {
    decision = gate();
  } catch {
    decision = { run: true, reason: 'gate error' };
  }
  const reason = decision.reason.replace(/[\r\n]+/gu, ' ');
  console.log(`affected-gate: run=${decision.run} (${reason})`);
  try {
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `run=${decision.run}\nreason=${reason}\n`
      );
  } catch {
    /* output failure falls back to the action's default */
  }
}
