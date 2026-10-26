// Tasks' signed-in native root-browser profile for
// scripts/ci/native-root-browser.mjs: with no board to open, a signed-in
// visit to the root renders the personal task entrypoint in place, in each
// locale.
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
  rootHost: 'tasks.tuturuuu.com',
  robots: 'noindex, nofollow, nosnippet',
  // The proxy treats an app session plus Web's session as signed in.
  session: ['app', 'web'],
  locales: [
    { locale: 'en', path: '/', finalPath: /^\/$/u },
    {
      locale: 'vi',
      path: '/vi',
      finalPath: /^\/vi\/?$/u,
      cookies: { NEXT_LOCALE: 'vi' },
    },
  ],
  supabase: { workspaces: workspace },
  web: {},
  hydration: { request: () => '/api/v1/' },
  // The default avatar for a workspace without one.
  browser: [{ origin: 'https://avatar.vercel.sh', fulfill: 'image' }],
};
