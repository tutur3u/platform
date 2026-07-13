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
    <div className="mt-6 grid gap-4">
      {visibleSections.map((section) => {
        const sectionHref = getSafeStorefrontHttpUrl(section.href);

        return (
          <section
            className={cn(
              'grid overflow-hidden border border-border bg-card md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]',
              radius
            )}
            key={section.id}
          >
            <div className="flex min-w-0 flex-col justify-center gap-3 p-6 sm:p-8">
              {section.title ? (
                <h2 className="text-balance font-semibold text-2xl tracking-tight">
                  {section.title}
                </h2>
              ) : null}
              {section.description ? (
                <p className="text-muted-foreground text-sm leading-6">
                  {section.description}
                </p>
              ) : null}
              {sectionHref ? (
                <a
                  className="mt-2 w-fit border-border border-b pb-1 font-medium text-sm transition hover:border-foreground"
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
