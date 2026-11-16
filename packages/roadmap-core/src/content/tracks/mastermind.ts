import type { Track } from '../../live/status.ts';

export const mastermindTrack: Track = {
  id: 'mastermind',
  name: 'Mastermind',
  summary:
    'Decisions, a daily catch-up and insight charts for the Tuturuuu team, on mobile and the web.',
  milestones: [
    {
      id: 'mastermind-mobile',
      title: 'Mastermind on mobile',
      deliverables: [
        {
          id: 'mm-home-catchup',
          title: 'Home with a catch-up section for today',
          prs: [7176, 7213],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-decisions',
          title: 'Answer decisions from Home and Inbox',
          prs: [7205, 7218],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-inbox-tiers',
          title: 'Inbox grouped by priority with search',
          prs: [7412, 7425],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-undo',
          title: 'Undo window before replies are sent',
          prs: [7414, 7459],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-charts',
          title: 'Accessible insight charts',
          prs: [7040],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mm-offline',
          title: 'Read the latest overview offline',
          prs: [7468],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mastermind-web',
      title: 'Mastermind on the web',
      deliverables: [
        {
          id: 'mm-web-app',
          title: 'Private Mastermind web app',
          prs: [7301],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-access',
          title: 'Access only with an explicit permission',
          prs: [7158],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-ask-cards',
          title: 'Inbox ask cards on the web',
          prs: [7390, 7395],
          app: 'mastermind',
          fallback: 'planned',
        },
        {
          id: 'mm-schedules',
          title: 'Scheduled occurrences',
          prs: [7911],
          app: 'mastermind',
          fallback: 'in_progress',
        },
      ],
    },
  ],
};
