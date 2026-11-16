// Network-fenced fixture for the shared command center. URL parameters:
//   locale=en|vi       labels from apps/web command_launcher messages
//   host=calendar|duplicate|finance-like
//                      duplicate mounts two shell launchers and one
//                      priority-10 product launcher
//   remote=ready|error|slow
//   actor=1|0          signed-in actor (workspaces, fallbacks) or anonymous
//   theme=dark, ui=sorbet
// Every request is answered here; nothing reaches a live service.
const keydownRegistrations = { count: 0 };
const addListener = document.addEventListener.bind(document);
document.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) => {
  if (type === 'keydown') keydownRegistrations.count += 1;
  addListener(type, listener, options);
}) as typeof document.addEventListener;
Object.assign(window, { __commandCenterKeydownRegistrations: keydownRegistrations });

const params = new URLSearchParams(location.search);
const remote = params.get('remote') ?? 'ready';
const workspaceNames = [
  'Orchard design collective',
  'Lunar research studio',
  'Paperboat community',
  'Northwind regional tutoring cooperative and evening learning collective',
  '<img src=x onerror="window.__injected=true">',
  ...Array.from({ length: 40 }, (_, index) => `Fixture team ${index + 1}`),
];
const fixtureWorkspaces = workspaceNames.map((name, index) => ({
  access_type: index === 2 ? 'guest' : 'owner',
  created_by_me: index !== 2,
  guest_landing_path: null,
  id: `fixture-${index}`,
  name,
  personal: index === 0,
}));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const requests: string[] = [];
Object.assign(window, { __commandCenterRequests: requests });
globalThis.fetch = async (input) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    location.origin
  );
  requests.push(url.pathname + url.search);
  if (url.pathname.includes('hidden')) return json({ hiddenWorkspaceIds: [] });
  if (url.pathname.includes('workspaces')) {
    const q = url.searchParams.get('q');
    if (q && remote === 'error') return json({ error: 'fixture' }, 500);
    if (q && remote === 'slow') await delay(1500);
    const matches = q
      ? fixtureWorkspaces.filter((workspace) =>
          workspace.name.toLowerCase().includes(q.toLowerCase())
        )
      : fixtureWorkspaces.slice(0, 20);
    return json(matches);
  }
  return json({ error: 'not stubbed' }, 404);
};

const [{ createRoot }, react, query, satellite, visibility, en, vi] =
  await Promise.all([
    import('react-dom/client'),
    import('react'),
    import('@tanstack/react-query'),
    import('../../src/components/command-launcher/portable'),
    import('../../../ui/src/hooks/use-workspace-visibility'),
    import('../../../../apps/web/messages/en.json'),
    import('../../../../apps/web/messages/vi.json'),
  ]);
await import('../../../ui/src/globals.css');

const locale = params.get('locale') === 'vi' ? 'vi' : 'en';
document.documentElement.lang = locale;
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
if (params.get('ui') === 'sorbet') document.documentElement.dataset.ui = 'sorbet';
const labels = satellite.buildCommandLauncherLabelsFromMessages(
  (locale === 'vi' ? vi : en).default.command_launcher
);
const host = params.get('host') ?? 'calendar';
const navItems = [
  { href: '/fixture/tasks', keywords: ['boards'], title: 'Boards' },
  { href: '/fixture/calendar', keywords: ['schedule'], title: 'Calendar week' },
  { href: '/fixture/settings', keywords: ['preferences'], title: 'Settings' },
];
const navigations: string[] = [];
Object.assign(window, { __commandCenterNavigations: navigations });
const onNavigate = (url: string) => navigations.push(url);
const client = new query.QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Launchers() {
  const props = {
    currentWorkspaceId: 'fixture-1',
    labels,
    navItems,
    onNavigate,
  };
  if (host === 'duplicate') {
    return react.createElement(
      react.Fragment,
      null,
      react.createElement(satellite.CommandCenterHost, { ...props, currentApp: 'calendar' }),
      react.createElement(satellite.CommandCenterHost, { ...props, currentApp: 'calendar' }),
      react.createElement(satellite.CommandCenterHost, {
        ...props,
        currentApp: 'tasks',
        instancePriority: 10,
        labels: { ...labels, placeholder: 'Product launcher' },
      })
    );
  }
  return react.createElement(satellite.CommandCenterHost, {
    ...props,
    currentApp: host === 'finance-like' ? 'finance' : 'calendar',
    extraSections:
      host === 'finance-like' ? () => null : undefined,
  });
}

function App() {
  const opener = react.createElement(
    'button',
    {
      'data-testid': 'opener',
      onClick: () => satellite.openGlobalCommandLauncher(),
      style: { margin: 16 },
      type: 'button',
    },
    'Open command center'
  );
  const content = react.createElement(react.Fragment, null, opener, react.createElement(Launchers));
  return react.createElement(
    query.QueryClientProvider,
    { client },
    params.get('actor') === '0'
      ? content
      : react.createElement(
          visibility.WorkspaceVisibilityProvider,
          { actorId: 'fixture-actor' },
          content
        )
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(react.createElement(App));
