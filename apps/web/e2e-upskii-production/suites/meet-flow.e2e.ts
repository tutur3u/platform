import { expect, forgetUpskiiSessions, owners, run, test } from '../fixtures';
import { HOSTS, on } from '../policy';
import {
  admitIfWaiting,
  bothSignedIn,
  callbackUrl,
  chooseMira,
  COPY,
  createMeeting,
  deleteMeeting,
  enterRoom,
  expectInCall,
  expectLinkResult,
  hostTurnOnMira,
  isInCall,
  LINK_STATE_COOKIE,
  linkCard,
  linkThroughConsent,
  MIRA_HELD,
  MIRA_IN_E2E,
  MIRA_UNAVAILABLE,
  meetGet,
  miraAvailable,
  miraRoom,
  need,
  openUpskiiPresenter,
  presentFirstUpskiiItem,
  randomValue,
  realtimeClaims,
  roomUrlFor,
  startConnect,
  TUTURUUU_LINK_PATH,
  trackLink,
  tuturuuuLinkStatus,
  upskiiDisconnect,
  upskiiLinkStatus,
  upskiiSession,
} from './meet-flow-helpers';

/**
 * Upskii ↔ Tuturuuu Meet journey against production with the run's QA
 * actors. Workspace members (learner, decliner) join a run-workspace meeting
 * without the waiting room; the non-member outsider is the one held there.
 */

const LINK_UNAVAILABLE =
  'Tuturuuu linking is not enabled on production Upskii (link secrets unset)';

