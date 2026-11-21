import {
  Calendar,
  HardDrive,
  ListTodo,
  type LucideIcon,
  Mail,
  MessagesSquare,
  Video,
  Wallet,
} from '@tuturuuu/icons/lucide-static';
import {
  getLaunchableApp,
  getLaunchableAppOrigin,
} from '@tuturuuu/utils/launchable-apps';
import { getTranslations } from 'next-intl/server';

// Apps that ship inside the Tuturuuu phone and desktop builds and also run on
// their own on the web. Names and URLs come from the launchable app registry.
export const DOWNLOAD_APP_FAMILIES = [
  ['meet', Video],
  ['mail', Mail],
  ['calendar', Calendar],
  ['tasks', ListTodo],
  ['chat', MessagesSquare],
  ['drive', HardDrive],
  ['finance', Wallet],
] as const satisfies readonly (readonly [string, LucideIcon])[];

export function resolveAppFamilies() {
  return DOWNLOAD_APP_FAMILIES.flatMap(([slug, icon]) => {
    const app = getLaunchableApp(slug);
    if (!app) return [];
    return [
      {
        slug,
        icon,
        title: app.title,
        href: getLaunchableAppOrigin(app, { environment: 'production' }),
      },
    ];
  });
}

export async function AppFamilies() {
  const t = await getTranslations('desktop_download');
  const apps = resolveAppFamilies();

  return (
    <section aria-labelledby="app-families-title" className="mt-16">
      <h2
        id="app-families-title"
        className="font-semibold text-base tracking-tight"
      >
        {t('apps.title')}
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        {t('apps.description')}
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {apps.map(({ slug, icon: Icon, title, href }) => (
          <li key={slug}>
            <a
              href={href}
              className="flex h-full flex-col items-center gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-4 text-center transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="font-medium text-sm">{title}</span>
              <span className="text-muted-foreground text-xs">
                {t('apps.open_web')}
                <span className="sr-only"> {title}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
