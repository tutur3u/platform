import { expect, type Page, test } from '@playwright/test';
import { clearMailpitMessages, completeOtpStage } from './helpers/auth';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetDbRateLimits,
  setWebOtpEnabled,
} from './helpers/rate-limits';
import {
  assertSafeTasksLifecycleEnvironment,
  cleanupTasksLifecycleFixtures,
  createBoardFromSwitcher,
  createTaskFromBoard,
  findLocalUserId,
  launchTasksFromAppsPicker,
  openTaskFromBoard,
  readServiceRows,
  selectBoardFromSwitcher,
  WEB_E2E_ORIGIN,
} from './helpers/tasks-workspace-lifecycle';

type TaskRow = {
  deleted_at: string | null;
  end_date: string | null;
  estimation_points: number | null;
  name: string;
  priority: string | null;
};

type TaskListRow = {
  board_id: string;
  id: string;
  status: string;
};

async function submitEmailOtp(page: Page, email: string): Promise<void> {
  let submittedEmail: string | undefined;
  await page
    .waitForLoadState('networkidle', { timeout: 30_000 })
    .catch(() => undefined);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const emailInput = page
      .getByPlaceholder('Enter your email or username')
      .first();
    await expect(emailInput).toBeVisible({ timeout: 120_000 });
    await emailInput.clear();
    await emailInput.fill(email);
    await expect(emailInput).toHaveValue(email);

    const sendRequestPromise = page.waitForRequest((request) => {
      return (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/auth/otp/send'
      );
    });
    await page
      .locator('form button[type="submit"]')
      .filter({ hasText: /continue/i })
      .first()
      .click();
    const sendRequest = await sendRequestPromise;
    const payload = sendRequest.postDataJSON() as { email?: string };
    submittedEmail = payload.email;

    if (submittedEmail === email) break;
    await page.getByRole('button', { name: 'Back', exact: true }).click();
  }

  expect(submittedEmail, 'OTP form submitted an unexpected email').toBe(email);
  await completeOtpStage(page, email);
}

async function signUpWithEmailOtp(page: Page, email: string): Promise<void> {
  await page.goto(`${WEB_E2E_ORIGIN}/en/login`, {
    waitUntil: 'domcontentloaded',
  });
  await submitEmailOtp(page, email);
}

async function completeCrossAppLoginWhenRequested(
  page: Page,
  email: string,
  tasksOrigin: string
): Promise<void> {
  const emailInput = page
    .getByPlaceholder('Enter your email or username')
    .first();
  const destination = await Promise.race([
    emailInput
      .waitFor({ state: 'visible', timeout: 120_000 })
      .then(() => 'login' as const),
    page
      .getByRole('button', { name: /add task/i })
      .last()
      .waitFor({ state: 'visible', timeout: 120_000 })
      .then(() => 'tasks' as const),
    page
      .getByRole('button', { name: 'Accept invitation', exact: true })
      .waitFor({ state: 'visible', timeout: 120_000 })
      .then(() => 'tasks' as const),
  ]);

  if (destination === 'login') {
    await clearMailpitMessages();
    const verifierResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === tasksOrigin && url.pathname.endsWith('/verify-token')
      );
    });
    await submitEmailOtp(page, email);
    const verifierResponse = await verifierResponsePromise;
    expect(
      verifierResponse.status(),
      `Tasks verifier returned ${await verifierResponse.text().catch(() => '')}`
    ).toBeLessThan(400);
    await expect
      .poll(async () => {
        const cookies = await page.context().cookies(tasksOrigin);
        return cookies.map((cookie) => cookie.name);
      })
      .toContain('tuturuuu_app_session');
  }
}

