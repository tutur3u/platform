import type { Track } from '../../live/status.ts';

export const cmsTrack: Track = {
  id: 'cms',
  name: 'CMS',
  summary:
    'Edit, preview and publish website content with versions, roles and media.',
  milestones: [
    {
      id: 'cms-up-next',
      title: 'Up next',
      deliverables: [
        {
          id: 'cms-page-builder',
          title: 'Drag-and-drop page builder with a block inspector',
          prs: [7595, 7596, 7597],
          app: 'cms',
          fallback: 'in_progress',
        },
        {
          id: 'cms-builder-save-publish',
          title: 'Save drafts and publish from the page builder',
          prs: [7714, 7738],
          app: 'cms',
          fallback: 'in_progress',
        },
        {
          id: 'cms-published-delivery',
          title: 'Published pages delivered fast from the edge',
          prs: [7654, 7705, 7702, 8015],
          app: 'cms',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'cms-page-versions',
      title: 'Pages with versions',
      summary: 'Draft safely and publish exactly what you previewed.',
      deliverables: [
        {
          id: 'cms-page-versions-publish',
          title: 'Page versions with audited publishing',
          prs: [7584],
          app: 'cms',
          fallback: 'planned',
        },
        {
          id: 'cms-version-routes',
          title: 'Edit, preview and publish a page version',
          prs: [7591],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'cms-block-schema',
          title: 'Versioned content blocks for pages',
          prs: [7593, 7739],
          app: 'cms',
          fallback: 'planned',
        },
        {
          id: 'cms-editor-role',
          title: 'Editor-only members who cannot publish',
          prs: [7623],
          app: 'cms',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'cms-content-sync',
      title: 'Content sync and media',
      deliverables: [
        {
          id: 'cms-relation-bundles',
          title: 'Related content and managed media assets',
          prs: [4990],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'cms-large-projects',
          title: 'Large content projects sync reliably',
          prs: [4960, 4962],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'cms-storage-analytics',
          title: 'Faster storage analytics for projects',
          prs: [6008],
          app: 'cms',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'cms-mobile',
      title: 'CMS on mobile',
      deliverables: [
        {
          id: 'cms-mobile-browsing',
          title: 'Browse content and edit entries on mobile',
          prs: [5863],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'cms-mobile-design-kit',
          title: 'Mobile CMS screens on the new design kit',
          prs: [6684],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
