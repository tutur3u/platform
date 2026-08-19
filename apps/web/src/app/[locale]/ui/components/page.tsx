import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { siteConfig } from '@/constants/configs';
import { componentDocs, componentDocsByCategory } from '../component-docs';
import { getComponentById } from '../component-docs-core';
import { ComponentIndexCard } from '../component-index-card';
import { OnThisPage } from '../docs-navigation';
import { DocsPageHeader, DocsSection, LinkGrid } from '../docs-primitives';
import { UiDocsCommandTrigger } from '../ui-docs-command-trigger';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';
  const t = await getTranslations('ui-showcase.docs.metadata');

  return {
    title: t('componentsTitle'),
    description: t('componentsDescription'),
    alternates: {
      canonical: `${siteConfig.url}/${normalizedLocale}/ui/components`,
    },
  };
}

export async function UiComponentsRuntime({ params }: Props) {
  const { locale } = await params;
  const normalizedLocale = locale === 'vi' ? 'vi' : 'en';

  const t = await getTranslations('ui-showcase.docs');
  const tCategories = await getTranslations('ui-showcase.categories');
  const baseHref = `/${normalizedLocale}/ui/components`;
  const tocItems = componentDocsByCategory.map((group) => ({
    id: group.category,
    label: tCategories(group.category),
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_12rem] xl:gap-10">
      <div className="min-w-0">
        <DocsPageHeader
          accent="navigation"
          badge={t('components.badge')}
          description={t('components.description', {
            count: componentDocs.length,
          })}
          pattern
          title={t('components.title')}
        >
          <UiDocsCommandTrigger label={t('command.trigger')} />
        </DocsPageHeader>

        {componentDocsByCategory.map((group) => (
          <DocsSection
            accent={group.category}
            description={t('components.categoryDescription', {
              count: group.docs.length,
            })}
            id={group.category}
            key={group.category}
            title={tCategories(group.category)}
          >
            <LinkGrid className="lg:grid-cols-3">
              {group.docs.map((doc) => {
                const entry = getComponentById(doc.id);
                return (
                  <div id={`component-${doc.id}`} key={doc.id}>
                    <ComponentIndexCard
                      category={doc.category}
                      description={t('components.itemDescription', {
                        category: tCategories(doc.category),
                        importPath: doc.importPath,
                      })}
                      entry={
                        entry
                          ? {
                              id: entry.id,
                              name: entry.name,
                              importPath: entry.importPath,
                            }
                          : undefined
                      }
                      href={`${baseHref}/${doc.slug}`}
                      importPath={doc.importPath}
                      name={doc.name}
                    />
                  </div>
                );
              })}
            </LinkGrid>
          </DocsSection>
        ))}
      </div>
      <OnThisPage items={tocItems} title={t('onThisPage')} />
    </div>
  );
}

export default function UiComponentsPage(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-96" />}>
      <UiComponentsRuntime {...props} />
    </Suspense>
  );
}
