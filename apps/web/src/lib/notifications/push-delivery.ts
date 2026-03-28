import 'server-only';

import type { MulticastMessage } from 'firebase-admin/messaging';
import { getFirebaseMessagingClient } from './firebase-admin';

export interface PushNotificationRecord {
  id: string;
  type: string;
  title: string;
  description: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  ws_id?: string | null;
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
): 'task' | 'inbox' {
  const boardId = asOptionalString(notification.data?.board_id);
  const entityType = asOptionalString(notification.entity_type);
  const entityId = asOptionalString(notification.entity_id);

  if (entityType === 'task' && entityId && boardId) {
    return 'task';
  }

  return 'inbox';
}

export function buildPushData(
  notification: PushNotificationRecord
): Record<string, string> {
  const boardId = asOptionalString(notification.data?.board_id);
  const workspaceId =
    asOptionalString(notification.ws_id) ??
    asOptionalString(notification.data?.workspace_id) ??
    asOptionalString(notification.data?.ws_id);

  return {
    notificationId: notification.id,
    type: notification.type,
    title: notification.title,
    description: notification.description ?? '',
    wsId: workspaceId ?? '',
    entityType: asOptionalString(notification.entity_type) ?? '',
    entityId: asOptionalString(notification.entity_id) ?? '',
    boardId: boardId ?? '',
    openTarget: buildPushOpenTarget(notification),
    createdAt: notification.created_at,
  };
}

export async function sendPushNotificationBatch({
  notification,
  devices,
}: {
  notification: PushNotificationRecord;
  devices: PushDeviceRegistration[];
}): Promise<PushSendResult> {
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
    notification: {
      title: notification.title,
      body: notification.description ?? undefined,
    },
    data: buildPushData(notification),
    android: {
      priority: 'high',
      notification: {
        channelId: 'tuturuuu_notifications',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
      payload: {
        aps: {
          sound: 'default',
        },
      },
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
