import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { componentDocs, componentDocsByCategory } from './component-docs';
import {
  CodeBlock,
  DocsPageHeader,
  DocsSection,
  LinkGrid,
  LinkPanel,
} from './docs-primitives';

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
        title={t('overview.title')}
      >
        <div className="grid max-w-3xl grid-cols-3 gap-2">
          <Metric
            label={t('overview.metrics.components')}
            value={componentDocs.length}
          />
          <Metric
            label={t('overview.metrics.categories')}
            value={componentDocsByCategory.length}
          />
          <Metric
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
            description={t('overview.componentsDescription')}
            href={`${baseHref}/components`}
            meta={t('overview.componentCount', { count: componentDocs.length })}
            title={t('overview.componentsTitle')}
          />
          <LinkPanel
            description={t('overview.buttonDescription')}
            href={`${baseHref}/components/button`}
            meta="@tuturuuu/ui/button"
            title={t('overview.buttonTitle')}
          />
          <LinkPanel
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1 rounded-lg border bg-background p-3">
      <div className="font-semibold text-2xl tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
