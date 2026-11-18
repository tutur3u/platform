// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { MiraWhereStrip } from './mira-where-strip';

vi.mock('./mira-profile', () => ({ MiraAvatar: () => <span /> }));
afterEach(cleanup);

it('shows activity and selection only from the supplied surface, with focus navigation', () => {
  const onFocusSurface = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MiraWhereStrip
        activity={{
          docs: {
            active: true,
            title: 'Lab Rubric',
            status: 'Editing §2…',
            preview: { before: 'Review ', selection: 'base case' },
          },
          whiteboard: { active: false, status: 'Last sketch at 10:20' },
        }}
        onFocusSurface={onFocusSurface}
      />
    </NextIntlClientProvider>
  );

  const strip = screen.getByRole('region', { name: 'Where Mira is' });
  const docs = within(strip).getByRole('button', { name: /Lab Rubric/ });
  expect(within(docs).getByText('Active')).toBeTruthy();
  expect(within(docs).getByText('Editing §2…')).toBeTruthy();
  expect(within(docs).getByText('base case')).toBeTruthy();
  expect(within(strip).getAllByText('Idle')).toHaveLength(2);
  expect(within(strip).getByText('Last sketch at 10:20')).toBeTruthy();
  expect(within(strip).getAllByRole('listitem')).toHaveLength(4);
  fireEvent.click(docs);
  expect(onFocusSurface).toHaveBeenCalledWith('docs');
});

it('renders read-only cards without a surface navigator', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MiraWhereStrip />
    </NextIntlClientProvider>
  );
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getAllByText('Idle')).toHaveLength(4);
});
