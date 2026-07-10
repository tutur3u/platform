import { toWorkspaceSlug } from './constants';
import { getTuturuuuPortlessAppOrigin } from './portless';

export const LAUNCHABLE_APP_CATEGORIES = [
  'productivity',
  'operations',
  'learning',
  'ai',
  'miscellaneous',
] as const;

export type LaunchableAppCategory = (typeof LAUNCHABLE_APP_CATEGORIES)[number];

export type LaunchableWorkspace = {
  guest_landing_path?: string | null;
  id: string;
  name?: string | null;
  personal?: boolean | null;
};

export type LaunchableAppWorkspacePathResolver = (
  workspace: LaunchableWorkspace
) => string;

export type LaunchableApp = {
  aliases: readonly string[];
  appRoot: string;
  category: LaunchableAppCategory;
  defaultPath: string;
  localhostOrigin?: string;
  packageName: string;
  portlessApp: Parameters<typeof getTuturuuuPortlessAppOrigin>[0];
  productionUrl: string;
  slug: string;
  title: string;
  workspacePathResolver?: LaunchableAppWorkspacePathResolver;
};

const workspaceRootPath: LaunchableAppWorkspacePathResolver = (workspace) =>
  `/${toWorkspaceSlug(workspace.id, { personal: Boolean(workspace.personal) })}`;

const workspaceTasksPath: LaunchableAppWorkspacePathResolver = (workspace) =>
  `${workspaceRootPath(workspace)}/tasks`;

const meetWorkspacePath: LaunchableAppWorkspacePathResolver = (workspace) =>
  `/workspace/${toWorkspaceSlug(workspace.id, {
    personal: Boolean(workspace.personal),
  })}`;

