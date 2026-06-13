import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { CodeBlock, DocsPageHeader, DocsSection } from '../docs-primitives';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

const checklist = [
  'registry',
  'preview',
  'docs',
  'messages',
  'tests',
  'package',
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs.metadata',
  });

  return {
    title: t('contributingTitle'),
    description: t('contributingDescription'),
    alternates: {
      canonical: `${siteConfig.url}/${normalizedLocale}/ui/contributing`,
    },
  };
}

export default async function UiContributingPage({ params }: Props) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs',
  });

  return (
    <div className="grid gap-4">
      <DocsPageHeader
        badge={t('contributing.badge')}
        description={t('contributing.description')}
        title={t('contributing.title')}
      />

      <DocsSection
        description={t('contributing.workflowDescription')}
        id="workflow"
        title={t('contributing.workflowTitle')}
      >
        <div className="grid gap-3">
          {checklist.map((item) => (
            <div className="rounded-lg border bg-background p-4" key={item}>
              <h3 className="font-semibold">
                {t(`contributing.items.${item}.title`)}
              </h3>
              <p className="mt-2 text-muted-foreground text-sm leading-6">
                {t(`contributing.items.${item}.description`)}
              </p>
            </div>
          ))}
        </div>
      </DocsSection>

      <DocsSection
        description={t('contributing.validationDescription')}
        id="validation"
        title={t('contributing.validationTitle')}
      >
        <CodeBlock
          code={`bun i18n:sort\nbun --cwd apps/web test 'src/app/[locale]/(marketing)/ui/component-docs.test.ts'\nbun --cwd apps/web test 'src/app/[locale]/(marketing)/ui/ui-docs-sidebar.test.tsx'\nbun --cwd apps/web type-check`}
          label="validation"
        />
      </DocsSection>
    </div>
  );
}
