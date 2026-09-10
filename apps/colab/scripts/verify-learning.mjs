import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifyLearning({ browser, request, owner, alice, bob }) {
  const response = await request('/rooms', owner, {
    title: 'RISE learning journey',
    startsAt: null,
    endsAt: null,
    maxUsers: 10,
    teamCount: 4,
  });
  assert.equal(response.status, 201);
  const room = await response.json();
  const path = `/rooms/${room.id}`;
  assert.equal(room.scenario.id, 'rise-induction-post');
  for (const [email, token, teamId] of [
    ['alice@example.com', alice, 'team-1'],
    ['bob@example.com', bob, 'team-2'],
  ]) {
    assert.equal(
      (await request(`${path}/action`, owner, { action: 'invite', email }))
        .status,
      200
    );
    assert.equal(
      (await request(`${path}/join`, token, { teamId })).status,
      200
    );
  }
  assert.equal(
    (await request('/rooms', alice, { title: 'Unauthorized workshop' })).status,
    403
  );
  const contexts = [];
  const errors = [];
  try {
    const pages = [];
    for (const token of [owner, alice, bob]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      });
      contexts.push(context);
      await context.addCookies([
        { name: 'colab_session', value: token, domain: '127.0.0.1', path: '/' },
      ]);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:8795/?room=${room.id}`);
      await expect(
        page.getByRole('heading', { name: room.title })
      ).toBeVisible();
      pages.push(page);
    }
    const [host, member, audience] = pages;
    await expect(
      member.getByRole('link', { name: 'Host controls', exact: true })
    ).toHaveCount(0);
    await expect(
      member.getByText('Your team’s finish line', { exact: true })
    ).toBeVisible();
    await member
      .getByRole('link', { name: 'Learning', exact: true })
      .first()
      .click();
    await expect(
      member.getByRole('heading', {
        name: 'Build an assistant your team can trust.',
      })
    ).toBeVisible();
    await expect(member.locator('.team-toolbar')).toBeHidden();
    await member.getByRole('button', { name: 'Markdown', exact: true }).click();
    await member
      .getByRole('textbox', { name: 'Edit the Markdown example' })
      .fill(
        '# My RISE brief\n\n- Read the approved facts\n- Ask before publishing'
      );
    await expect(
      member
        .locator('.learning-markdown')
        .getByRole('heading', { name: 'My RISE brief' })
    ).toBeVisible();
    await member
      .getByRole('button', { name: 'Mark as explored', exact: true })
      .click();
    await expect(
      member.getByRole('progressbar', { name: 'Your learning path' })
    ).toHaveAttribute('value', '1');
    await member.screenshot({
      path: '/private/tmp/colab-rise-markdown-desktop.png',
      fullPage: true,
    });
    await member
      .getByRole('button', { name: 'System prompts', exact: true })
      .click();
    await member
      .getByRole('textbox', { name: 'Prompt analysis', exact: true })
      .fill('You are a RISE editor for new students.');
    await expect(
      member.locator('.learning .framework-map article[data-covered="true"]')
    ).toHaveCount(1);
    const missing = member.locator('.learning .framework-map article').nth(1);
    await missing.getByText('Try adding', { exact: true }).click();
    await missing.getByRole('button', { name: 'Add this section' }).click();
    await expect(
      member.getByRole('textbox', { name: 'Prompt analysis', exact: true })
    ).toHaveValue(/Inputs & evidence/);
    await member.getByRole('link', { name: 'Prompt', exact: true }).click();
    await member
      .getByRole('button', { name: 'Try a starter prompt', exact: true })
      .click();
    await member
      .getByRole('button', { name: 'Save team prompt', exact: true })
      .click();
    await expect(
      member.getByRole('button', { name: 'Ask AI to review', exact: true })
    ).toBeEnabled();
    await host.getByRole('link', { name: 'Prompt', exact: true }).click();
    await member
      .getByRole('button', { name: 'Ask AI to review', exact: true })
      .click();
    await expect(
      member.getByText(
        'Your assistant has a clear starting point. Add an explicit source and review rule.',
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      host.getByText(
        'Your assistant has a clear starting point. Add an explicit source and review rule.',
        { exact: true }
      )
    ).toBeVisible();
    await member.screenshot({
      path: '/private/tmp/colab-rise-prompt-coach-desktop.png',
      fullPage: true,
    });
    await member
      .getByRole('textbox', { name: 'Your team’s system prompt' })
      .fill(
        'You are a RISE assistant. Read the approved brief and write a bilingual Facebook post.'
      );
    await expect(
      member.getByText(
        'This review is for an earlier prompt. Save your changes and run a fresh review.',
        { exact: true }
      )
    ).toBeVisible();
    await member
      .getByRole('button', { name: 'Save team prompt', exact: true })
      .click();
    await member.getByRole('link', { name: 'Skills', exact: true }).click();
    await member
      .getByRole('button', { name: 'Generate skills', exact: true })
      .click();
    await expect(
      member.getByText('demo-skill/SKILL.md', { exact: true })
    ).toBeVisible({ timeout: 15000 });
    await audience
      .getByRole('link', { name: 'Live showcase', exact: true })
      .click();
    await host
      .getByRole('link', { name: 'Live showcase', exact: true })
      .click();
    await host
      .getByRole('button', { name: 'Run live test', exact: true })
      .click();
    await expect(
      audience.getByText('Live demo agent result', { exact: true })
    ).toBeVisible({ timeout: 15000 });
    await host.getByRole('button', { name: 'Next team', exact: true }).click();
    await expect(audience.locator('.showcase-title')).toHaveText(
      room.teams[1].name
    );
    assert.equal(
      (
        await request(`${path}/ai`, alice, {
          action: 'scenario',
          steering: 'Missing link',
        })
      ).status,
      403
    );
    const generated = await request(`${path}/ai`, owner, {
      action: 'scenario',
      steering: 'Missing registration link',
      random: true,
    });
    assert.equal(generated.status, 200);
    await member.getByRole('link', { name: 'Brief', exact: true }).click();
    await expect(
      member.getByRole('heading', {
        name: 'Induction Day: registration link missing',
        exact: true,
      })
    ).toBeVisible();
    await member
      .getByRole('link', { name: 'Learning', exact: true })
      .first()
      .click();
    await member.getByRole('button', { name: 'Markdown', exact: true }).click();
    await member.setViewportSize({ width: 390, height: 844 });
    const closeNavigation = member
      .locator('aside')
      .getByRole('button', { name: 'Collapse navigation', exact: true })
      .filter({ visible: true });
    if (await closeNavigation.count()) await closeNavigation.first().click();
    await member.waitForFunction(
      () => document.querySelector('aside')?.getBoundingClientRect().width <= 1
    );
    await member.evaluate(() => window.scrollTo(0, 0));
    await member.screenshot({
      path: '/private/tmp/colab-rise-learning-mobile.png',
      fullPage: true,
    });
    assert.equal(
      await member.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
    await member.setViewportSize({ width: 1440, height: 1000 });
    await member
      .getByRole('button', { name: 'Test, improve & showcase', exact: true })
      .click();
    await expect(
      member.getByRole('link', { name: 'Open team prompt', exact: true })
    ).toBeVisible();
    await audience.context().setOffline(true);
    await audience.context().setOffline(false);
    await host.getByRole('button', { name: 'Next team', exact: true }).click();
    await expect(audience.locator('.showcase-title')).toHaveText(
      room.teams[2].name,
      { timeout: 20000 }
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: RISE default mission, learning navigation, live Markdown, framework suggestions, AI review and staleness, attendee skills, shared review/results, stage rotation, random scenarios, reconnect, mobile layout.'
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
