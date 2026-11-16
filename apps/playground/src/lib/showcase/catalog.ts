import {
  LAUNCHABLE_APPS,
  type LaunchableAppCategory,
  type LaunchableAppSlug,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';

/** Web owns sign-in; the showcase links there with no return parameter. */
export const SIGN_IN_URL = 'https://tuturuuu.com/login';

/** Roadmap is a Web feature rather than a launchable app. */
export const ROADMAP_URL = 'https://tuturuuu.com/roadmap';

/** Products with a working in-browser demo, in display order. */
export const INTERACTIVE_SLUGS = [
  'tasks',
  'calendar',
  'track',
  'finance',
  'mail',
  'mind',
] as const satisfies readonly LaunchableAppSlug[];

export type InteractiveSlug = (typeof INTERACTIVE_SLUGS)[number];

export type ShowcaseCategory = LaunchableAppCategory;

export const SHOWCASE_CATEGORY_LABELS: Record<ShowcaseCategory, string> = {
  productivity: 'Productivity',
  operations: 'Operations',
  learning: 'Learning',
  ai: 'AI',
  miscellaneous: 'More',
};

export type ShowcaseProduct = {
  slug: string;
  title: string;
  category: ShowcaseCategory;
  summary: string;
  /** Production destination of the real product. */
  href: string;
  interactive: boolean;
};

const SUMMARIES: Record<LaunchableAppSlug | 'roadmap', string> = {
  platform: 'Workspaces, members and the shared dashboard.',
  calendar: 'Plan the week and keep every event in one place.',
  chat: 'Direct messages and team conversations.',
  cms: 'Manage content for sites and apps.',
  drive: 'Store, share and organise files.',
  git: 'Browse repositories and code changes.',
  apps: 'Launch every Tuturuuu app from one place.',
  docs: 'Guides and reference documentation.',
  finance: 'Wallets, transactions and invoices with live totals.',
  hive: 'A simulation sandbox.',
  inventory: 'Stock levels across warehouses.',
  storefront: 'A hosted store with products and a cart.',
  learn: 'Courses and study tools for students.',
  mail: 'Read, write and organise email.',
  meet: 'Video meetings for your team.',
  mind: 'Capture ideas as notes and maps.',
  ai: 'Models, agents and evaluations.',
  nova: 'Prompt engineering challenges.',
  tools: 'QR codes, passwords, UUIDs and other utilities.',
  rewise: 'Review with flashcards.',
  shortener: 'Short, shareable links.',
  tasks: 'Boards, lists and projects.',
  teach: 'Classes and tutoring.',
  pay: 'Billing and subscriptions.',
  contacts: 'Customers, members and leads.',
  forms: 'Build forms and collect responses.',
  track: 'Time tracking for focused work.',
  colab: 'Team workshops and multiplayer learning.',
  lettin: 'Worldbuilding wikis, characters and stories.',
  parley: 'Scenario training and roleplay.',
  roadmap: 'What is shipping next across Tuturuuu.',
};

export function isInteractiveSlug(slug: string): slug is InteractiveSlug {
  return (INTERACTIVE_SLUGS as readonly string[]).includes(slug);
}

/**
 * Every launchable app plus Roadmap, with production destinations taken from
 * the shared registry. Only INTERACTIVE_SLUGS are marked interactive.
 */
export function getShowcaseCatalog(): ShowcaseProduct[] {
  const apps: ShowcaseProduct[] = LAUNCHABLE_APPS.map((app) => ({
    slug: app.slug,
    title: app.title,
    category: app.category,
    summary: SUMMARIES[app.slug],
    href: resolveLaunchableAppUrl({ app, environment: 'production' }),
    interactive: isInteractiveSlug(app.slug),
  }));

  return [
    ...apps,
    {
      slug: 'roadmap',
      title: 'Roadmap',
      category: 'miscellaneous',
      summary: SUMMARIES.roadmap,
      href: ROADMAP_URL,
      interactive: false,
    },
  ];
}

export function getShowcaseProduct(slug: string): ShowcaseProduct | null {
  return getShowcaseCatalog().find((product) => product.slug === slug) ?? null;
}

/** Interactive products in INTERACTIVE_SLUGS order. */
export function getInteractiveProducts(): ShowcaseProduct[] {
  const catalog = getShowcaseCatalog();
  return INTERACTIVE_SLUGS.flatMap((slug) => {
    const product = catalog.find((item) => item.slug === slug);
    return product ? [product] : [];
  });
}
