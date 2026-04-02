import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogDataTable } from './audit-log-data-table';

const replaceMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'audit-log-table.field_summary') {
      return `${values?.firstField} +${values?.count}`;
    }

    return key;
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ws-1/users/database',
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => new URLSearchParams('tab=audit-log'),
}));

describe('AuditLogDataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the detail drawer with before and after values when a row is clicked', () => {
    render(
      <AuditLogDataTable
        data={[
          {
            auditRecordId: 1,
            eventKind: 'archived',
            summary: 'Archived Alice',
            changedFields: ['archived', 'archived_until'],
            fieldChanges: [
              {
                field: 'archived',
                label: 'Archived',
                before: 'false',
                after: 'true',
              },
              {
                field: 'archived_until',
                label: 'Archived Until',
                before: null,
                after: '2026-03-20T00:00:00.000Z',
              },
            ],
            before: {
              archived: 'false',
              archived_until: null,
            },
            after: {
              archived: 'true',
              archived_until: '2026-03-20T00:00:00.000Z',
            },
            affectedUser: {
              id: 'user-1',
              name: 'Alice',
              email: 'alice@example.com',
            },
            actor: {
              authUid: 'actor-1',
              workspaceUserId: 'workspace-actor-1',
              id: 'actor-1',
              name: 'Bob',
              email: 'bob@example.com',
            },
            occurredAt: '2026-03-10T10:00:00.000Z',
            source: 'backfilled',
          },
        ]}
        count={1}
        page={1}
        pageSize={10}
        eventKind="all"
        source="all"
        affectedUserQuery=""
        actorQuery=""
      />
    );

    fireEvent.click(screen.getByText('Archived Alice'));

    expect(
      screen.getByText('audit-log-table.field_changes_title')
    ).toBeInTheDocument();
    expect(screen.getByText('Archived Until')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.getByText('2026-03-20T00:00:00.000Z')).toBeInTheDocument();
  });

  it('renders event and source filters for server-side query updates', () => {
    render(
      <AuditLogDataTable
        data={[]}
        count={0}
        page={1}
        pageSize={10}
        eventKind="all"
        source="all"
        affectedUserQuery=""
        actorQuery=""
      />
    );

    expect(
      screen.getByPlaceholderText(
        'audit-log-insights.affected_user_search_placeholder'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('audit-log-insights.actor_search_placeholder')
    ).toBeInTheDocument();
  });
});
