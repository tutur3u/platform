import { describe, expect, it } from 'vitest';
import {
  auditCalendarGatewayFirewall,
  CALENDAR_GATEWAY_PATH_PATTERN,
  CALENDAR_GATEWAY_RULE_NAME,
  LEGACY_CALENDAR_GATEWAY_PATH_PATTERN,
} from './firewall-policy';

const credential = 'synthetic-private-credential-'.padEnd(43, 'x');
function config(pattern = LEGACY_CALENDAR_GATEWAY_PATH_PATTERN) {
  return {
    active: {
      firewallEnabled: true,
      rules: [
        {
          name: CALENDAR_GATEWAY_RULE_NAME,
          active: true,
          action: { mitigate: { action: 'bypass' } },
          conditionGroup: [
            {
              conditions: [
                { type: 'path', op: 're', value: pattern },
                {
                  type: 'header',
                  op: 'eq',
                  key: 'x-tuturuuu-calendar-gateway',
                  value: credential,
                },
              ],
            },
          ],
        },
      ],
    },
    draft: null,
  };
}

describe('native Calendar hosting exception', () => {
  it('reproduces the live rule gap for both initial reads and saves without revealing the credential', () => {
    const result = auditCalendarGatewayFirewall(config());
    expect(result.coverage).toHaveLength(2);
    for (const path of result.coverage) {
      expect(path.current).toBe(false);
      expect(path.proposed).toBe(true);
    }
    expect(JSON.stringify(result)).not.toContain(credential);
    expect(result.credentialMatchPreserved).toBe(true);
  });

  it('accepts the corrected exact settings paths and preserves existing native/cron paths', () => {
    const result = auditCalendarGatewayFirewall(
      config(CALENDAR_GATEWAY_PATH_PATTERN)
    );
    expect(result.coverage.every((path) => path.current)).toBe(true);
    const regex = new RegExp(CALENDAR_GATEWAY_PATH_PATTERN);
    for (const path of [
      '/api/v1/calendar/connections',
      '/api/v1/workspaces/ws/calendar/events',
      '/api/cron/calendar/provider-sync',
      '/api/cron/calendar/smart-schedule',
    ]) {
      expect(regex.test(path)).toBe(true);
    }
    for (const path of [
      '/api/v1/users/calendar-settings/extra',
      '/api/v1/workspaces/ws/calendar-settings/extra',
      '/api/v1/users/me',
      '/api/cron/calendar/other',
    ]) {
      expect(regex.test(path)).toBe(false);
    }
  });

  it('audits the gateway rule alongside unrelated rules it does not model', () => {
    const policy = config();
    (policy.active.rules as unknown[]).push({
      name: 'Unrelated country block',
      active: true,
      action: { mitigate: { action: 'deny' } },
      conditionGroup: [
        {
          conditions: [{ type: 'geo_country', op: 'inc', value: ['AA', 'BB'] }],
        },
      ],
    });
    expect(auditCalendarGatewayFirewall(policy).rule).toBe(
      CALENDAR_GATEWAY_RULE_NAME
    );
  });

  it('refuses a missing credential condition or a concurrent unpublished draft', () => {
    const missing = config();
    missing.active.rules[0]!.conditionGroup[0]!.conditions.pop();
    expect(() => auditCalendarGatewayFirewall(missing)).toThrow('unexpected');
    expect(() =>
      auditCalendarGatewayFirewall({ ...config(), draft: {} })
    ).toThrow('unexpected');
  });
});
