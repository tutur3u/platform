import type { Track } from '../../live/status.ts';

export const colabTrack: Track = {
  id: 'colab',
  name: 'Colab',
  summary: 'Collaborative programming workshops with AI help for teams.',
  milestones: [
    {
      id: 'colab-workshops',
      title: 'Redesigned workshops',
      deliverables: [
        {
          id: 'colab-workshop-redesign',
          title: 'Redesigned workshops with activity history',
          prs: [5229],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'colab-workshop-practice',
          title: 'Smoother workshop practice and clear limits',
          prs: [5274, 5277],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'colab-team-ai',
          title: 'Teams can run AI work at the same time',
          prs: [5306],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'colab-showcase',
      title: 'Showcase and skills',
      deliverables: [
        {
          id: 'colab-team-showcase',
          title: 'Team showcase and dependable skills',
          prs: [5287, 5289],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'colab-gemini',
          title: 'Workshop AI moves to Gemini',
          prs: [8075],
          app: 'colab',
          fallback: 'planned',
        },
      ],
    },
  ],
};
