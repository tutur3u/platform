// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspacePerson } from '@tuturuuu/internal-api/people';
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecipientPeoplePicker } from './recipient-people-picker';

const fixture = vi.hoisted((): { email: string | null } => ({
  email: 'CONTACT@EXAMPLE.COM',
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/custom/workspace-people-picker', () => ({
  WorkspacePeoplePicker: ({
    onSelect,
  }: {
    onSelect: (person: WorkspacePerson) => void;
  }) =>
    h(
      'button',
      {
        onClick: () =>
          onSelect({
            kind: 'contact',
            id: 'contact-1',
            linkedUserId: null,
            displayName: 'Test Contact',
            email: fixture.email,
            avatarUrl: null,
          }),
      },
      'Choose contact'
    ),
}));
afterEach(cleanup);

function setup(excludedAddresses: string[] = []) {
  const onSelect = vi.fn();
  render(
    h(RecipientPeoplePicker, {
      workspaceId: 'workspace-1',
      fieldLabel: 'To',
      excludedAddresses,
      onSelect,
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose contact' }));
  return onSelect;
}

it('keeps the visible name and normalizes the chosen email address', () => {
  fixture.email = ' CONTACT@EXAMPLE.COM ';
  expect(setup()).toHaveBeenCalledWith({
    address: 'contact@example.com',
    displayName: 'Test Contact',
  });
});

it('does not duplicate an address already selected in another field', () => {
  fixture.email = 'CONTACT@example.com';
  expect(setup(['Contact@Example.COM'])).not.toHaveBeenCalled();
});

it.each([null, '', 'no-email', 'first last@example.com'])(
  'rejects non-emailable selection %s',
  (email) => {
    fixture.email = email;
    expect(setup()).not.toHaveBeenCalled();
  }
);
