import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_NOTIFICATION_TYPES } from './notification-utils';

const appsRoot = path.resolve(__dirname, '../../../..');

type Bundle = {
  notifications?: {
    settings?: { events?: Record<string, string> };
    types?: Record<string, string>;
  };
};

function readBundle(app: string, locale: 'en' | 'vi') {
  try {
    return JSON.parse(
      readFileSync(
        path.join(appsRoot, app, 'messages', `${locale}.json`),
        'utf8'
      )
    ) as Bundle;
  } catch {
    return null;
  }
}

/** Active apps whose bundles render notification types and preferences. */
const notificationApps = readdirSync(appsRoot).filter((app) => {
  const bundle = readBundle(app, 'en');
  return Boolean(
    bundle?.notifications?.types?.task_assigned &&
      bundle.notifications.settings?.events?.task_assigned
  );
});

describe('notification type messages', () => {
  it('finds the apps that render notifications', () => {
    expect(ALL_NOTIFICATION_TYPES).toContain('topic_assigned');
    expect(notificationApps).toContain('web');
    expect(notificationApps.length).toBeGreaterThan(5);
  });

  it.each(
    notificationApps.flatMap((app) =>
      (['en', 'vi'] as const).map((locale) => [app, locale] as const)
    )
  )('%s/%s labels topic_assigned', (app, locale) => {
    const notifications = readBundle(app, locale)?.notifications;
    expect(notifications?.types?.topic_assigned).toBeTruthy();
    expect(notifications?.settings?.events?.topic_assigned).toBeTruthy();
  });
});
