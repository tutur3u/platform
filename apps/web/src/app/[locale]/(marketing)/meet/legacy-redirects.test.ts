import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LegacyCalendarMeetPage from '../calendar/meet-together/[[...slug]]/page';
import LegacyMeetPage from '../meet-together/page';
import LegacyMeetPlanPage from '../meet-together/plans/[planId]/page';
import LegacyMeetProductPage from '../products/meet-together/page';

vi.mock('next/navigation', () => ({ permanentRedirect: vi.fn() }));

describe('Tuturuuu Meet legacy route compatibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves list query parameters', async () => {
    await LegacyMeetPage({
      searchParams: Promise.resolve({ page: '2', search: 'team' }),
    });
    expect(permanentRedirect).toHaveBeenCalledWith('/meet?page=2&search=team');
  });

  it('preserves the plan id and guest query parameters', async () => {
    await LegacyMeetPlanPage({
      params: Promise.resolve({ planId: 'abc123' }),
      searchParams: Promise.resolve({ guest: 'An' }),
    });
    expect(permanentRedirect).toHaveBeenCalledWith(
      '/meet/plans/abc123?guest=An'
    );
  });

  it('redirects calendar aliases without changing the remaining path', async () => {
    await LegacyCalendarMeetPage({
      params: Promise.resolve({ slug: ['plans', 'abc123'] }),
      searchParams: Promise.resolve({ mode: 'guest' }),
    });
    expect(permanentRedirect).toHaveBeenCalledWith(
      '/meet/plans/abc123?mode=guest'
    );
  });

  it('redirects the product alias to the canonical landing page', async () => {
    await LegacyMeetProductPage({
      searchParams: Promise.resolve({ source: 'products' }),
    });
    expect(permanentRedirect).toHaveBeenCalledWith('/meet?source=products');
  });
});
