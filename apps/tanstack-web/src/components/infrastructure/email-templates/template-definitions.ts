export type PropField = {
  defaultValue?: boolean | number | string;
  label: string;
  name: string;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  type: 'boolean' | 'date' | 'number' | 'select' | 'text' | 'textarea';
};

export type EmailTemplateId =
  | 'deadline-reminder'
  | 'guest-template'
  | 'notification-digest'
  | 'post-template'
  | 'workspace-invite';

export type TemplateDefinition = {
  defaultProps: Record<string, unknown>;
  description: string;
  id: EmailTemplateId;
  name: string;
  propsSchema: PropField[];
};

const reminderDueDate = '2027-01-01T00:00:00.000Z';
const notificationCreatedAt = '2026-06-24T00:00:00.000Z';

const notificationSamples = [
  {
    actionUrl: 'https://tuturuuu.com/tasks/1',
    createdAt: notificationCreatedAt,
    description: 'You have been assigned a new task',
    id: '1',
    title: 'New task: Complete quarterly report',
    type: 'task_assigned',
  },
  {
    actionUrl: 'https://tuturuuu.com/tasks/2',
    createdAt: notificationCreatedAt,
    description: 'Due in 2 hours',
    id: '2',
    title: 'Deadline approaching: Submit proposal',
    type: 'deadline_reminder',
  },
];