async function completeTeamOnboarding(
  page: Page,
  workspaceName: string,
  memberEmail: string
): Promise<string> {
  await page.goto(`${WEB_E2E_ORIGIN}/en/onboarding`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  const onboarding = page.locator('#main-content');
  const smallTeam = onboarding
    .getByRole('button')
    .filter({ hasText: /Small Team/ });
  await onboarding
    .getByRole('button', { name: 'Get Started', exact: true })
    .click();
  await expect(smallTeam).toBeVisible();
  await smallTeam.click();
  await onboarding
    .getByRole('button', { name: 'Continue', exact: true })
    .click();

  const displayName = onboarding.getByPlaceholder('Your name');
  await expect(displayName).toBeVisible();
  await displayName.fill('Tasks Lifecycle Owner');
  await onboarding
    .getByRole('button', { name: 'Continue', exact: true })
    .click();

  const workspaceNameInput = onboarding.getByPlaceholder('Acme Inc.');
  await expect(workspaceNameInput).toBeVisible();
  await workspaceNameInput.fill(workspaceName);
  const workspaceResponsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/workspaces/team'
    );
  });
  await onboarding
    .getByRole('button', { name: 'Continue', exact: true })
    .click();
  const workspaceResponse = await workspaceResponsePromise;
  const workspaceResponseText = await workspaceResponse.text();
  expect(workspaceResponse.status(), workspaceResponseText).toBe(200);
  const workspace = JSON.parse(workspaceResponseText) as { id?: string };
  expect(
    workspace.id,
    'expected onboarding to create a workspace'
  ).toBeTruthy();

  const inviteInput = onboarding.getByPlaceholder('colleague@company.com');
  await expect(inviteInput).toBeVisible();
  await inviteInput.fill(memberEmail);
  await inviteInput.press('Enter');
  await expect(
    onboarding.getByText(memberEmail, { exact: true })
  ).toBeVisible();
  const inviteResponsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname ===
        `/api/v1/workspaces/${workspace.id}/members/batch-invite`
    );
  });
  await onboarding
    .getByRole('button', { name: 'Send Invites', exact: true })
    .click();
  const inviteResponse = await inviteResponsePromise;
  const inviteResponseText = await inviteResponse.text();
  expect(inviteResponse.ok(), inviteResponseText).toBeTruthy();
  const invitePayload = JSON.parse(inviteResponseText) as {
    results?: { email: string; error?: string; success: boolean }[];
    successCount?: number;
  };
  expect(
    invitePayload.successCount,
    `expected ${memberEmail} to be invited: ${JSON.stringify(invitePayload.results)}`
  ).toBe(1);

  await onboarding
    .getByRole('button', { name: 'Go to Dashboard', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${workspace.id}$`), {
    timeout: 60_000,
  });
  return workspace.id!;
}

async function completeInvitedMemberOnboarding(
  page: Page,
  workspaceId: string
): Promise<void> {
  const onboarding = page.locator('#main-content');
  const getStarted = onboarding.getByRole('button', {
    name: 'Get Started',
    exact: true,
  });
  await expect(getStarted).toBeVisible({ timeout: 60_000 });
  await getStarted.click();

  // Accepting the invitation gives this new account an existing team
  // workspace, so the product skips workspace creation and asks only for the
  // member's profile before finishing onboarding.
  const displayName = onboarding.getByPlaceholder('Your name');
  await expect(displayName).toBeVisible({ timeout: 60_000 });
  await displayName.fill('Tasks Lifecycle Member');
  await onboarding
    .getByRole('button', { name: 'Continue', exact: true })
    .click();

  const goToDashboard = onboarding.getByRole('button', {
    name: 'Go to Dashboard',
    exact: true,
  });
  await expect(goToDashboard).toBeVisible({ timeout: 60_000 });
  await goToDashboard.click();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}$`), {
    timeout: 60_000,
  });
}

