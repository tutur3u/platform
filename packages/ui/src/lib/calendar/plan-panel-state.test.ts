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

  it('stays host-only at Path=/ on a subdomain host', () => {
    expect(planPanelCookie(true, '')).toBe(
      'calendar-plan-panel=open; Path=/; Max-Age=31536000; SameSite=Lax'
    );
  });

  it('scopes to the mount path with Secure on a mounted app', () => {
    const cookie = planPanelCookie(false, '/calendar');
    expect(cookie).toContain('Path=/calendar; Secure');
    expect(cookie).not.toContain('Path=/;');
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('detects the mounted base declared by the app', () => {
    const scope = globalThis as Record<string, unknown>;
    scope.__tuturuuuAppBase = '/calendar';
    try {
      expect(planPanelCookie(true)).toContain('Path=/calendar; Secure');
    } finally {
      delete scope.__tuturuuuAppBase;
    }
    expect(planPanelCookie(true)).toContain('Path=/;');
  });

  it('round-trips through the browser cookie', () => {
    expect(readPlanPanelOpenFromDocument()).toBe(false);
    document.cookie = planPanelCookie(true, '');
    expect(readPlanPanelOpenFromDocument()).toBe(true);
    document.cookie = planPanelCookie(false, '');
    expect(readPlanPanelOpenFromDocument()).toBe(false);
  });
});
