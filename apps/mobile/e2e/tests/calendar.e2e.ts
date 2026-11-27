import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { mobileQaSession } from '../shared-mobile-config.ts';
import { openQaSession } from './session.ts';

test('Calendar switches views and opens event detail and creation', async ({
  app,
  agent,
  device,
  screen,
}) => {
  const session = mobileQaSession();
  if (!session) {
    test.skip('Supply a disposable QA session for signed-in specs.');
    return;
  }

  await openQaSession({ app, device, screen }, session);
  await screen.getByTestId('shell-nav-apps').click();
  await agent.act('Open Calendar from the Apps launcher');
  await expect(screen.getByTestId(/^mobile\.calendar\.view\./u)).toBeVisible();

  await agent.act('Select the Calendar tab in the bottom dock');
  const modes = [
    ['day', 'Day'],
    ['threeDays', '3 Days'],
    ['week', 'Week'],
  ];
  for (const [mode, label] of modes) {
    await agent.act(`Open the calendar view picker and select the ${label} view`);
    await expect(screen.getByTestId(`mobile.calendar.view.${mode}`)).toBeVisible();
  }

  await agent.act('Select the Agenda tab in the bottom dock, then go to Today');
  await expect(screen.getByTestId('mobile.calendar.view.agenda')).toBeVisible();
  await screen.getByTestId(/^mobile\.calendar\.event\./u).first().click();
  await expect(screen.getByTestId('mobile.calendar.event-detail')).toBeVisible();
  await agent.act('Dismiss the event detail sheet without editing the event');

  await agent.act('Open New event using the calendar add button in the dock');
  await expect(screen.getByTestId('mobile.calendar.event-create')).toBeVisible();
  await agent.act('Cancel the event form without creating an event');
});
