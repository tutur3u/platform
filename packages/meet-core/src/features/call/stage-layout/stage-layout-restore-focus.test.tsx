// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { StageLayoutView } from './stage-layout-view';
import { useActivityPresentation } from './use-activity-presentation';
import { useStageLayout } from './use-stage-layout';

const icon = () => null;

function Harness() {
  const stage = useStageLayout({
    accountId: 'user',
    meetingId: 'meeting',
    isAvailable: () => true,
    tier: 'desktop',
  });
  const presentation = useActivityPresentation(stage.openIds.length > 0, []);

  return (
    <>
      <button type="button" onClick={() => stage.open('Document')}>
        Open document
      </button>
      <button
        type="button"
        onClick={() => {
          stage.bring('Polls');
          presentation.navigate({
            kind: 'forced-summon',
            id: 'summon',
            leader: 'Host',
          });
        }}
      >
        Receive summon
      </button>
      <StageLayoutView
        controller={stage}
        peopleCount={2}
        stage={null}
        presentation={presentation}
        activities={stage.openIds.map((id) => ({
          id,
          title: id,
          icon,
          content: <input aria-label={id + ' input'} />,
        }))}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it.each([
  { description: 'focuses the summoned pane from the chip', focused: true },
  { description: 'preserves focus after leaving the chip', focused: false },
])('$description', ({ focused }) => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open document' }));
  fireEvent.click(screen.getByRole('button', { name: 'Minimize activities' }));
  const chip = screen.getByRole('button', { name: 'Reopen Document' });
  chip.focus();
  expect(document.activeElement).toBe(chip);
  if (!focused) chip.blur();

  fireEvent.click(screen.getByRole('button', { name: 'Receive summon' }));

  expect(screen.queryByRole('button', { name: 'Reopen Document' })).toBeNull();
  const pane = screen.getByLabelText('Polls', { selector: '[data-pane-id]' });
  expect(document.activeElement).toBe(focused ? pane : document.body);
});
