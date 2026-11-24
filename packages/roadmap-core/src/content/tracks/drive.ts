import type { Track } from '../../live/status.ts';

export const driveTrack: Track = {
  id: 'drive',
  name: 'Drive',
  summary: 'Find, browse and share files quickly on web and mobile.',
  milestones: [
    {
      id: 'drive-sorbet',
      title: 'A new file browser',
      titleVi: 'Trình duyệt tệp mới',
      deliverables: [
        {
          id: 'drive-sorbet-browser',
          title: 'File browser rebuilt on the Sorbet design',
          titleVi: 'Trình duyệt tệp được làm lại theo thiết kế Sorbet',
          prs: [],
          commits: ['8a590e242a213f36709b2c9198eecf0848c22820'],
          app: 'drive',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'drive-mobile',
      title: 'Drive on mobile',
      deliverables: [
        {
          id: 'drive-mobile-search',
          title: 'Search and automatic paging in mobile Drive',
          prs: [5822],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'drive-mobile-narrow',
          title: 'Drive controls stay visible on narrow screens',
          prs: [6182, 6172],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'drive-mobile-mfa',
          title: 'Files stay open during two-factor prompts',
          prs: [5881],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'drive-mobile-cache',
          title: 'See and limit cached storage on your device',
          prs: [5560],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'drive-offline-list',
          title: 'Browse your Drive root list offline',
          prs: [7474],
          app: 'mobile',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'drive-sharing',
      title: 'Safer sharing',
      deliverables: [
        {
          id: 'drive-export-links',
          title: 'Export links that expire and can be revoked',
          prs: [7140],
          app: 'drive',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'drive-runtime',
      title: 'Faster Drive hosting',
      deliverables: [
        {
          id: 'drive-edge',
          title: 'Drive built for the new edge runtime',
          prs: [7085, 7928, 7991],
          app: 'drive',
          fallback: 'planned',
        },
      ],
    },
  ],
};
