import { z } from 'zod';

export const CALENDAR_GATEWAY_RULE_NAME =
  'Authenticated native Calendar gateway';
export const LEGACY_CALENDAR_GATEWAY_PATH_PATTERN =
  '^/api/(v1/(workspaces/[^/]+/calendar|calendar)(/|$)|cron/calendar/(provider-sync|smart-schedule)$)';
export const CALENDAR_GATEWAY_PATH_PATTERN =
  '^/api/(v1/(workspaces/[^/]+/calendar|calendar)(/|$)|v1/(users/calendar-settings|workspaces/[a-zA-Z0-9_-]+/calendar-settings)$|cron/calendar/(provider-sync|smart-schedule)$)';

const conditionSchema = z.object({
  type: z.string(),
  op: z.string(),
  value: z.string(),
  key: z.string().optional(),
  neg: z.boolean().optional(),
});
const ruleSchema = z.object({
  name: z.string(),
  active: z.boolean(),
  action: z.object({ mitigate: z.object({ action: z.string() }) }),
  conditionGroup: z.array(z.object({ conditions: z.array(conditionSchema) })),
});
const namedRuleSchema = z.object({ name: z.string() }).passthrough();
const configSchema = z.object({
  active: z.object({
    firewallEnabled: z.boolean(),
    rules: z.array(z.unknown()),
  }),
  draft: z.unknown().nullish(),
});

/** Returns only public policy facts; the credential never leaves this parser. */
export function auditCalendarGatewayFirewall(input: unknown) {
  try {
    const config = configSchema.parse(input);
    if (!config.active.firewallEnabled || config.draft != null)
      throw new Error();
    // Select the gateway rule before validating its shape: unrelated rules may
    // use condition forms (e.g. array-valued `inc`) this audit does not model.
    const candidates = config.active.rules.filter(
      (rule) =>
        namedRuleSchema.safeParse(rule).data?.name ===
        CALENDAR_GATEWAY_RULE_NAME
    );
    if (candidates.length !== 1) throw new Error();
    const rule = ruleSchema.parse(candidates[0]);
    if (
      !rule.active ||
      rule.action.mitigate.action !== 'bypass' ||
      rule.conditionGroup.length !== 1
    )
      throw new Error();
    const conditions = rule.conditionGroup[0]!.conditions;
    const path = conditions.find((item) => item.type === 'path');
    const credential = conditions.find((item) => item.type === 'header');
    if (
      conditions.length !== 2 ||
      !path ||
      path.op !== 're' ||
      path.neg ||
      !credential ||
      credential.op !== 'eq' ||
      credential.neg ||
      credential.key !== 'x-tuturuuu-calendar-gateway' ||
      !/^[a-zA-Z0-9_-]{43,}$/.test(credential.value) ||
      ![
        LEGACY_CALENDAR_GATEWAY_PATH_PATTERN,
        CALENDAR_GATEWAY_PATH_PATTERN,
      ].includes(path.value)
    )
      throw new Error();
    const current = new RegExp(path.value);
    const proposed = new RegExp(CALENDAR_GATEWAY_PATH_PATTERN);
    const preferences = [
      '/api/v1/users/calendar-settings',
      '/api/v1/workspaces/workspace-1/calendar-settings',
    ];
    return {
      rule: CALENDAR_GATEWAY_RULE_NAME,
      currentPathPattern: path.value,
      proposedPathPattern: CALENDAR_GATEWAY_PATH_PATTERN,
      credentialMatchPreserved: true,
      coverage: preferences.map((pathname) => ({
        pathname,
        current: current.test(pathname),
        proposed: proposed.test(pathname),
      })),
    };
  } catch {
    throw new Error(
      'Firewall policy is unavailable or unexpected; inspect it privately before changing it.'
    );
  }
}
