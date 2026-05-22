import { fireEvent, render, screen } from '@testing-library/react';
import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';
import { ContactsPanel } from './topic-announcements-contacts';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([valueKey, value]) => `${valueKey}=${value}`)
          .join(',')}`
      : key,
}));

vi.mock('./workspace-virtual-user-linker', () => ({
  WorkspaceVirtualUserLinker: () => <button type="button">linked_user</button>,
}));

const contact: TopicAnnouncementContact = {
  archived: false,
  createdAt: '2026-05-20T00:00:00.000Z',
  email: 'teacher@example.com',
  id: 'contact-1',
  metadata: {},
  name: 'Teacher One',
  tags: [],
  verificationStatus: 'verified',
  workspaceUserId: null,
};

describe('ContactsPanel', () => {
  it('keeps contact creation in an explicit add-contact dialog', () => {
    render(
      <ContactsPanel
        contacts={[contact]}
        isCreating={false}
        isDeleting={false}
        isLoading={false}
        isVerifying={false}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onVerify={vi.fn()}
        workspaceUsers={[]}
        wsId="workspace-1"
      />
    );

    expect(screen.queryByLabelText('contact_name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'add_contact' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('contact_name')).toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeInTheDocument();
  });
});
