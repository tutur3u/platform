import type { Track } from '../../live/status.ts';

export const mobileTrack: Track = {
  id: 'mobile',
  name: 'Mobile',
  summary:
    'The Tuturuuu app gets a refreshed design, faster task handling and offline reading.',
  milestones: [
    {
      id: 'mobile-releases',
      title: 'Unified mobile releases',
      titleVi: 'Phát hành di động thống nhất',
      deliverables: [
        {
          id: 'unified-versioning',
          title: 'One version and build number across iOS, Android and desktop',
          titleVi:
            'Một số phiên bản và số bản dựng chung cho iOS, Android và máy tính',
          prs: [],
          commits: ['06cb34185af2adfc869698763a1e2323b6367494'],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'build-0-27-34',
          title:
            'Version 0.27.34 (build 1000007) in TestFlight and Google Play internal testing',
          titleVi:
            'Phiên bản 0.27.34 (bản dựng 1000007) trên TestFlight và thử nghiệm nội bộ Google Play',
          prs: [],
          app: 'mobile',
          fallback: 'in_progress',
        },
        {
          id: 'mobile-tasks-rebuild',
          title: 'Rebuilt My Tasks, Kanban and task details on mobile',
          titleVi:
            'Làm lại My Tasks, Kanban và chi tiết công việc trên di động',
          prs: [],
          commits: [
            '2a3d9d6690bc36da4f21a76a16a418d4c473b29b',
            '5ac0f7ea47b81454303d3efa52fecaf95bb87156',
            'd80690db49c0eb77548d5a2ff8dd98b35e409699',
          ],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-finance-rebuild',
          title:
            'Finance on mobile: invoices, reports, debts and recurring payments',
          titleVi:
            'Tài chính trên di động: hóa đơn, báo cáo, khoản nợ và giao dịch định kỳ',
          prs: [],
          commits: [
            'cd3e16f699142b54875b11013dc25d0230d2667d',
            '1ff9e916b9c5f3447edb3815bd5c620dcde497ab',
            'b9ab197676825b1f50a851ddaab97dd200fe034d',
          ],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'store-1-0',
          title:
            'Tuturuuu 1.0 on the App Store, Mac App Store, Google Play and Microsoft Store',
          titleVi:
            'Tuturuuu 1.0 trên App Store, Mac App Store, Google Play và Microsoft Store',
          prs: [],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mobile-offline',
      title: 'Offline reading',
      deliverables: [
        {
          id: 'offline-status',
          title: 'Offline status indicator',
          prs: [7461],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'offline-home',
          title: 'Home works offline from cached tasks, events and classes',
          prs: [7469],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'offline-notes-docs',
          title: 'Notes and Documents readable offline',
          prs: [7471, 7472],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'offline-habits-timer',
          title: 'Habits and Time tracker readable offline',
          prs: [7466, 7467],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'offline-conflicts',
          title: 'Offline edits keep a local copy if they conflict',
          prs: [7451],
          app: 'mobile',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'mobile-design',
      title: 'A refreshed design',
      deliverables: [
        {
          id: 'mobile-tabs',
          title: 'New root tabs: Mira, Inbox and You',
          prs: [6897, 6898],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-home',
          title: 'Home regrouped into Today, Up next and Calendar',
          prs: [6893, 6679],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-appearance',
          title: 'Appearance themes, density, corners and motion',
          prs: [6534, 6889],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-appearance-sync',
          title: 'Appearance synced across your devices',
          prs: [6938],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-tablet',
          title: 'Tablet list and detail layout',
          prs: [6685],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mobile-tasks',
      title: 'Tasks on the go',
      deliverables: [
        {
          id: 'mobile-task-swipes',
          title: 'Swipe actions and a context menu on task rows',
          prs: [6882, 6937],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-quick-actions',
          title: 'Redesigned quick actions sheet with dates',
          prs: [6974, 7079],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-day-agenda',
          title: 'Board timeline as a day agenda',
          prs: [6981],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-pomodoro',
          title: 'Device Pomodoro and Focus Time on tasks',
          prs: [6900, 6922],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mobile-more',
      title: 'More on mobile',
      deliverables: [
        {
          id: 'mobile-education',
          title: 'Education mode with a Today classes card',
          prs: [6982],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-inventory',
          title: 'Inventory list with barcode scan and search',
          prs: [6976],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mobile-telemetry-consent',
          title: 'Clear choice about sharing usage data',
          prs: [7214],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
  ],
};
