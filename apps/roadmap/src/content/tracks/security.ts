import type { Track } from '../../live/status.ts';

export const securityTrack: Track = {
  id: 'security',
  name: 'Security',
  summary:
    'Hardening that keeps your data and sessions safe as apps move to the edge.',
  milestones: [
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
