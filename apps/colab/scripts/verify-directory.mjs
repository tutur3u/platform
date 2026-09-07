import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifyDirectory({ request, owner, alice, browser }) {
  const created = await request('/rooms', owner, {
    title: 'Directory access verification',
    startsAt: Date.now() - 1000,
    endsAt: Date.now() + 3600000,
    maxUsers: 4,
    teamCount: 2,
  });
  assert.equal(created.status, 201);
  const room = await created.json();
  const path = `/rooms/${room.id}`;
  const list = async (identity) => {
    const response = await request('/workshops', identity);
    assert.equal(response.status, 200);
    return (await response.json()).workshops;
  };
  assert.ok((await list(owner)).some((item) => item.id === room.id));
  assert.ok(!(await list(alice)).some((item) => item.id === room.id));
  await request(`${path}/action`, owner, {
    action: 'invite',
    email: 'alice@example.com',
  });
  await request(`${path}/join`, alice, { teamId: 'team-2' });
  assert.ok((await list(alice)).some((item) => item.id === room.id));
  const view = await (await request(path, owner)).json();
  assert.ok(view.audit.some((entry) => entry.action === 'created'));
  assert.ok(view.audit.some((entry) => entry.action === 'invite'));
  const learner = await (await request(path, alice)).json();
  assert.ok(!learner.audit.some((entry) => entry.adminOnly));
  assert.ok(!JSON.stringify(view.audit).includes('alice@example.com'));
  await request(`${path}/action`, owner, { action: 'mode', mode: 'private' });
  assert.ok(!(await list(alice)).some((item) => item.id === room.id));
  assert.ok((await list(owner)).some((item) => item.id === room.id));
  await request(`${path}/action`, owner, { action: 'mode', mode: 'open' });
  assert.ok((await list(alice)).some((item) => item.id === room.id));
  await request(`${path}/action`, owner, {
    action: 'revoke',
    email: 'alice@example.com',
  });
  assert.ok(!(await list(alice)).some((item) => item.id === room.id));
  const context = await browser.newContext();
  try {
    await context.addCookies([
      { name: 'colab_session', value: owner, domain: '127.0.0.1', path: '/' },
    ]);
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8795/workshops');
    await expect(
      page.getByRole('button', { name: room.title, exact: true })
    ).toBeVisible();
    await page.evaluate(() => {
      window.__directoryDocument = document;
    });
    await page
      .getByRole('textbox', { name: 'Search workshops…' })
      .fill('no-matching-workshop');
    await expect(
      page.getByText('No matching workshops', { exact: true })
    ).toBeVisible();
    await page.getByRole('textbox', { name: 'Search workshops…' }).fill('');
    await page.clock.setFixedTime(new Date(Date.now() + 7200000));
    await page.getByRole('tab', { name: /Past workshops/ }).click();
    await expect(
      page.getByRole('button', { name: room.title, exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Ended', { exact: true }).first()
    ).toBeVisible();
    assert.equal(
      await page.evaluate(() => window.__directoryDocument === document),
      true
    );
    await page.screenshot({ path: '/private/tmp/colab-workshops-past.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    );
  } finally {
    await context.close();
  }
  console.log(
    'PASS: persisted directory, membership/private/revocation filtering, audit recording and admin projection.'
  );
}
