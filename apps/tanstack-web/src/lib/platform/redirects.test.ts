import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCmsCollectionRedirectHref,
  buildCmsEntryRedirectHref,
  buildCmsRedirectHref,
  buildDriveRedirectHref,
  buildFinanceRedirectHref,
  buildFinanceTransactionCategoriesRedirectHref,
  buildHiveDashboardRedirectHref,
  buildHiveNotWhitelistedRedirectHref,
  buildMailRedirectHref,
  buildMeetMeetingRedirectHref,
  buildMeetMeetingsRedirectHref,
  buildMeetPlansRedirectHref,
  buildMindBoardRedirectHref,
  buildMindRedirectHref,
  buildQrGeneratorRedirectHref,
  buildVerifyTokenRedirectHref,
  courseBuilderRedirectHref,
  docsRedirectHref,
  educationLibraryRedirectHref,
  meetTogetherCalendarRedirectHref,
  meetTogetherProductRedirectHref,
  pricingRedirectHref,
  workspaceChatRedirectHref,
  workspaceDashboardRedirectHref,
  workspaceHabitsRedirectHref,
  workspaceInfrastructureAppCoordinationRedirectHref,
  workspaceMeetPlansRedirectHref,
  workspaceRolesRedirectHref,
  workspaceTopicAnnouncementsRedirectHref,
  workspaceUserDatabaseRedirectHref,
} from './redirects';

