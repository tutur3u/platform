/**
 * Notification Service Utilities
 *
 * Provides utilities for creating, managing, and querying notifications
 * across web, email, SMS, and push notification channels.
 */

import { createClient } from '@tuturuuu/supabase/next/server';

export type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_mention'
  | 'workspace_invite';

export type NotificationChannel = 'web' | 'email' | 'sms' | 'push';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface CreateNotificationParams {
  wsId: string;
  userId: string;
  type: NotificationType;
  title: string;
  description?: string;
  data?: Record<string, any>;
  entityType?: string;
  entityId?: string;
  createdBy?: string;
}

export interface GetNotificationsParams {
  wsId: string;
  userId: string;
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
}

/**
 * Creates a notification for a user
 * Respects user preferences for web and email notifications
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('create_notification', {
    p_ws_id: params.wsId,
    p_user_id: params.userId,
    p_type: params.type,
    p_title: params.title,
    p_description: params.description ?? undefined,
    p_data: params.data || {},
    p_entity_type: params.entityType ?? undefined,
    p_entity_id: params.entityId ?? undefined,
    p_created_by: params.createdBy ?? undefined,
  });

  if (error) {
    console.error('Error creating notification:', error);
    return null;
  }

  return data as string | null;
}

/**
 * Gets notifications for a user with pagination and filtering
 */
export async function getNotifications(params: GetNotificationsParams) {
  const supabase = await createClient();

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('ws_id', params.wsId)
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false });

  if (params.unreadOnly) {
    query = query.is('read_at', null);
  }

  if (params.type) {
    query = query.eq('type', params.type);
  }

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.offset) {
    query = query.range(
      params.offset,
      params.offset + (params.limit || 10) - 1
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching notifications:', error);
    return { notifications: [], count: 0 };
  }

  return {
    notifications: data || [],
    count: count || 0,
  };
}

/**
 * Gets the unread notification count for a user
 */
export async function getUnreadCount(
  wsId: string,
  userId: string
): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    console.error('Error fetching unread count:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Marks a notification as read
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }

  return true;
}

/**
 * Marks a notification as unread
 */
export async function markAsUnread(notificationId: string): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: null })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as unread:', error);
    return false;
  }

  return true;
}

/**
 * Marks all notifications as read for a user in a workspace
 */
export async function markAllAsRead(
  wsId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    console.error('Error marking all notifications as read:', error);
    return false;
  }

  return true;
}

/**
 * Deletes a notification
 */
export async function deleteNotification(
  notificationId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) {
    console.error('Error deleting notification:', error);
    return false;
  }

  return true;
}

/**
 * Gets notification preferences for a user
 */
export async function getNotificationPreferences(wsId: string, userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching notification preferences:', error);
    return [];
  }

  return data || [];
}

/**
 * Sets notification preference for a specific event type and channel
 */
export async function setNotificationPreference(
  wsId: string,
  userId: string,
  eventType: NotificationType,
  channel: NotificationChannel,
  enabled: boolean
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase.from('notification_preferences').upsert(
    {
      ws_id: wsId,
      user_id: userId,
      event_type: eventType,
      channel,
      enabled,
    },
    {
      onConflict: 'ws_id,user_id,event_type,channel',
    }
  );

  if (error) {
    console.error('Error setting notification preference:', error);
    return false;
  }

  return true;
}

/**
 * Checks if a notification should be sent based on user preferences
 * Defaults to true if no preference is set
 */
export async function shouldSendNotification(
  wsId: string,
  userId: string,
  eventType: NotificationType,
  channel: NotificationChannel
): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('should_send_notification', {
    p_ws_id: wsId,
    p_user_id: userId,
    p_event_type: eventType,
    p_channel: channel,
  });

  if (error) {
    console.error('Error checking notification preference:', error);
    // Default to true (enabled) if there's an error
    return true;
  }

  return data as boolean;
}

/**
 * Scans text for @mentions and returns user IDs
 * Mentions format: @[userId] or @username
 */
export function extractMentions(text: string): string[] {
  if (!text) return [];

  // Match @[uuid] pattern
  const uuidPattern =
    /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;
  const matches = text.matchAll(uuidPattern);

  const userIds: string[] = [];
  for (const match of matches) {
    if (match[1]) {
      userIds.push(match[1]);
    }
  }

  return [...new Set(userIds)]; // Remove duplicates
}

/**
 * Creates mention notifications for users mentioned in text
 */
export async function createMentionNotifications(
  wsId: string,
  text: string,
  entityType: string,
  entityId: string,
  entityName: string,
  createdBy: string
): Promise<void> {
  const mentionedUserIds = extractMentions(text);

  if (mentionedUserIds.length === 0) return;

  // Get creator name
  const supabase = await createClient();
  const { data: creator } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', createdBy)
    .single();

  const creatorName = creator?.display_name || 'Someone';

  // Create notifications for each mentioned user
  for (const userId of mentionedUserIds) {
    // Don't notify the creator
    if (userId === createdBy) continue;

    await createNotification({
      wsId,
      userId,
      type: 'task_mention',
      title: 'You were mentioned',
      description: `${creatorName} mentioned you in "${entityName}"`,
      data: {
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        mentioned_by: createdBy,
        mentioned_by_name: creatorName,
      },
      entityType,
      entityId,
      createdBy,
    });
  }
}
