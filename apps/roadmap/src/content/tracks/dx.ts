import type { Track } from '../../live/status.ts';

export const dxTrack: Track = {
  id: 'dx',
  name: 'Developer experience',
  summary:
    'Faster tooling, typed APIs and better docs for people building on Tuturuuu.',
  milestones: [
    {
      id: 'faster-tooling',
      title: 'Faster builds and checks',
      deliverables: [
        {
          id: 'oxc-lint-format',
          title: 'Much faster linting and formatting with Oxc',
          prs: [6130, 7785],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'turbo-hash',
          title: 'Fewer needless rebuilds in the monorepo',
          prs: [6475],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'remote-cache',
          title: 'Shared remote build cache on Cloudflare R2',
          prs: [6484],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'pre-push-gate',
          title: 'Quick pre-push checks without a full build',
          prs: [6467],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'vite-plus',
          title: 'Apps adopt the Vite+ toolchain',
          prs: [6136, 6621],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'typed-api',
      title: 'Typed API and packages',
      deliverables: [
        {
          id: 'api-foundation',
          title: 'Standalone API with OpenAPI 3.1 and generated clients',
          prs: [6761],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'workspace-endpoints',
          title: 'First 26 workspace endpoints on the typed API',
          prs: [7946],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'api-remaining',
          title: 'Remaining web API routes move to the typed API',
          prs: [],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'installable-packages',
          title: 'Published @tuturuuu packages install cleanly',
          prs: [7389],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'feature-flags-release',
          title: '@tuturuuu/feature-flags released automatically',
          prs: [7479],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'cloudflare-package',
          title: '@tuturuuu/cloudflare package for edge helpers',
          prs: [7442],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'docs-and-cli',
      title: 'Docs and CLI',
      deliverables: [
        {
          id: 'platform-guides',
          title: '82 new product and engineering guides',
          prs: [6085],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'cloudflare-references',
          title: 'Version-pinned Cloudflare migration references',
          prs: [7839, 6620],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'cli-side-by-side',
          title: 'CLI upgrades can keep versions side by side',
          prs: [6696],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'new-stack-guide',
          title: 'Guide for building apps on Start, Vite+ and Void',
          prs: [],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