test.describe.serial('meet-flow journey', () => {
  const journey: { linked: boolean; meetingId?: string; roomUrl?: string } = {
    linked: false,
  };

  // Cross-test objects: the teacher's link and the journey meeting.
  test.afterAll(async ({ actors, tuturuuuContext, upskiiContext }) => {
    const { tt, up } = need(actors);
    const host = await tuturuuuContext(tt.host);
    try {
      if (journey.meetingId) {
        const status = await deleteMeeting(
          host,
          tt.workspaceId,
          journey.meetingId
        );
        test.info().annotations.push({
          type: 'cleanup',
          description: `journey meeting delete: HTTP ${status}`,
        });
      }
    } finally {
      if (journey.linked) {
        try {
          await upskiiDisconnect(await upskiiContext(up.teacher));
        } finally {
          await host.request.delete(on('tuturuuu', TUTURUUU_LINK_PATH), {
            headers: { origin: HOSTS.tuturuuu },
            maxRedirects: 0,
          });
        }
      }
    }
  });

  test('1. Upskii sign-in reaches the signed-in shell', async ({
    actors,
    upskiiContext,
  }) => {
    const { up } = need(actors);
    const ctx = await upskiiContext(up.teacher);
    const page = await ctx.newPage();
    await page.goto(on('upskiiApp', '/'));
    await expect(page).toHaveURL(
      (u) =>
        u.origin === HOSTS.upskiiApp && !/(login|sign-in)/u.test(u.pathname)
    );
    await expect(
      page.getByRole('main').or(page.getByRole('navigation')).first()
    ).toBeVisible();
    expect((await upskiiSession(ctx))?.user?.email).toBe(up.teacher.email);
  });

  test('2. teacher links the Tuturuuu account from Upskii', async ({
    actors,
    tuturuuuContext,
    upskiiContext,
    track,
  }) => {
    const { tt, up } = need(actors);
    const ctx = await bothSignedIn(
      await tuturuuuContext(tt.host),
      await upskiiContext(up.teacher)
    );
    const before = await upskiiLinkStatus(ctx);
    test.skip(!before.enabled, LINK_UNAVAILABLE);
    expect(before.link, 'a fresh teacher starts unlinked').toBeNull();
    trackLink(track, 'teacher');
    journey.linked = true;

    const page = await ctx.newPage();
    expect(await linkThroughConsent(page, '/settings/preferences')).toBe(
      'linked'
    );
    await expectLinkResult(page, 'linked', COPY.linked);
    await expect(
      linkCard(page).getByText(`Linked to ${tt.host.email}`)
    ).toBeVisible();

    const status = await upskiiLinkStatus(ctx);
    expect(status.confirmed).toBe(true);
    expect(status.link).not.toBeNull();
    const remote = await tuturuuuLinkStatus(ctx);
    expect(remote.link).not.toBeNull();
    trackLink(track, 'teacher', remote.link?.linkId);
  });

  test('link conflict: the student cannot link the already linked host', async ({
    actors,
    tuturuuuContext,
    upskiiContext,
    track,
  }) => {
    test.skip(!journey.linked, 'Teacher link was not established');
    const { tt, up } = need(actors);
    const ctx = await bothSignedIn(
      await tuturuuuContext(tt.host),
      await upskiiContext(up.student)
    );
    // Recorded in case the refusal regresses into a second link.
    trackLink(track, 'student');
    try {
      const page = await ctx.newPage();
      expect(await linkThroughConsent(page, '/settings')).toBe('LINK_CONFLICT');
      await expectLinkResult(page, 'LINK_CONFLICT', COPY.conflict);
      expect((await upskiiLinkStatus(ctx)).link).toBeNull();
    } finally {
      const status = await upskiiLinkStatus(ctx).catch(() => null);
      if (status?.link) await upskiiDisconnect(ctx);
    }
  });

  test('3. host starts a Meet session and presents Upskii content', async ({
    actors,
    tuturuuuContext,
    track,
    label,
  }) => {
    const { tt } = need(actors);
    const host = await tuturuuuContext(tt.host);
    journey.meetingId = await createMeeting(
      host,
      track,
      tt.workspaceId,
      label('meet'),
      'journey'
    );
    const page = await host.newPage();
    journey.roomUrl = await roomUrlFor(page, tt.workspaceId, journey.meetingId);
    await enterRoom(page, journey.roomUrl, 'QA Host');
    await expectInCall(page);

    const panel = await openUpskiiPresenter(page);
    test.skip(
      !panel,
      'The Upskii presenter is not offered in the Meet Activities hub (upskiiTool is not in meet-core tools/registry.ts)'
    );
    if (!panel) return;
    test.skip(!journey.linked, 'Teacher link was not established');
    const outcome = await presentFirstUpskiiItem(panel);
    // The per-run teacher owns no class unless one is seeded; the empty
    // states are the presenter's answer for a linked teacher without content.
    test.info().annotations.push({ type: 'presenter', description: outcome });
  });

  test('4. learner joins, is admitted and confirms Mira', async ({
    actors,
    tuturuuuContext,
  }) => {
    const { tt } = need(actors);
    const { meetingId, roomUrl } = journey;
    if (!meetingId || !roomUrl) throw new Error('Journey meeting missing');
    const host = await tuturuuuContext(tt.host);
    const hostPage = await host.newPage();
    await enterRoom(hostPage, roomUrl, 'QA Host');
    await expectInCall(hostPage);

    const learner = await tuturuuuContext(tt.learner);
    const learnerPage = await learner.newPage();
    await enterRoom(learnerPage, roomUrl, 'QA Learner');
    const waited = await admitIfWaiting(hostPage);
    test.info().annotations.push({
      type: 'admission',
      description: waited
        ? 'learner admitted from the waiting room'
        : 'workspace member joined without the waiting room',
    });
    await expectInCall(learnerPage);

    test.skip(!MIRA_IN_E2E, MIRA_HELD);
    test.skip(!(await miraAvailable(host, meetingId)), MIRA_UNAVAILABLE);
    await hostTurnOnMira(hostPage);
    await expect
      .poll(async () => {
        const mira = await miraRoom(host, meetingId);
        return mira.available && !!mira.acceptance;
      })
      .toBe(true);
    await chooseMira(learnerPage, 'on');
    await expect
      .poll(async () => {
        const mira = await miraRoom(learner, meetingId);
        return mira.available ? mira.choice : null;
      })
      .toBe('on');
  });

  test('decliner joins, declines Mira and is excluded', async ({
    actors,
    tuturuuuContext,
  }) => {
    const { tt } = need(actors);
    const { meetingId, roomUrl } = journey;
    if (!meetingId || !roomUrl) throw new Error('Journey meeting missing');
    const host = await tuturuuuContext(tt.host);
    const hostPage = await host.newPage();
    await enterRoom(hostPage, roomUrl, 'QA Host');
    await expectInCall(hostPage);
    test.skip(!MIRA_IN_E2E, MIRA_HELD);
    test.skip(!(await miraAvailable(host, meetingId)), MIRA_UNAVAILABLE);
    const current = await miraRoom(host, meetingId);
    if (current.available && !current.acceptance)
      await hostTurnOnMira(hostPage);

    const decliner = await tuturuuuContext(tt.decliner);
    const page = await decliner.newPage();
    await enterRoom(page, roomUrl, 'QA Decliner', 'untick');
    await admitIfWaiting(hostPage);
    await expectInCall(page);
    await chooseMira(page, 'off');

    await expect
      .poll(async () => {
        const mira = await miraRoom(decliner, meetingId);
        return mira.available ? `${mira.choice}:${mira.ready}` : 'unavailable';
      })
      .toBe('off:false');
    // Aggregate counts only: the decliner is admitted but not included.
    const room = await miraRoom(host, meetingId);
    expect(room.available).toBe(true);
    if (room.available)
      expect(room.status.included).toBeLessThan(room.status.admitted);
    const transcript = await meetGet<{ available: boolean; choice?: string }>(
      decliner,
      `/api/meet-call/${meetingId}/transcript-consent`
    );
    expect(transcript.status).toBe(200);
    if (transcript.body?.available)
      expect(transcript.body.choice).toBe('decline');
  });

  test('5. the meeting record is written back and readable by the host', async ({
    actors,
    tuturuuuContext,
    track,
  }) => {
    const { tt } = need(actors);
    const { meetingId } = journey;
    if (!meetingId) throw new Error('Journey meeting missing');
    const host = await tuturuuuContext(tt.host);
    const path = `/api/meet-record/${tt.workspaceId}/${meetingId}`;
    const key = `meet-flow:record-item:${run.runLabel}`;
    const base = {
      key,
      kind: 'tuturuuu-meeting' as const,
      actor: 'host' as const,
      coveredBy: owners.tuturuuu,
      meta: { object: 'meeting-record-item', meetingId },
    };
    track(base);
    const content = `[QA-E2E ${run.runLabel}] decision`;
    const created = await host.request.post(on('meet', path), {
      headers: { origin: HOSTS.meet, 'content-type': 'application/json' },
      data: { kind: 'decision', content },
      maxRedirects: 0,
    });
    expect(created.status(), 'record item create').toBe(200);
    const { id } = (await created.json()) as { id: string };
    track({ ...base, id });
    try {
      const { status, body } = await meetGet<{
        isHost: boolean;
        items: Array<{ id: string; kind: string; content: string }>;
      }>(host, path);
      expect(status).toBe(200);
      expect(body?.isHost).toBe(true);
      expect(body?.items).toContainEqual(
        expect.objectContaining({ id, kind: 'decision', content })
      );
      // Upskii has no meeting-record surface; Meet's API is the only reader.
    } finally {
      await host.request.delete(on('meet', path), {
        headers: { origin: HOSTS.meet, 'content-type': 'application/json' },
        data: { id },
        maxRedirects: 0,
      });
    }
  });

  test('6. teacher disconnects Tuturuuu and signs out of Upskii', async ({
    actors,
    tuturuuuContext,
    upskiiContext,
  }) => {
    test.skip(!journey.linked, 'Teacher link was not established');
    const { tt, up } = need(actors);
    const ctx = await bothSignedIn(
      await tuturuuuContext(tt.host),
      await upskiiContext(up.teacher)
    );
    const page = await ctx.newPage();
    await page.goto(on('upskiiApp', '/settings/preferences'));
    const card = linkCard(page);
    await expect(card.getByText(`Linked to ${tt.host.email}`)).toBeVisible();
    await card
      .getByRole('button', { name: COPY.disconnect, exact: true })
      .click();
    await card.getByRole('button', { name: COPY.confirmDisconnect }).click();
    await expect(
      card.getByRole('button', { name: COPY.connect })
    ).toBeVisible();

    expect((await upskiiLinkStatus(ctx)).link).toBeNull();
    await expect
      .poll(async () => (await tuturuuuLinkStatus(ctx)).link)
      .toBeNull();
    journey.linked = false;

    const signOut = await ctx.request.post(
      on('upskiiAuth', '/api/auth/sign-out'),
      {
        headers: {
          origin: HOSTS.upskiiApp,
          'content-type': 'application/json',
        },
        data: '{}',
        maxRedirects: 0,
      }
    );
    expect(signOut.ok(), 'Upskii sign-out').toBe(true);
    forgetUpskiiSessions();
    const session = await upskiiSession(ctx);
    expect(session?.session ?? null).toBeNull();
  });
});

