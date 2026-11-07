import { expect } from '@playwright/test';
import { z } from 'zod';
import {
  config,
  input,
  readJson,
  segment,
  signIn,
  test,
  workspacePath,
} from './fixtures';

const connections = z.object({
  connections: z.array(z.object({ id: z.string(), provider: z.string() })),
});

test('signed-in provider event and Tasks reads survive refresh', async ({
  page,
  acceptanceLocale,
}) => {
  await signIn(page, acceptanceLocale, workspacePath);
  const provider = connections.parse(
    await readJson(
      page,
      `/api/v1/calendar/connections?wsId=${segment(config.workspace)}`
    )
  );
  expect(provider.connections).toContainEqual(
    expect.objectContaining({
      id: input('CALENDAR_CONNECTION_ID'),
      provider: input('CALENDAR_PROVIDER'),
    })
  );
  const range = new URLSearchParams({
    start_at: z
      .string()
      .datetime({ offset: true })
      .parse(input('CALENDAR_RANGE_START')),
    end_at: z
      .string()
      .datetime({ offset: true })
      .parse(input('CALENDAR_RANGE_END')),
  });
  const events = z
    .object({ data: z.array(z.object({ id: z.string(), title: z.string() })) })
    .parse(
      await readJson(
        page,
        `/api/v1/workspaces/${segment(config.workspace)}/calendar/events?${range}`
      )
    );
  expect(events.data).toContainEqual(
    expect.objectContaining({
      id: input('CALENDAR_EVENT_ID'),
      title: input('CALENDAR_EVENT_TITLE'),
    })
  );
  await expect(
    page.getByText(input('CALENDAR_EVENT_TITLE'), { exact: true }).first()
  ).toBeVisible();
  const boards = z
    .object({ boards: z.array(z.object({ id: z.string() })) })
    .parse(
      await readJson(
        page,
        `/api/v1/workspaces/${segment(config.workspace)}/task-boards`
      )
    );
  expect(boards.boards).toContainEqual(
    expect.objectContaining({ id: input('TASK_BOARD_ID') })
  );
});

test.describe('Calendar service-worker offline fallback', () => {
  // Service-worker fetches bypass context.route. Only this offline test opts in;
  // signed-in provider/Tasks acceptance retains the default blocked worker policy.
  test.use({ serviceWorkers: 'allow' });

  test('offline navigation shows a public fallback and recovers the signed-in app', async ({
    page,
    context,
    acceptanceLocale,
  }) => {
    await signIn(page, acceptanceLocale, workspacePath);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => resolve(),
            { once: true }
          )
        );
      }
    });
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1')).toHaveText("You're offline");
      await expect(
        page.getByText(input('CALENDAR_EVENT_TITLE'), { exact: true })
      ).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByText(input('CALENDAR_EVENT_TITLE'), { exact: true }).first()
    ).toBeVisible();
  });
});
