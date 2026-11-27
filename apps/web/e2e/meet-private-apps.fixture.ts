import { expect, test } from '@playwright/test';

// Runs against packages/meet-core/fixtures/meet-activities (vite, port 5213):
//   bunx vite --config packages/meet-core/fixtures/meet-activities/vite.config.ts
//   bunx playwright test -c apps/web/playwright.meet-activities.config.ts meet-private-apps.fixture.ts

test('opens Private Apps panel, switches all 5 tabs, filters Chat and Drive, and renders zero iframes (EN)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scene=private-apps&locale=en&theme=dark', {
    waitUntil: 'networkidle',
  });

  await page.getByTestId('open-private-apps').click();

  const panel = page.locator('aside[aria-label="My day"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Only visible to you')).toBeVisible();

  // Tasks tab (default)
  await expect(panel.getByText('Prepare Q4 deck')).toBeVisible();
  const tasksLink = panel.getByRole('link', { name: 'Open Tasks' });
  await expect(tasksLink).toHaveAttribute('target', '_blank');
  await expect(tasksLink).toHaveAttribute('rel', 'noopener noreferrer');

  // Calendar tab
  await panel.getByRole('tab', { name: 'Calendar' }).click();
  await expect(panel.getByText('Product sync')).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Open Calendar' })
  ).toHaveAttribute('rel', 'noopener noreferrer');

  // Meetings tab
  await panel.getByRole('tab', { name: 'Meetings' }).click();
  await expect(panel.getByText('Weekly design review')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open Meet' })).toHaveAttribute(
    'rel',
    'noopener noreferrer'
  );

  // Chat tab with localized search placeholder and filtering
  await panel.getByRole('tab', { name: 'Chat' }).click();
  const chatSearch = panel.getByPlaceholder('Filter conversations…');
  await expect(chatSearch).toBeVisible();
  await expect(panel.getByText('Design channel')).toBeVisible();
  await expect(panel.getByText('Ops alerts')).toBeVisible();

  await chatSearch.fill('Design');
  await expect(panel.getByText('Design channel')).toBeVisible();
  await expect(panel.getByText('Ops alerts')).toBeHidden();

  await chatSearch.fill('nonexistent-channel');
  await expect(panel.getByText('No matching items.')).toBeVisible();

  // Drive tab with localized search placeholder and filtering
  await panel.getByRole('tab', { name: 'Drive' }).click();
  const driveSearch = panel.getByPlaceholder('Filter files and folders…');
  await expect(driveSearch).toBeVisible();
  await expect(panel.getByText('Roadmap')).toBeVisible();
  await expect(panel.getByText('Q4-budget.pdf')).toBeVisible();

  await driveSearch.fill('budget');
  await expect(panel.getByText('Q4-budget.pdf')).toBeVisible();
  await expect(panel.getByText('Roadmap')).toBeHidden();

  // Strictly native React panels: zero iframes anywhere in DOM.
  await expect(page.locator('iframe')).toHaveCount(0);

  // No VI copy side-by-side in EN mode.
  const panelText = (await panel.textContent()) ?? '';
  expect(panelText).not.toContain('Ngày của tôi');
  expect(panelText).not.toContain('Trò chuyện');
  expect(panelText).not.toContain('Chỉ bạn nhìn thấy');
});

test('renders Private Apps panel in Vietnamese with localized placeholders and no EN/VI side-by-side', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scene=private-apps&locale=vi&theme=dark', {
    waitUntil: 'networkidle',
  });

  await page.getByTestId('open-private-apps').click();

  const panel = page.locator('aside[aria-label="Ngày của tôi"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Chỉ bạn nhìn thấy')).toBeVisible();

  await expect(panel.getByRole('tab', { name: 'Công việc' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Lịch' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Cuộc họp' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Trò chuyện' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Drive' })).toBeVisible();

  await panel.getByRole('tab', { name: 'Trò chuyện' }).click();
  await expect(panel.getByPlaceholder('Lọc cuộc trò chuyện…')).toBeVisible();

  await panel.getByRole('tab', { name: 'Drive' }).click();
  await expect(panel.getByPlaceholder('Lọc tệp và thư mục…')).toBeVisible();

  await expect(page.locator('iframe')).toHaveCount(0);

  // No EN chrome copy side-by-side in VI mode.
  const panelText = (await panel.textContent()) ?? '';
  expect(panelText).not.toContain('My day');
  expect(panelText).not.toContain('Only visible to you');
  expect(panelText).not.toContain('Filter conversations…');
  expect(panelText).not.toContain('Filter files and folders…');
});
