import { useState, useEffect, useCallback } from 'react';
import type { Notification as NotificationData } from './useNotifications';

type PermissionState = 'default' | 'granted' | 'denied';

interface UseBrowserNotificationsReturn {
  permission: PermissionState;
  isSupported: boolean;
  requestPermission: () => Promise<PermissionState>;
  showNotification: (notification: NotificationData) => void;
}

/**
 * Hook to manage browser notifications
 * Handles permission requests and showing native notifications
 */
export function useBrowserNotifications(): UseBrowserNotificationsReturn {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [isSupported, setIsSupported] = useState(false);

  // Check if browser notifications are supported
  useEffect(() => {
    const supported = 'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  /**
   * Request permission to show notifications
   */
  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (!isSupported) {
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }, [isSupported]);

  /**
   * Show a browser notification
   */
  const showNotification = useCallback(
    (notificationData: NotificationData) => {
      if (!isSupported || permission !== 'granted') {
        return;
      }

      const { title, description, type, data } = notificationData;

      // Get icon based on notification type
      const icon = getNotificationIcon(type);

      // Create notification
      const notification = new Notification(title, {
        body: description || undefined,
        icon,
        badge: icon,
        tag: notificationData.id, // Prevents duplicate notifications
        requireInteraction: false,
        silent: false,
      });

      // Handle notification click
      notification.onclick = () => {
        window.focus();
        notification.close();

        // Navigate to the entity if available
        if (data.entity_id && data.entity_type === 'task') {
          const taskUrl = data.board_id
            ? `/${data.ws_id}/tasks/${data.board_id}?task=${data.entity_id}`
            : `/${data.ws_id}/tasks?task=${data.entity_id}`;
          window.location.href = taskUrl;
        }
      };

      // Auto-close after 10 seconds
      setTimeout(() => {
        notification.close();
      }, 10000);
    },
    [isSupported, permission]
  );

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
  };
}

/**
 * Get icon URL based on notification type
 */
function getNotificationIcon(type: string): string {
  // You can customize these icons or use actual image URLs
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  switch (type) {
    case 'task_assigned':
      return `${baseUrl}/icons/notification-task-assigned.png`;
    case 'task_updated':
      return `${baseUrl}/icons/notification-task-updated.png`;
    case 'task_mention':
      return `${baseUrl}/icons/notification-mention.png`;
    case 'workspace_invite':
      return `${baseUrl}/icons/notification-invite.png`;
    default:
      return `${baseUrl}/icons/notification-default.png`;
  }
}
