import { fireEvent, render, screen } from '@testing-library/react';
import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { useState } from 'react';
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

// The add-contact button now lives in the page header, which owns the dialog
// open-state and passes it to the controlled ContactsPanel. This harness mirrors
// that wiring so the test still exercises the "form is gated behind an explicit
// add action" behavior.
function ContactsPanelHarness() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsAddDialogOpen(true)} type="button">
        add_contact
      </button>
      <ContactsPanel
        contacts={[contact]}
        isAddDialogOpen={isAddDialogOpen}
        isCreating={false}
        isDeleting={false}
        isLoading={false}
        isVerifying={false}
        onAddDialogOpenChange={setIsAddDialogOpen}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onVerify={vi.fn()}
        workspaceUsers={[]}
        wsId="workspace-1"
      />
    </>
  );
}

describe('ContactsPanel', () => {
  it('keeps contact creation in an explicit add-contact dialog', () => {
    render(<ContactsPanelHarness />);

    expect(screen.queryByLabelText('contact_name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'add_contact' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('contact_name')).toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeInTheDocument();
  });
});
