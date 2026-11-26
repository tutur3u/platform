// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { NavigationPerson } from '../hooks/use-room-navigation';
import {
  RoomNavigationTargets,
  useTargetSelection,
} from './room-navigation-targets';

afterEach(cleanup);

function Targets({ people }: { people: NavigationPerson[] }) {
  const selection = useTargetSelection(people);
  return <RoomNavigationTargets people={people} selection={selection} />;
}

it('shows whole initials for an emoji name in the Follow and Summon list', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Targets
        people={[
          { userId: 'minh', displayName: 'Minh 🎨' },
          { userId: 'anh', displayName: 'Đặng Ánh' },
        ]}
      />
    </NextIntlClientProvider>
  );
  expect(screen.getByText('MI')).toBeTruthy();
  expect(screen.getByText('ĐÁ')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/[�]|M\?/u);
});
