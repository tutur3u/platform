// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { SessionSetup } from './session-setup';

vi.mock('./actions', () => ({ startScenario: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
const scenarios = [
  {
    id: 'one',
    title: 'Discuss priorities',
    category: 'Team',
    briefing: 'Agree on next steps',
    roles: [],
    revision: 1,
  },
  {
    id: 'two',
    title: 'Resolve disagreement',
    category: 'Feedback',
    briefing: 'Listen to both perspectives',
    roles: [],
    revision: 2,
  },
];
afterEach(cleanup);
function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionSetup scenarios={scenarios} />
    </NextIntlClientProvider>
  );
}
it('requires fresh consent when the selected scenario changes', () => {
  setup();
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(
    (screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(
    (screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
  fireEvent.click(screen.getAllByRole('radio')[1]!);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(
    false
  );
  expect(
    (screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  expect(
    screen
      .getByRole('link', { name: messages.parley.view_briefing })
      .getAttribute('href')
  ).toBe('/scenarios/two');
  expect(
    document.querySelector<HTMLInputElement>('input[name="scenario_id"]')?.value
  ).toBe('two');
});
it('keeps the selected scenario explicit when search hides it and recovers empty results', () => {
  setup();
  fireEvent.change(screen.getByLabelText('Search scenarios'), {
    target: { value: 'missing' },
  });
  expect(screen.getByText('No scenarios match your search')).toBeTruthy();
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
  expect(
    screen.getByRole('heading', { name: 'Discuss priorities' })
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  expect((screen.getAllByRole('radio')[0] as HTMLInputElement).checked).toBe(
    true
  );
});