export const EMAIL_TEMPLATES: TemplateDefinition[] = [
  {
    defaultProps: {
      inviteUrl: '',
      inviteeName: 'there',
      inviterName: 'Someone',
      workspaceId: '',
      workspaceName: 'a workspace',
    },
    description: 'Email sent when inviting someone to join a workspace',
    id: 'workspace-invite',
    name: 'Workspace Invite',
    propsSchema: [
      {
        defaultValue: 'there',
        label: 'Invitee Name',
        name: 'inviteeName',
        placeholder: 'John Doe',
        type: 'text',
      },
      {
        defaultValue: 'Someone',
        label: 'Inviter Name',
        name: 'inviterName',
        placeholder: 'Jane Smith',
        type: 'text',
      },
      {
        defaultValue: 'a workspace',
        label: 'Workspace Name',
        name: 'workspaceName',
        placeholder: 'My Workspace',
        type: 'text',
      },
      {
        defaultValue: '',
        label: 'Workspace ID',
        name: 'workspaceId',
        placeholder: 'ws_123...',
        type: 'text',
      },
      {
        defaultValue: '',
        label: 'Invite URL',
        name: 'inviteUrl',
        placeholder: 'https://tuturuuu.com/invite/...',
        type: 'text',
      },
    ],
  },
  {
    defaultProps: {
      boardName: 'Board',
      dueDate: reminderDueDate,
      reminderInterval: '24 hours',
      taskName: 'Untitled Task',
      taskUrl: '',
      userName: 'there',
      workspaceName: 'Workspace',
    },
    description: 'Reminder email sent before task deadlines',
    id: 'deadline-reminder',
    name: 'Deadline Reminder',
    propsSchema: [
      {
        defaultValue: 'there',
        label: 'User Name',
        name: 'userName',
        placeholder: 'John',
        type: 'text',
      },
      {
        defaultValue: 'Untitled Task',
        label: 'Task Name',
        name: 'taskName',
        placeholder: 'Complete project report',
        type: 'text',
      },
      {
        defaultValue: 'Board',
        label: 'Board Name',
        name: 'boardName',
        placeholder: 'Project Board',
        type: 'text',
      },
      {
        defaultValue: 'Workspace',
        label: 'Workspace Name',
        name: 'workspaceName',
        placeholder: 'My Workspace',
        type: 'text',
      },
      {
        defaultValue: reminderDueDate,
        label: 'Due Date',
        name: 'dueDate',
        placeholder: '2027-01-01T00:00:00Z',
        type: 'text',
      },
      {
        defaultValue: '24 hours',
        label: 'Reminder Interval',
        name: 'reminderInterval',
        options: ['30 minutes', '1 hour', '24 hours', '48 hours', '1 week'],
        type: 'select',
      },
      {
        defaultValue: '',
        label: 'Task URL',
        name: 'taskUrl',
        placeholder: 'https://tuturuuu.com/tasks/...',
        type: 'text',
      },
    ],
  },
  {
    defaultProps: {
      post: {
        content: 'Listening - Exam skills',
        group_name: '[COSC1234] Event Management',
        id: '1',
        notes: null,
        title: 'MINDSET 2 - UNIT 8 - FESTIVALS AND TRADITIONS',
      },
    },
    description: 'Email template for user group posts and learning reports',
    id: 'post-template',
    name: 'Post Template',
    propsSchema: [
      {
        defaultValue: JSON.stringify(
          {
            content: 'Listening - Exam skills',
            group_name: '[COSC1234] Event Management',
            id: '1',
            notes: null,
            title: 'MINDSET 2 - UNIT 8 - FESTIVALS AND TRADITIONS',
          },
          null,
          2
        ),
        label: 'Post Object (JSON)',
        name: 'post',
        placeholder:
          '{"group_name": "Class A", "title": "Lesson 1", "content": "..."}',
        type: 'textarea',
      },
    ],
  },
  {
    defaultProps: {
      avgScore: 75,
      className: '<Tên lớp>',
      comments: 'Học sinh tích cực tham gia các hoạt động trong lớp.',
      studentName: '<Tên học sinh>',
      teacherName: '<Tên giáo viên>',
    },
    description: 'Trial period report email for guest users',
    id: 'guest-template',
    name: 'Guest Template',
    propsSchema: [
      {
        defaultValue: '<Tên học sinh>',
        label: 'Student Name',
        name: 'studentName',
        placeholder: 'Nguyễn Văn A',
        type: 'text',
      },
      {
        defaultValue: '<Tên lớp>',
        label: 'Class Name',
        name: 'className',
        placeholder: 'IELTS 7.0',
        type: 'text',
      },
      {
        defaultValue: '<Tên giáo viên>',
        label: 'Teacher Name',
        name: 'teacherName',
        placeholder: 'Cô Hoa',
        type: 'text',
      },
      {
        defaultValue: 75,
        label: 'Average Score',
        name: 'avgScore',
        placeholder: '85',
        type: 'number',
      },
      {
        defaultValue: 'Học sinh tích cực tham gia các hoạt động trong lớp.',
        label: 'Comments',
        name: 'comments',
        placeholder: 'Student performed well...',
        type: 'textarea',
      },
    ],
  },
  {
    defaultProps: {
      notifications: notificationSamples,
      userName: 'there',
      workspaceName: 'Tuturuuu',
      workspaceUrl: 'https://tuturuuu.com',
    },
    description: 'Batched notification summary email',
    id: 'notification-digest',
    name: 'Notification Digest',
    propsSchema: [
      {
        defaultValue: 'there',
        label: 'User Name',
        name: 'userName',
        placeholder: 'John',
        type: 'text',
      },
      {
        defaultValue: 'Tuturuuu',
        label: 'Workspace Name',
        name: 'workspaceName',
        placeholder: 'My Workspace',
        type: 'text',
      },
      {
        defaultValue: JSON.stringify(notificationSamples, null, 2),
        label: 'Notifications (JSON Array)',
        name: 'notifications',
        placeholder: '[{"id": "1", "type": "task_assigned", ...}]',
        type: 'textarea',
      },
      {
        defaultValue: 'https://tuturuuu.com',
        label: 'Workspace URL',
        name: 'workspaceUrl',
        placeholder: 'https://tuturuuu.com/workspace',
        type: 'text',
      },
    ],
  },
];

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return EMAIL_TEMPLATES.find((template) => template.id === id);
}
