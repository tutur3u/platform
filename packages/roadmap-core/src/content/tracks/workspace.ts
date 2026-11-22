import type { Track } from '../../live/status.ts';

export const workspaceTrack: Track = {
  id: 'workspace',
  name: 'Workspace & website',
  summary: 'Accounts, workspaces, settings and the tuturuuu.com website.',
  milestones: [
    {
      id: 'sorbet-rollout',
      title: 'Sorbet design rollout',
      titleVi: 'Triển khai thiết kế Sorbet',
      deliverables: [
        {
          id: 'sorbet-opt-in',
          title:
            'Sorbet design available as an opt-in that follows your account',
          titleVi:
            'Thiết kế Sorbet có thể bật thử và tự đồng bộ theo tài khoản của bạn',
          prs: [8436],
          commits: [
            '3f3a1cc7a2f82e9a72b93800a86f3fe60566a562',
            '63f18c4ac6a4d0ece11518682ba2a9dd80129e9b',
            'c565dcdebb0681150821679fb1e4ad4433de3b22',
          ],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'sorbet-web-dock',
          title: 'Floating dock for phones on the web, matching the mobile app',
          titleVi:
            'Thanh dock nổi cho điện thoại trên web, đồng bộ với ứng dụng di động',
          prs: [],
          commits: ['b28cb11cfd023bacd5a0a0eb55465a9766366283'],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'sorbet-mobile',
          title: 'Sorbet design and floating dock in the mobile app',
          titleVi: 'Thiết kế Sorbet và thanh dock nổi trong ứng dụng di động',
          prs: [],
          commits: [
            '882a7d93e9a4204f498496b4c55f76f84e3a33c2',
            'c31a92a527354e083667f04d8c6e4d39136fa508',
          ],
          app: 'mobile',
          fallback: 'planned',
        },
        {
          id: 'marketing-navbar',
          title: 'Website navbar rebuilt on the floating-bar design',
          titleVi:
            'Thanh điều hướng website được làm lại theo thiết kế thanh nổi',
          prs: [],
          commits: [
            '3670c6afaa5b591f4cf47d2a38e1d5ad55b6e25e',
            'dcfed381c211fd25d97e92d6259750d2e89cb766',
          ],
          app: 'marketing',
          fallback: 'planned',
        },
        {
          id: 'sorbet-default',
          title: 'Sorbet becomes the default design for everyone',
          titleVi: 'Sorbet trở thành thiết kế mặc định cho mọi người',
          prs: [],
          app: 'web',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'workspace-up-next',
      title: 'Up next',
      deliverables: [
        {
          id: 'documents-hierarchy',
          title: 'Nest documents and move them with drag and drop',
          prs: [7895, 7918],
          app: 'web',
          fallback: 'in_progress',
        },
        {
          id: 'website-design-page',
          title: 'Public design system page at tuturuuu.com/design',
          prs: [7876],
          app: 'web',
          fallback: 'in_progress',
        },
        {
          id: 'workspace-avatar-editor',
          title: 'One avatar editor for profiles and workspaces',
          prs: [7871],
          app: 'web',
          fallback: 'in_progress',
        },
        {
          id: 'legal-nov-2026',
          title: 'Updated Terms, Privacy Policy and data processing terms',
          prs: [7582],
          app: 'web',
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'workspace-settings',
      title: 'Profiles and settings',
      deliverables: [
        {
          id: 'workspace-public-profiles',
          title: 'Public profiles from the account menu',
          prs: [6106],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'workspace-profile-banner',
          title: 'Edit your profile banner on the web',
          prs: [5916],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'workspace-hidden-choices',
          title: 'Hide workspaces and pick from a full-screen list',
          prs: [5699],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'workspace-settings-groups',
          title: 'Settings grouped into clearer sections',
          prs: [7790, 7791],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'workspace-settings-dialog',
          title: 'Flatter board settings in an inset dialog',
          prs: [7920],
          app: 'web',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'workspace-website',
      title: 'tuturuuu.com',
      deliverables: [
        {
          id: 'website-localized-metadata',
          title: 'Localized titles and previews for product pages',
          prs: [5159],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'website-sitemap',
          title: 'Automatic sitemap and bilingual team page',
          prs: [5729],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'website-consent-banner',
          title: 'Privacy consent banner on the website',
          prs: [8045],
          app: 'marketing',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'workspace-earlier-start',
      title: 'Earlier: Where it began',
      summary: '2022 to 2023.',
      deliverables: [
        {
          id: 'workspace-prototype',
          title: 'First prototype with sign-in',
          prs: [3],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'workspace-organizations',
          title: 'Organizations, later renamed workspaces',
          prs: [16, 187],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'workspace-member-roles',
          title: 'Workspace member roles',
          prs: [474],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'workspace-landing-2023',
          title: 'New tuturuuu.com landing page',
          prs: [104],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'workspace-earlier-everyone',
      title: 'Earlier: Open to everyone',
      summary: '2023 to 2025.',
      deliverables: [
        {
          id: 'workspace-vietnamese',
          title: 'Full Vietnamese translation',
          prs: [283, 926],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'workspace-themes',
          title: 'Light, dark and colour themes',
          prs: [902, 1001],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'workspace-invites',
          title: 'Invite by email or with a link',
          prs: [1431, 3796],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'workspace-personal',
          title: 'Personal workspace and open workspace creation',
          prs: [3451, 3817],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'workspace-short-links-qr',
          title: 'Short links with passwords and a QR generator',
          prs: [3203, 4179, 3560],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
