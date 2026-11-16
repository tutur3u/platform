import type { Track } from '../../live/status.ts';

export const novaTrack: Track = {
  id: 'nova',
  name: 'Nova',
  summary:
    'Learn and compete in prompt engineering with timed challenges and leaderboards.',
  milestones: [
    {
      id: 'nova-earlier-launch',
      title: 'Earlier: Nova launches',
      summary: 'Late 2024 to 2025.',
      deliverables: [
        {
          id: 'nova-launch',
          title: 'Nova prompt engineering platform',
          prs: [2153, 2228],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'nova-vietnamese',
          title: 'Nova in Vietnamese',
          prs: [2272, 2279],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'nova-mobile',
          title: 'Nova works on phones',
          prs: [2278, 2666],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'nova-earlier-challenges',
      title: 'Earlier: Challenges and scoring',
      summary: '2025.',
      deliverables: [
        {
          id: 'nova-criteria-marking',
          title: 'Scoring against custom challenge criteria',
          prs: [2298, 2299],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'nova-leaderboards',
          title: 'Individual and team leaderboards',
          prs: [2282, 2348],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'nova-challenge-access',
          title: 'Password-protected and invite-only challenges',
          prs: [2318, 2331],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'nova-multiple-attempts',
          title: 'Multiple attempts per challenge',
          prs: [2338],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'nova-profiles-scores',
          title: 'Profiles and detailed challenge scores',
          prs: [2314, 2868],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
