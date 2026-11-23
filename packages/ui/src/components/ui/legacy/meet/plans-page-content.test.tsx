import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MeetTogetherPlanWithParticipants } from './page';
import { PlansPageContent } from './plans-page-content';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/plans',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('./form', () => ({ default: () => <div>plan-form</div> }));
vi.mock('./edit-plan-dialog', () => ({
  default: () => <button type="button">edit-plan</button>,
}));
vi.mock('./pagination', () => ({ default: () => <nav>pagination</nav> }));

const plan = (
  overrides: Partial<MeetTogetherPlanWithParticipants>
): MeetTogetherPlanWithParticipants =>
  ({
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Planning sync',
    creator_id: 'user-1',
    description: 'Quarterly planning',
    dates: ['2026-12-01', '2026-12-02'],
    participants: [
      {
        user_id: 'user-1',
        display_name: 'Ada',
        is_guest: false,
        timeblock_count: 2,
        plan_id: 'p',
      },
    ],
    ...overrides,
  }) as MeetTogetherPlanWithParticipants;

const render_ = (props: Partial<Parameters<typeof PlansPageContent>[0]> = {}) =>
  render(
    <PlansPageContent
      locale="en"
      page={1}
      pageSize={9}
      path="/plans"
      plans={[plan({})]}
      totalCount={1}
      user={{ id: 'user-1' }}
      {...props}
    />
  );

describe('Plans page', () => {
  it('lists plans with the name as the only link to the plan', () => {
    render_();

    const link = screen.getByRole('link', { name: 'Planning sync' });
    expect(link).toHaveAttribute(
      'href',
      '/plans/11111111222233334444555555555555'
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'your_plans'
    );
    expect(screen.getByText('plan_count:1')).toBeTruthy();
    expect(screen.getByText('plan-form')).toBeTruthy();
  });

  it('offers edit only to the creator', () => {
    const { unmount } = render_();
    expect(screen.getByText('edit-plan')).toBeTruthy();
    unmount();

    render_({ user: { id: 'someone-else' } });
    expect(screen.queryByText('edit-plan')).toBeNull();
  });

  it('switches between the list and the grid without losing the plans', () => {
    render_();

    expect(screen.getAllByRole('list')[0]?.className).toContain('divide-y');
    fireEvent.click(screen.getByRole('radio', { name: 'grid_view' }));
    const items = screen.getAllByRole('listitem');
    expect(items.some((item) => within(item).queryByText('Ada') !== null)).toBe(
      true
    );
  });

  it('explains an empty list and hides the view toggle', () => {
    render_({ plans: [], totalCount: 0 });

    expect(screen.getByText('no_plans_yet')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'grid_view' })).toBeNull();
    expect(screen.queryByText(/plan_count/)).toBeNull();
  });

  it('shows only the composer and its sign-in path when signed out', () => {
    render_({ plans: [], totalCount: 0, user: null });

    expect(screen.getByText('plan-form')).toBeTruthy();
    expect(screen.getByText('new_plan_desc')).toBeTruthy();
    expect(screen.queryByText('no_plans_yet')).toBeNull();
    expect(screen.queryByText('login_required')).toBeNull();
    expect(screen.queryByRole('region', { name: 'your_plans' })).toBeNull();
  });

  it('uses semantic tokens rather than decorative hues', () => {
    const { container } = render_();
    expect(container.innerHTML).not.toMatch(
      /dynamic-(blue|purple|green|orange)|gradient|blur-3xl/
    );
  });
});
