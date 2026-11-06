import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementForm } from './announcement-form';
import { AnnouncementPlaceField } from './announcement-place-field';

const mocks = vi.hoisted(() => ({
  listTopicAnnouncementCampusOptions: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/date-time-picker', () => ({
  DateTimePicker: () => <div>schedule picker</div>,
}));

vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));

vi.mock('@tuturuuu/internal-api/topic-announcements', () => ({
  listTopicAnnouncementCampusOptions: mocks.listTopicAnnouncementCampusOptions,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceUser: vi.fn(),
  listWorkspaceBasicUsers: vi.fn(async () => ({ count: 0, data: [] })),
  previewTopicAnnouncementEmail: vi.fn(async () => ({
    data: { attachments: [], html: '', subject: '', text: '' },
  })),
}));

// A native select stands in for the popover so a choice can be driven.
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    ariaLabel,
    onChange,
    options,
    selected,
  }: {
    ariaLabel?: string;
    onChange?: (value: string) => void;
    options: { label: string; value: string }[];
    selected: string;
  }) => (
    <select
      aria-label={ariaLabel ?? 'combobox'}
      onChange={(event) => onChange?.(event.target.value)}
      value={selected}
    >
      <option value="">none</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

function withQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listTopicAnnouncementCampusOptions.mockResolvedValue({
    data: ['Campus North', 'Legacy Annex'],
  });
});

describe('AnnouncementPlaceField', () => {
  it('offers the current workspace campus labels and fills the place', async () => {
    const onChange = vi.fn();
    render(
      withQuery(
        <AnnouncementPlaceField
          disabled={false}
          onChange={onChange}
          value=""
          wsId="workspace-a"
        />
      )
    );

    const picker = await screen.findByLabelText('place_campus_picker');
    expect(mocks.listTopicAnnouncementCampusOptions).toHaveBeenCalledWith(
      'workspace-a'
    );
    expect(
      [...picker.querySelectorAll('option')].map((option) => option.value)
    ).toEqual(['', 'Campus North', 'Legacy Annex']);
    fireEvent.change(picker, { target: { value: 'Legacy Annex' } });
    expect(onChange).toHaveBeenCalledWith('Legacy Annex');
  });

  it('keeps a manual or template place that is not a campus', async () => {
    const onChange = vi.fn();
    render(
      withQuery(
        <AnnouncementPlaceField
          disabled={false}
          onChange={onChange}
          value="Library hall"
          wsId="workspace-a"
        />
      )
    );

    expect(await screen.findByLabelText('place_campus_picker')).toHaveValue('');
    const input = screen.getByLabelText('place');
    expect(input).toHaveValue('Library hall');
    fireEvent.change(input, { target: { value: 'Room 12 annex' } });
    expect(onChange).toHaveBeenCalledWith('Room 12 annex');
  });

  it('shows only the free-text place when the workspace has no campuses', async () => {
    mocks.listTopicAnnouncementCampusOptions.mockResolvedValue({ data: [] });
    render(
      withQuery(
        <AnnouncementPlaceField
          disabled={false}
          onChange={vi.fn()}
          value=""
          wsId="workspace-b"
        />
      )
    );

    await waitFor(() =>
      expect(mocks.listTopicAnnouncementCampusOptions).toHaveBeenCalledWith(
        'workspace-b'
      )
    );
    expect(screen.queryByLabelText('place_campus_picker')).toBeNull();
    expect(screen.getByLabelText('place')).toBeInTheDocument();
  });
});

describe('AnnouncementForm place', () => {
  it('saves the chosen campus label as the place and leaves the room separate', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      withQuery(
        <AnnouncementForm
          canSend
          contacts={[
            {
              archived: false,
              createdAt: '2026-05-20T00:00:00.000Z',
              email: 'teacher@example.com',
              id: 'contact-1',
              metadata: {},
              name: 'Teacher One',
              tags: [],
              verificationStatus: 'verified',
              workspaceUserId: null,
            },
          ]}
          groups={[]}
          isCreating={false}
          isSavingTemplate={false}
          isScheduling={false}
          isSending={false}
          onCreate={onCreate}
          onCreateAndSchedule={vi.fn()}
          onCreateAndSend={vi.fn()}
          onSaveTemplate={vi.fn()}
          onTimezoneRequired={vi.fn()}
          onUploadAttachment={vi.fn()}
          schedulingTimezone="Asia/Ho_Chi_Minh"
          teacherAssignmentsEnabled={false}
          templates={[]}
          workspaceUsers={[]}
          wsId="workspace-a"
        />
      )
    );

    fireEvent.change(screen.getByLabelText('announcement_title'), {
      target: { value: 'Unit 3 speaking practice' },
    });
    fireEvent.change(await screen.findByLabelText('place_campus_picker'), {
      target: { value: 'Campus North' },
    });
    fireEvent.change(screen.getByLabelText('room'), {
      target: { value: 'Room 4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.change(screen.getByLabelText('topic_primary_label'), {
      target: { value: 'Practice speaking about weekend plans.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_submit_draft' })
    );

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      place: 'Campus North',
      room: 'Room 4',
    });
  });
});
