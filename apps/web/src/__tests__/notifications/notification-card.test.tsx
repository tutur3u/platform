import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
  },
}));

// Import after mocks
import { NotificationCard } from '@/components/notifications/notification-card';
import type { Notification } from '@/hooks/useNotifications';

describe('NotificationCard', () => {
  const mockOnMarkAsRead = vi.fn();
  const mockT = (key: string) => key;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockNotification = (
    overrides: Partial<Notification> = {}
  ): Notification => ({
    id: 'test-notification-1',
    ws_id: 'workspace-1',
    user_id: 'user-1',
    type: 'task_updated',
    title: 'Task updated',
    description: 'User updated "Test Task"',
    data: {},
    entity_type: 'task',
    entity_id: 'task-1',
    read_at: null,
    created_at: new Date().toISOString(),
    created_by: 'user-2',
    actor: {
      id: 'actor-1',
      display_name: 'Test User',
      avatar_url: null,
    },
    ...overrides,
  });

  describe('list_id changes display', () => {
    it('should display list names for task_moved notifications with list name data', () => {
      const notification = createMockNotification({
        type: 'task_moved',
        data: {
          changes: {
            list_id: {
              old: 'old-list-uuid',
              new: 'new-list-uuid',
            },
          },
          old_list_name: 'To Do',
          new_list_name: 'In Progress',
        },
      });

      render(
        <NotificationCard
          notification={notification}
          onMarkAsRead={mockOnMarkAsRead}
          t={mockT}
          wsId="workspace-1"
          isUpdating={false}
        />
      );

      // Should display list names, not UUIDs
      expect(screen.getByText('To Do')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      // Should not display UUIDs
      expect(screen.queryByText('old-list-uuid')).not.toBeInTheDocument();
      expect(screen.queryByText('new-list-uuid')).not.toBeInTheDocument();
    });

    it('should display "Unknown" when list names are not available', () => {
      const notification = createMockNotification({
        type: 'task_moved',
        data: {
          changes: {
            list_id: {
              old: 'old-list-uuid',
              new: 'new-list-uuid',
            },
          },
          // No old_list_name or new_list_name provided
        },
      });

      render(
        <NotificationCard
          notification={notification}
          onMarkAsRead={mockOnMarkAsRead}
          t={mockT}
          wsId="workspace-1"
          isUpdating={false}
        />
      );

      // Should display "Unknown" as fallback
      const unknownElements = screen.getAllByText('Unknown');
      expect(unknownElements.length).toBeGreaterThanOrEqual(2);
    });

    it('should display field label as "List" for list_id changes', () => {
      const notification = createMockNotification({
        type: 'task_moved',
        data: {
          changes: {
            list_id: {
              old: 'old-list-uuid',
              new: 'new-list-uuid',
            },
          },
          old_list_name: 'Backlog',
          new_list_name: 'Done',
        },
      });

      render(
        <NotificationCard
          notification={notification}
          onMarkAsRead={mockOnMarkAsRead}
          t={mockT}
          wsId="workspace-1"
          isUpdating={false}
        />
      );

      // Should display "List:" label, not "List Id:"
      const listLabels = screen.getAllByText('List:');
      expect(listLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('other field changes', () => {
    it('should display priority changes normally', () => {
      const notification = createMockNotification({
        type: 'task_priority_changed',
        data: {
          changes: {
            priority: {
              old: 'low',
              new: 'high',
            },
          },
        },
      });

      render(
        <NotificationCard
          notification={notification}
          onMarkAsRead={mockOnMarkAsRead}
          t={mockT}
          wsId="workspace-1"
          isUpdating={false}
        />
      );

      expect(screen.getByText('Priority:')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('should display title changes normally', () => {
      const notification = createMockNotification({
        type: 'task_title_changed',
        data: {
          changes: {
            name: {
              old: 'Old Title',
              new: 'New Title',
            },
          },
        },
      });

      render(
        <NotificationCard
          notification={notification}
          onMarkAsRead={mockOnMarkAsRead}
          t={mockT}
          wsId="workspace-1"
          isUpdating={false}
        />
      );

      expect(screen.getByText('Title:')).toBeInTheDocument();
      expect(screen.getByText('Old Title')).toBeInTheDocument();
      expect(screen.getByText('New Title')).toBeInTheDocument();
    });
  });
});
