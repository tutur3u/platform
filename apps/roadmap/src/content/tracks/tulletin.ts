import type { Track } from '../../live/status.ts';

export const tulletinTrack: Track = {
  id: 'tulletin',
  name: 'Tulletin',
  summary:
    'Creative notebooks for writing and worldbuilding, with published worlds to read.',
  milestones: [
    {
      id: 'tulletin-studio',
      title: 'A calmer writing studio',
      deliverables: [
        {
          id: 'tulletin-quick-notes',
          title: 'Capture quick notes and ideas privately',
          prs: [6137, 6150],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-writing-stats',
          title: 'Private writing statistics and session word targets',
          prs: [6161, 6177],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-work-progress',
          title: 'Organize your work by stage',
          prs: [6127, 6186],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-calendar-time',
          title: 'Plan writing time in your workspace calendar',
          prs: [6157],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'tulletin-notebooks',
      title: 'Notebooks and libraries',
      deliverables: [
        {
          id: 'tulletin-saved-libraries',
          title: 'Private saved notebook libraries',
          prs: [6116, 6193],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-export-import',
          title: 'Export notebooks and import them with a review',
          prs: [6117, 6118],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-drive-copies',
          title: 'Save notebook copies to workspace Drive',
          prs: [6199],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'tulletin-publishing',
      title: 'Publishing and reading',
      deliverables: [
        {
          id: 'tulletin-preview-compare',
          title: 'Compare draft and published previews',
          prs: [6146, 6154],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-collections',
          title: 'Browse published collections and tags',
          prs: [6152, 6113],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-reader-prefs',
          title: 'Reader text preferences and heading search',
          prs: [6223, 6195],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'tulletin-launch',
      title: 'Earlier: Tulletin launches',
      summary: 'September to October 2026.',
      deliverables: [
        {
          id: 'tulletin-first-release',
          title: 'Tulletin worldbuilding app',
          prs: [5351],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-creative-spaces',
          title: 'Relaxed home and dedicated creative spaces',
          prs: [5733],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'tulletin-wiki-profiles',
          title: 'Creator wiki and profiles',
          prs: [5744],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
