// Tasks' signed-in native root-browser profile for
// scripts/ci/native-root-browser.mjs: a signed-in visit to the root opens the
// personal workspace's default board, in each locale.
const BOARD_ID = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0';
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
    {
      locale: 'en',
      path: '/',
      finalPath: new RegExp(`^/personal/boards/${BOARD_ID}$`, 'u'),
    },
    {
      locale: 'vi',
      path: '/vi',
      // next-intl drops the prefix once the locale cookie names Vietnamese.
      finalPath: new RegExp(`^/personal/boards/${BOARD_ID}$`, 'u'),
      cookies: { NEXT_LOCALE: 'vi' },
    },
  ],
  supabase: {
    workspaces: workspace,
    // Task-board APIs check membership before listing boards.
    workspace_members: ({ actorId, wsId }) => ({
      ws_id: wsId,
      user_id: actorId,
      type: 'MEMBER',
    }),
    // The default personal board already exists, so nothing is written.
    workspace_boards: ({ actorId, wsId }) => ({
      id: BOARD_ID,
      ws_id: wsId,
      name: 'Tasks',
      creator_id: actorId,
      created_at: '2026-01-01T00:00:00Z',
      archived_at: null,
      deleted_at: null,
    }),
  },
  web: {},
  // The board's client reads (user configs) only start once it hydrates.
  hydration: { request: () => '/api/v1/' },
  // The default avatar for a workspace without one.
  browser: [{ origin: 'https://avatar.vercel.sh', fulfill: 'image' }],
};
