import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SyncTriggerButton from './sync-trigger-button';

vi.mock('@tuturuuu/icons', () => ({
  ExternalLink: () => <span aria-hidden="true" />,
}));

describe('Calendar sync trigger', () => {
  it('opens the workspace in the Calendar app instead of mutating through Infrastructure', () => {
    render(
      <SyncTriggerButton
        calendarAppUrl="https://calendar.tuturuuu.com"
        wsId="071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1"
      />
    );

    expect(
      screen.getByRole('link', { name: 'Open Calendar to sync' })
    ).toHaveAttribute(
      'href',
      'https://calendar.tuturuuu.com/071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1'
    );
  });

  it('does not retain the legacy active-sync route or caller', () => {
    const legacyRoute = resolve(
      process.cwd(),
      '../calendar/src/app/api/v1/calendar/auth/active-sync/route.ts'
    );
    const componentSource = readFileSync(
      resolve(
        process.cwd(),
        'src/app/[locale]/(dashboard)/[wsId]/calendar-sync/_components/sync-trigger-button.tsx'
      ),
      'utf8'
    );

    expect(existsSync(legacyRoute)).toBe(false);
    expect(componentSource).not.toContain('/api/v1/calendar/auth/active-sync');
  });
});
