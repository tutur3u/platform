import type { Track } from '../../live/status.ts';

export const aiStudioTrack: Track = {
  id: 'ai-studio',
  name: 'AI Studio',
  summary:
    'Choose models, bring your own subscriptions and see what AI costs your workspace.',
  milestones: [
    {
      id: 'ai-studio-subscriptions',
      title: 'Bring your own AI',
      deliverables: [
        {
          id: 'ai-chatgpt-subscriptions',
          title: 'Use your own ChatGPT subscription',
          prs: [5728],
          app: 'ai',
          fallback: 'planned',
        },
        {
          id: 'ai-app-keys',
          title: 'Apps can run background AI work with a bound key',
          prs: [5091],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'ai-studio-costs',
      title: 'See what AI costs',
      deliverables: [
        {
          id: 'ai-cost-currency',
          title: 'Provider costs shown in your chosen currency',
          prs: [5097],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'ai-provider-expenses',
          title: 'External provider spending in one view',
          prs: [5224],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'ai-studio-earlier',
      title: 'Earlier: AI experiments',
      summary: '2023 to 2025.',
      deliverables: [
        {
          id: 'ai-first-chatgpt',
          title: 'First experimental ChatGPT-powered features',
          prs: [229],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'ai-own-api-key',
          title: 'Bring your own API key',
          prs: [2698, 2713],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'ai-executions-log',
          title: 'Workspace log of AI runs',
          prs: [3384],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
