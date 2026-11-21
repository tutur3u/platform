import { afterEach, describe, expect, it } from 'vitest';
import {
  PLAN_PANEL_COOKIE_NAME,
  parsePlanPanelOpen,
  planPanelCookie,
  readPlanPanelOpenFromDocument,
} from './plan-panel-state';

afterEach(() => {
  document.cookie = `${PLAN_PANEL_COOKIE_NAME}=; Path=/; Max-Age=0`;
});

describe('plan panel state cookie', () => {
  it('defaults to closed for a missing or unknown value', () => {
    expect(parsePlanPanelOpen(undefined)).toBe(false);
    expect(parsePlanPanelOpen('true')).toBe(false);
    expect(parsePlanPanelOpen('open')).toBe(true);
  });

  it('round-trips through the browser cookie', () => {
    expect(readPlanPanelOpenFromDocument()).toBe(false);
    document.cookie = planPanelCookie(true);
    expect(readPlanPanelOpenFromDocument()).toBe(true);
    document.cookie = planPanelCookie(false);
    expect(readPlanPanelOpenFromDocument()).toBe(false);
  });
});
