import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactForm } from './contact-form';

const mocks = vi.hoisted(() => ({
  listTopicAnnouncementContacts: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/internal-api', () => mocks);
vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));
vi.mock('./workspace-virtual-user-linker', () => ({
  WorkspaceVirtualUserLinker: ({
    disabled,
    value,
  }: {
    disabled?: boolean;
    value: string | null;
  }) => (
    <span data-disabled={String(Boolean(disabled))} data-testid="linker">
      {value ?? 'no-link'}
    </span>
  ),
}));

function contact(
  overrides: Partial<TopicAnnouncementContact>
): TopicAnnouncementContact {
  return {
    archived: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    email: 'lan@example.com',
    id: 'contact-lan',
    metadata: {},
    name: 'Lan Nguyen',
    tags: ['gvnn'],
    verificationStatus: 'verified',
    workspaceUserId: 'user-lan',
    ...overrides,
  };
}

function renderForm() {
  const onCreate = vi.fn();
  const onSelectExisting = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ContactForm
        isCreating={false}
        onCreate={onCreate}
        onSelectExisting={onSelectExisting}
        workspaceUsers={[]}
        wsId="workspace-1"
      />
    </QueryClientProvider>
  );
  return { onCreate, onSelectExisting };
}

async function pickExisting(query: string, label: string) {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.change(
    screen.getByPlaceholderText('existing_contact_search_placeholder'),
    { target: { value: query } }
  );
  await waitFor(() =>
    expect(mocks.listTopicAnnouncementContacts).toHaveBeenCalledWith(
      'workspace-1',
      { q: query }
    )
  );
  fireEvent.click(await screen.findByText(label));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  mocks.listTopicAnnouncementContacts.mockImplementation(
    async (_wsId: string, { q }: { q?: string }) => ({
      data:
        q === 'Lan'
          ? [
              contact({}),
              contact({
                email: 'lan.tran@example.com',
                id: 'contact-lan-2',
                workspaceUserId: null,
              }),
            ]
          : q === 'Old'
            ? [contact({ archived: true, id: 'contact-old', name: 'Old GV' })]
            : q === 'Blank'
              ? [contact({ email: '', id: 'contact-blank', name: 'Blank GV' })]
              : [],
    })
  );
});

describe('ContactForm existing contact picker', () => {
  it('fills the stored email and reuses the existing contact without a POST', async () => {
    const { onCreate, onSelectExisting } = renderForm();

    await pickExisting('Lan', 'lan@example.com');

    expect(screen.getByLabelText('email')).toHaveValue('lan@example.com');
    expect(screen.getByLabelText('email')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('contact_name')).toHaveValue('Lan Nguyen');
    expect(screen.getByTestId('linker')).toHaveTextContent('user-lan');
    expect(screen.getByTestId('linker')).toHaveAttribute(
      'data-disabled',
      'true'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'use_existing_contact' })
    );

    expect(onCreate).not.toHaveBeenCalled();
    expect(onSelectExisting).toHaveBeenCalledTimes(1);
    expect(onSelectExisting.mock.calls[0]?.[0]).toMatchObject({
      email: 'lan@example.com',
      id: 'contact-lan',
      workspaceUserId: 'user-lan',
    });
  });

  it('disambiguates same-name contacts by email', async () => {
    renderForm();

    await pickExisting('Lan', 'lan.tran@example.com');

    expect(screen.getByLabelText('email')).toHaveValue('lan.tran@example.com');
    expect(screen.getByTestId('linker')).toHaveTextContent('no-link');
  });

  it('keeps manual creation unchanged', () => {
    const { onCreate, onSelectExisting } = renderForm();

    fireEvent.change(screen.getByLabelText('contact_name'), {
      target: { value: 'New Teacher' },
    });
    fireEvent.change(screen.getByLabelText('email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText('tags'), {
      target: { value: 'a, b' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'add_contact' }));

    expect(onSelectExisting).not.toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledWith({
      email: 'new@example.com',
      name: 'New Teacher',
      tags: ['a', 'b'],
      workspaceUserId: null,
    });
  });

  it.each([
    ['Old', 'Old GV', 'existing_contact_rejected_archived'],
    ['Blank', 'Blank GV', 'existing_contact_rejected_missing_email'],
  ])('rejects an unusable %s contact', async (query, label, message) => {
    const { onCreate, onSelectExisting } = renderForm();

    await pickExisting(query, label);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('email')).toHaveValue('');
    expect(screen.getByLabelText('email')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'add_contact' })).toBeDisabled();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onSelectExisting).not.toHaveBeenCalled();
  });
});
