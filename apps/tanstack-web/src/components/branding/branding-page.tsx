import {
  Check,
  Copy,
  Download,
  FileText,
  Moon,
  Palette,
  Sparkles,
  Sun,
  Type,
} from '@tuturuuu/icons/lucide';

const brandColors = [
  ['Innovation', '#4180E9'],
  ['Growth', '#4ACA3F'],
  ['Energy', '#FB7B05'],
  ['Impact', '#E94646'],
] as const;

const productAssets = [
  ['Tuturuuu', '/media/branding/tuturuuu.svg'],
  ['Mira', '/media/branding/mira.svg'],
  ['Nova', '/media/branding/nova.svg'],
  ['Tudo', '/media/branding/tudo.svg'],
  ['Rewise', '/media/branding/rewise.svg'],
  ['Gaming', '/media/branding/gaming.svg'],
] as const;

export function BrandingPage() {
  return (
    <main className="relative overflow-hidden text-pretty bg-root-background text-foreground">
      <section className="relative isolate overflow-hidden border-border border-b px-4 pt-16 pb-8 sm:px-6 lg:px-8">
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 py-12 lg:min-h-[calc(100dvh-18rem)] lg:grid-cols-[0.95fr_0.72fr] lg:py-16">
          <div className="max-w-4xl space-y-8">
            <div className="space-y-7">
              <h1 className="max-w-5xl text-pretty font-semibold text-5xl tracking-tight sm:text-7xl lg:text-[6.75rem] lg:leading-[0.88]">
                Tuturuuu Branding{' '}
                <span className="block pl-[0.02em] text-dynamic-blue">
                  and assets
                </span>
              </h1>
              <p className="max-w-2xl text-foreground/62 text-lg leading-8 sm:text-xl">
                Download Tuturuuu brand assets, product marks, colors,
                typography guidance, and usage rules for consistent brand
                applications.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="#brand-assets"
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 font-medium text-primary-foreground text-sm shadow-sm transition hover:bg-primary/90"
              >
                <Download className="mr-2 h-5 w-5" />
                Download assets
              </a>
              <a
                href="#usage"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background/40 px-8 font-medium text-sm shadow-xs transition hover:bg-muted"
              >
                <FileText className="mr-2 h-5 w-5" />
                View usage rules
              </a>
            </div>
          </div>
          <div className="rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-2xl backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-medium text-muted-foreground text-sm">
                Primary mark
              </span>
              <div className="flex gap-2">
                <span className="rounded-full bg-muted p-2">
                  <Moon className="h-4 w-4" />
                </span>
                <span className="rounded-full bg-muted p-2">
                  <Sun className="h-4 w-4" />
                </span>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-3xl bg-[#09090B] p-8">
                <img
                  src="/media/branding/brand-mark-dark.svg"
                  alt="Tuturuuu brand mark for dark backgrounds"
                  className="h-auto w-full"
                />
              </div>
              <div className="rounded-3xl border bg-white p-8">
                <img
                  src="/media/branding/brand-mark-light.svg"
                  alt="Tuturuuu brand mark for light backgrounds"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="brand-assets" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-semibold text-3xl tracking-tight sm:text-4xl">
                Product Marks
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Use these marks when referencing Tuturuuu and its product
                family.
              </p>
            </div>
            <Sparkles className="hidden h-10 w-10 text-dynamic-blue md:block" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {productAssets.map(([name, src]) => (
              <div
                key={name}
                className="rounded-2xl border border-border/70 bg-card p-6"
              >
                <div className="mb-4 flex aspect-video items-center justify-center rounded-xl bg-muted/50 p-6">
                  <img src={src} alt={`${name} logo`} className="max-h-28" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{name}</div>
                  <a
                    href={src}
                    download
                    className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    SVG
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-border/70 border-y bg-muted/20 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex items-center gap-3">
            <Palette className="h-8 w-8 text-dynamic-blue" />
            <div>
              <h2 className="font-semibold text-3xl tracking-tight">
                Brand Colors
              </h2>
              <p className="text-muted-foreground">
                Core accent colors used across Tuturuuu product experiences.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {brandColors.map(([name, color]) => (
              <div key={color} className="overflow-hidden rounded-2xl border">
                <div className="h-32" style={{ backgroundColor: color }} />
                <div className="flex items-center justify-between bg-card p-4">
                  <div>
                    <div className="font-medium">{name}</div>
                    <div className="font-mono text-muted-foreground text-sm">
                      {color}
                    </div>
                  </div>
                  <Copy className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="usage" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          {[
            {
              icon: Sparkles,
              title: 'Logo',
              description:
                'Keep clear space around every mark and preserve the original proportions.',
            },
            {
              icon: Palette,
              title: 'Color',
              description:
                'Use brand colors intentionally for accents, focus states, and product identity.',
            },
            {
              icon: Type,
              title: 'Typography',
              description:
                'Use Inter for Latin interfaces and Noto Sans where Vietnamese support is needed.',
            },
          ].map(({ description, icon: Icon, title }) => (
            <div key={title} className="rounded-2xl border bg-card p-6">
              <Icon className="mb-5 h-8 w-8 text-dynamic-blue" />
              <h3 className="mb-3 font-semibold text-xl">{title}</h3>
              <p className="text-muted-foreground">{description}</p>
              <div className="mt-5 flex items-center gap-2 text-dynamic-green text-sm">
                <Check className="h-4 w-4" />
                Approved guidance
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