test.describe('meet-flow negatives', () => {
  test('forged link state is refused', async ({ actors, upskiiContext }) => {
    const { up } = need(actors);
    const ctx = await upskiiContext(up.teacher);
    test.skip(!(await upskiiLinkStatus(ctx)).enabled, LINK_UNAVAILABLE);
    const page = await ctx.newPage();
    await page.goto(callbackUrl(randomValue(), randomValue()));
    await expectLinkResult(page, 'LINK_STATE_INVALID', COPY.stateInvalid);
  });

  test('a callback without the link state cookie is refused', async ({
    actors,
    upskiiContext,
  }) => {
    const { up } = need(actors);
    const ctx = await upskiiContext(up.teacher);
    test.skip(!(await upskiiLinkStatus(ctx)).enabled, LINK_UNAVAILABLE);
    const state = await startConnect(ctx);
    const names = (await ctx.cookies(HOSTS.upskiiApp)).map((c) => c.name);
    expect(names).toContain(LINK_STATE_COOKIE);
    await ctx.clearCookies({ name: LINK_STATE_COOKIE });
    const page = await ctx.newPage();
    await page.goto(callbackUrl(state, randomValue()));
    await expectLinkResult(page, 'LINK_STATE_INVALID', COPY.stateInvalid);
  });

  test('a callback in another Upskii account is refused', async ({
    actors,
    upskiiContext,
  }) => {
    const { up } = need(actors);
    const teacher = await upskiiContext(up.teacher);
    test.skip(!(await upskiiLinkStatus(teacher)).enabled, LINK_UNAVAILABLE);
    const state = await startConnect(teacher);
    const cookie = (await teacher.cookies(HOSTS.upskiiApp)).find(
      (c) => c.name === LINK_STATE_COOKIE
    );
    if (!cookie) throw new Error('Connect set no link state cookie');
    const student = await upskiiContext(up.student);
    await student.addCookies([
      {
        name: cookie.name,
        value: cookie.value,
        url: `${HOSTS.upskiiApp}/`,
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const page = await student.newPage();
    await page.goto(callbackUrl(state, randomValue()));
    await expectLinkResult(page, 'LINK_SESSION_MISMATCH', COPY.mismatch);
  });

  test('an outsider waits in the lobby without host admission', async ({
    actors,
    tuturuuuContext,
    track,
    label,
  }) => {
    const { tt } = need(actors);
    const host = await tuturuuuContext(tt.host);
    const meetingId = await createMeeting(
      host,
      track,
      tt.workspaceId,
      label('meet lobby'),
      'outsider'
    );
    try {
      const hostPage = await host.newPage();
      const roomUrl = await roomUrlFor(hostPage, tt.workspaceId, meetingId);
      await enterRoom(hostPage, roomUrl, 'QA Host');
      await expectInCall(hostPage);

      const outsider = await tuturuuuContext(tt.outsider);
      const token = await outsider.request.post(
        on('meet', `/api/meet-call/${meetingId}/token`),
        {
          headers: { origin: HOSTS.meet, 'content-type': 'application/json' },
          data: {},
          maxRedirects: 0,
        }
      );
      expect([200, 403]).toContain(token.status());
      if (token.status() === 403) return; // Refused outright: no room access.
      const claims = realtimeClaims(
        ((await token.json()) as { token: string }).token
      );
      expect(
        claims.admission,
        'a non-member token only reaches the lobby'
      ).toBe('lobby');
      expect(claims.role).toBe('speaker');

      const page = await outsider.newPage();
      await enterRoom(page, roomUrl, 'QA Outsider');
      await expect(
        page.getByRole('button', { name: 'Waiting for host approval' })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        hostPage.getByText(/^Waiting to join \(\d+\)$/u)
      ).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(5_000);
      expect(await isInCall(page), 'never admitted without the host').toBe(
        false
      );
    } finally {
      await deleteMeeting(host, tt.workspaceId, meetingId);
    }
  });

  test('the meeting record refuses non-members and signed-out readers', async ({
    actors,
    tuturuuuContext,
    anonymousContext,
    track,
    label,
  }) => {
    const { tt } = need(actors);
    const host = await tuturuuuContext(tt.host);
    const meetingId = await createMeeting(
      host,
      track,
      tt.workspaceId,
      label('meet record acl'),
      'record-acl'
    );
    try {
      const path = `/api/meet-record/${tt.workspaceId}/${meetingId}`;
      expect((await meetGet(host, path)).status).toBe(200);
      const outsider = await tuturuuuContext(tt.outsider);
      expect((await meetGet(outsider, path)).status).toBe(403);
      expect((await meetGet(await anonymousContext(), path)).status).toBe(401);
    } finally {
      await deleteMeeting(host, tt.workspaceId, meetingId);
    }
  });
});
