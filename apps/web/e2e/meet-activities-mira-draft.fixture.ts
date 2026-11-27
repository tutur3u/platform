import { expect, test } from '@playwright/test';

// Runs against packages/meet-core/fixtures/meet-activities (vite, port 5213):
//   bunx vite --config packages/meet-core/fixtures/meet-activities/vite.config.ts
//   bunx playwright test -c apps/web/playwright.meet-activities.config.ts

const DRAFT_API = '**/api/meet-call/fixture-meeting/live-activities/mira-draft';

test('host drafts flashcards and icebreaker with Mira in English with placeholders on every input', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.route(DRAFT_API, async (route) => {
    const body = route.request().postDataJSON() as { kind: string };
    if (body.kind === 'flashcards') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'flashcards',
          title: 'Photosynthesis',
          cards: [
            { front: 'Chlorophyll', back: 'Pigment that absorbs light' },
            { front: 'Stomata', back: 'Leaf pores for gas exchange' },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'icebreaker',
        prompt: 'Which plant fact surprised you most this week?',
        starters: ['Cacti', 'Redwoods'],
      }),
    });
  });

  await page.goto('/?scene=mira-draft&locale=en&role=host', {
    waitUntil: 'networkidle',
  });

  // Never mix Vietnamese copy in English locale
  await expect(page.getByText('Soạn cùng Mira')).toHaveCount(0);

  // Flashcards Mira draft journey
  const flashcards = page.getByTestId('mira-flashcards-host');
  await flashcards.getByRole('button', { name: 'Draft with Mira' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const topic = dialog.getByRole('textbox', { name: 'Topic' });
  await expect(topic).toHaveAttribute('placeholder', /.+/);
  await expect(dialog.getByRole('combobox', { name: 'Number of items' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Language' })).toBeVisible();
  await expect(
    dialog.getByRole('combobox', { name: 'Difficulty' })
  ).toContainText('Select difficulty');

  await topic.fill('Photosynthesis vocabulary for grade 8');
  await dialog.getByRole('button', { name: 'Generate draft' }).click();

  await expect(dialog.getByTestId('mira-draft-preview')).toContainText(
    'Chlorophyll'
  );
  await dialog.getByRole('button', { name: 'Apply to editor' }).click();
  await expect(dialog).toBeHidden();

  await expect(
    flashcards.getByLabel('Front of card 1')
  ).toHaveValue('Chlorophyll');
  await expect(
    flashcards.getByLabel('Back of card 2')
  ).toHaveValue('Leaf pores for gas exchange');

  // Icebreaker Mira draft journey
  const icebreaker = page.getByTestId('mira-icebreaker-host');
  await icebreaker.getByRole('button', { name: 'Draft with Mira' }).click();
  await expect(dialog).toBeVisible();
  const iceTopic = dialog.getByRole('textbox', { name: 'Topic' });
  await expect(iceTopic).toHaveAttribute('placeholder', /.+/);
  await iceTopic.fill('Biology warmup');
  await dialog.getByRole('button', { name: 'Generate draft' }).click();
  await expect(dialog.getByTestId('mira-draft-preview')).toContainText(
    'Which plant fact surprised you most this week?'
  );
  await dialog.getByRole('button', { name: 'Apply to editor' }).click();
  await expect(
    icebreaker.getByLabel('Ask your own question')
  ).toHaveValue('Which plant fact surprised you most this week?');
});

test('host drafts flashcards in Vietnamese with localized placeholders and zero side-by-side English', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.route(DRAFT_API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'flashcards',
        title: 'Quang hợp',
        cards: [
          { front: 'Diệp lục', back: 'Sắc tố hấp thụ ánh sáng' },
        ],
      }),
    });
  });

  await page.goto('/?scene=mira-draft&locale=vi&role=host', {
    waitUntil: 'networkidle',
  });

  // Never mix English copy in Vietnamese locale
  await expect(page.getByText('Draft with Mira')).toHaveCount(0);

  const flashcards = page.getByTestId('mira-flashcards-host');
  await flashcards.getByRole('button', { name: 'Soạn cùng Mira' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const topic = dialog.getByRole('textbox', { name: 'Chủ đề' });
  await expect(topic).toHaveAttribute('placeholder', /^Ví dụ:/);
  await expect(
    dialog.getByRole('combobox', { name: 'Độ khó' })
  ).toContainText('Chọn độ khó');

  await topic.fill('Thuật ngữ quang hợp lớp 8');
  await dialog.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(dialog.getByTestId('mira-draft-preview')).toContainText(
    'Diệp lục'
  );
  await dialog.getByRole('button', { name: 'Áp dụng vào trình soạn thảo' }).click();
  await expect(
    flashcards.getByLabel('Mặt trước của thẻ 1')
  ).toHaveValue('Diệp lục');
});

test('guests never see the Draft with Mira trigger', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scene=mira-draft&locale=en&role=guest', {
    waitUntil: 'networkidle',
  });

  await expect(page.getByRole('button', { name: 'Draft with Mira' })).toHaveCount(
    0
  );
});
