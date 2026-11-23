import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { NextIntlClientProvider } from 'next-intl';
import { createRoot } from 'react-dom/client';
import en from '../../../../apps/meet/messages/en.json';
import vi from '../../../../apps/meet/messages/vi.json';
import type { MeetTogetherPlanWithParticipants } from '../../src/components/ui/legacy/meet/page';
import { PlansPageContent } from '../../src/components/ui/legacy/meet/plans-page-content';
import './fixture.css';

// ?theme=dark|light, ?ui=sorbet, ?locale=vi, ?state=empty|signed-out
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'vi' ? 'vi' : 'en';
const state = params.get('state');
document.documentElement.classList.toggle(
  'dark',
  params.get('theme') === 'dark'
);
if (params.get('ui') === 'sorbet')
  document.documentElement.dataset.ui = 'sorbet';

const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch: async () => {},
};

const viewerId = 'viewer-fixture';
const plan = (
  index: number,
  overrides: Partial<MeetTogetherPlanWithParticipants>
): MeetTogetherPlanWithParticipants =>
  ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: 'Untitled plan',
    creator_id: index % 2 === 0 ? viewerId : 'someone-else',
    created_at: `2026-11-${String(10 + index).padStart(2, '0')}T03:00:00.000Z`,
    start_time: '09:00:00+07',
    end_time: '17:00:00+07',
    dates: ['2026-12-01', '2026-12-02', '2026-12-03'],
    participants: [
      {
        user_id: viewerId,
        display_name: 'Ada',
        is_guest: false,
        timeblock_count: 3,
        plan_id: null,
      },
      {
        user_id: null,
        display_name: 'Guest',
        is_guest: true,
        timeblock_count: 1,
        plan_id: null,
      },
    ],
    ...overrides,
  }) as MeetTogetherPlanWithParticipants;

const plans =
  state === 'empty' || state === 'signed-out'
    ? []
    : [
        plan(1, {
          name: 'Quarterly planning',
          description: 'Agree the quarter roadmap and owners.',
        }),
        plan(2, { name: 'Design review' }),
        plan(3, {
          name: 'A long plan name that has to wrap onto a second line to prove the row holds',
          description: 'Short note.',
          dates: [
            '2026-12-01',
            '2026-12-02',
            '2026-12-03',
            '2026-12-04',
            '2026-12-05',
          ],
        }),
        plan(4, { name: 'Retro', participants: [] }),
      ];

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={new QueryClient()}>
    <AppRouterContext.Provider value={router as never}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'vi' ? (vi as never) : (en as never)}
      >
        <PlansPageContent
          locale={locale}
          page={1}
          pageSize={9}
          path="/plans"
          plans={plans}
          totalCount={plans.length}
          user={state === 'signed-out' ? null : { id: viewerId }}
          wsId="ws"
        />
      </NextIntlClientProvider>
    </AppRouterContext.Provider>
  </QueryClientProvider>
);
