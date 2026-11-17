// Invalid committed records fail during ESM import, before the publisher can
// write a stage stop receipt. CI imports this module to enforce the boundary.
export class VercelConfigError extends Error {
  constructor() {
    super('Invalid Vercel config');
    this.guardCode = 'VERCEL_CONFIG_INVALID';
    this.phase = 'config-import';
  }
}

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
    throw new VercelConfigError();
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
  const prefix = app?.replaceAll('-', '_').toUpperCase() + '_';
  const inputs = [value.sourceShaEnv, value.aliasPreimageEnv];
  if (
    !app ||
    !/^VERCEL_[A-Z0-9_]+_PROJECT_ID$/u.test(value.projectSecretName) ||
    inputs[0] === inputs[1] ||
    inputs.some(
      (key) => !key.startsWith(prefix) || /_(TOKEN|SECRET|KEY)$/u.test(key)
    ) ||
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
