import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ teacherAssignmentsEnabled: false }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('../topic-announcements-shell', () => ({
  useTopicAnnouncements: () => ({
    actions: { importAndSendRows: vi.fn(), importRows: vi.fn() },
    canSend: true,
    contacts: [],
    importResult: null,
    pending: { importAndSendRows: false, importRows: false },
    teacherAssignmentsEnabled: state.teacherAssignmentsEnabled,
    wsId: 'workspace-1',
  }),
}));
vi.mock('../topic-announcements-page-header', () => ({
  TopicAnnouncementsPageHeader: () => null,
}));
vi.mock('../topic-announcements-import', () => ({
  downloadTopicAnnouncementTemplate: vi.fn(),
  ImportPanel: () => <div>pre-feature import</div>,
}));
vi.mock('../teacher-schedule-import', () => ({
  TeacherScheduleImportPanel: () => <div>teacher schedule import</div>,
}));

import { TopicAnnouncementsImportPageClient } from './import-page-client';

beforeEach(() => {
  state.teacherAssignmentsEnabled = false;
});

describe('TopicAnnouncementsImportPageClient', () => {
  it('keeps the pre-feature import with teacher assignments off', () => {
    render(<TopicAnnouncementsImportPageClient />);
    expect(screen.getByText('pre-feature import')).toBeInTheDocument();
    expect(screen.queryByText('teacher schedule import')).toBeNull();
  });

  it('uses the teacher schedule import with teacher assignments on', () => {
    state.teacherAssignmentsEnabled = true;
    render(<TopicAnnouncementsImportPageClient />);
    expect(screen.getByText('teacher schedule import')).toBeInTheDocument();
  });
});
