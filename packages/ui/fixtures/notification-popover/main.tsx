import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import en from '../../../../apps/web/messages/en.json';
import vi from '../../../../apps/web/messages/vi.json';
import { notificationLabelsFromMessages } from '../../src/components/ui/custom/notification-labels';
import { NotificationRuntime } from '../../src/components/ui/custom/notification-runtime';
import SatelliteNotificationPopover from '../../src/components/ui/custom/satellite-notification-popover';
import { Toaster } from '../../src/components/ui/sonner';
import type { Notification } from '../../src/hooks/use-notifications';
import '../../src/globals.css';

// Standalone layout fixture: fictional data, an in-memory notification API
// injected through the runtime transport, no network, auth or database.
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'vi' ? 'vi' : 'en';
const anchor = params.get('anchor') === 'navbar' ? 'navbar' : 'sidebar';
document.documentElement.lang = locale;
document.documentElement.classList.toggle(
  'dark',
  params.get('theme') === 'dark'
);
if (params.get('ui') === 'sorbet')
  document.documentElement.dataset.ui = 'sorbet';

const WS = '00000000-0000-4000-8000-0000000000aa';
const now = Date.now();
const titles = [
  'Orchard review checklist was assigned to you',
  'Lunar studio onboarding copy has new comments from three reviewers',
  'Weekly planning starts at 19:30',
  'Budget for regional tutoring cooperative reached 90 percent',
];
const rows: Notification[] = Array.from({ length: 30 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  ws_id: WS,
  user_id: 'fixture-user',
  type: i === 0 ? 'workspace_invite' : 'task_updated',
  title: titles[i % titles.length]!,
  description: i % 3 === 0 ? 'Paperboat community · Product roadmap' : null,
  data: i === 0 ? { workspace_id: WS, workspace_name: 'Orchard design' } : {},
  entity_type: i === 0 ? null : 'task',
  // Rows 1-3 repeat one entity so the list shows a collapsed stack.
  entity_id: i === 0 ? null : i <= 3 ? 'task-stacked' : `task-${i}`,
  read_at: i % 4 === 3 ? new Date(now).toISOString() : null,
  created_at: new Date(now - i * 3 * 3_600_000).toISOString(),
  created_by: null,
  actor: null,
}));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });

let revision = 0;
const revisions = new Map<string, string>();

async function fakeApi(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input), location.origin);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const unread = () => rows.filter((n) => !n.read_at);
  if (url.pathname.endsWith('/unread-count'))
    return json({ count: unread().length });
  if ((init?.method ?? 'GET') === 'GET') {
    const list =
      url.searchParams.get('unreadOnly') === 'true' ? unread() : rows;
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    return json({
      notifications: list.slice(offset, offset + limit),
      count: list.length,
      limit,
      offset,
    });
  }
  // Models the per-row database revision: every read-state change of a row
  // gives it a new opaque value.
  if (body?.action === 'mark_all_read') {
    const changed = unread();
    for (const n of changed) {
      n.read_at = new Date().toISOString();
      revisions.set(n.id, `rev-${++revision}`);
    }
    return json({
      success: true,
      ids: changed.map((n) => n.id),
      undo_revisions: changed.map((n) => revisions.get(n.id)),
    });
  }
  if (body?.action === 'restore_unread') {
    const restored = rows.filter(
      (n) =>
        body.ids.includes(n.id) &&
        n.read_at &&
        body.revisions.includes(revisions.get(n.id))
    );
    for (const n of restored) {
      n.read_at = null;
      revisions.set(n.id, `rev-${++revision}`);
    }
    return json({ ids: restored.map((n) => n.id) });
  }
  const target = rows.find((n) => url.pathname.endsWith(`/${n.id}`));
  if (target && typeof body?.read === 'boolean') {
    target.read_at = body.read ? new Date().toISOString() : null;
    revisions.set(target.id, `rev-${++revision}`);
  }
  return json({ success: true });
}

const labels = notificationLabelsFromMessages(locale === 'vi' ? vi : en);
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const bell = (
  <NotificationRuntime
    value={{
      params: { wsId: WS, locale },
      pathname: `/${WS}`,
      router: { push() {}, refresh() {} },
      Link: ({ children, ...props }) => <a {...props}>{children}</a>,
      realtime: true,
      apiOptions: { appBaseResolver: (path) => path, fetch: fakeApi },
    }}
  >
    <SatelliteNotificationPopover userId="fixture-user" labels={labels} />
  </NotificationRuntime>
);

// Mirrors the shared Structure: a rail that becomes a full-width sheet below
// 768px, or a satellite navbar with the bell at the end.
const chrome =
  anchor === 'sidebar' ? (
    <aside
      data-fixture-rail
      style={{
        position: 'fixed',
        inset: '0 auto 0 0',
        width: innerWidth < 768 ? '100%' : 64,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: 8,
        borderRight: '1px solid var(--border)',
        background: 'var(--background)',
      }}
    >
      {bell}
    </aside>
  ) : (
    <header
      data-fixture-navbar
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        height: 56,
        padding: '0 12px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {bell}
    </header>
  );

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <div style={{ minHeight: '100dvh', background: 'var(--background)' }}>
      {chrome}
    </div>
    <Toaster />
  </QueryClientProvider>
);
