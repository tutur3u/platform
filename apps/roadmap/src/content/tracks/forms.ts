import type { Track } from '../../live/status.ts';

export const formsTrack: Track = {
  id: 'forms',
  name: 'Forms',
  summary:
    'Build forms in a three-pane studio, share or embed them, and read the results.',
  milestones: [
    {
      id: 'forms-studio',
      title: 'A new form studio',
      summary: 'Design forms side by side with a live preview.',
      deliverables: [
        {
          id: 'forms-three-pane-studio',
          title: 'Three-pane studio for building forms',
          prs: [5148, 5152],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'forms-question-types',
          title: 'Email, phone, number, URL, NPS and ranking questions',
          prs: [5146],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'forms-embeds-collab',
          title: 'Embeds, per-form SEO and real-time co-editing',
          prs: [5145],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'forms-nps-ranking-results',
          title: 'NPS and ranking results in form analytics',
          prs: [5157],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'forms-responding',
      title: 'Easier to answer',
      deliverables: [
        {
          id: 'forms-one-question',
          title: 'One question at a time, with full keyboard support',
          prs: [5156],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'forms-auto-advance',
          title: 'Move on automatically after a single-tap answer',
          prs: [5158],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'forms-preview-devices',
          title: 'Preview forms at phone, tablet and desktop widths',
          prs: [5165],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'forms-embed-height',
          title: 'Auto-sizing embeds keep a sensible minimum height',
          prs: [5166],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'forms-restored-drafts',
          title: 'Restored draft answers are kept when you return',
          prs: [6076],
          app: 'forms',
          fallback: 'planned',
        },
      ],
    },
  ],
};
