import { stop } from './calendar-exact-sha-stop.mjs';

const fields = [
  'appDirectory',
  'productionAlias',
  'supabaseHost',
  'buildCommand',
  'projectSecretName',
  'stageEnvironment',
  'sourceShaEnv',
  'aliasPreimageEnv',
  'cliVersion',
];
const host = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u;
const name = /^[A-Z][A-Z0-9_]*$/u;

export function validateVercelSection(value) {
  const fail = () => {
    throw stop('BUILD_RECIPE_NOT_LEGACY', 'Invalid Vercel config');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  if (
    Object.keys(value).length !== fields.length ||
    fields.some(
      (key) => !Object.hasOwn(value, key) || typeof value[key] !== 'string'
    )
  )
    fail();
  const app = /^apps\/([a-z][a-z0-9-]*)$/u.exec(value.appDirectory)?.[1];
  if (
    !app ||
    !host.test(value.productionAlias) ||
    !host.test(value.supabaseHost) ||
    value.stageEnvironment !== `vercel-stage-${app}` ||
    ![
      value.projectSecretName,
      value.sourceShaEnv,
      value.aliasPreimageEnv,
    ].every((v) => name.test(v)) ||
    value.cliVersion !== '59.25.0' ||
    !value.buildCommand ||
    /[\r\n\0]/u.test(value.buildCommand)
  )
    fail();
  return Object.freeze({ ...value });
}

export const CALENDAR_VERCEL = validateVercelSection({
  appDirectory: 'apps/calendar',
  productionAlias: 'calendar.tuturuuu.com',
  supabaseHost: 'nzamlzqfdwaaxdefwraj.supabase.co',
  buildCommand:
    "cd ../.. && bun turbo:local run build --filter='@tuturuuu/calendar^...' && bun run --cwd apps/calendar build:legacy",
  projectSecretName: 'VERCEL_CALENDAR_PROJECT_ID',
  stageEnvironment: 'vercel-stage-calendar',
  sourceShaEnv: 'CALENDAR_MAIN_SHA',
  aliasPreimageEnv: 'CALENDAR_ALIAS_PREIMAGE',
  cliVersion: '59.25.0',
});
