import type { Track } from '../../live/status.ts';

export const securityTrack: Track = {
  id: 'security',
  name: 'Security',
  summary:
    'Hardening that keeps your data and sessions safe as apps move to the edge.',
  milestones: [
    {
      id: 'accounts-and-roles',
      title: 'Stronger sign-in and workspace roles',
      titleVi: 'Đăng nhập và vai trò không gian làm việc an toàn hơn',
      deliverables: [
        {
          id: 'sec-step-up',
          title:
            'Apps can ask for a fresh second-factor check before sensitive actions',
          titleVi:
            'Ứng dụng có thể yêu cầu xác minh lớp thứ hai mới trước thao tác nhạy cảm',
          prs: [],
          commits: [
            '95dab39f6a27cb9e3b59b2c1abf6f6b17066e20c',
            '7640a2f0a2bd7f60ac625d12ed903d8855306fcb',
          ],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'sec-no-default-admin',
          title: 'New workspace members no longer get admin rights by default',
          titleVi:
            'Thành viên mới của không gian làm việc không còn mặc định có quyền quản trị',
          prs: [],
          commits: ['902f64321907228fc09564641319fc77ef9f6aad'],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'sec-role-cleanup',
          title: 'Removing a member also removes their workspace roles',
          titleVi:
            'Gỡ một thành viên cũng gỡ luôn các vai trò của họ trong không gian làm việc',
          prs: [],
          commits: [
            '06feb2d7d7127d6085434bb9e18548ecc981bb3a',
            '80d3f96c1d7697594a89cdd4ea5e734e2fe55f39',
          ],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'sec-manager-floor',
          title:
            'Member removals and permission edits keep a workspace member manager',
          titleVi:
            'Xóa thành viên và sửa quyền vẫn giữ lại một người quản lý thành viên',
          prs: [],
          commits: [
            'ff706319fcf94362ac1aae260a78da5b379ddeae',
            'b2d6f4069eec2d396e40adca3bfa27125ba10f86',
            '0fda934f3e02196f7ad7f58c57a91d617a34097d',
          ],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'sec-session-core',
          title:
            'New sign-in session service with device limits and step-up checks',
          titleVi:
            'Dịch vụ phiên đăng nhập mới với giới hạn thiết bị và xác minh bổ sung',
          prs: [],
          app: null,
          fallback: 'in_progress',
        },
        {
          id: 'sec-keyguard',
          title: 'Pinned signing-key guard for the new session service',
          titleVi:
            'Cơ chế bảo vệ khóa ký cố định cho dịch vụ phiên đăng nhập mới',
          prs: [],
          app: null,
          fallback: 'in_progress',
        },
      ],
    },
    {
      id: 'safer-requests',
      title: 'Safer server requests',
      deliverables: [
        {
          id: 'redirects-edge-transports',
          title: 'Stricter redirect handling in shared network clients',
          prs: [7910, 8033],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'redirects-web-server',
          title: 'Server requests from tuturuuu.com never follow redirects',
          prs: [8034],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'redirects-native-data',
          title: 'Stricter redirect handling in native data clients',
          prs: [7947],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'redirects-downloads',
          title: 'File download relay refuses unexpected redirects',
          prs: [7912],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'redirects-providers',
          title: 'Calendar and Mail provider calls refuse redirects',
          prs: [7907],
          app: 'calendar',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'private-caching',
      title: 'Privacy-safe caching',
      deliverables: [
        {
          id: 'gateway-no-personal-cache',
          title: 'Public pages never cache personalized content',
          prs: [7940, 7965],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'signed-in-bypass',
          title: 'Signed-in visitors always get fresh, personal pages',
          prs: [7979],
          app: 'web',
          fallback: 'planned',
        },
        {
          id: 'roadmap-cache-boundary',
          title: 'Roadmap caching limited to public data',
          prs: [7802],
          app: 'roadmap',
          fallback: 'planned',
        },
        {
          id: 'offline-cache-per-app',
          title: 'Offline caches kept separate for each app',
          prs: [6776],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'abuse-protection',
      title: 'Abuse protection at the edge',
      deliverables: [
        {
          id: 'abuse-guard-worker',
          title: 'Durable rate limiting built on Cloudflare',
          prs: [6837, 6852],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'abuse-guard-mind-nova',
          title: 'Mind and Nova use edge rate limiting',
          prs: [8001, 8002],
          app: 'mind',
          fallback: 'planned',
        },
        {
          id: 'abuse-guard-rewise-cms',
          title: 'Rewise and CMS use edge rate limiting',
          prs: [8035],
          app: 'rewise',
          fallback: 'planned',
        },
        {
          id: 'meet-ai-limits',
          title: 'Per-user limits on Meet AI features',
          prs: [7417],
          app: 'meet',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'secure-defaults',
      title: 'Secure by default on Workers',
      deliverables: [
        {
          id: 'fail-closed-config',
          title: 'Apps refuse to start without required settings',
          prs: [7666, 7682],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'security-headers',
          title: 'Per-app security headers on every page',
          prs: [6749, 6813],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'no-source-maps',
          title: 'Production bundles ship without source maps',
          prs: [6972],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'csrf-check',
          title: 'Framework-independent cross-site request checks',
          prs: [6847],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'redacted-sync-errors',
          title: 'Calendar sync errors stay short and redacted',
          prs: [8068],
          app: 'calendar',
          fallback: 'in_progress',
        },
        {
          id: 'workspace-ai-policy',
          title: 'Workspace AI policies apply to every provider',
          prs: [7525],
          app: 'ai',
          fallback: 'in_progress',
        },
      ],
    },
  ],
};
