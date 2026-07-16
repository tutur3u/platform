import {
  ArrowUpRight,
  BookOpenCheck,
  BookText,
  BrainCircuit,
  CalendarDays,
  Command,
  CreditCard,
  FilePenLine,
  GraduationCap,
  HardDrive,
  Hexagon,
  LayoutGrid,
  Link2,
  ListChecks,
  type LucideIcon,
  Mail,
  MessageSquare,
  Package,
  Presentation,
  QrCodeIcon,
  Sparkles,
  Store,
  Timer,
  Users,
  Video,
  Wallet,
} from '@tuturuuu/icons';
import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BASE_URL } from '@/constants/common';
import {
  APP_CATEGORIES,
  type AppCategory,
  GATEWAY_APPS,
  type GatewayAppSlug,
} from '@/lib/apps-registry';

const APP_ICONS: Record<GatewayAppSlug, LucideIcon> = {
  apps: LayoutGrid,
  calendar: CalendarDays,
  chat: MessageSquare,
  cms: FilePenLine,
  contacts: Users,
  docs: BookText,
  drive: HardDrive,
  finance: Wallet,
  hive: Hexagon,
  inventory: Package,
  learn: GraduationCap,
  mail: Mail,
  meet: Video,
  mind: BrainCircuit,
  nova: Sparkles,
  pay: CreditCard,
  platform: Command,
  tools: QrCodeIcon,
  rewise: BookOpenCheck,
  shortener: Link2,
  storefront: Store,
  tasks: ListChecks,
  teach: Presentation,
  track: Timer,
};

const CATEGORY_TONES: Record<AppCategory, string> = {
  ai: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan',
  learning: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  miscellaneous: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  operations: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  productivity: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
};

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'appsGateway.metadata',
  });

  return createPageMetadata({
    baseUrl: BASE_URL,
    description: t('description'),
    indexable: true,
    locale,
    pathname: '/',
    siteName: 'Tuturuuu Apps',
    title: t('title'),
  });
}

export default async function AppsGatewayPage() {
  const t = await getTranslations('appsGateway');

  return (
    <main className="min-h-screen">
      <section className="border-border/70 border-b">
        <div className="mx-auto grid min-h-[36rem] w-full max-w-7xl content-end gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(20rem,0.55fr)] lg:px-8 lg:py-14">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-md border border-dynamic-blue/25 bg-dynamic-blue/10 px-3 py-1 text-dynamic-blue text-sm">
              <LayoutGrid className="size-4" />
              <span>{t('eyebrow')}</span>
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-balance font-semibold text-5xl leading-tight sm:text-6xl lg:text-7xl">
                {t('title')}
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground leading-8">
                {t('subtitle')}
              </p>
            </div>
          </div>
          <div className="grid content-end gap-3 text-sm">
            {APP_CATEGORIES.map((category) => (
              <a
                className={cn(
                  'group flex items-center justify-between rounded-lg border px-4 py-3 transition hover:bg-background',
                  CATEGORY_TONES[category]
                )}
                href={`#${category}`}
                key={category}
              >
                <span>{t(`categories.${category}`)}</span>
                <span>
                  {t('categoryCount', { count: countApps(category) })}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6">
          {APP_CATEGORIES.map((category) => {
            const apps = GATEWAY_APPS.filter(
              (app) => app.category === category
            );

            if (apps.length === 0) {
              return null;
            }

            return (
              <section
                aria-labelledby={`${category}-heading`}
                className="scroll-mt-8"
                id={category}
                key={category}
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <h2
                      className="font-semibold text-2xl"
                      id={`${category}-heading`}
                    >
                      {t(`categories.${category}`)}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {t(`categoryDescriptions.${category}`)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {apps.map((app) => {
                    const Icon = APP_ICONS[app.slug];

                    return (
                      <Link
                        className="group grid min-h-40 rounded-lg border border-border/80 bg-background p-4 transition hover:border-dynamic-blue/40 hover:bg-dynamic-blue/5"
                        href={`/${app.slug}`}
                        key={app.slug}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span
                            className={cn(
                              'flex size-10 items-center justify-center rounded-md border',
                              CATEGORY_TONES[app.category]
                            )}
                          >
                            <Icon className="size-5" />
                          </span>
                          <ArrowUpRight className="size-5 text-muted-foreground transition group-hover:text-dynamic-blue" />
                        </span>
                        <span className="mt-6 grid gap-2">
                          <span className="font-semibold text-xl">
                            {app.title}
                          </span>
                          <span className="text-muted-foreground text-sm leading-6">
                            {t(`apps.${app.slug}.description`)}
                          </span>
                        </span>
                        <span className="mt-5 text-muted-foreground text-xs">
                          {app.appRoot}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function countApps(category: AppCategory) {
  return GATEWAY_APPS.filter((app) => app.category === category).length;
}
