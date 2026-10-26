import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherScheduleImportPanel } from './teacher-schedule-import';

const mocks = vi.hoisted(() => ({
  getWorkspaceUser: vi.fn(),
  listWorkspaceBasicUsers: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => mocks);
vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));

const TEACHER = {
  display_name: null,
  email: null,
  full_name: 'Trần Mai',
  id: '00000000-0000-4000-8000-000000000001',
};

/** The users endpoint normalizes text server-side (accent-insensitive). */
function searchUsers(_wsId: string, { q }: { q?: string }) {
  const query = (q ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return Promise.resolve({
    count: 1,
    data: /mai/iu.test(query) ? [TEACHER] : [],
  });
}

function ImportPanel(
  props: Omit<ComponentProps<typeof TeacherScheduleImportPanel>, 'wsId'>
) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TeacherScheduleImportPanel {...props} wsId="workspace-1" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listWorkspaceBasicUsers.mockImplementation(searchUsers);
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([valueKey, value]) => `${valueKey}=${value}`)
          .join(',')}`
      : key,
}));

const defaultProps = {
  canSend: true,
  importResult: null,
  isImporting: false,
  isSending: false,
  onImport: vi.fn(),
  onImportAndSend: vi.fn(),
};

describe('TeacherScheduleImportPanel', () => {
  it('lets operators edit rows directly and create drafts from valid rows', () => {
    const onImport = vi.fn();

    render(<ImportPanel {...defaultProps} onImport={onImport} />);

    fireEvent.change(screen.getByLabelText('email 1'), {
      target: { value: 'ready@example.com' },
    });
    fireEvent.change(screen.getByLabelText('topic 1'), {
      target: { value: 'Ready topic' },
    });
    fireEvent.change(screen.getByLabelText('announcement_title 1'), {
      target: { value: 'Ready title' },
    });

    expect(screen.getByText('import_ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'bulk_create_drafts' }));

    expect(onImport).toHaveBeenCalledWith({
      rows: [
        {
          contactEmail: 'ready@example.com',
          title: 'Ready title',
          topic: 'Ready topic',
        },
      ],
      sourceName: undefined,
      sourceType: 'foreign_teacher_schedule',
    });
  });

  it('loads CSV into the editable grid and can create then send', () => {
    const onImportAndSend = vi.fn();

    render(<ImportPanel {...defaultProps} onImportAndSend={onImportAndSend} />);

    fireEvent.change(screen.getByLabelText('paste_csv'), {
      target: {
        value: [
          'email,topic,title',
          'ready@example.com,Ready topic,Ready title',
          'missing-topic@example.com,,Missing topic title',
          ',Needs email,Missing email title',
        ].join('\n'),
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /bulk_load_csv/u }));

    expect(screen.getByDisplayValue('ready@example.com')).toBeInTheDocument();
    expect(screen.getByText('import_error_missing_topic')).toBeInTheDocument();
    expect(screen.getByText('import_error_missing_email')).toBeInTheDocument();

    // A topic-less row is still a valid draft, so sending stays blocked until
    // the operator fills the topic or drops the row.
    const sendButton = screen.getByRole('button', {
      name: 'bulk_create_and_send',
    });
    expect(sendButton).toBeDisabled();
    expect(screen.getByText('bulk_send_requires_topic')).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'bulk_remove_row',
      })[1] as HTMLElement
    );
    expect(sendButton).toBeEnabled();
    fireEvent.click(sendButton);

    expect(onImportAndSend).toHaveBeenCalledWith({
      rows: [
        {
          contactEmail: 'ready@example.com',
          title: 'Ready title',
          topic: 'Ready topic',
        },
      ],
      sourceName: undefined,
      sourceType: 'foreign_teacher_schedule',
    });
  });

  it('creates topic-less drafts with the teacher resolved by server search', async () => {
    const onImport = vi.fn();

    render(<ImportPanel {...defaultProps} onImport={onImport} />);

    fireEvent.change(screen.getByLabelText('email 1'), {
      target: { value: 'ready@example.com' },
    });
    fireEvent.change(screen.getByLabelText('teacher_in_charge 1'), {
      target: { value: 'Nobody' },
    });
    expect(
      await screen.findByText('import_error_unmatched_teacher')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'bulk_create_drafts' })
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText('teacher_in_charge 1'), {
      target: { value: 'tran mai' },
    });
    await waitFor(() =>
      expect(mocks.listWorkspaceBasicUsers).toHaveBeenCalledWith(
        'workspace-1',
        expect.objectContaining({ q: 'tran mai' })
      )
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'bulk_create_drafts' })
      ).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'bulk_create_drafts' }));

    expect(onImport).toHaveBeenCalledWith({
      rows: [
        {
          contactEmail: 'ready@example.com',
          teacherWorkspaceUserId: '00000000-0000-4000-8000-000000000001',
        },
      ],
      sourceName: undefined,
      sourceType: 'foreign_teacher_schedule',
    });
  });
});
