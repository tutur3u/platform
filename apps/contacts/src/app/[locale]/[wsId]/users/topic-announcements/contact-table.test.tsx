import { fireEvent, render, screen } from '@testing-library/react';
import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';
import { ContactTable } from './contact-table';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([valueKey, value]) => `${valueKey}=${value}`)
          .join(',')}`
      : key,
}));

const baseContact: TopicAnnouncementContact = {
  archived: false,
  createdAt: '2026-05-20T00:00:00.000Z',
  email: 'teacher@example.com',
  id: 'contact-1',
  metadata: {},
  name: 'Teacher One',
  tags: [],
  verificationStatus: 'needs_verification',
  workspaceUserId: null,
};

function createContact(
  overrides: Partial<TopicAnnouncementContact> = {}
): TopicAnnouncementContact {
  return {
    ...baseContact,
    ...overrides,
  };
}

function renderTable(
  contacts: TopicAnnouncementContact[],
  overrides: Partial<Parameters<typeof ContactTable>[0]> = {}
) {
  const props = {
    contacts,
    isDeleting: false,
    isLoading: false,
    isVerifying: false,
    onAddContact: vi.fn(),
    onDelete: vi.fn(),
    onVerify: vi.fn(),
    workspaceUsersById: new Map(),
    ...overrides,
  };

  render(<ContactTable {...props} />);
  return props;
}

describe('ContactTable', () => {
  it('shows verification actions only for contacts that need verification', () => {
    renderTable([
      createContact({ id: 'verified-1', verificationStatus: 'verified' }),
      createContact({
        id: 'linked-1',
        verificationStatus: 'linked_confirmed_account',
      }),
      createContact({ id: 'pending-1', verificationStatus: 'pending' }),
    ]);

    expect(
      screen.queryByRole('button', { name: 'send_verification' })
    ).not.toBeInTheDocument();
  });

  it('requests verification for unverified contacts', () => {
    const props = renderTable([
      createContact({
        id: 'needs-verification-1',
        verificationStatus: 'needs_verification',
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'send_verification' }));

    expect(props.onVerify).toHaveBeenCalledWith('needs-verification-1');
  });

  it('removes contacts after confirmation', () => {
    const props = renderTable([
      createContact({ id: 'remove-contact-1', name: 'Teacher Remove' }),
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: 'remove_contact_action' })
    );
    expect(screen.getByText('remove_contact_title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'remove_contact' }));

    expect(props.onDelete).toHaveBeenCalledWith('remove-contact-1');
  });
});