async function configureTaskThroughDialog(
  page: Page,
  boardName: string,
  labelName: string,
  projectName: string
): Promise<void> {
  const propertiesToggle = page
    .getByRole('button', { name: /properties/i })
    .first();
  if (await propertiesToggle.isVisible().catch(() => false)) {
    await propertiesToggle.click();
  }

  await page.getByRole('button', { name: 'Priority', exact: true }).click();
  await page.getByRole('button', { name: 'High', exact: true }).click();
  await page.getByRole('button', { name: 'Dates', exact: true }).click();
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();

  await page.getByRole('button', { name: 'Estimate', exact: true }).click();
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  const estimationDialog = page.getByRole('dialog', {
    name: `Configure Estimation for "${boardName}"`,
  });
  await expect(estimationDialog).toBeVisible();
  await estimationDialog
    .getByRole('combobox', { name: 'Estimation Method' })
    .click();
  await page.getByRole('option', { name: /Linear/ }).click();
  await estimationDialog
    .getByRole('button', { name: 'Update Estimation', exact: true })
    .click();
  await expect(estimationDialog).toBeHidden();
  await page.getByRole('button', { name: 'Estimate', exact: true }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();

  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('button', { name: 'Create Label', exact: true }).click();
  const labelDialog = page.getByRole('dialog', { name: 'Create New Label' });
  await labelDialog
    .getByPlaceholder('e.g., Bug, Feature, Priority')
    .fill(labelName);
  await labelDialog
    .getByRole('button', { name: 'Create Label', exact: true })
    .click();
  await expect(labelDialog).toBeHidden();

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page
    .getByRole('button', { name: 'Create Project', exact: true })
    .click();
  const projectDialog = page.getByRole('dialog', {
    name: 'Create New Project',
  });
  await projectDialog
    .getByPlaceholder('e.g., Website Redesign, Q4 Campaign')
    .fill(projectName);
  await projectDialog
    .getByRole('button', { name: 'Create Project', exact: true })
    .click();
  await expect(projectDialog).toBeHidden();
}

test.describe('Tasks workspace lifecycle', () => {
  test.beforeAll(() => {
    assertSafeTasksLifecycleEnvironment();
  });

  test('follows signup, onboarding, invitation, and Kanban CRUD end to end', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(600_000);

    const runId = `${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`;
    const ownerEmail = `tasks-owner-${runId}@example.com`;
    const memberEmail = `tasks-member-${runId}@example.com`;
    const workspaceName = `Tasks workspace ${runId}`;
    const boardName = `Lifecycle board ${runId}`;
    const ownerTaskName = `Plan release ${runId}`;
    const memberTaskName = `Review release ${runId}`;
    const renamedMemberTaskName = `Approve release ${runId}`;
    const labelName = `E2E label ${runId}`;
    const projectName = `E2E project ${runId}`;
    const headers = e2eClientHeaders(e2eClientIpForTest(testInfo, 214));
    const ownerContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const memberContext = await browser.newContext({
      extraHTTPHeaders: headers,
    });
    const ownerPage = await ownerContext.newPage();
    const memberPage = await memberContext.newPage();
    for (const page of [ownerPage, memberPage]) {
      page.setDefaultTimeout(30_000);
      page.setDefaultNavigationTimeout(60_000);
    }
    const userIds: string[] = [];
    let workspaceId: string | undefined;
    let ownerUserId = '';
    let previousOtpState: boolean | undefined;

    try {
      await resetDbRateLimits();
      previousOtpState = await setWebOtpEnabled(true);
      await clearMailpitMessages();

      await test.step('sign up and complete team onboarding in the browser', async () => {
        await signUpWithEmailOtp(ownerPage, ownerEmail);
        ownerUserId = await findLocalUserId(ownerEmail);
        userIds.push(ownerUserId);
        workspaceId = await completeTeamOnboarding(
          ownerPage,
          workspaceName,
          memberEmail
        );
        expect(
          await readServiceRows<{
            creator_id: string;
            workspace_members: { type: string; user_id: string }[];
          }>(
            'workspaces',
            `id=eq.${workspaceId}&select=creator_id,workspace_members(type,user_id)`
          )
        ).toEqual([
          {
            creator_id: ownerUserId,
            workspace_members: [{ type: 'MEMBER', user_id: ownerUserId }],
          },
        ]);
      });

      let boardId = '';
      let ownerTaskId = '';
      await test.step('launch Tasks and create a configured board and task through the UI', async () => {
        const ownerTasksOrigin = await launchTasksFromAppsPicker(ownerPage);
        await completeCrossAppLoginWhenRequested(
          ownerPage,
          ownerEmail,
          ownerTasksOrigin
        );
        await expect(ownerPage).toHaveURL(
          new RegExp(`/${workspaceId}/boards/[0-9a-f-]+$`),
          { timeout: 120_000 }
        );

        boardId = await createBoardFromSwitcher(
          ownerPage,
          workspaceId!,
          boardName
        );
        expect(
          await readServiceRows<{ id: string; name: string; ws_id: string }>(
            'workspace_boards',
            `id=eq.${boardId}&select=id,name,ws_id`
          )
        ).toEqual([{ id: boardId, name: boardName, ws_id: workspaceId }]);

        const boardLists = await readServiceRows<TaskListRow>(
          'task_lists',
          `board_id=eq.${boardId}&deleted=eq.false&order=position.asc&select=id,board_id,status`
        );
        expect(boardLists.length).toBeGreaterThanOrEqual(4);
        const targetList = boardLists.find(
          (list) => list.status === 'not_started'
        );
        expect(
          targetList,
          'expected the new board to have a backlog list'
        ).toBeTruthy();

        const ownerTask = await createTaskFromBoard(
          ownerPage,
          workspaceId!,
          targetList!.id,
          ownerTaskName
        );
        ownerTaskId = ownerTask.id;
        await openTaskFromBoard(ownerPage, ownerTaskName);
        await configureTaskThroughDialog(
          ownerPage,
          boardName,
          labelName,
          projectName
        );

        await expect
          .poll(async () => {
            const rows = await readServiceRows<TaskRow>(
              'tasks',
              `id=eq.${ownerTaskId}&select=name,priority,end_date,estimation_points,deleted_at`
            );
            return rows[0];
          })
          .toMatchObject({
            deleted_at: null,
            end_date: expect.any(String),
            estimation_points: 3,
            name: ownerTaskName,
            priority: 'high',
          });

        const labelRows = await readServiceRows<{ id: string }>(
          'workspace_task_labels',
          `ws_id=eq.${workspaceId}&name=eq.${encodeURIComponent(labelName)}&select=id`
        );
        expect(labelRows).toHaveLength(1);
        const projectRows = await readServiceRows<{ id: string }>(
          'task_projects',
          `ws_id=eq.${workspaceId}&name=eq.${encodeURIComponent(projectName)}&select=id`
        );
        expect(projectRows).toHaveLength(1);
        await expect
          .poll(async () => {
            const rows = await readServiceRows<{ label_id: string }>(
              'task_labels',
              `task_id=eq.${ownerTaskId}&label_id=eq.${labelRows[0]!.id}&select=label_id`
            );
            return rows[0]?.label_id;
          })
          .toBe(labelRows[0]!.id);
        await expect
          .poll(async () => {
            const rows = await readServiceRows<{ project_id: string }>(
              'task_project_tasks',
              `task_id=eq.${ownerTaskId}&project_id=eq.${projectRows[0]!.id}&select=project_id`
            );
            return rows[0]?.project_id;
          })
          .toBe(projectRows[0]!.id);
      });

      await test.step('sign up the invited member, accept, and perform task CRUD', async () => {
        await clearMailpitMessages();
        await signUpWithEmailOtp(memberPage, memberEmail);
        const memberUserId = await findLocalUserId(memberEmail);
        userIds.push(memberUserId);
        await memberPage.goto(`${WEB_E2E_ORIGIN}/onboarding`, {
          waitUntil: 'domcontentloaded',
        });

        const acceptButton = memberPage.getByRole('button', {
          name: /^Accept Invite$/i,
        });
        await expect(acceptButton).toBeVisible({ timeout: 120_000 });
        await acceptButton.click();
        await expect
          .poll(async () => {
            const rows = await readServiceRows<{ user_id: string }>(
              'workspace_members',
              `ws_id=eq.${workspaceId}&user_id=eq.${userIds.at(-1)}&select=user_id`
            );
            return rows[0]?.user_id;
          })
          .toBe(userIds.at(-1));

        await completeInvitedMemberOnboarding(memberPage, workspaceId!);

        const memberTasksOrigin = await launchTasksFromAppsPicker(memberPage);
        await completeCrossAppLoginWhenRequested(
          memberPage,
          memberEmail,
          memberTasksOrigin
        );

        await selectBoardFromSwitcher(
          memberPage,
          workspaceId!,
          boardId,
          boardName
        );
        await expect(
          memberPage.getByText(ownerTaskName, { exact: true }).first()
        ).toBeVisible({ timeout: 60_000 });

        const memberTask = await createTaskFromBoard(
          memberPage,
          workspaceId!,
          (
            await readServiceRows<TaskListRow>(
              'task_lists',
              `board_id=eq.${boardId}&status=eq.not_started&deleted=eq.false&order=position.asc&limit=1&select=id,board_id,status`
            )
          )[0]!.id,
          memberTaskName
        );
        await openTaskFromBoard(memberPage, memberTaskName);
        const memberTaskInput = memberPage.locator('[data-task-name-input]');
        await memberTaskInput.fill(renamedMemberTaskName);
        await memberTaskInput.blur();
        await expect
          .poll(async () => {
            const rows = await readServiceRows<TaskRow>(
              'tasks',
              `id=eq.${memberTask.id}&select=name,priority,end_date,estimation_points,deleted_at`
            );
            return rows[0]?.name;
          })
          .toBe(renamedMemberTaskName);

        const taskDialog = memberPage.getByRole('dialog').filter({
          has: memberTaskInput,
        });
        await taskDialog.getByRole('button', { name: /more options/i }).click();
        await memberPage.getByRole('menuitem', { name: /^delete$/i }).click();
        await expect(
          memberPage.getByRole('heading', { name: 'Delete task?' })
        ).toBeVisible();
        await memberPage
          .getByRole('button', { name: 'Move to Trash', exact: true })
          .click();
        await expect
          .poll(async () => {
            const rows = await readServiceRows<TaskRow>(
              'tasks',
              `id=eq.${memberTask.id}&select=name,priority,end_date,estimation_points,deleted_at`
            );
            return rows[0]?.deleted_at;
          })
          .toEqual(expect.any(String));
      });
    } finally {
      testInfo.setTimeout(testInfo.timeout + 30_000);
      if (previousOtpState !== undefined) {
        await setWebOtpEnabled(previousOtpState);
      }
      await cleanupTasksLifecycleFixtures({
        userEmails: [ownerEmail, memberEmail],
        userIds,
        workspaceId,
      });
      await memberContext.close();
      await ownerContext.close();
    }
  });
});
