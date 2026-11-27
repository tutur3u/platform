import { test } from '@e2e-dev/mobile';
import { expect } from 'e2e';
import { mobileQaSession } from '../shared-mobile-config.ts';
import { openQaSession } from './session.ts';

test('Tasks opens board and list views, filters tasks, and opens creation and detail', async ({
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
  await agent.act('Open Tasks from the Apps launcher');
  await screen.getByTestId(/^tasks-board-card-/u).first().click();

  await agent.act('Select Kanban in the task board dock');
  await expect(
    screen.getByTestId(/^mobile\.tasks\.kanban-list\./u).first()
  ).toBeVisible();
  await screen.getByTestId(/^mobile\.tasks\.kanban-create\./u).first().click();
  await expect(screen.getByRole('textbox').first()).toBeVisible();
  await agent.act('Cancel the Create task form without saving');

  await agent.act('Select List in the task board dock');
  const task = screen.getByTestId(/^mobile\.tasks\.list-task\./u).first();
  await expect(task).toBeVisible();

  await agent.act('Open Filters from the task board header or its overflow menu');
  await expect(screen.getByTestId('mobile.tasks.filters')).toBeVisible();
  await agent.act(
    'Select only Urgent in the Priority picker, confirm the picker, then apply the board filters'
  );
  await expect(screen.getByTestId('mobile.tasks.list-empty')).toBeVisible();
  await expect(task).toBeHidden();

  await agent.act('Clear the active board filters without changing view settings');
  await expect(task).toBeVisible();
  await task.click();
  await expect(screen.getByTestId('mobile.tasks.detail')).toBeVisible();
  await agent.act('Dismiss the task detail surface without editing the task');
});
