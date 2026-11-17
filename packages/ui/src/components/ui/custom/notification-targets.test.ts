import { describe, expect, it } from 'vitest';
import {
  notificationTargetAppName,
  resolveNotificationTarget,
} from './notification-targets';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const MAILBOX = '44444444-4444-4444-8444-444444444444';
const THREAD = '55555555-5555-4555-8555-555555555555';
const CONVO = '66666666-6666-4666-8666-666666666666';
const ORIGIN = 'https://tuturuuu.com';

const resolve = (
  n: Parameters<typeof resolveNotificationTarget>[0],
  routeWsId?: string
) =>
  resolveNotificationTarget(n, {
    routeWsId,
    currentOrigin: 'http://localhost:7803',
  });

describe('resolveNotificationTarget', () => {
  it('opens a task in the Tasks app of the notification workspace', () => {
    const target = resolve(
      { entity_type: 'task', entity_id: TASK, ws_id: WS },
      OTHER_WS
    );
    expect(target).toMatchObject({ kind: 'task', taskId: TASK, wsId: WS });
    const url = new URL(target!.href);
    expect(url.pathname.endsWith(`/${WS}/tasks/${TASK}`)).toBe(true);
    expect(notificationTargetAppName(target)).toBe('Tasks');
  });

  it('falls back to the route workspace for a task without ws_id', () => {
    const target = resolve({ entity_type: 'task', entity_id: TASK }, WS);
    expect(target?.href).toContain(`/${WS}/tasks/${TASK}`);
  });

  it('opens the exact mail thread in the personal mailbox', () => {
    const target = resolve({
      type: 'mail_received',
      entity_type: 'mail_message',
      data: { mailboxId: MAILBOX, threadId: THREAD },
    });
    expect(target?.app).toBe('mail');
    const url = new URL(target!.href);
    expect(url.pathname.endsWith('/personal')).toBe(true);
    expect(url.searchParams.get('mailbox')).toBe(MAILBOX);
    expect(url.searchParams.get('thread')).toBe(THREAD);
  });

  it('opens a chat conversation', () => {
    const target = resolve({
      entity_type: 'chat_conversation',
      entity_id: CONVO,
      ws_id: WS,
    });
    expect(new URL(target!.href).searchParams.get('conversationId')).toBe(
      CONVO
    );
  });

  it('ignores stored URLs and non-UUID ids', () => {
    expect(
      resolve({
        type: 'mail_received',
        data: {
          mailboxId: 'https://evil.example',
          threadId: THREAD,
          action_url: 'https://evil.example',
        },
      })
    ).toBeNull();
    expect(
      resolve({ entity_type: 'task', entity_id: '../../x', ws_id: WS })
    ).toBeNull();
    expect(
      resolve({ entity_type: 'task', entity_id: TASK, ws_id: 'not-a-ws' })
    ).toBeNull();
  });

  it('only ever targets first-party app origins', () => {
    const target = resolveNotificationTarget(
      { entity_type: 'task', entity_id: TASK, ws_id: WS },
      { currentOrigin: ORIGIN, routeWsId: WS }
    );
    expect(target).not.toBeNull();
    const host = new URL(target!.href).hostname;
    expect(
      host === 'localhost' ||
        host.endsWith('tuturuuu.com') ||
        host.endsWith('tuturuuu.localhost')
    ).toBe(true);
  });

  it('leaves generic system notifications without a target', () => {
    expect(resolve({ type: 'system_announcement', ws_id: WS })).toBeNull();
    expect(
      resolve({
        type: 'workspace_invite',
        entity_type: 'workspace_invite',
        entity_id: WS,
      })
    ).toBeNull();
  });
});
