import { cn } from '@tuturuuu/utils/format';
import type { InteractiveSlug, ShowcaseProduct } from '@/lib/showcase/catalog';
import { DEMO_STEPS } from '@/lib/showcase/demos';
import { AppLink } from './app-link';
import { ArrowRightIcon } from './icons';
import { focusRing } from './styles';

/** Whole-card link to one working demo. */
export function DemoCard({ product }: { product: ShowcaseProduct }) {
  const steps = DEMO_STEPS[product.slug as InteractiveSlug] ?? [];
  return (
    <AppLink
      className={cn(
        'group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground transition-colors hover:border-foreground/30 hover:bg-accent/40',
        focusRing
      )}
      href={`/demo/${product.slug}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-semibold text-lg tracking-tight">
          {product.title}
        </span>
        <ArrowRightIcon className="text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
      <span className="text-muted-foreground text-sm">{product.summary}</span>
      <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {steps.map((step) => (
          <span
            key={step}
            className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground text-xs"
          >
            {step}
          </span>
        ))}
      </span>
    </AppLink>
  );
}
