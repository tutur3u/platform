import { cn } from '@tuturuuu/utils/format';
import type { ShowcaseProduct } from '@/lib/showcase/catalog';
import { AppLink } from './app-link';
import { focusRing } from './styles';

/** Switches between the working demos; scrolls sideways on narrow screens. */
export function DemoNav({
  products,
  currentSlug,
}: {
  products: readonly ShowcaseProduct[];
  currentSlug?: string;
}) {
  return (
    <nav
      aria-label="Demos"
      className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
    >
      <ul className="flex w-max gap-1 rounded-full border border-border bg-muted/50 p-1">
        {products.map((product) => {
          const current = product.slug === currentSlug;
          return (
            <li key={product.slug}>
              <AppLink
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 items-center rounded-full px-3.5 font-medium text-sm transition-colors',
                  current
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                  focusRing
                )}
                href={`/demo/${product.slug}`}
              >
                {product.title}
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
