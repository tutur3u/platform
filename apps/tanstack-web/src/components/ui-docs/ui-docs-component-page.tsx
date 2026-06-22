import { componentDocs, getComponentDoc } from './component-docs';
import { ComponentDetail } from './components/[componentId]/component-detail';
import { DocsPageHeader, LinkGrid, LinkPanel } from './docs-primitives';
import { useUiDocsTranslator } from './ui-docs-i18n';

export function UiDocsComponentPage({
  componentId,
  locale,
}: {
  componentId: string;
  locale: string;
}) {
  const t = useUiDocsTranslator('docs');
  const tCategories = useUiDocsTranslator('categories');
  const tCustomizations = useUiDocsTranslator('customizations');
  const doc = getComponentDoc(componentId);

  if (!doc) {
    return (
      <div className="grid gap-8">
        <DocsPageHeader
          accent="feedback"
          badge={t('components.badge')}
          description={t('components.description', {
            count: componentDocs.length,
          })}
          title={t('components.title')}
        />
        <LinkGrid className="lg:grid-cols-3">
          {componentDocs.slice(0, 6).map((candidate) => (
            <LinkPanel
              accent={candidate.category}
              description={t('components.itemDescription', {
                category: tCategories(candidate.category),
                importPath: candidate.importPath,
              })}
              href={`/${locale}/ui/components/${candidate.slug}`}
              key={candidate.id}
              meta={candidate.importPath}
              title={candidate.name}
            />
          ))}
        </LinkGrid>
      </div>
    );
  }

  return (
    <ComponentDetail
      doc={doc}
      locale={locale}
      t={t}
      tCategories={tCategories}
      tCustomizations={tCustomizations}
    />
  );
}