export const LAUNCHABLE_APPS = [
  {
    aliases: ['Tuturuuu', 'Dashboard', 'Workspace'],
    appRoot: 'apps/web',
    category: 'productivity',
    defaultPath: '/',
    localhostOrigin: 'http://localhost:7803',
    packageName: '@tuturuuu/web',
    portlessApp: 'platform',
    productionUrl: 'https://tuturuuu.com',
    slug: 'platform',
    title: 'Platform',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Schedule', 'Events'],
    appRoot: 'apps/calendar',
    category: 'productivity',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7806',
    packageName: '@tuturuuu/calendar',
    portlessApp: 'calendar',
    productionUrl: 'https://calendar.tuturuuu.com',
    slug: 'calendar',
    title: 'Calendar',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Chat', 'Messages', 'Direct Messages'],
    appRoot: 'apps/chat',
    category: 'productivity',
    defaultPath: '/',
    localhostOrigin: 'http://localhost:7821',
    packageName: '@tuturuuu/chat',
    portlessApp: 'chat',
    productionUrl: 'https://chat.tuturuuu.com',
    slug: 'chat',
    title: 'Chat',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Content', 'CMS'],
    appRoot: 'apps/cms',
    category: 'operations',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7811',
    packageName: '@tuturuuu/cms',
    portlessApp: 'cms',
    productionUrl: 'https://cms.tuturuuu.com',
    slug: 'cms',
    title: 'CMS',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Files', 'Storage'],
    appRoot: 'apps/drive',
    category: 'productivity',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7817',
    packageName: '@tuturuuu/drive',
    portlessApp: 'drive',
    productionUrl: 'https://drive.tuturuuu.com',
    slug: 'drive',
    title: 'Drive',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['App Launcher', 'Gateway', 'Apps Gateway'],
    appRoot: 'apps/apps',
    category: 'miscellaneous',
    defaultPath: '/',
    localhostOrigin: 'http://localhost:7818',
    packageName: '@tuturuuu/apps',
    portlessApp: 'apps',
    productionUrl: 'https://apps.tuturuuu.com',
    slug: 'apps',
    title: 'Apps',
  },
  {
    aliases: ['Documentation', 'Guides', 'Reference'],
    appRoot: 'apps/docs',
    category: 'miscellaneous',
    defaultPath: '/',
    packageName: 'apps/docs',
    portlessApp: 'docs',
    productionUrl: 'https://docs.tuturuuu.com',
    slug: 'docs',
    title: 'Docs',
  },
  {
    aliases: ['Money', 'Wallets', 'Invoices'],
    appRoot: 'apps/finance',
    category: 'operations',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7808',
    packageName: '@tuturuuu/finance',
    portlessApp: 'finance',
    productionUrl: 'https://finance.tuturuuu.com',
    slug: 'finance',
    title: 'Finance',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Simulation', 'Voxel'],
    appRoot: 'apps/hive',
    category: 'ai',
    defaultPath: '/',
    localhostOrigin: 'http://localhost:7814',
    packageName: '@tuturuuu/hive',
    portlessApp: 'hive',
    productionUrl: 'https://hive.tuturuuu.com',
    slug: 'hive',
    title: 'Hive',
  },
  {
    aliases: ['Warehouse', 'Stock'],
    appRoot: 'apps/inventory',
    category: 'operations',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7815',
    packageName: '@tuturuuu/inventory',
    portlessApp: 'inventory',
    productionUrl: 'https://inventory.tuturuuu.com',
    slug: 'inventory',
    title: 'Inventory',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Store', 'Shop', 'Cart'],
    appRoot: 'apps/storefront',
    category: 'operations',
    defaultPath: '/store/demo',
    localhostOrigin: 'http://localhost:7822',
    packageName: '@tuturuuu/storefront',
    portlessApp: 'storefront',
    productionUrl: 'https://storefront.tuturuuu.com',
    slug: 'storefront',
    title: 'Storefront',
  },
  {
    aliases: ['Study', 'Student'],
    appRoot: 'apps/learn',
    category: 'learning',
    defaultPath: '/dashboard',
    localhostOrigin: 'http://localhost:7812',
    packageName: '@tuturuuu/learn',
    portlessApp: 'learn',
    productionUrl: 'https://learn.tuturuuu.com',
    slug: 'learn',
    title: 'Learn',
  },
  {
    aliases: ['Email', 'Inbox'],
    appRoot: 'apps/mail',
    category: 'productivity',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7820',
    packageName: '@tuturuuu/mail',
    portlessApp: 'mail',
    productionUrl: 'https://mail.tuturuuu.com',
    slug: 'mail',
    title: 'Mail',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Meeting', 'Video'],
    appRoot: 'apps/meet',
    category: 'productivity',
    defaultPath: '/',
    localhostOrigin: 'http://localhost:7807',
    packageName: '@tuturuuu/meet',
    portlessApp: 'meet',
    productionUrl: 'https://meet.tuturuuu.com',
    slug: 'meet',
    title: 'Meet',
    workspacePathResolver: meetWorkspacePath,
  },
  {
    aliases: ['Mind Map', 'Canvas'],
    appRoot: 'apps/mind',
    category: 'ai',
    defaultPath: '/dashboard',
    localhostOrigin: 'http://localhost:7816',
    packageName: '@tuturuuu/mind',
    portlessApp: 'mind',
    productionUrl: 'https://mind.tuturuuu.com',
    slug: 'mind',
    title: 'Mind',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Prompt', 'Challenges'],
    appRoot: 'apps/nova',
    category: 'ai',
    defaultPath: '/',
    localhostOrigin: 'http://localhost:7805',
    packageName: '@tuturuuu/nova',
    portlessApp: 'nova',
    productionUrl: 'https://nova.ai.vn',
    slug: 'nova',
    title: 'Nova',
  },
  {
    aliases: ['QR Code', 'Generator', 'Password', 'Random', 'UUID', 'Token'],
    appRoot: 'apps/tools',
    category: 'miscellaneous',
    defaultPath: '/',
    localhostOrigin: 'http://localhost:7825',
    packageName: '@tuturuuu/tools',
    portlessApp: 'tools',
    productionUrl: 'https://tools.tuturuuu.com',
    slug: 'tools',
    title: 'Tools',
  },
  {
    aliases: ['Review', 'Flashcards'],
    appRoot: 'apps/rewise',
    category: 'ai',
    defaultPath: '/',
    localhostOrigin: 'http://localhost:7804',
    packageName: '@tuturuuu/rewise',
    portlessApp: 'rewise',
    productionUrl: 'https://rewise.me',
    slug: 'rewise',
    title: 'Rewise',
  },
  {
    aliases: ['Links', 'URL Shortener'],
    appRoot: 'apps/shortener',
    category: 'miscellaneous',
    defaultPath: '/',
    packageName: '@tuturuuu/shortener',
    portlessApp: 'shortener',
    productionUrl: 'https://shortener.tuturuuu.com',
    slug: 'shortener',
    title: 'Shortener',
  },
  {
    aliases: ['Todos', 'Kanban', 'Projects'],
    appRoot: 'apps/tasks',
    category: 'productivity',
    defaultPath: '/personal/tasks',
    localhostOrigin: 'http://localhost:7809',
    packageName: '@tuturuuu/tasks',
    portlessApp: 'tasks',
    productionUrl: 'https://tasks.tuturuuu.com',
    slug: 'tasks',
    title: 'Tasks',
    workspacePathResolver: workspaceTasksPath,
  },
  {
    aliases: ['Classes', 'Tutoring'],
    appRoot: 'apps/teach',
    category: 'learning',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7813',
    packageName: '@tuturuuu/teach',
    portlessApp: 'teach',
    productionUrl: 'https://teach.tuturuuu.com',
    slug: 'teach',
    title: 'Teach',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Billing', 'Subscriptions', 'Payments'],
    appRoot: 'apps/pay',
    category: 'operations',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7826',
    packageName: '@tuturuuu/pay',
    portlessApp: 'pay',
    productionUrl: 'https://pay.tuturuuu.com',
    slug: 'pay',
    title: 'Pay',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['CRM', 'Users', 'Members', 'Customers', 'Leads'],
    appRoot: 'apps/contacts',
    category: 'operations',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7827',
    packageName: '@tuturuuu/contacts',
    portlessApp: 'contacts',
    productionUrl: 'https://contacts.tuturuuu.com',
    slug: 'contacts',
    title: 'Contacts',
    workspacePathResolver: workspaceRootPath,
  },
  {
    aliases: ['Time Tracking', 'Timer'],
    appRoot: 'apps/track',
    category: 'productivity',
    defaultPath: '/personal',
    localhostOrigin: 'http://localhost:7810',
    packageName: '@tuturuuu/track',
    portlessApp: 'track',
    productionUrl: 'https://track.tuturuuu.com',
    slug: 'track',
    title: 'Track',
    workspacePathResolver: workspaceRootPath,
  },
] as const satisfies readonly LaunchableApp[];

