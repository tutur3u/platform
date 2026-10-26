// Track's signed-in native root-browser profile for
// scripts/ci/native-root-browser.mjs: a signed-in visit to the root lands on
// the personal workspace's timer in each locale.
const workspace = ({ actorId, wsId }) => ({
  id: wsId,
  name: 'Fixture Personal',
  personal: true,
  handle: null,
  avatar_url: null,
  logo_url: null,
  creator_id: actorId,
  created_at: '2026-01-01T00:00:00Z',
  deleted: false,
  workspace_members: [{ user_id: actorId }],
});

export default {
  rootHost: 'track.tuturuuu.com',
  robots: 'noindex, nofollow, nosnippet',
  // The proxy treats an app session plus Web's session as signed in.
  session: ['app', 'web'],
  locales: [
    { locale: 'en', path: '/', finalPath: /^\/personal\/?$/u },
    {
      locale: 'vi',
      path: '/vi',
      finalPath: /^\/personal\/?$/u,
      cookies: { NEXT_LOCALE: 'vi' },
    },
  ],
  supabase: { workspaces: workspace },
  web: {
    'GET /api/v1/users/me/default-workspace': ({ wsId }) => ({
      id: wsId,
      name: 'Fixture Personal',
      personal: true,
    }),
  },
  // The timer polls; its first workspace read proves hydration.
  hydration: { request: ({ wsId }) => `/api/v1/workspaces/${wsId}/` },
  // The default avatar for a workspace without one.
  browser: [{ origin: 'https://avatar.vercel.sh', fulfill: 'image' }],
};
