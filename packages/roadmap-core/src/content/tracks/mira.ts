import type { Track } from '../../live/status.ts';

export const miraTrack: Track = {
  id: 'mira',
  name: 'Mira',
  summary:
    'Tuturuuu’s AI assistant: voice calls, memory, workspace tools, and more places to talk to it.',
  milestones: [
    {
      id: 'mira-mobile',
      title: 'Mira on mobile',
      deliverables: [
        {
          id: 'mira-live-call',
          title: 'Full-screen Mira Live calls with one start button',
          prs: [6714, 6862],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-voice-dock',
          title: 'Record and send voice messages to Mira',
          prs: [5829, 7446],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-local-models',
          title: 'On-device models and private local chat',
          prs: [5870, 5914],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-onboarding',
          title: 'Branded Mira onboarding',
          prs: [5783],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'mira-offline',
          title: 'Read Mira conversations offline',
          prs: [7470],
          app: 'mobile',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mira-memory',
      title: 'Memory and personality',
      deliverables: [
        {
          id: 'mira-personality',
          title: 'Manage Mira’s personality and memories',
          prs: [5963],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'mira-edit-memories',
          title: 'Edit saved memories with a review step',
          prs: [5969, 5976],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-rename',
          title: 'Rename Mira',
          prs: [5974],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'mira-themes',
          title: 'Themed message bubbles',
          prs: [6148, 6158],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'mira-tools',
      title: 'Mira can do more',
      deliverables: [
        {
          id: 'mira-mail-tools',
          title: 'Read mail and draft replies',
          prs: [6659],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-health-tools',
          title: 'Log weight and habits, and get a day overview',
          prs: [6660],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-open-app',
          title: 'Open apps and use what is on screen',
          prs: [6662, 6664],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-first-reply',
          title: 'Faster first reply',
          prs: [6725],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'mira-workspace-policy',
          title: 'Workspace-wide AI policy controls',
          prs: [7525],
          app: 'ai',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'mira-channels',
      title: 'Mira in more places',
      deliverables: [
        {
          id: 'mira-in-meet',
          title: 'Mira mark and avatar in Meet',
          prs: [7922, 7448],
          app: 'meet',
          fallback: 'planned',
        },
        {
          id: 'mira-discord',
          title: 'Mira in Discord servers linked to a workspace',
          prs: [],
          app: null,
          fallback: 'in_progress',
        },
        {
          id: 'mira-zalo',
          title: 'Mira in Zalo chats',
          prs: [],
          app: null,
          fallback: 'in_progress',
        },
      ],
    },
  ],
};
