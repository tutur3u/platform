import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlanningNavigation } from './planning-navigation';

const state = vi.hoisted(() => ({ pathname: '/vi/personal/calendar' }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
}));

describe('planning navigation', () => {
  it('retains the locale and personal workspace when switching from Tasks calendar', () => {
    render(<PlanningNavigation workspaceSlug="personal" />);
    expect(
      screen
        .getByRole('link', { name: 'calendar' })
        .getAttribute('aria-current')
    ).toBe('page');
    expect(
      screen.getByRole('link', { name: 'tasks' }).getAttribute('href')
    ).toBe('/vi/personal/tasks');
  });
  it('returns from a Calendar board to the same workspace calendar', () => {
    state.pathname = '/vi/workspace-1/tasks/boards/board-1';
    render(<PlanningNavigation workspaceSlug="workspace-1" calendarRoot />);
    expect(
      screen.getByRole('link', { name: 'tasks' }).getAttribute('aria-current')
    ).toBe('page');
    expect(
      screen.getByRole('link', { name: 'calendar' }).getAttribute('href')
    ).toBe('/vi/workspace-1');
  });
});
