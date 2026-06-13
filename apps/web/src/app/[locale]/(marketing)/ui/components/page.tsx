import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { componentDocs, componentDocsByCategory } from '../component-docs';
import { OnThisPage } from '../docs-navigation';
import {
  DocsPageHeader,
  DocsSection,
  LinkGrid,
  LinkPanel,
} from '../docs-primitives';

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

  return {
    title: t('componentsTitle'),
    description: t('componentsDescription'),
    alternates: {
      canonical: `${siteConfig.url}/${normalizedLocale}/ui/components`,
    },
  };
}

export default async function UiComponentsPage({ params }: Props) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.docs',
  });
  const tCategories = await getTranslations({
    locale: normalizedLocale,
    namespace: 'ui-showcase.categories',
  });
  const baseHref = `/${normalizedLocale}/ui/components`;
  const tocItems = componentDocsByCategory.map((group) => ({
    id: group.category,
    label: tCategories(group.category),
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_12rem] xl:gap-10">
      <div className="min-w-0">
        <DocsPageHeader
          badge={t('components.badge')}
          description={t('components.description', {
            count: componentDocs.length,
          })}
          title={t('components.title')}
        />

        {componentDocsByCategory.map((group) => (
          <DocsSection
            description={t('components.categoryDescription', {
              count: group.docs.length,
            })}
            id={group.category}
            key={group.category}
            title={tCategories(group.category)}
          >
            <LinkGrid>
              {group.docs.map((doc) => (
                <div id={`component-${doc.id}`} key={doc.id}>
                  <LinkPanel
                    description={t('components.itemDescription', {
                      category: tCategories(doc.category),
                      importPath: doc.importPath,
                    })}
                    href={`${baseHref}/${doc.slug}`}
                    meta={doc.importPath}
                    title={doc.name}
                  />
                </div>
              ))}
            </LinkGrid>
          </DocsSection>
        ))}
      </div>
      <OnThisPage items={tocItems} title={t('onThisPage')} />
    </div>
  );
}
