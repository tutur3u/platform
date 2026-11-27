import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('filters the personal Kanban board and restores its cards', async ({
  agent,
  app,
  browser,
  screen,
}) => {
  await app.open('/en/personal/tasks/boards');
  await expect(screen.getByRole('heading', 'Task Boards')).toBeVisible();

  await agent.act('open the Personal Board from the active task boards list');

  await expect(browser).toHaveURL(/\/en\/personal\/tasks\/boards\/[^/]+$/);
  await expect(screen.getByRole('heading', 'Personal Board')).toBeVisible();
  for (const column of ['Not Started', 'Active', 'Done']) {
    await expect(screen.getByRole('heading', column)).toBeVisible();
  }
  const cards = screen.getByTestId('task-card', { visible: true });
  const cardTitles = [
    'Review Q4 onboarding checklist',
    'Verify deterministic E2E replay cache',
    'Bootstrap web test harness',
  ];
  await expect(cards).toHaveText(cardTitles);

  const search = screen.getByRole('textbox', 'Search tasks...');
  await expect(search).toBeVisible();
  await agent.act('search the board for {query}', {
    params: { query: 'no matching task title' },
  });
  await expect(screen.getByRole('status')).toHaveText(
    'No tasks match the current filters'
  );
  await expect(cards).toHaveCount(0);

  await agent.act('clear the Kanban filters');
  await expect(search).toHaveValue('');
  await expect(screen.getByRole('status')).toBeHidden();
  await expect(cards).toHaveText(cardTitles);
});
