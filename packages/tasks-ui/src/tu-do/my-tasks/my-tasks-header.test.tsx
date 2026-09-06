import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyTasksHeader } from './my-tasks-header';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('task greeting hydration', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps server markup independent of server timezone', () => {
    const html = renderToString(
      <MyTasksHeader overdueCount={0} todayCount={0} upcomingCount={0} />
    );
    expect(html).toContain('sidebar_tabs.tasks');
    expect(html).not.toContain('ws-tasks.good_');
  });

  it('shows the local greeting after hydration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 6, 8));
    const container = document.createElement('div');
    const header = (
      <MyTasksHeader overdueCount={0} todayCount={0} upcomingCount={0} />
    );
    container.innerHTML = renderToString(header);
    expect(container.querySelector('h1')?.textContent).toBe(
      'sidebar_tabs.tasks'
    );

    vi.setSystemTime(new Date(2026, 8, 6, 15));
    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    act(() => {
      root = hydrateRoot(container, header, { onRecoverableError });
    });
    expect(container.querySelector('h1')?.textContent).toBe(
      'ws-tasks.good_afternoon'
    );
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => root?.unmount());
  });
});
