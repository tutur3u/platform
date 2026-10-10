import 'server-only';

import type { MulticastMessage } from 'firebase-admin/messaging';
import { notificationDisplayCopy } from './display-copy';
import { getFirebaseMessagingClient } from './firebase-admin';

export interface PushNotificationRecord {
  id: string;
  type: string;
  title: string;
  description: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  ws_id?: string | null;
  user_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
}

export interface PushDeviceRegistration {
  token: string;
}

export interface PushSendResult {
  deliveredCount: number;
  invalidTokens: string[];
}

export interface CustomPushMessageInput {
  title: string;
  body: string;
  data?: Record<string, string>;
  dataOnly?: boolean;
  expiresAt?: string;
  category?: string;
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function buildPushOpenTarget(
  notification: PushNotificationRecord
): 'task' | 'chat' | 'mail' | 'inbox' {
  if (
    notification.type === 'mail_received' &&
    asOptionalString(notification.data?.mailboxId) &&
    asOptionalString(notification.data?.threadId) &&
    asOptionalString(notification.data?.messageId) &&
    asOptionalString(notification.data?.userId)
  )
    return 'mail';
  const boardId = asOptionalString(notification.data?.board_id);
  const conversationId =
    asOptionalString(notification.data?.conversation_id) ??
    asOptionalString(notification.data?.conversationId);
  const entityType = asOptionalString(notification.entity_type);
  const entityId = asOptionalString(notification.entity_id);

  if (entityType === 'task' && entityId && boardId) {
    return 'task';
  }

  if (entityType === 'chat_conversation' && (entityId || conversationId)) {
    return 'chat';
  }

  return 'inbox';
}

const INBOX_IDENTITY_PREFIX = 'tuturuuu:inbox:v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Full persisted identity, not a hash or an action-authorizing token. */
function inboxIdentity(notification: PushNotificationRecord): string | null {
  if (
    typeof notification.user_id !== 'string' ||
    !UUID.test(notification.user_id) ||
    !UUID.test(notification.id) ||
    (notification.ws_id !== null &&
      (typeof notification.ws_id !== 'string' ||
        !UUID.test(notification.ws_id)))
  )
    return null;
  // Explicit null is personal inbox; omitted scope is legacy/unknown, never guessed.
  const tuple = [
    notification.user_id.toLowerCase(),
    notification.ws_id?.toLowerCase() ?? null,
    notification.id.toLowerCase(),
  ];
  return (
    INBOX_IDENTITY_PREFIX +
    Buffer.from(JSON.stringify(tuple), 'utf8').toString('base64url')
  );
}

export function buildPushData(
  notification: PushNotificationRecord
): Record<string, string> {
  const display = notificationDisplayCopy(notification);
  const boardId = asOptionalString(notification.data?.board_id);
  const conversationId =
    asOptionalString(notification.data?.conversation_id) ??
    asOptionalString(notification.data?.conversationId) ??
    (asOptionalString(notification.entity_type) === 'chat_conversation'
      ? asOptionalString(notification.entity_id)
      : null);
  const messageId =
    asOptionalString(notification.data?.message_id) ??
    asOptionalString(notification.data?.messageId);
  const workspaceId =
    asOptionalString(notification.ws_id) ??
    asOptionalString(notification.data?.workspace_id) ??
    asOptionalString(notification.data?.ws_id);

  const identity = inboxIdentity(notification);
  const recipient = asOptionalString(notification.user_id);
  return {
    ...(identity ? { inboxIdentity: identity } : {}),
    notificationId: notification.id,
    type: notification.type,
    title: display.title,
    description: display.body,
    appName: display.app,
    wsId: workspaceId ?? '',
    entityType: asOptionalString(notification.entity_type) ?? '',
    entityId: asOptionalString(notification.entity_id) ?? '',
    boardId: boardId ?? '',
    conversationId: conversationId ?? '',
    messageId: messageId ?? '',
    ...(notification.type === 'mail_received'
      ? {
          mailboxId: asOptionalString(notification.data?.mailboxId) ?? '',
          threadId: asOptionalString(notification.data?.threadId) ?? '',
          userId: asOptionalString(notification.data?.userId) ?? '',
        }
      : {}),
    // Preserve old Mail navigation only; it never creates trusted inbox identity.
    ...(recipient ? { userId: recipient } : {}),
    openTarget: buildPushOpenTarget(notification),
    createdAt: notification.created_at,
  };
}

async function sendMessageBatch(
  {
    devices,
    message,
  }: {
    devices: PushDeviceRegistration[];
    message: CustomPushMessageInput;
  },
  ownedInboxIdentity?: string
): Promise<PushSendResult> {
  if (devices.length === 0) {
    return {
      deliveredCount: 0,
      invalidTokens: [],
    };
  }

  const tokens = devices
    .map((device) => device.token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return {
      deliveredCount: 0,
      invalidTokens: [],
    };
  }

  const payload: MulticastMessage = {
    tokens,
    data: message.data,
    android: {
      priority: 'high',
      ...(message.expiresAt
        ? { ttl: Math.max(0, Date.parse(message.expiresAt) - Date.now()) }
        : {}),
      notification: message.dataOnly
        ? undefined
        : {
            channelId: 'tuturuuu_notifications',
            ...(ownedInboxIdentity ? { tag: ownedInboxIdentity } : {}),
          },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        ...(message.expiresAt
          ? {
              'apns-expiration': String(
                Math.floor(Date.parse(message.expiresAt) / 1000)
              ),
            }
          : {}),
      },
      payload: {
        ...(message.category === 'tuturuuu_login_approval'
          ? { payload: JSON.stringify(message.data) }
          : {}),
        aps: {
          sound: 'default',
          ...(message.category ? { category: message.category } : {}),
        },
      },
    },
    notification: message.dataOnly
      ? undefined
      : {
          title: message.title,
          body: message.body,
        },
  };

  const response =
    await getFirebaseMessagingClient().sendEachForMulticast(payload);

  const invalidTokens: string[] = [];
  response.responses.forEach((result, index) => {
    if (!result.success) {
      const code = result.error?.code;
      if (code && INVALID_TOKEN_CODES.has(code)) {
        invalidTokens.push(tokens[index]!);
      }
    }
  });

  return {
    deliveredCount: response.successCount,
    invalidTokens,
  };
}

/** Custom/MFA pushes cannot supply persisted inbox identity via arbitrary data. */
export async function sendCustomPushMessageBatch(args: {
  devices: PushDeviceRegistration[];
  message: CustomPushMessageInput;
}): Promise<PushSendResult> {
  const data = args.message.data ? { ...args.message.data } : undefined;
  if (data) delete data.inboxIdentity;
  return sendMessageBatch({
    ...args,
    message: { ...args.message, data },
  });
}

export async function sendPushNotificationBatch({
  notification,
  devices,
}: {
  notification: PushNotificationRecord;
  devices: PushDeviceRegistration[];
}): Promise<PushSendResult> {
  const display = notificationDisplayCopy(notification);
  const data = buildPushData(notification);
  return sendMessageBatch(
    {
      devices,
      message: {
        title: display.title,
        body: display.body,
        data,
      },
    },
    data.inboxIdentity
  );
}
