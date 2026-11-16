import { cn } from '@tuturuuu/utils/format';
import { notFound } from 'next/navigation';
import { AppLink } from '@/components/showcase/app-link';
import { DemoNav } from '@/components/showcase/demo-nav';
import { DemoRenderer } from '@/components/showcase/demo-renderer';
import { ArrowLeftIcon, ExternalIcon } from '@/components/showcase/icons';
import { StatusBadge } from '@/components/showcase/product-card';
import { ShowcaseFrame } from '@/components/showcase/showcase-frame';
import { focusRing } from '@/components/showcase/styles';
import {
  getInteractiveProducts,
  getShowcaseProduct,
  isInteractiveSlug,
  type ShowcaseProduct,
  SIGN_IN_URL,
} from '@/lib/showcase/catalog';
import { DEMO_STEPS } from '@/lib/showcase/demos';

type DemoPageProps = { params: Promise<{ product: string }> };

export async function generateMetadata({ params }: DemoPageProps) {
  const { product: slug } = await params;
  const product = getShowcaseProduct(slug);
  if (!product) return { title: 'Demo not found · Tuturuuu Playground' };
  return {
    title: `${product.title} demo · Tuturuuu Playground`,
    description: product.summary,
  };
}

const backLink = cn(
  'inline-flex items-center gap-1.5 rounded-md text-muted-foreground text-sm hover:text-foreground',
  focusRing
);

const outlineAction = cn(
  'inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-4 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
  focusRing
);

const primaryAction = cn(
  'inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90',
  focusRing
);

export default async function DemoPage({ params }: DemoPageProps) {
  const { product: slug } = await params;
  const product = getShowcaseProduct(slug);
  if (!product) notFound();

  const demos = getInteractiveProducts();

  return (
    <ShowcaseFrame>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 md:py-10">
        <AppLink className={backLink} href="/#products">
          <ArrowLeftIcon />
          All products
        </AppLink>

        {isInteractiveSlug(product.slug) ? (
          <>
            <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <h1 className="font-semibold text-3xl tracking-tight">
                  {product.title} demo
                </h1>
                <p className="text-muted-foreground">
                  {DEMO_STEPS[product.slug].join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className={outlineAction} href={product.href}>
                  Open {product.title}
                  <ExternalIcon />
                </a>
                <a className={primaryAction} href={SIGN_IN_URL}>
                  Sign in
                </a>
              </div>
            </header>
            <DemoNav currentSlug={product.slug} products={demos} />
            <DemoRenderer slug={product.slug} />
          </>
        ) : (
          <PendingTour demos={demos} product={product} />
        )}
      </div>
    </ShowcaseFrame>
  );
}

function PendingTour({
  product,
  demos,
}: {
  product: ShowcaseProduct;
  demos: readonly ShowcaseProduct[];
}) {
  return (
    <div className="space-y-8">
      <header className="max-w-2xl space-y-3">
        <StatusBadge interactive={false} />
        <h1 className="font-semibold text-3xl tracking-tight">
          {product.title}
        </h1>
        <p className="text-muted-foreground">{product.summary}</p>
        <p>The interactive tour for {product.title} is not ready yet.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <a className={primaryAction} href={product.href}>
            Open {product.title}
            <ExternalIcon />
          </a>
          <a className={outlineAction} href={SIGN_IN_URL}>
            Sign in
          </a>
        </div>
      </header>
      <section aria-labelledby="working-demos" className="space-y-3">
        <h2 className="font-semibold text-lg tracking-tight" id="working-demos">
          Try a working demo
        </h2>
        <DemoNav products={demos} />
      </section>
    </div>
  );
}
