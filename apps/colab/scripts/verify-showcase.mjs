import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifyShowcase({ browser, request, owner, alice, bob }) {
  const created = await request('/rooms', owner, {
    title: 'Live showcase verification',
    startsAt: Date.now() - 1000,
    endsAt: Date.now() + 3600000,
    maxUsers: 6,
    teamCount: 2,
  });
  assert.equal(created.status, 201);
  const room = await created.json();
  const path = `/rooms/${room.id}`;
  const team1Name = room.teams.find((team) => team.id === 'team-1').name;
  const team2Name = room.teams.find((team) => team.id === 'team-2').name;
  assert.equal(room.showcase, true);
  let response = await request(`${path}/action`, owner, {
    action: 'prompt',
    prompt: '[malformed-once] Build a careful event planning assistant.',
    revision: 0,
  });
  assert.equal(response.status, 200, await response.clone().text());
  response = await request(`${path}/ai`, owner, {
    action: 'compile',
    multiple: true,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).teams[0].skills[0].name, 'demo-skill');
  response = await request(`${path}/action`, owner, {
    action: 'prompt',
    prompt: '[always-malformed] Protect privacy and ask before publishing.',
    revision: 1,
  });
  assert.equal(response.status, 200, await response.clone().text());
  response = await request(`${path}/ai`, owner, {
    action: 'compile',
    multiple: true,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(
    (await response.json()).teams[0].skills[0].name,
    'team-working-guide'
  );
  for (const [email, who, teamId] of [
    ['alice@example.com', alice, 'team-1'],
    ['bob@example.com', bob, 'team-2'],
  ]) {
    assert.equal(
      (await request(`${path}/action`, owner, { action: 'invite', email }))
        .status,
      200
    );
    assert.equal((await request(`${path}/join`, who, { teamId })).status, 200);
  }
  const contexts = [];
  const errors = [];
  try {
    const pages = [];
    for (const who of [owner, alice, bob]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      contexts.push(context);
      await context.addCookies([
        { name: 'colab_session', value: who, domain: '127.0.0.1', path: '/' },
      ]);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:8795/?room=${room.id}`);
      await expect(
        page.getByRole('heading', { name: room.title })
      ).toBeVisible();
      await expect(page.locator('.presence')).toContainText('online');
      pages.push(page);
    }
    const [host, viewer, writer] = pages;
    await expect(host.getByRole('tab')).toHaveCount(0);
    await host
      .getByRole('button', { name: 'Switch application', exact: true })
      .click();
    await expect(
      host.getByRole('heading', { name: 'Apps', exact: true })
    ).toBeVisible();
    await expect(
      host.getByRole('searchbox', { name: 'Search apps', exact: true })
    ).toBeVisible();
    await expect(host.locator('[data-slot="app-card"]')).toHaveCount(28);
    await expect(host.getByText('28 apps', { exact: true })).toBeVisible();
    const appSearch = host.getByRole('searchbox', {
      name: 'Search apps',
      exact: true,
    });
    await appSearch.fill('calendar');
    await expect(host.getByText('1 app', { exact: true })).toBeVisible();
    await appSearch.clear();
    await expect(
      host.getByRole('link', { name: 'Calendar', exact: true })
    ).toBeVisible();
    await host.screenshot({
      path: '/private/tmp/colab-apps-launcher.png',
      fullPage: true,
    });
    await host.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
      viewer.getByRole('link', { name: 'Host controls', exact: true })
    ).toHaveCount(0);
    await host.screenshot({
      path: '/private/tmp/colab-sidebar-brief.png',
      fullPage: true,
    });
    for (const page of [viewer, writer])
      await page.getByRole('link', { name: 'Prompt', exact: true }).click();
    const teamSelect = (page) =>
      page.getByRole('combobox', { name: 'Team work' });
    const chooseTeam = async (page) => {
      await teamSelect(page).click();
      await page.getByRole('option', { name: team2Name, exact: true }).click();
    };
    const teamCount = async (page, count) => {
      await teamSelect(page).click();
      await expect(page.getByRole('option')).toHaveCount(count);
      await page.keyboard.press('Escape');
    };
    const originalDocument = await viewer.evaluate(
      () => performance.timeOrigin
    );
    await viewer.locator('#prompt').fill('Keep my unsaved team draft');
    await chooseTeam(viewer);
    await expect(viewer.locator('#team-skills')).toHaveCount(1);
    await expect(viewer.locator('#sandbox-desk')).toHaveCount(1);
    await expect(viewer.locator('.readonly-prompt:visible')).toBeVisible();
    await expect(
      viewer.getByRole('button', { name: 'Save team prompt' })
    ).not.toBeVisible();
    await writer
      .locator('#prompt')
      .fill('Read the launch brief and request approval before publishing.');
    await writer
      .getByRole('button', { name: 'Save team prompt', exact: true })
      .click();
    await expect(viewer.locator('.readonly-prompt:visible')).toContainText(
      'Read the launch brief'
    );
    await viewer
      .getByRole('link', { name: 'Activity log', exact: true })
      .click();
    await expect(
      viewer.getByText('Saved a team prompt', { exact: true }).last()
    ).toBeVisible();
    await viewer.getByRole('link', { name: 'Prompt', exact: true }).click();
    await host
      .getByRole('link', { name: 'Host controls', exact: true })
      .click();
    await host.getByRole('tab', { name: 'Showcase', exact: true }).click();
    const toggle = host.getByRole('switch', { name: 'Live showcase' });
    await expect(toggle.locator('..')).toHaveCSS('display', 'flex');
    await expect(toggle.locator('..')).toHaveCSS('flex-direction', 'row');
    await host.screenshot({
      path: '/private/tmp/colab-sidebar-controls.png',
      fullPage: true,
    });
    await host.emulateMedia({ colorScheme: 'dark' });
    await host.screenshot({
      path: '/private/tmp/colab-sidebar-controls-dark.png',
      fullPage: true,
    });
    await host.emulateMedia({ colorScheme: 'light' });
    const beforeCompile = await (await request(path, owner)).json();
    const compiling = request(`${path}/ai`, bob, {
      action: 'compile',
      multiple: true,
    });
    await expect
      .poll(async () => (await (await request(path, owner)).json()).aiCalls)
      .toBeGreaterThan(beforeCompile.aiCalls);
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await teamCount(viewer, 1);
    const compiled = await compiling;
    assert.equal(compiled.status, 200, await compiled.clone().text());
    await expect(
      viewer.getByText('demo-skill/SKILL.md', { exact: true })
    ).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toBeChecked();
    await chooseTeam(viewer);
    for (const action of ['run']) {
      const response = await request(`${path}/ai`, bob, {
        action,
        multiple: true,
      });
      assert.equal(response.status, 200, await response.clone().text());
    }
    assert.equal(
      (
        await request(`${path}/action`, owner, {
          action: 'showcaseTeam',
          teamId: 'team-2',
        })
      ).status,
      200
    );
    for (const page of [host, viewer, writer]) {
      await page
        .getByRole('link', { name: 'Live showcase', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: team2Name, exact: true })
      ).toBeVisible();
      await expect(page.getByText('demo-skill', { exact: true })).toBeVisible();
      await expect(
        page
          .locator('.showcase-workspace')
          .getByText('Live demo agent result', { exact: true })
      ).toBeVisible();
    }
    await expect(
      viewer.getByRole('button', { name: 'Run live test', exact: true })
    ).toHaveCount(0);
    const beforeLiveTest = await (await request(path, owner)).json();
    const beforeLiveRunCount = beforeLiveTest.teams.find(
      (team) => team.id === 'team-2'
    ).runs.length;
    await writer
      .getByRole('button', { name: 'Run live test', exact: true })
      .click();
    await expect
      .poll(async () => {
        const room = await (await request(path, owner)).json();
        return room.teams.find((team) => team.id === 'team-2').runs.length;
      })
      .toBeGreaterThan(beforeLiveRunCount);
    await host.getByRole('button', { name: 'Next team', exact: true }).click();
    await expect(
      viewer.getByRole('heading', { name: team1Name, exact: true })
    ).toBeVisible();
    await host.screenshot({
      path: '/private/tmp/colab-showcase-tab-desktop.png',
      fullPage: true,
    });
    await host.setViewportSize({ width: 390, height: 844 });
    const closeNavigation = host
      .locator('aside')
      .getByRole('button', { name: 'Collapse navigation', exact: true })
      .filter({ visible: true });
    if (await closeNavigation.count()) await closeNavigation.first().click();
    await host.waitForFunction(
      () => document.querySelector('aside')?.getBoundingClientRect().width <= 1
    );
    assert.ok(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      'showcase mobile horizontal overflow'
    );
    await host.screenshot({
      path: '/private/tmp/colab-live-showcase-mobile.png',
      fullPage: true,
    });
    await host.setViewportSize({ width: 1440, height: 1000 });
    await host
      .getByRole('link', { name: 'Host controls', exact: true })
      .click();
    await host.getByRole('tab', { name: 'Showcase', exact: true }).click();
    await viewer.getByRole('link', { name: 'Skills', exact: true }).click();
    await expect(
      viewer.getByText('demo-skill/SKILL.md', { exact: true })
    ).toBeVisible();
    await viewer.getByRole('link', { name: 'Results', exact: true }).click();
    await expect(
      viewer.getByText('Live demo agent result', { exact: true }).first()
    ).toBeVisible();
    await viewer
      .getByRole('link', { name: 'Practice apps', exact: true })
      .click();
    await expect(
      viewer.getByText('Live demo document', { exact: true }).first()
    ).toBeVisible();
    await viewer.getByRole('link', { name: 'Prompt', exact: true }).click();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(teamSelect(viewer)).toContainText(team1Name);
    await teamCount(viewer, 1);
    await expect(viewer.locator('#prompt')).toHaveValue(
      'Keep my unsaved team draft'
    );
    await expect(
      viewer.getByText('Live demo agent result', { exact: true })
    ).toHaveCount(0);
    await expect(
      viewer.getByText('Live demo document', { exact: true })
    ).toHaveCount(0);
    await writer.getByRole('link', { name: 'Prompt', exact: true }).click();
    await teamCount(writer, 1);
    await writer.getByRole('link', { name: 'Results', exact: true }).click();
    await expect(
      writer.getByText('Live demo agent result', { exact: true }).first()
    ).toBeVisible();
    assert.equal(
      (
        await request(`${path}/action`, alice, {
          action: 'showcase',
          enabled: true,
        })
      ).status,
      403
    );
    const hiddenWrite = await request(`${path}/action`, bob, {
      action: 'prompt',
      prompt: 'Updated while sharing is off',
      revision: 1,
    });
    assert.equal(hiddenWrite.status, 200);
    const hiddenView = await (await request(path, alice)).json();
    assert.equal(hiddenView.teams.length, 1);
    assert.ok(
      !JSON.stringify(hiddenView).includes('Updated while sharing is off')
    );
    await toggle.click();
    await expect(toggle).toBeChecked();
    await teamCount(viewer, 2);
    await expect(teamSelect(viewer)).toContainText(team1Name);
    await chooseTeam(viewer);
    await expect(viewer.locator('.readonly-prompt:visible')).toHaveText(
      'Updated while sharing is off'
    );
    assert.equal(
      await viewer.evaluate(() => performance.timeOrigin),
      originalDocument
    );
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await teamCount(viewer, 1);
    await viewer.reload();
    await teamCount(viewer, 1);
    // Promoted room admins can control sharing too, regardless of email domain.
    assert.equal(
      (
        await request(`${path}/action`, owner, {
          action: 'admin',
          memberId: 'alice',
          enabled: true,
        })
      ).status,
      200
    );
    await viewer
      .getByRole('link', { name: 'Host controls', exact: true })
      .click();
    await viewer.getByRole('tab', { name: 'Showcase', exact: true }).click();
    await viewer.getByRole('switch', { name: 'Live showcase' }).click();
    await expect(toggle).toBeChecked();
    await teamCount(writer, 2);
    const beforeConflict = await (await request(path, owner)).json();
    const conflicting = request(`${path}/ai`, bob, {
      action: 'compile',
      multiple: true,
    });
    await expect
      .poll(async () => (await (await request(path, owner)).json()).aiCalls)
      .toBeGreaterThan(beforeConflict.aiCalls);
    const team = beforeConflict.teams.find((item) => item.id === 'team-2');
    assert.equal(
      (
        await request(`${path}/action`, bob, {
          action: 'prompt',
          prompt: 'A new prompt while compilation is running',
          revision: team.revision,
        })
      ).status,
      200
    );
    assert.equal(
      (await conflicting).status,
      409,
      'Actual prompt changes must still reject stale AI output'
    );
    await writer.screenshot({
      path: '/private/tmp/colab-live-showcase.png',
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: three-browser live showcase, saved prompts, skills, practice data, run results, instant hide/show, admin-only controls, delegated admin, reconnect privacy, own draft preservation.'
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
