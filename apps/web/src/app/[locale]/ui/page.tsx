import { Blocks, Layers, Sparkles } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ComponentType } from 'react';
import { siteConfig } from '@/constants/configs';
import { componentDocs, componentDocsByCategory } from './component-docs';
import {
  CodeBlock,
  DocsPageHeader,
  DocsSection,
  LinkGrid,
  LinkPanel,
} from './docs-primitives';
import { BRAND_ACCENT, getAccent } from './ui-docs-theme';

// Rendered dynamically: shiki highlighting calls `Date.now()` internally, which
// Next disallows during static prerendering (next-prerender-current-time).
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs.metadata',
  });
  const pageUrl = `${siteConfig.url}/${normalizedLocale}/ui`;

  return {
    title: t('overviewTitle'),
    description: t('overviewDescription'),
    alternates: {
      canonical: pageUrl,
      languages: {
        en: `${siteConfig.url}/en/ui`,
        vi: `${siteConfig.url}/vi/ui`,
      },
    },
    openGraph: {
      type: 'website',
      url: pageUrl,
      title: t('overviewTitle'),
      description: t('overviewDescription'),
      siteName: siteConfig.name,
      locale: normalizedLocale === 'vi' ? 'vi_VN' : 'en_US',
    },
    twitter: {
      card: 'summary',
      title: t('overviewTitle'),
      description: t('overviewDescription'),
      creator: '@tuturuuu',
    },
  };
}

export default async function UiDocsOverviewPage({ params }: Props) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  setRequestLocale(normalizedLocale);

  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs',
  });
  const baseHref = `/${normalizedLocale}/ui`;

  return (
    <div className="grid gap-4">
      <DocsPageHeader
        badge={t('overview.badge')}
        description={t('overview.description')}
        pattern
        title={t('overview.title')}
      >
        <div className="grid max-w-3xl grid-cols-3 gap-3">
          <Metric
            accent="actions"
            icon={Blocks}
            label={t('overview.metrics.components')}
            value={componentDocs.length}
          />
          <Metric
            accent="navigation"
            icon={Layers}
            label={t('overview.metrics.categories')}
            value={componentDocsByCategory.length}
          />
          <Metric
            accent="inputs"
            icon={Sparkles}
            label={t('overview.metrics.live')}
            value={componentDocs.filter((doc) => doc.status === 'live').length}
          />
        </div>
      </DocsPageHeader>

      <DocsSection
        description={t('overview.startDescription')}
        id="start"
        title={t('overview.startTitle')}
      >
        <LinkGrid>
          <LinkPanel
            description={t('overview.setupDescription')}
            href={`${baseHref}/setup`}
            meta={t('overview.publicAndInternal')}
            title={t('overview.setupTitle')}
          />
          <LinkPanel
            accent="navigation"
            description={t('overview.componentsDescription')}
            href={`${baseHref}/components`}
            meta={t('overview.componentCount', { count: componentDocs.length })}
            title={t('overview.componentsTitle')}
          />
          <LinkPanel
            accent="actions"
            description={t('overview.buttonDescription')}
            href={`${baseHref}/components/button`}
            meta="@tuturuuu/ui/button"
            title={t('overview.buttonTitle')}
          />
          <LinkPanel
            accent="advanced"
            description={t('overview.contributingDescription')}
            href={`${baseHref}/contributing`}
            meta={t('overview.internal')}
            title={t('overview.contributingTitle')}
          />
        </LinkGrid>
      </DocsSection>

      <DocsSection
        description={t('overview.quickstartDescription')}
        id="quickstart"
        title={t('overview.quickstartTitle')}
      >
        <CodeBlock
          code={`bun add @tuturuuu/ui\n\nimport '@tuturuuu/ui/globals.css';\nimport { Button } from '@tuturuuu/ui/button';\n\nexport function SaveAction() {\n  return <Button>Save changes</Button>;\n}`}
          label="app/page.tsx"
        />
      </DocsSection>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  accent?: Parameters<typeof getAccent>[0];
}) {
  const a = accent ? getAccent(accent) : BRAND_ACCENT;

  return (
    <div className="relative grid gap-2 overflow-hidden rounded-xl border bg-card p-4">
      <span
        className={cn(
          'grid size-8 place-items-center rounded-lg border',
          a.bg,
          a.text,
          a.border
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="font-semibold text-3xl tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
