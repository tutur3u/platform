import type { Track } from '../../live/status.ts';

export const trackTrack: Track = {
  id: 'track',
  name: 'Track',
  summary:
    'Timers, focus sessions, session history and time requests for you and your team.',
  milestones: [
    {
      id: 'track-focus',
      title: 'Focus sessions',
      deliverables: [
        {
          id: 'track-pomodoro-focus',
          title: 'Tag Pomodoro sessions and count them as Focus Time',
          prs: [6903, 6905],
          app: 'track',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'track-mobile',
      title: 'Track on mobile',
      deliverables: [
        {
          id: 'track-mobile-timer-ux',
          title: 'Smoother timer on mobile',
          prs: [4498],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-mobile-missed-entry',
          title: 'Add a missed entry from any timer screen',
          prs: [4517],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-mobile-dock-timer',
          title: 'Timer controls in the mobile dock',
          prs: [5832],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-mobile-timer-settings',
          title: 'Timer settings in one place on mobile',
          prs: [6547],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'track-requests',
      title: 'Earlier: Time requests and insights',
      summary: '2025 to early 2026.',
      deliverables: [
        {
          id: 'track-request-improvements',
          title: 'Clearer time requests with an activity log',
          prs: [4155, 4166],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-self-approval',
          title: 'Approve your own requests with the right permission',
          prs: [4270],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-revert-requests',
          title: 'Undo an approval or rejection',
          prs: [4450],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-history-stats',
          title: 'Richer history stats and an activity heatmap',
          prs: [4310, 4409, 4626],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'track-earlier-timer',
      title: 'Earlier: The first timers',
      summary: '2023 to 2025.',
      deliverables: [
        {
          id: 'track-first-pomodoro',
          title: 'Pomodoro timer in the calendar view',
          prs: [87],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-timer-from-tasks',
          title: 'Start a timer from My Tasks or a board',
          prs: [3955],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-pause-behaviour',
          title: 'Better pause and resume for running sessions',
          prs: [4138],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'track-habits-scheduling',
          title: 'Habits scheduled automatically alongside tasks',
          prs: [4042],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
