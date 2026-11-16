import type { Track } from '../../live/status.ts';

export const upskiiTrack: Track = {
  id: 'upskii',
  name: 'Upskii',
  summary:
    'Education tools across Upskii and Tuturuuu Learn, Teach and Rewise.',
  milestones: [
    {
      id: 'upskii-docs',
      title: 'Upskii in Tuturuuu',
      deliverables: [
        {
          id: 'upskii-overview',
          title: 'Upskii overview in the Tuturuuu docs',
          prs: [7351],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'learn-coding',
      title: 'Learn: coding lab',
      deliverables: [
        {
          id: 'learn-coding-lab',
          title: 'Multilingual coding lab',
          prs: [5609],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'learn-coding-workspace',
          title: 'Resizable coding workspace with run history',
          prs: [5637, 5707],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'learn-problem-catalog',
          title: 'Programming problem catalog with author forms',
          prs: [5709, 5710],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'learn-teach-shell',
      title: 'Learn and Teach upgrades',
      deliverables: [
        {
          id: 'learn-teach-shell',
          title: 'Learn and Teach share the new app shell',
          prs: [5533, 5567],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'learn-teach-todo',
          title: 'Personal To do in Learn and Teach',
          prs: [5785],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'learn-teach-edge',
          title: 'Learn and Teach on the new edge runtime',
          prs: [7961, 7943],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'rewise-url',
          title: 'Rewise lives at rewise.tuturuuu.com',
          prs: [7757],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
