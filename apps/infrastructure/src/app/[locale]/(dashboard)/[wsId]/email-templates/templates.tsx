'use client';

import DeadlineReminderEmail from '@tuturuuu/transactional/emails/deadline-reminder';
import GuestTemplate from '@tuturuuu/transactional/emails/guest-template';
import NotificationDigestEmail from '@tuturuuu/transactional/emails/notification-digest';
import PostEmailTemplate from '@tuturuuu/transactional/emails/post-template';
import WorkspaceInviteEmail from '@tuturuuu/transactional/emails/workspace-invite';
import type { ComponentType } from 'react';

export interface PropField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'boolean';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  defaultValue?: string | number | boolean;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  component: ComponentType<Record<string, unknown>>;
  propsSchema: PropField[];
  defaultProps: Record<string, unknown>;
}

export const EMAIL_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'workspace-invite',
    name: 'Workspace Invite',
    description: 'Email sent when inviting someone to join a workspace',
    component: WorkspaceInviteEmail as ComponentType<Record<string, unknown>>,
    propsSchema: [
      {
        name: 'inviteeName',
        label: 'Invitee Name',
        type: 'text',
        placeholder: 'John Doe',
        defaultValue: 'there',
      },
      {
        name: 'inviterName',
        label: 'Inviter Name',
        type: 'text',
        placeholder: 'Jane Smith',
        defaultValue: 'Someone',
      },
      {
        name: 'workspaceName',
        label: 'Workspace Name',
        type: 'text',
        placeholder: 'My Workspace',
        defaultValue: 'a workspace',
      },
      {
        name: 'workspaceId',
        label: 'Workspace ID',
        type: 'text',
        placeholder: 'ws_123...',
        defaultValue: '',
      },
      {
        name: 'inviteUrl',
        label: 'Invite URL',
        type: 'text',
        placeholder: 'https://tuturuuu.com/invite/...',
        defaultValue: '',
      },
    ],
    defaultProps: {
      inviteeName: 'there',
      inviterName: 'Someone',
      workspaceName: 'a workspace',
      workspaceId: '',
      inviteUrl: '',
    },
  },
  {
    id: 'deadline-reminder',
    name: 'Deadline Reminder',
    description: 'Reminder email sent before task deadlines',
    component: DeadlineReminderEmail as ComponentType<Record<string, unknown>>,
    propsSchema: [
      {
        name: 'userName',
        label: 'User Name',
        type: 'text',
        placeholder: 'John',
        defaultValue: 'there',
      },
      {
        name: 'taskName',
        label: 'Task Name',
        type: 'text',
        placeholder: 'Complete project report',
        defaultValue: 'Untitled Task',
      },
      {
        name: 'boardName',
        label: 'Board Name',
        type: 'text',
        placeholder: 'Project Board',
        defaultValue: 'Board',
      },
      {
        name: 'workspaceName',
        label: 'Workspace Name',
        type: 'text',
        placeholder: 'My Workspace',
        defaultValue: 'Workspace',
      },
      {
        name: 'dueDate',
        label: 'Due Date',
        type: 'text',
        placeholder: '2024-12-31T23:59:59Z',
        defaultValue: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        name: 'reminderInterval',
        label: 'Reminder Interval',
        type: 'select',
        options: ['30 minutes', '1 hour', '24 hours', '48 hours', '1 week'],
        defaultValue: '24 hours',
      },
      {
        name: 'taskUrl',
        label: 'Task URL',
        type: 'text',
        placeholder: 'https://tuturuuu.com/tasks/...',
        defaultValue: '',
      },
    ],
    defaultProps: {
      userName: 'there',
      taskName: 'Untitled Task',
      boardName: 'Board',
      workspaceName: 'Workspace',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      reminderInterval: '24 hours',
      taskUrl: '',
    },
  },
  {
    id: 'post-template',
    name: 'Post Template',
    description: 'Email template for user group posts and learning reports',
    component: PostEmailTemplate as ComponentType<Record<string, unknown>>,
    propsSchema: [
      {
        name: 'post',
        label: 'Post Object (JSON)',
        type: 'textarea',
        placeholder:
          '{"group_name": "Class A", "title": "Lesson 1", "content": "..."}',
        defaultValue: JSON.stringify(
          {
            id: '1',
            group_name: '[COSC1234] Event Management',
            title: 'MINDSET 2 - UNIT 8 - FESTIVALS AND TRADITIONS',
            content: 'Listening - Exam skills',
            notes: null,
          },
          null,
          2
        ),
      },
    ],
    defaultProps: {
      post: {
        id: '1',
        group_name: '[COSC1234] Event Management',
        title: 'MINDSET 2 - UNIT 8 - FESTIVALS AND TRADITIONS',
        content: 'Listening - Exam skills',
        notes: null,
      },
    },
  },
  {
    id: 'guest-template',
    name: 'Guest Template',
    description: 'Trial period report email for guest users',
    component: GuestTemplate as ComponentType<Record<string, unknown>>,
    propsSchema: [
      {
        name: 'studentName',
        label: 'Student Name',
        type: 'text',
        placeholder: 'Nguyễn Văn A',
        defaultValue: '<Tên học sinh>',
      },
      {
        name: 'className',
        label: 'Class Name',
        type: 'text',
        placeholder: 'IELTS 7.0',
        defaultValue: '<Tên lớp>',
      },
      {
        name: 'teacherName',
        label: 'Teacher Name',
        type: 'text',
        placeholder: 'Cô Hoa',
        defaultValue: '<Tên giáo viên>',
      },
      {
        name: 'avgScore',
        label: 'Average Score',
        type: 'number',
        placeholder: '85',
        defaultValue: 75,
      },
      {
        name: 'comments',
        label: 'Comments',
        type: 'textarea',
        placeholder: 'Student performed well...',
        defaultValue: 'Học sinh tích cực tham gia các hoạt động trong lớp.',
      },
    ],
    defaultProps: {
      studentName: '<Tên học sinh>',
      className: '<Tên lớp>',
      teacherName: '<Tên giáo viên>',
      avgScore: 75,
      comments: 'Học sinh tích cực tham gia các hoạt động trong lớp.',
    },
  },
  {
    id: 'notification-digest',
    name: 'Notification Digest',
    description: 'Batched notification summary email',
    component: NotificationDigestEmail as ComponentType<
      Record<string, unknown>
    >,
    propsSchema: [
      {
        name: 'userName',
        label: 'User Name',
        type: 'text',
        placeholder: 'John',
        defaultValue: 'there',
      },
      {
        name: 'workspaceName',
        label: 'Workspace Name',
        type: 'text',
        placeholder: 'My Workspace',
        defaultValue: 'Tuturuuu',
      },
      {
        name: 'notifications',
        label: 'Notifications (JSON Array)',
        type: 'textarea',
        placeholder: '[{"id": "1", "type": "task_assigned", ...}]',
        defaultValue: JSON.stringify(
          [
            {
              id: '1',
              type: 'task_assigned',
              title: 'New task: Complete quarterly report',
              description: 'You have been assigned a new task',
              createdAt: new Date().toISOString(),
              actionUrl: 'https://tuturuuu.com/tasks/1',
            },
            {
              id: '2',
              type: 'deadline_reminder',
              title: 'Deadline approaching: Submit proposal',
              description: 'Due in 2 hours',
              createdAt: new Date().toISOString(),
              actionUrl: 'https://tuturuuu.com/tasks/2',
            },
          ],
          null,
          2
        ),
      },
      {
        name: 'workspaceUrl',
        label: 'Workspace URL',
        type: 'text',
        placeholder: 'https://tuturuuu.com/workspace',
        defaultValue: 'https://tuturuuu.com',
      },
    ],
    defaultProps: {
      userName: 'there',
      workspaceName: 'Tuturuuu',
      notifications: [
        {
          id: '1',
          type: 'task_assigned',
          title: 'New task: Complete quarterly report',
          description: 'You have been assigned a new task',
          createdAt: new Date().toISOString(),
          actionUrl: 'https://tuturuuu.com/tasks/1',
        },
        {
          id: '2',
          type: 'deadline_reminder',
          title: 'Deadline approaching: Submit proposal',
          description: 'Due in 2 hours',
          createdAt: new Date().toISOString(),
          actionUrl: 'https://tuturuuu.com/tasks/2',
        },
      ],
      workspaceUrl: 'https://tuturuuu.com',
    },
  },
];

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}