describe('public redirect helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves the legacy pricing anchor redirect target', () => {
    expect(pricingRedirectHref()).toBe('/?hash-nav=1#pricing');
  });

  it('preserves the legacy localized pricing canonical redirect target', () => {
    expect(pricingRedirectHref({ localized: true })).toBe('/pricing');
  });

  it('preserves the legacy docs external redirect target', () => {
    expect(docsRedirectHref()).toBe('https://docs.tuturuuu.com');
  });

  it('preserves the legacy meet-together product redirect target', () => {
    expect(meetTogetherProductRedirectHref()).toBe('/meet-together');
  });

  it('preserves legacy workspace dashboard redirect targets', () => {
    expect(workspaceUserDatabaseRedirectHref('ws-1')).toBe(
      '/ws-1/users/database'
    );
    expect(workspaceChatRedirectHref('ws-1')).toBe('/ws-1/chat');
    expect(workspaceDashboardRedirectHref('ws-1')).toBe('/ws-1');
    expect(workspaceHabitsRedirectHref('ws-1')).toBe('/ws-1/habits');
    expect(workspaceMeetPlansRedirectHref('ws-1')).toBe('/ws-1/meet/plans');
    expect(workspaceRolesRedirectHref('ws-1')).toBe('/ws-1/members?tab=roles');
    expect(workspaceTopicAnnouncementsRedirectHref('ws-1')).toBe(
      '/ws-1/users/topic-announcements/announcements'
    );
    vi.stubEnv('INFRA_APP_URL', 'https://infra.example.com');
    expect(workspaceInfrastructureAppCoordinationRedirectHref('ws-1')).toBe(
      'https://infra.example.com/ws-1/app-coordination'
    );
  });

  it('preserves legacy finance transaction categories workspace slugs', () => {
    expect(buildFinanceTransactionCategoriesRedirectHref('ws-1')).toBe(
      '/ws-1/finance/categories'
    );
    expect(
      buildFinanceTransactionCategoriesRedirectHref('personal-ws', {
        personal: true,
      })
    ).toBe('/personal/finance/categories');
    expect(
      buildFinanceTransactionCategoriesRedirectHref(ROOT_WORKSPACE_ID)
    ).toBe('/internal/finance/categories');
  });

  it('preserves legacy finance transaction categories query forwarding', () => {
    expect(
      buildFinanceTransactionCategoriesRedirectHref('ws-1', {
        searchParams: {
          empty: '',
          range: 'month',
          tag: ['food', ''],
          unset: undefined,
        },
      })
    ).toBe('/ws-1/finance/categories?range=month&tag=food&tag=');

    const searchParams = new URLSearchParams();
    searchParams.append('wallet', 'wallet 1');
    searchParams.append('wallet', 'wallet/2');
    searchParams.append('empty', '');

    expect(
      buildFinanceTransactionCategoriesRedirectHref('ws-1', {
        searchParams,
      })
    ).toBe('/ws-1/finance/categories?wallet=wallet+1&wallet=wallet%2F2&empty=');
  });

  it('preserves legacy Finance page redirect paths and query forwarding', () => {
    expect(buildFinanceRedirectHref('ws-1', '')).toBe('/ws-1/finance');
    expect(buildFinanceRedirectHref('ws-1', 'analytics')).toBe(
      '/ws-1/finance/analytics'
    );
    expect(buildFinanceRedirectHref(ROOT_WORKSPACE_ID, 'debts/debt-1')).toBe(
      '/internal/finance/debts/debt-1'
    );
    expect(buildFinanceRedirectHref('ws-1', '/budgets/')).toBe(
      '/ws-1/finance/budgets'
    );
    expect(
      buildFinanceRedirectHref('ws-1', 'transactions', {
        searchParams: '?create=transfer&mode=transfer',
      })
    ).toBe('/ws-1/finance/transactions?create=transfer&mode=transfer');
    expect(
      buildFinanceRedirectHref('ws-1', 'wallets', {
        searchParams: {
          create: 'credit-card',
          q: 'cash box',
          tool: 'import',
        },
      })
    ).toBe('/ws-1/finance/wallets?create=credit-card&q=cash+box&tool=import');
    expect(
      buildFinanceRedirectHref(
        'ws-1',
        `transactions/${encodeURIComponent('txn/1')}`,
        {
          searchParams: '?tab=history',
        }
      )
    ).toBe('/ws-1/finance/transactions/txn%2F1?tab=history');
  });

  it('preserves legacy education permanent redirect targets', () => {
    expect(educationLibraryRedirectHref('ws-1', 'flashcards')).toBe(
      '/ws-1/education/library/flashcards'
    );
    expect(educationLibraryRedirectHref('ws-1', 'quiz-sets')).toBe(
      '/ws-1/education/library/quiz-sets'
    );
    expect(educationLibraryRedirectHref('ws-1', 'quizzes')).toBe(
      '/ws-1/education/library/quizzes'
    );
    expect(courseBuilderRedirectHref('ws-1', 'course-1')).toBe(
      '/ws-1/education/courses/course-1/builder'
    );
  });

  it('preserves the legacy meet-together calendar redirect target', () => {
    expect(meetTogetherCalendarRedirectHref()).toBe('/meet-together');
    expect(meetTogetherCalendarRedirectHref('plans/summer')).toBe(
      '/meet-together/plans/summer'
    );
    expect(meetTogetherCalendarRedirectHref('/plans/summer/')).toBe(
      '/meet-together/plans/summer'
    );
  });

  it('redirects the QR generator to the QR app origin and preserves query entries', () => {
    vi.stubEnv('QR_APP_URL', 'https://qr.example.com');

    expect(
      buildQrGeneratorRedirectHref('?content=hello&tag=one&tag=two&empty=')
    ).toBe('https://qr.example.com/?content=hello&tag=one&tag=two&empty=');
  });

  it('preserves parsed TanStack QR redirect arrays', () => {
    vi.stubEnv('QR_APP_URL', 'https://qr.example.com');

    expect(
      buildQrGeneratorRedirectHref({
        empty: '',
        tag: ['one', 'two'],
        unset: undefined,
      })
    ).toBe('https://qr.example.com/?empty=&tag=one&tag=two');
  });

  it('uses local QR app origins for local Portless production checks', () => {
    vi.stubEnv('BASE_URL', 'https://tuturuuu.localhost:1355');
    vi.stubEnv('NODE_ENV', 'production');

    expect(buildQrGeneratorRedirectHref('?utm_source=e2e')).toBe(
      'https://qr.tuturuuu.localhost/?utm_source=e2e'
    );
  });

  it('accepts URLSearchParams input for server-side call sites', () => {
    vi.stubEnv('QR_APP_URL', 'https://qr.example.com');

    const searchParams = new URLSearchParams();
    searchParams.append('url', 'https://tuturuuu.com/docs');

    expect(buildQrGeneratorRedirectHref(searchParams)).toBe(
      'https://qr.example.com/?url=https%3A%2F%2Ftuturuuu.com%2Fdocs'
    );
  });

  it('preserves legacy mail app redirect targets', () => {
    vi.stubEnv('MAIL_APP_URL', 'https://mail.example.com/base/');

    expect(buildMailRedirectHref('ws-1')).toBe('https://mail.example.com/ws-1');
    expect(buildMailRedirectHref('ws-1', { folder: 'sent' })).toBe(
      'https://mail.example.com/ws-1?folder=sent'
    );
  });

  it('preserves Meet app handoff targets and query forwarding', () => {
    vi.stubEnv('MEET_APP_URL', 'https://meet.example.com/base/');

    expect(buildMeetPlansRedirectHref('ws-1')).toBe(
      'https://meet.example.com/workspace/ws-1/plans'
    );
    expect(
      buildMeetMeetingsRedirectHref('ws-1', {
        searchParams: '?page=2&search=planning',
      })
    ).toBe(
      'https://meet.example.com/workspace/ws-1/meetings?page=2&search=planning'
    );
    expect(
      buildMeetMeetingRedirectHref('ws-1', 'meeting/1', {
        searchParams: new URLSearchParams([['tab', 'recordings']]),
      })
    ).toBe(
      'https://meet.example.com/workspace/ws-1/meetings/meeting%2F1?tab=recordings'
    );
  });

  it('preserves legacy Drive app redirect targets', () => {
    vi.stubEnv('DRIVE_APP_URL', 'https://drive.example.com/base/');

    expect(buildDriveRedirectHref('ws-1')).toBe(
      'https://drive.example.com/ws-1'
    );
    expect(buildDriveRedirectHref('personal-ws', { personal: true })).toBe(
      'https://drive.example.com/personal'
    );
    expect(buildDriveRedirectHref(ROOT_WORKSPACE_ID)).toBe(
      'https://drive.example.com/internal'
    );
  });

  it('preserves legacy Drive query forwarding', () => {
    vi.stubEnv('DRIVE_APP_URL', 'https://drive.example.com');

    expect(
      buildDriveRedirectHref('ws-1', {
        searchParams: '?path=assets&q=demo&tag=a&tag=b&empty=',
      })
    ).toBe(
      'https://drive.example.com/ws-1?path=assets&q=demo&tag=a&tag=b&empty='
    );
  });

  it('preserves Hive app handoff targets and query forwarding', () => {
    vi.stubEnv('HIVE_APP_URL', 'https://hive.example.com/base/');

    expect(
      buildHiveDashboardRedirectHref({
        searchParams: '?panel=world&serverId=server-1',
      })
    ).toBe('https://hive.example.com/dashboard?panel=world&serverId=server-1');
    expect(buildHiveNotWhitelistedRedirectHref()).toBe(
      'https://hive.example.com/not-whitelisted'
    );
  });

  it('preserves Mind app handoff targets and query forwarding', () => {
    vi.stubEnv('MIND_APP_URL', 'https://mind.example.com/base/');

    expect(buildMindRedirectHref('ws-1')).toBe('https://mind.example.com/ws-1');
    expect(
      buildMindBoardRedirectHref('ws-1', 'board/1', {
        searchParams: '?view=map',
      })
    ).toBe('https://mind.example.com/ws-1/boards/board%2F1?view=map');
  });

  it('preserves legacy CMS app redirect targets', () => {
    vi.stubEnv('CMS_APP_URL', 'https://cms.example.com/base/');

    expect(buildCmsRedirectHref('/ws-1')).toBe('https://cms.example.com/ws-1');
    expect(buildCmsRedirectHref('/ws-1/content')).toBe(
      'https://cms.example.com/ws-1/content'
    );
    expect(buildCmsCollectionRedirectHref('ws-1', 'collection-1')).toBe(
      'https://cms.example.com/ws-1/content/collections/collection-1'
    );
    expect(buildCmsEntryRedirectHref('ws-1', 'entry-1')).toBe(
      'https://cms.example.com/ws-1/content/entries/entry-1'
    );
  });

  it('normalizes verify-token redirects with the legacy safe fallback', () => {
    expect(buildVerifyTokenRedirectHref('?nextUrl=%2Fpersonal%2Ftasks')).toBe(
      '/personal/tasks'
    );
    expect(
      buildVerifyTokenRedirectHref('?nextUrl=https%3A%2F%2Fevil.test')
    ).toBe('/onboarding');
    expect(buildVerifyTokenRedirectHref('?nextUrl=%2F%2Fevil.test')).toBe(
      '/onboarding'
    );
  });
});
