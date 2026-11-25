// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../../apps/meet/messages/en.json';
import {
  ActivityPaneContext,
  type ActivityPaneValue,
} from '../../stage-layout/activity-pane-context';
import { MeetFormsSheet } from './meet-forms-sheet';

vi.mock('../../prejoin/use-meet-call-ux', () => ({
  useMeetCallUx: () => true,
}));

afterEach(cleanup);

it('closes the forms sheet when its activity pane becomes hidden', () => {
  const pane: ActivityPaneValue = {
    activityId: 'forms',
    title: 'Forms',
    active: true,
    visible: true,
    sizeClass: 'wide',
    short: false,
    maximized: false,
    headerSlot: null,
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  };
  const onOpenChange = vi.fn();
  const view = (visible: boolean) => (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ActivityPaneContext.Provider
        value={{ ...pane, active: visible, visible }}
      >
        <MeetFormsSheet
          open
          onOpenChange={onOpenChange}
          state={{ kind: 'empty' }}
          answers={{}}
          onAnswersChange={vi.fn()}
          onSubmit={vi.fn(async () => {})}
        />
      </ActivityPaneContext.Provider>
    </NextIntlClientProvider>
  );

  const { rerender } = render(view(true));
  const name = messages.meet.call.forms.title;
  expect(screen.getByRole('dialog', { name })).toBeTruthy();

  rerender(view(false));
  expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  expect(onOpenChange).not.toHaveBeenCalled();
});
