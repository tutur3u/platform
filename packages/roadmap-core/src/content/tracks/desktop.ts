import type { Track } from '../../live/status.ts';

export const desktopTrack: Track = {
  id: 'desktop',
  name: 'Desktop app',
  summary:
    'Tuturuuu for Windows and macOS, with beta builds and in-app updates.',
  milestones: [
    {
      id: 'desktop-windows',
      title: 'Windows and release notes',
      deliverables: [
        {
          id: 'desktop-windows-installers',
          title: 'Windows beta installers',
          prs: [6394],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'desktop-release-notes',
          title: 'Desktop versions ship with clear release notes',
          prs: [7157],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'desktop-dpi-fallback',
          title: 'Sharper display on older Windows scaling setups',
          prs: [5889],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'desktop-beta',
      title: 'Earlier: Desktop beta',
      summary: 'September 2026.',
      deliverables: [
        {
          id: 'desktop-beta-download',
          title: 'Desktop beta builds and a download page',
          prs: [5405],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'desktop-managed-updates',
          title: 'Managed beta updates and Microsoft Store package',
          prs: [5443],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'desktop-login-approvals',
          title: 'Approve desktop sign-ins from your phone',
          prs: [5400],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
