import { cn } from '@tuturuuu/utils/format';
import {
  SHOWCASE_CATEGORY_LABELS,
  type ShowcaseProduct,
} from '@/lib/showcase/catalog';
import { ArrowRightIcon, ExternalIcon } from './icons';
import { AppLink } from './app-link';
import { focusRing } from './styles';

const primaryAction = cn(
  'inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90',
  focusRing
);

const secondaryAction = cn(
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
  focusRing
);

export function StatusBadge({ interactive }: { interactive: boolean }) {
  return interactive ? (
    <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground text-xs">
      Interactive
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-border border-dashed px-2 py-0.5 font-medium text-muted-foreground text-xs">
      Tour pending
    </span>
  );
}

export function ProductCard({
  product,
  headingLevel = 'h3',
}: {
  product: ShowcaseProduct;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className="truncate font-semibold tracking-tight">
            {product.title}
          </Heading>
          <p className="text-muted-foreground text-xs">
            {SHOWCASE_CATEGORY_LABELS[product.category]}
          </p>
        </div>
        <StatusBadge interactive={product.interactive} />
      </div>
      <p className="flex-1 text-muted-foreground text-sm">{product.summary}</p>
      <div className="flex flex-wrap gap-2">
        {product.interactive ? (
          <AppLink className={primaryAction} href={`/demo/${product.slug}`}>
            Try demo<span className="sr-only">: {product.title}</span>
            <ArrowRightIcon />
          </AppLink>
        ) : null}
        <a className={secondaryAction} href={product.href}>
          Open {product.title}
          <ExternalIcon />
        </a>
      </div>
    </article>
  );
}
