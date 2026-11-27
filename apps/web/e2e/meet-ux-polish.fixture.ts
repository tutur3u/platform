import { expect, type Page, test } from '@playwright/test';

// Runs against packages/meet-core/fixtures/meet-activities (vite, port 5213):
//   bunx vite --config packages/meet-core/fixtures/meet-activities/vite.config.ts
//   bunx playwright test -c apps/web/playwright.meet-activities.config.ts

const VI_DIACRITICS =
  /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ]/;
const EN_AND_VI_SIDE_BY_SIDE =
  /\b(?:Ask|Search|Share|Settings|Meeting|Timer|Polls|Question)\b\s*[/|—–-]\s*[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i;

async function assertPlaceholdersInScope(
  page: Page,
  selector: string,
  locale: 'en' | 'vi'
) {
  const findings = await page.locator(selector).evaluate((root) => {
    const inputs = Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea'
      )
    );
    const selects = Array.from(
      root.querySelectorAll<HTMLElement>('[role="combobox"]')
    );
    return {
      inputs: inputs.map((el) => ({
        tag: el.tagName.toLowerCase(),
        placeholder: el.getAttribute('placeholder')?.trim() ?? '',
      })),
      selects: selects.map((el) => ({
        text: el.textContent?.trim() ?? '',
      })),
      text: root.textContent ?? '',
    };
  });

  expect(findings.inputs.length + findings.selects.length).toBeGreaterThan(0);
  for (const input of findings.inputs) {
    expect(input.placeholder.length).toBeGreaterThan(0);
    if (locale === 'en') expect(input.placeholder).not.toMatch(VI_DIACRITICS);
    expect(input.placeholder).not.toMatch(EN_AND_VI_SIDE_BY_SIDE);
  }
  for (const select of findings.selects) {
    expect(select.text.length).toBeGreaterThan(0);
    if (locale === 'en') expect(select.text).not.toMatch(VI_DIACRITICS);
    expect(select.text).not.toMatch(EN_AND_VI_SIDE_BY_SIDE);
  }
  expect(findings.text).not.toMatch(EN_AND_VI_SIDE_BY_SIDE);
}

for (const locale of ['en', 'vi'] as const) {
  test(`placeholders are non-empty, localized, and never bilingual side-by-side across Q&A, Activities, Share, and Settings (${locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/?scene=polish&locale=${locale}&theme=dark&ui=sorbet`, {
      waitUntil: 'networkidle',
    });

    // 1. Q&A composer
    await assertPlaceholdersInScope(
      page,
      '[data-testid="polish-qa-container"]',
      locale
    );

    // 2. Activities dialog (search input, deduplicated detail page, timer controls input)
    const activitiesLabel = locale === 'vi' ? 'Hoạt động' : 'Activities';
    await page
      .getByRole('button', { name: new RegExp(`^${activitiesLabel}`) })
      .click();
    const activitiesDialog = page.getByRole('dialog');
    await expect(activitiesDialog).toBeVisible();
    await assertPlaceholdersInScope(page, '[role="dialog"]', locale);

    // Detail page does not duplicate the shell page heading
    const pollsLabel = locale === 'vi' ? 'Bình chọn' : 'Polls';
    await activitiesDialog
      .getByRole('navigation')
      .getByRole('button', { name: pollsLabel })
      .click();
    await expect(activitiesDialog.locator('h2')).toHaveCount(0);

    // Timer page inside Activities has a localized placeholder on its custom minutes input
    const timerLabel = locale === 'vi' ? 'Hẹn giờ lớp học' : 'Class timer';
    await activitiesDialog
      .getByRole('navigation')
      .getByRole('button', { name: timerLabel })
      .click();
    await assertPlaceholdersInScope(page, '[role="dialog"]', locale);
    await page.keyboard.press('Escape');
    await expect(activitiesDialog).toHaveCount(0);

    // 3. Share dialog
    const shareLabel = locale === 'vi' ? 'Chia sẻ' : 'Share';
    await page.getByRole('button', { name: shareLabel }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertPlaceholdersInScope(page, '[role="dialog"]', locale);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 4. Settings dialog (inputs + selects)
    await page.getByTestId('open-settings-fixture').click();
    await expect(page.getByTestId('polish-settings-dialog')).toBeVisible();
    await assertPlaceholdersInScope(
      page,
      '[data-testid="polish-settings-dialog"]',
      locale
    );
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('polish-settings-dialog')).toHaveCount(0);
  });
}

test('timer chip ticks without per-second aria-live spam', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scene=polish&locale=en&theme=dark&ui=sorbet', {
    waitUntil: 'networkidle',
  });

  const chip = page.locator('[data-slot="class-timer-chip"]').first();
  await expect(chip).toBeVisible();

  const liveAttr = await chip.getAttribute('aria-live');
  expect(liveAttr === null || liveAttr === 'off').toBe(true);
  const ancestorLive = await chip.evaluate((el) =>
    el.parentElement?.closest('[aria-live="polite"], [aria-live="assertive"]')
  );
  expect(ancestorLive).toBeNull();

  const initialText = await chip.textContent();
  await page.waitForTimeout(1250);
  const nextText = await chip.textContent();
  expect(nextText).not.toBe(initialText);

  // The sibling polite status stays silent across routine second ticks.
  const statusText = await page
    .locator('header [role="status"][aria-live="polite"]')
    .first()
    .textContent();
  expect(statusText?.trim() ?? '').toBe('');
});

test('pressing Escape while a dialog is open inside focus view does not exit focus view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?scene=polish&locale=en&theme=dark&ui=sorbet', {
    waitUntil: 'networkidle',
  });

  const tile = page.getByTestId(
    'participant-00000000-0000-4000-8000-000000000001-screen'
  );
  await page.getByRole('button', { name: 'Focus on screen' }).click();
  await expect(tile).toHaveAttribute('data-focus-view', 'true');

  // Open a dialog while focus view is active.
  await page.getByTestId('open-focus-overlay-dialog').click();
  const overlayDialog = page.getByTestId('focus-overlay-dialog');
  await expect(overlayDialog).toBeVisible();

  // First Escape closes the dialog only; focus view stays active.
  await page.keyboard.press('Escape');
  await expect(overlayDialog).toHaveCount(0);
  await expect(tile).toHaveAttribute('data-focus-view', 'true');

  // Second Escape exits focus view cleanly.
  await page.keyboard.press('Escape');
  await expect(tile).not.toHaveAttribute('data-focus-view', 'true');
});
