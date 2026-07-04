import type { InventoryStorefrontSection } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { StorefrontImagePanel } from './image-panel';
import { getSafeStorefrontHttpUrl } from './utils';

export function StorefrontMerchSections({
  radius,
  sections,
}: {
  radius: string;
  sections: InventoryStorefrontSection[];
}) {
  const visibleSections = sections
    .filter((section) => section.status === 'published')
    .filter((section) => section.sectionType !== 'cover')
    .filter((section) => {
      const sectionHref = getSafeStorefrontHttpUrl(section.href);
      return Boolean(
        section.title?.trim() ||
          section.description?.trim() ||
          section.imageUrl?.trim() ||
          sectionHref
      );
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (visibleSections.length === 0) return null;

  return (
    <div className="mt-4 grid gap-3">
      {visibleSections.map((section) => {
        const sectionHref = getSafeStorefrontHttpUrl(section.href);

        return (
          <section
            className={cn(
              'grid overflow-hidden border border-border bg-card md:grid-cols-[minmax(0,1fr)_280px]',
              radius
            )}
            key={section.id}
          >
            <div className="flex min-w-0 flex-col justify-center gap-2 p-4">
              {section.title ? (
                <h2 className="font-semibold text-lg">{section.title}</h2>
              ) : null}
              {section.description ? (
                <p className="text-muted-foreground text-sm leading-6">
                  {section.description}
                </p>
              ) : null}
              {sectionHref ? (
                <a
                  className="mt-1 w-fit font-medium text-sm underline-offset-4 hover:underline"
                  href={sectionHref}
                >
                  {sectionHref.replace(/^https?:\/\//u, '')}
                </a>
              ) : null}
            </div>
            <StorefrontImagePanel
              className="min-h-36 md:min-h-full"
              imageUrl={section.imageUrl}
              label={section.title ?? 'Storefront section'}
            />
          </section>
        );
      })}
    </div>
  );
}
