import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyTasksHeader } from './my-tasks-header';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('task greeting hydration', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps server markup independent of server timezone', () => {
    const html = renderToString(
      <MyTasksHeader overdueCount={0} todayCount={0} upcomingCount={0} />
    );
    expect(html).toContain('sidebar_tabs.tasks');
    expect(html).not.toContain('ws-tasks.good_');
  });

  it('shows the local greeting after hydration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 6, 15));
    render(<MyTasksHeader overdueCount={0} todayCount={0} upcomingCount={0} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'ws-tasks.good_afternoon'
    );
  });
});
