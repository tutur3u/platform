// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../messages/en.json';
import { ScenarioDiscovery } from './scenario-discovery';

const scenarios = [
  {
    id: 'one',
    title: 'Synthetic one',
    category: 'Practice',
    briefing: 'Shared choices',
    roles: [],
    revision: 1,
  },
  {
    id: 'two',
    title: 'Synthetic two',
    category: 'Review',
    briefing: 'Reflect together',
    roles: [],
    revision: 1,
  },
];
afterEach(cleanup);
function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ScenarioDiscovery scenarios={scenarios} />
    </NextIntlClientProvider>
  );
}
it('combines search with category and can clear an empty result', () => {
  setup();
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'Review' },
  });
  expect(screen.queryByText('Synthetic one')).toBeNull();
  expect(screen.getByText('Synthetic two')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Search scenarios'), {
    target: { value: 'missing' },
  });
  expect(screen.getByText('No scenarios match your search')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByText('Synthetic one')).toBeTruthy();
  expect(screen.getByText('Synthetic two')).toBeTruthy();
});
it('opens a briefing before starting a session', () => {
  setup();
  expect(
    screen.getByRole('link', { name: /Synthetic one/ }).getAttribute('href')
  ).toBe('/scenarios/one');
  expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
});
