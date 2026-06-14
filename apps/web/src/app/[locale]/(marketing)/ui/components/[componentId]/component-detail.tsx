import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentDoc } from '../../component-docs';
import { getAdjacentComponentDocs } from '../../component-docs';
import { getComponentById } from '../../component-docs-core';
import { ComponentPreview } from '../../component-preview';
import { OnThisPage, PrevNextPager, type TocItem } from '../../docs-navigation';
import { CodeBlock, DocsPageHeader, DocsSection } from '../../docs-primitives';
import { getAccent } from '../../ui-docs-theme';
import {
  ApiReferenceTable,
  CustomizationBadges,
  RelatedComponents,
} from './component-detail-sections';

type Translator = (
  key: string,
  values?: Record<string, string | number>
) => string;

const tocIds = [
  'preview',
  'installation',
  'usage',
  'examples',
  'api',
  'customization',
  'related',
] as const;

export function ComponentDetail({
  doc,
  locale,
  t,
  tCategories,
  tCustomizations,
}: {
  doc: ComponentDoc;
  locale: string;
  t: Translator;
  tCategories: Translator;
  tCustomizations: Translator;
}) {
  const entry = getComponentById(doc.id);
  const adjacent = getAdjacentComponentDocs(doc);
  const a = getAccent(doc.category);
  const tocItems: TocItem[] = tocIds.map((id) => ({
    id,
    label: t(`detail.toc.${id}`),
  }));
  const baseHref = `/${locale}/ui/components`;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_12rem] xl:gap-10">
      <article className="min-w-0">
        <DocsPageHeader
          accent={doc.category}
          badge={tCategories(doc.category)}
          description={t('detail.description', {
            importPath: doc.importPath,
            name: doc.name,
          })}
          pattern
          title={doc.name}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={doc.status === 'live' ? 'success' : 'outline'}>
              {t(`status.${doc.status}`)}
            </Badge>
            <Badge variant="secondary">{doc.importPath}</Badge>
          </div>
        </DocsPageHeader>

        <DocsSection
          accent={doc.category}
          description={t('detail.previewDescription')}
          id="preview"
          title={t('detail.previewTitle')}
        >
          <div
            className={cn(
              'relative grid min-h-72 place-items-center overflow-hidden rounded-2xl border bg-card p-6',
              a.border
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_8%,transparent)_1px,transparent_1px)] bg-[size:1.25rem_1.25rem] opacity-50" />
            <div className="relative">
              {entry ? <ComponentPreview entry={entry} /> : null}
            </div>
          </div>
        </DocsSection>

        <DocsSection
          accent={doc.category}
          description={t('detail.installationDescription')}
          id="installation"
          title={t('detail.installationTitle')}
        >
          <div className="grid gap-4">
            <CodeBlock code={doc.installation.command} label="terminal" />
            {doc.installation.manualSteps.map((step) => (
              <CodeBlock
                code={step}
                key={step}
                label={t('detail.manualStep')}
              />
            ))}
          </div>
        </DocsSection>

        <DocsSection
          accent={doc.category}
          description={t('detail.usageDescription')}
          id="usage"
          title={t('detail.usageTitle')}
        >
          <CodeBlock code={doc.usage} label="usage.tsx" />
        </DocsSection>

        <DocsSection
          accent={doc.category}
          description={t('detail.examplesDescription')}
          id="examples"
          title={t('detail.examplesTitle')}
        >
          <div className="grid gap-5">
            {doc.examples.map((example) => (
              <div className="grid gap-3" key={example.id}>
                <div>
                  <h3 className="font-semibold">
                    {t(`detail.examples.${example.titleKey}.title`)}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm leading-6">
                    {t(`detail.examples.${example.descriptionKey}.description`)}
                  </p>
                </div>
                {example.showPreview && entry ? (
                  <div className="relative grid min-h-48 place-items-center overflow-hidden rounded-xl border bg-card p-6">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_8%,transparent)_1px,transparent_1px)] bg-[size:1.25rem_1.25rem] opacity-50" />
                    <div className="relative">
                      <ComponentPreview entry={entry} />
                    </div>
                  </div>
                ) : null}
                <CodeBlock code={example.code} label={`${doc.slug}.tsx`} />
              </div>
            ))}
          </div>
        </DocsSection>

        <DocsSection
          accent={doc.category}
          description={t('detail.apiDescription')}
          id="api"
          title={t('detail.apiTitle')}
        >
          <ApiReferenceTable doc={doc} t={t} />
        </DocsSection>

        <DocsSection
          accent={doc.category}
          description={t('detail.customizationDescription')}
          id="customization"
          title={t('detail.customizationTitle')}
        >
          <CustomizationBadges doc={doc} tCustomizations={tCustomizations} />
        </DocsSection>

        <DocsSection
          accent={doc.category}
          description={t('detail.relatedDescription')}
          id="related"
          title={t('detail.relatedTitle')}
        >
          <RelatedComponents
            baseHref={baseHref}
            doc={doc}
            t={t}
            tCategories={tCategories}
          />
        </DocsSection>

        <PrevNextPager
          next={
            adjacent.next
              ? {
                  href: `${baseHref}/${adjacent.next.slug}`,
                  label: t('detail.next'),
                  title: adjacent.next.name,
                }
              : undefined
          }
          previous={
            adjacent.previous
              ? {
                  href: `${baseHref}/${adjacent.previous.slug}`,
                  label: t('detail.previous'),
                  title: adjacent.previous.name,
                }
              : undefined
          }
        />
      </article>
      <OnThisPage items={tocItems} title={t('onThisPage')} />
    </div>
  );
}
