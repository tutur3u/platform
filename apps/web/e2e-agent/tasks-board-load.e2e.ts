import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('loads the active personal tasks board and renders its columns', async ({
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
  await expect(screen.getByRole('heading', 'Not Started')).toBeVisible();
  await expect(screen.getByRole('heading', 'Active')).toBeVisible();
  await expect(screen.getByRole('heading', 'Done')).toBeVisible();
});