export type LaunchableAppSlug = (typeof LAUNCHABLE_APPS)[number]['slug'];

export type LaunchableAppEnvironment =
  | 'auto'
  | 'localhost'
  | 'portless'
  | 'production';

export function getLaunchableApp(slug: string) {
  return LAUNCHABLE_APPS.find((app) => app.slug === slug) ?? null;
}

export function getLaunchableAppByTitle(value?: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) return null;

  return (
    LAUNCHABLE_APPS.find(
      (app) =>
        app.slug === normalized ||
        app.title.toLowerCase() === normalized ||
        app.aliases.some((alias) => alias.toLowerCase() === normalized)
    ) ?? null
  );
}

function getAutoEnvironment(currentOrigin?: string): LaunchableAppEnvironment {
  if (currentOrigin?.includes('tuturuuu.localhost')) return 'portless';
  if (currentOrigin?.includes('localhost')) return 'localhost';

  if (typeof window !== 'undefined') {
    if (window.location.hostname.endsWith('tuturuuu.localhost')) {
      return 'portless';
    }

    if (window.location.hostname === 'localhost') {
      return 'localhost';
    }
  }

  return process.env.NODE_ENV === 'production' ? 'production' : 'portless';
}

export function getLaunchableAppOrigin(
  app: LaunchableApp,
  {
    currentOrigin,
    environment = 'auto',
  }: {
    currentOrigin?: string;
    environment?: LaunchableAppEnvironment;
  } = {}
) {
  const resolvedEnvironment =
    environment === 'auto' ? getAutoEnvironment(currentOrigin) : environment;

  if (resolvedEnvironment === 'production') return app.productionUrl;
  if (resolvedEnvironment === 'localhost') {
    return app.localhostOrigin ?? getTuturuuuPortlessAppOrigin(app.portlessApp);
  }

  return getTuturuuuPortlessAppOrigin(app.portlessApp);
}

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

function normalizePath(path: string) {
  const trimmed = path.trim();

  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function resolveLaunchableAppPath({
  app,
  path,
  workspace,
  workspacePathResolver,
}: {
  app: LaunchableApp;
  path?: string | null;
  workspace?: LaunchableWorkspace | null;
  workspacePathResolver?: LaunchableAppWorkspacePathResolver;
}) {
  if (path) return normalizePath(path);

  if (workspace) {
    const resolver = workspacePathResolver ?? app.workspacePathResolver;
    if (resolver) return normalizePath(resolver(workspace));
  }

  return normalizePath(app.defaultPath);
}

export function resolveLaunchableAppUrl({
  app,
  currentOrigin,
  environment = 'auto',
  path,
  searchParams,
  workspace,
  workspacePathResolver,
}: {
  app: LaunchableApp;
  currentOrigin?: string;
  environment?: LaunchableAppEnvironment;
  path?: string | null;
  searchParams?: Record<string, string | string[] | undefined>;
  workspace?: LaunchableWorkspace | null;
  workspacePathResolver?: LaunchableAppWorkspacePathResolver;
}) {
  const url = new URL(
    getLaunchableAppOrigin(app, { currentOrigin, environment })
  );
  const resolvedPath = resolveLaunchableAppPath({
    app,
    path,
    workspace,
    workspacePathResolver,
  });

  url.pathname =
    resolvedPath === '/'
      ? trimTrailingSlashes(url.pathname) || '/'
      : `${trimTrailingSlashes(url.pathname)}${resolvedPath}`;

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
