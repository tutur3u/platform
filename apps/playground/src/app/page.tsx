import { cn } from '@tuturuuu/utils/format';
import { AppLink } from '@/components/showcase/app-link';
import { DemoCard } from '@/components/showcase/demo-card';
import { ArrowRightIcon } from '@/components/showcase/icons';
import { ProductExplorer } from '@/components/showcase/product-explorer';
import { ShowcaseFrame } from '@/components/showcase/showcase-frame';
import { focusRing } from '@/components/showcase/styles';
import {
  getInteractiveProducts,
  getShowcaseCatalog,
  SIGN_IN_URL,
} from '@/lib/showcase/catalog';

export const metadata = {
  title: 'Tuturuuu Playground',
  description:
    'Try Tuturuuu Tasks, Calendar, Track, Finance, Mail and Mind in your browser with sample data. No account needed.',
};

const primaryCta = cn(
  'inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90',
  focusRing
);

const secondaryCta = cn(
  'inline-flex h-10 items-center rounded-md border border-input bg-background px-5 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
  focusRing
);

export default function PlaygroundHome() {
  const catalog = getShowcaseCatalog();
  const demos = getInteractiveProducts();

  return (
    <ShowcaseFrame>
      <section className="border-border border-b">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <p className="font-medium text-muted-foreground text-sm">
            {catalog.length} products · {demos.length} interactive
          </p>
          <h1 className="mt-3 max-w-2xl text-balance font-semibold text-4xl tracking-tight md:text-5xl">
            Try Tuturuuu in your browser
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            Working demos with sample data. No account, nothing saved.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <AppLink className={primaryCta} href="/demo/tasks">
              Start with Tasks
              <ArrowRightIcon />
            </AppLink>
            <AppLink className={secondaryCta} href="/#products">
              Browse all products
            </AppLink>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="demos-heading"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 md:px-6 md:py-16"
        id="demos"
      >
        <h2
          className="font-semibold text-2xl tracking-tight"
          id="demos-heading"
        >
          Interactive demos
        </h2>
        <p className="mt-2 text-muted-foreground">
          Each one resets with a click.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {demos.map((product) => (
            <li key={product.slug}>
              <DemoCard product={product} />
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="products-heading"
        className="border-border border-t bg-muted/30"
      >
        <div
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 md:px-6 md:py-16"
          id="products"
        >
          <h2
            className="font-semibold text-2xl tracking-tight"
            id="products-heading"
          >
            All products
          </h2>
          <p className="mt-2 mb-6 max-w-2xl text-muted-foreground">
            Products without a demo open the real app. Their tours are on the
            way.
          </p>
          <ProductExplorer products={catalog} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-xl tracking-tight">
            Ready for your own workspace?
          </h2>
          <a className={primaryCta} href={SIGN_IN_URL}>
            Sign in
          </a>
        </div>
      </section>
    </ShowcaseFrame>
  );
}
