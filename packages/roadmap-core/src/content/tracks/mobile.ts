import type { Track } from '../../live/status.ts';

export const mobileTrack: Track = {
  id: 'mobile',
  name: 'Mobile',
  summary:
    'The Tuturuuu app gets a refreshed design, faster task handling and offline reading.',
  milestones: [
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
