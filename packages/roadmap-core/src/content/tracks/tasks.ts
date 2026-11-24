import type { Track } from '../../live/status.ts';

export const tasksTrack: Track = {
  id: 'tasks',
  name: 'Tasks',
  summary:
    'Plan work in sprints, keep boards readable and capture notes next to your tasks.',
  milestones: [
    {
      id: 'tasks-collaboration',
      title: 'Comments, links and imports',
      titleVi: 'Bình luận, liên kết và nhập dữ liệu',
      deliverables: [
        {
          id: 'task-comments-links',
          title: 'Comments, linked resources and status in the task dialog',
          titleVi:
            'Bình luận, tài nguyên liên kết và trạng thái trong hộp thoại công việc',
          prs: [],
          commits: [
            '6f61b3309bb5513f30c3d074012b47e14b989c11',
            'd252d04cfb283ffd85b17a16792048600a4ed5ed',
            '1c9bcc814f5e75a2d24585daeaa19a5704e7984c',
          ],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'task-github-import',
          title:
            'Import GitHub issues with their timeline, keeping your edits on re-import',
          titleVi:
            'Nhập issue GitHub kèm dòng thời gian, giữ nguyên chỉnh sửa của bạn khi nhập lại',
          prs: [],
          commits: [
            '19eed42e2e560822fd8fe5777ad79fa8972b5772',
            '17a40db6648722bae55abf79514f66f0a2fac483',
          ],
          app: 'tasks',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'tasks-sprints',
      title: 'Sprints and cycles',
      summary: 'Plan, run and close sprints directly on a board.',
      deliverables: [
        {
          id: 'board-sprints',
          title: 'Sprints on every board, shown in the header and Board view',
          prs: [7043, 7046],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'sprint-plan-tab',
          title: 'Plan the next sprint from a Plan tab',
          prs: [7088],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'sprint-plan-ahead',
          title: 'Plan up to five sprints ahead and park tasks outside sprints',
          prs: [7224, 7396],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'sprint-end-summary',
          title:
            'End a sprint with a summary that carries or backlogs open work',
          prs: [7089],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'cycles-backlog',
          title: 'Cycle and backlog planning view',
          prs: [6940, 6943],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'sprint-permissions',
          title: 'Separate permissions for creating and deleting sprints',
          prs: [7777],
          app: 'tasks',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'tasks-board',
      title: 'A cleaner board',
      summary: 'A redesigned board header, cards and task panel.',
      deliverables: [
        {
          id: 'board-header-filters',
          title: 'Two-row board header with people, project and focus filters',
          prs: [7042],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'task-side-panel',
          title: 'Open tasks in a side panel without leaving the board',
          prs: [7045, 7108],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'task-ids',
          title: 'Task IDs on cards with per-project ticket keys you can edit',
          prs: [7041, 7097],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'board-polish',
          title: 'Polished header, task panel, details and cards',
          prs: [7193],
          app: 'tasks',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'tasks-planning',
      title: 'Richer task details',
      deliverables: [
        {
          id: 'planning-priority',
          title: 'Set a planning priority on tasks',
          prs: [6189],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'project-association',
          title: 'Link tasks to a project',
          prs: [6191],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'planning-notes',
          title: 'Add planning notes to tasks',
          prs: [6222],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'media-in-new-tasks',
          title: 'Attach images and media when creating a task',
          prs: [5593, 5602],
          app: 'tasks',
          fallback: 'planned',
        },
        {
          id: 'reliable-drag-drop',
          title: 'Reliable drag and drop between columns',
          prs: [5596],
          app: 'tasks',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'tasks-notes',
      title: 'Notes alongside your work',
      deliverables: [
        {
          id: 'workspace-notes',
          title: 'Workspace Notes on web and mobile',
          prs: [5535],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'notes-links',
          title: 'Link notes to tasks, events and meetings',
          prs: [5543],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'notes-archive',
          title: 'Archive views and structured editing for Notes',
          prs: [5576],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'notes-device-lock',
          title: 'Lock Notes on a device with a passkey',
          prs: [5583],
          app: 'web',
          fallback: 'planned',
        },
      ],
    },
  ],
};
