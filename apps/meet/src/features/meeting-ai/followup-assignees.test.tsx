// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../messages/en.json';
import { FollowupAssignees, matchFollowupOwner } from './followup-assignees';

const members = [
  {
    id: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    avatarUrl: null,
  },
  {
    id: 'other-alice',
    displayName: 'Alice',
    email: 'other@example.com',
    avatarUrl: null,
  },
  { id: 'bob', displayName: null, email: 'bob@example.com', avatarUrl: null },
];
afterEach(cleanup);
it('matches stable IDs first and refuses ambiguous names or IDs outside the destination', () => {
  expect(matchFollowupOwner({ owner: 'Alice' }, members)).toBeNull();
  expect(
    matchFollowupOwner({ owner: 'Alice', ownerId: 'outsider' }, members)
  ).toBeNull();
  expect(
    matchFollowupOwner({ owner: 'Alice', ownerId: 'other-alice' }, members)?.id
  ).toBe('other-alice');
  expect(matchFollowupOwner({ owner: ' BOB@example.com ' }, members)?.id).toBe(
    'bob'
  );
});
it('requires an explicit owner selection and supports multiple assignees through search', () => {
  function View() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <NextIntlClientProvider locale="en" messages={messages}>
        <FollowupAssignees
          members={members}
          selected={selected}
          onChange={setSelected}
          userId="bob"
          suggestion={{
            key: 'one',
            kind: 'task',
            title: 'Review',
            evidence: 'Agreed',
            owner: 'Alice',
            ownerId: 'alice',
            timeText: null,
            startLocal: null,
            endLocal: null,
            timezone: null,
          }}
        />
        <output aria-label="Selected IDs">{selected.join(',')}</output>
      </NextIntlClientProvider>
    );
  }
  render(<View />);
  expect(screen.getByLabelText('Selected IDs').textContent).toBe('');
  fireEvent.click(
    screen.getByRole('button', { name: 'Assign suggested owner: Alice' })
  );
  expect(screen.getByLabelText('Selected IDs').textContent).toBe('alice');
  fireEvent.change(screen.getByLabelText('Search members by name or email'), {
    target: { value: 'bob@' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'bob@example.com' }));
  expect(screen.getByLabelText('Selected IDs').textContent).toBe('alice,bob');
  fireEvent.click(screen.getByRole('checkbox', { name: 'bob@example.com' }));
  expect(screen.getByLabelText('Selected IDs').textContent).toBe('alice');
});
