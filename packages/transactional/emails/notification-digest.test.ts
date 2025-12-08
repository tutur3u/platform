import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import NotificationDigestEmail, {
  formatTimeRange,
  generateSubjectLine,
  getDelayInfo,
  getNotificationConfig,
  getCategoryForType,
  getCategoryConfig,
  NOTIFICATION_CONFIG,
  CATEGORY_CONFIG,
  TYPE_TO_CATEGORY,
  type NotificationItem,
  type NotificationCategory,
} from './notification-digest';

describe('notification-digest utilities', () => {
  describe('getNotificationConfig', () => {
    it('should return correct config for known notification types', () => {
      const taskAssigned = getNotificationConfig('task_assigned');
      expect(taskAssigned.label).toBe('Assigned');
      expect(taskAssigned.emoji).toBe('📋');
      expect(taskAssigned.priority).toBe(3);

      const deadline = getNotificationConfig('deadline_reminder');
      expect(deadline.label).toBe('Deadline');
      expect(deadline.emoji).toBe('⏰');
      expect(deadline.priority).toBe(2);

      const invite = getNotificationConfig('workspace_invite');
      expect(invite.label).toBe('Invitation');
      expect(invite.priority).toBe(1); // Highest priority
    });

    it('should return general config for unknown notification types', () => {
      const unknown = getNotificationConfig('unknown_type');
      expect(unknown.label).toBe('Update');
      expect(unknown.emoji).toBe('🔔');
      expect(unknown.priority).toBe(8);
    });

    it('should have workspace_invite as highest priority (1)', () => {
      const priorities = Object.values(NOTIFICATION_CONFIG).map(
        (c) => c.priority
      );
      expect(Math.min(...priorities)).toBe(1);
      expect(NOTIFICATION_CONFIG.workspace_invite.priority).toBe(1);
    });
  });

  describe('getCategoryForType', () => {
    it('should map task field changes to task_updates category', () => {
      expect(getCategoryForType('task_title_changed')).toBe('task_updates');
      expect(getCategoryForType('task_description_changed')).toBe(
        'task_updates'
      );
      expect(getCategoryForType('task_priority_changed')).toBe('task_updates');
      expect(getCategoryForType('task_due_date_changed')).toBe('task_updates');
      expect(getCategoryForType('task_start_date_changed')).toBe(
        'task_updates'
      );
      expect(getCategoryForType('task_estimation_changed')).toBe(
        'task_updates'
      );
      expect(getCategoryForType('task_updated')).toBe('task_updates');
    });

    it('should map status changes to task_status category', () => {
      expect(getCategoryForType('task_completed')).toBe('task_status');
      expect(getCategoryForType('task_reopened')).toBe('task_status');
      expect(getCategoryForType('task_moved')).toBe('task_status');
    });

    it('should map assignment types to task_assignments category', () => {
      expect(getCategoryForType('task_assigned')).toBe('task_assignments');
      expect(getCategoryForType('task_mention')).toBe('task_assignments');
    });

    it('should map relationship types to task_relationships category', () => {
      expect(getCategoryForType('task_label_added')).toBe('task_relationships');
      expect(getCategoryForType('task_label_removed')).toBe(
        'task_relationships'
      );
      expect(getCategoryForType('task_project_linked')).toBe(
        'task_relationships'
      );
      expect(getCategoryForType('task_project_unlinked')).toBe(
        'task_relationships'
      );
      expect(getCategoryForType('task_assignee_removed')).toBe(
        'task_relationships'
      );
    });

    it('should map other known types to their categories', () => {
      expect(getCategoryForType('workspace_invite')).toBe('workspace');
      expect(getCategoryForType('comment_added')).toBe('comments');
      expect(getCategoryForType('deadline_reminder')).toBe('deadlines');
      expect(getCategoryForType('system_announcement')).toBe('system');
    });

    it('should map unknown types to general category', () => {
      expect(getCategoryForType('unknown_type')).toBe('general');
      expect(getCategoryForType('random_notification')).toBe('general');
    });
  });

  describe('getCategoryConfig', () => {
    it('should return category config for known types', () => {
      const config = getCategoryConfig('task_title_changed');
      expect(config.label).toBe('Task Updates');
      expect(config.emoji).toBe('📝');
    });

    it('should return general config for unknown types', () => {
      const config = getCategoryConfig('unknown_type');
      expect(config.label).toBe('Updates');
      expect(config.emoji).toBe('🔔');
    });
  });

  describe('CATEGORY_CONFIG', () => {
    it('should have workspace as highest priority (1)', () => {
      const priorities = Object.values(CATEGORY_CONFIG).map((c) => c.priority);
      expect(Math.min(...priorities)).toBe(1);
      expect(CATEGORY_CONFIG.workspace.priority).toBe(1);
    });

    it('should have all required categories defined', () => {
      const expectedCategories: NotificationCategory[] = [
        'task_assignments',
        'task_status',
        'task_updates',
        'task_relationships',
        'workspace',
        'comments',
        'deadlines',
        'system',
        'general',
      ];

      expectedCategories.forEach((category) => {
        expect(CATEGORY_CONFIG[category]).toBeDefined();
        expect(CATEGORY_CONFIG[category].label).toBeDefined();
        expect(CATEGORY_CONFIG[category].emoji).toBeDefined();
        expect(CATEGORY_CONFIG[category].color).toBeDefined();
        expect(CATEGORY_CONFIG[category].bgColor).toBeDefined();
        expect(CATEGORY_CONFIG[category].priority).toBeDefined();
        expect(CATEGORY_CONFIG[category].actionVerb).toBeDefined();
      });
    });
  });

  describe('TYPE_TO_CATEGORY consolidation', () => {
    it('should consolidate all task field changes into one category', () => {
      const fieldChangeTypes = [
        'task_title_changed',
        'task_description_changed',
        'task_priority_changed',
        'task_due_date_changed',
        'task_start_date_changed',
        'task_estimation_changed',
      ];

      const categories = fieldChangeTypes.map((t) => TYPE_TO_CATEGORY[t]);
      const uniqueCategories = [...new Set(categories)];

      expect(uniqueCategories).toHaveLength(1);
      expect(uniqueCategories[0]).toBe('task_updates');
    });
  });

  describe('generateSubjectLine', () => {
    const createNotification = (
      type: string,
      title: string,
      data?: Record<string, unknown>
    ): NotificationItem => ({
      id: `test-${Math.random()}`,
      type,
      title,
      description: '',
      data,
      createdAt: new Date().toISOString(),
    });

    it('should return generic message for empty notifications', () => {
      const subject = generateSubjectLine([], 'My Workspace');
      expect(subject).toBe('Updates from My Workspace');
    });

    it('should generate subject for workspace invite', () => {
      const notifications = [
        createNotification('workspace_invite', 'Invitation', {
          workspace_name: 'Team Alpha',
        }),
      ];
      const subject = generateSubjectLine(notifications, 'Default');
      expect(subject).toContain("You're invited to Team Alpha");
      expect(subject).toContain('✉️');
    });

    it('should generate subject for deadline reminder', () => {
      const notifications = [
        createNotification('deadline_reminder', 'Submit report'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toBe('⏰ Deadline: Submit report');
    });

    it('should generate subject for task assigned', () => {
      const notifications = [
        createNotification('task_assigned', 'Review PR #123'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toBe('📋 New task: Review PR #123');
    });

    it('should generate subject for task mention', () => {
      const notifications = [
        createNotification('task_mention', 'Discussion', {
          mentioned_by: 'John',
        }),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toBe('📋 John mentioned you');
    });

    it('should generate subject for comment added', () => {
      const notifications = [
        createNotification('comment_added', 'Budget planning document'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toContain('💬 New comment on');
      expect(subject).toContain('Budget planning document');
    });

    it('should generate subject for task completed', () => {
      const notifications = [
        createNotification('task_completed', 'Setup CI/CD'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toBe('✅ Task completed: Setup CI/CD');
    });

    it('should generate subject for task updated (field changes)', () => {
      const notifications = [
        createNotification('task_updated', 'Fix bug #456'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toBe('📝 Task updated: Fix bug #456');
    });

    it('should generate subject for granular task field changes', () => {
      const notifications = [
        createNotification('task_title_changed', 'Updated task name'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toBe('📝 Task updated: Updated task name');
    });

    it('should prioritize most important notification for subject', () => {
      // deadline_reminder (priority 2) should be used over task_updated (priority 6)
      const notifications = [
        createNotification('task_updated', 'Some update'),
        createNotification('deadline_reminder', 'Important deadline'),
        createNotification('comment_added', 'New comment'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toContain('Deadline: Important deadline');
      expect(subject).toContain('(+2 more)');
    });

    it('should show remaining count for multiple notifications', () => {
      const notifications = [
        createNotification('task_assigned', 'Task 1'),
        createNotification('task_assigned', 'Task 2'),
        createNotification('task_assigned', 'Task 3'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toContain('(+2 more)');
    });

    it('should not show remaining count for single notification', () => {
      const notifications = [createNotification('task_assigned', 'Only task')];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).not.toContain('more');
    });

    it('should truncate long comment titles', () => {
      const notifications = [
        createNotification(
          'comment_added',
          'This is a very long title that should be truncated for the email subject line'
        ),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      // Title should be truncated to 30 chars
      expect(subject.length).toBeLessThan(100);
      expect(subject).toContain('…');
    });
  });

  describe('formatTimeRange', () => {
    it('should return empty string when no data provided', () => {
      const result = formatTimeRange(undefined, undefined, undefined);
      expect(result).toBe('');
    });

    it('should return empty string for empty notifications array', () => {
      const result = formatTimeRange(undefined, undefined, []);
      expect(result).toBe('');
    });

    it('should format same-day notifications with time range', () => {
      const now = new Date();
      const morning = new Date(now);
      morning.setHours(9, 0, 0, 0);
      const afternoon = new Date(now);
      afternoon.setHours(14, 30, 0, 0);

      const notifications: NotificationItem[] = [
        {
          id: '1',
          type: 'task_assigned',
          title: 'Task 1',
          createdAt: morning.toISOString(),
        },
        {
          id: '2',
          type: 'task_assigned',
          title: 'Task 2',
          createdAt: afternoon.toISOString(),
        },
      ];

      const result = formatTimeRange(undefined, undefined, notifications);
      // Should contain the date and time range
      expect(result).toContain('-');
      expect(result).toMatch(/\d{1,2}:\d{2}/); // Time format
    });

    it('should show single time when notifications are at same moment', () => {
      const sameTime = new Date('2024-12-06T10:08:00Z').toISOString();
      const notifications: NotificationItem[] = [
        {
          id: '1',
          type: 'task_assigned',
          title: 'Task 1',
          createdAt: sameTime,
        },
        {
          id: '2',
          type: 'task_completed',
          title: 'Task 2',
          createdAt: sameTime,
        },
      ];
      const result = formatTimeRange(undefined, undefined, notifications);
      // Should show single time format "Dec 6 at X:XX AM/PM", not range with "-"
      expect(result).toContain('at');
      expect(result).not.toMatch(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/); // Should NOT have time range
    });

    it('should show single time when window times are within 1 minute', () => {
      const windowStart = '2024-12-06T10:08:00Z';
      const windowEnd = '2024-12-06T10:08:30Z'; // 30 seconds later

      const result = formatTimeRange(windowStart, windowEnd, undefined);
      expect(result).toContain('at');
      expect(result).not.toMatch(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/);
    });

    it('should format multi-day range', () => {
      const day1 = new Date('2024-12-01T10:00:00Z');
      const day3 = new Date('2024-12-03T15:00:00Z');

      const notifications: NotificationItem[] = [
        {
          id: '1',
          type: 'task_assigned',
          title: 'Task 1',
          createdAt: day1.toISOString(),
        },
        {
          id: '2',
          type: 'task_assigned',
          title: 'Task 2',
          createdAt: day3.toISOString(),
        },
      ];

      const result = formatTimeRange(undefined, undefined, notifications);
      expect(result).toContain('Dec');
      expect(result).toContain('-');
    });

    it('should use window timestamps as fallback', () => {
      const windowStart = '2024-12-01T00:00:00Z';
      const windowEnd = '2024-12-01T23:59:59Z';

      const result = formatTimeRange(windowStart, windowEnd, undefined);
      expect(result).toContain('Dec');
    });
  });

  describe('task_moved list names in subject', () => {
    const createNotification = (
      type: string,
      title: string,
      data?: Record<string, unknown>
    ): NotificationItem => ({
      id: `test-${Math.random()}`,
      type,
      title,
      description: '',
      data,
      createdAt: new Date().toISOString(),
    });

    it('should generate subject for task_moved', () => {
      const notifications = [createNotification('task_moved', 'Fix login bug')];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toContain('Task moved');
      expect(subject).toContain('Fix login bug');
    });

    it('should generate subject for task_reopened', () => {
      const notifications = [
        createNotification('task_reopened', 'Review documentation'),
      ];
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toContain('Task reopened');
      expect(subject).toContain('Review documentation');
    });

    it('should prioritize task_moved in subject for multiple status changes', () => {
      const notifications = [
        createNotification('task_moved', 'Task A'),
        createNotification('task_completed', 'Task B'),
      ];
      // Both are in task_status category with same priority
      const subject = generateSubjectLine(notifications, 'Workspace');
      expect(subject).toContain('(+1 more)');
    });
  });

  describe('getDelayInfo', () => {
    it('should return not delayed when no timestamps provided', () => {
      const result = getDelayInfo(undefined, undefined);
      expect(result.isDelayed).toBe(false);
      expect(result.delayText).toBe('');
    });

    it('should return not delayed when only windowEnd provided', () => {
      const result = getDelayInfo('2024-12-01T10:00:00Z', undefined);
      expect(result.isDelayed).toBe(false);
    });

    it('should return not delayed for small delay (under 15 minutes)', () => {
      // Threshold is 15 minutes - 10 minutes should not be delayed
      const windowEnd = '2024-12-01T10:00:00.000Z';
      const sentAt = '2024-12-01T10:10:00.000Z'; // 10 minutes later

      const result = getDelayInfo(windowEnd, sentAt);
      expect(result.isDelayed).toBe(false);
    });

    it('should detect delay in minutes', () => {
      // Use fixed timestamps - must be > 15 minute threshold
      const windowEnd = '2024-12-01T10:00:00.000Z';
      const sentAt = '2024-12-01T10:25:00.000Z'; // 25 minutes later

      const result = getDelayInfo(windowEnd, sentAt);
      expect(result.isDelayed).toBe(true);
      expect(result.delayText).toContain('25 minute');
    });

    it('should detect delay in hours', () => {
      const windowEnd = '2024-12-01T10:00:00.000Z';
      const sentAt = '2024-12-01T13:00:00.000Z'; // 3 hours later

      const result = getDelayInfo(windowEnd, sentAt);
      expect(result.isDelayed).toBe(true);
      expect(result.delayText).toBe('Delayed 3 hours');
    });

    it('should detect delay in days', () => {
      const windowEnd = '2024-12-01T10:00:00.000Z';
      const sentAt = '2024-12-03T10:00:00.000Z'; // 2 days later

      const result = getDelayInfo(windowEnd, sentAt);
      expect(result.isDelayed).toBe(true);
      expect(result.delayText).toBe('Delayed 2 days');
    });

    it('should use singular form for 1 hour', () => {
      const windowEnd = '2024-12-01T10:00:00.000Z';
      const sentAt = '2024-12-01T11:00:00.000Z'; // 1 hour later

      const result = getDelayInfo(windowEnd, sentAt);
      expect(result.isDelayed).toBe(true);
      expect(result.delayText).toBe('Delayed 1 hour');
    });

    it('should use singular form for 1 day', () => {
      const windowEnd = '2024-12-01T10:00:00.000Z';
      const sentAt = '2024-12-02T10:00:00.000Z'; // 1 day later

      const result = getDelayInfo(windowEnd, sentAt);
      expect(result.isDelayed).toBe(true);
      expect(result.delayText).toBe('Delayed 1 day');
    });
  });

  describe('NotificationDigestEmail rendering with list names', () => {
    const createNotification = (
      type: string,
      title: string,
      data?: Record<string, unknown>
    ): NotificationItem => ({
      id: `test-${Math.random()}`,
      type,
      title,
      description: 'Test description',
      data,
      createdAt: new Date().toISOString(),
    });

    it('should render task_moved notification with list names', async () => {
      const notifications: NotificationItem[] = [
        createNotification('task_moved', 'Fix login bug', {
          old_list_name: 'To Do',
          new_list_name: 'In Progress',
        }),
      ];

      const html = await render(
        NotificationDigestEmail({
          userName: 'Test User',
          workspaceName: 'Test Workspace',
          notifications,
          workspaceUrl: 'https://test.com',
        })
      );

      // Should contain the list names in the rendered HTML
      expect(html).toContain('To Do');
      expect(html).toContain('In Progress');
    });

    it('should render task_moved without list names when not provided', async () => {
      const notifications: NotificationItem[] = [
        createNotification('task_moved', 'Fix login bug', {
          // No list names provided
        }),
      ];

      const html = await render(
        NotificationDigestEmail({
          userName: 'Test User',
          workspaceName: 'Test Workspace',
          notifications,
          workspaceUrl: 'https://test.com',
        })
      );

      // Should still render the notification
      expect(html).toContain('Fix login bug');
      // Should not contain list move badges (no arrow between list names)
      expect(html).not.toContain('To Do');
    });

    it('should render multiple notifications including task_moved', async () => {
      const notifications: NotificationItem[] = [
        createNotification('task_moved', 'Task A', {
          old_list_name: 'Backlog',
          new_list_name: 'Done',
        }),
        createNotification('task_assigned', 'Task B'),
        createNotification('task_completed', 'Task C'),
      ];

      const html = await render(
        NotificationDigestEmail({
          userName: 'Test User',
          workspaceName: 'Test Workspace',
          notifications,
          workspaceUrl: 'https://test.com',
        })
      );

      // Should contain all notifications
      expect(html).toContain('Task A');
      expect(html).toContain('Task B');
      expect(html).toContain('Task C');
      // Should contain list names for task_moved
      expect(html).toContain('Backlog');
      expect(html).toContain('Done');
    });
  });
});
