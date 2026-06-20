import { ArrowRight, ExternalLink, Sparkles } from '@tuturuuu/icons/lucide';
import { partnerGridColorClasses } from './partners-color-classes';
import type { Partner } from './partners-data';
import { partners } from './partners-data';
import { joinClassNames, PartnersCard } from './partners-primitives';

function PartnerGridCard({
  index,
  partner,
}: {
  index: number;
  partner: Partner;
}) {
  const colors = partnerGridColorClasses[partner.color];

  return (
    <div>
      <div className="relative h-full">
        <div
          className={joinClassNames(
            'pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100',
            colors.ringGlow
          )}
          style={{
            animation: 'partners-ring 1.5s ease-in-out infinite',
            boxShadow: '0 0 15px 1px currentColor',
          }}
        />

        <PartnersCard
          className={joinClassNames(
            'group relative h-full overflow-hidden bg-linear-to-br to-background backdrop-blur-sm transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl',
            colors.border,
            colors.glow
          )}
        >
          <a
            className="block h-full"
            href={partner.website}
            rel="noopener noreferrer"
            target="_blank"
          >
            <div className="relative overflow-hidden">
              <div
                className={joinClassNames(
                  'absolute inset-0 bg-linear-to-br to-background opacity-30 transition-opacity duration-500 group-hover:opacity-50',
                  colors.gradient
                )}
              />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-background via-background/50 to-transparent opacity-70" />
              <div
                className="absolute top-3 left-3 z-10"
                style={{
                  animation: `partners-pulse-dot 2.5s ease-in-out ${
                    index * 0.2
                  }s infinite`,
                }}
              >
                <Sparkles className="h-4 w-4 text-foreground/50" />
              </div>
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-linear-to-br from-muted/20 to-background">
                <img
                  alt={partner.name}
                  className="h-full w-full object-cover object-center transition-all duration-700 group-hover:scale-110 group-hover:brightness-105"
                  src={partner.logo}
                />
              </div>
            </div>

            <div className="relative p-5">
              <div className="mb-3 inline-block">
                <div
                  className={joinClassNames(
                    'rounded-lg border-2 px-2 py-1 font-semibold text-xs tracking-wide shadow-lg backdrop-blur-lg transition-all duration-300 hover:-translate-y-0.5 hover:scale-105',
                    colors.badge
                  )}
                >
                  {partner.category}
                </div>
              </div>

              <h3 className="mb-2 line-clamp-2 font-bold text-foreground text-lg transition-colors duration-300 group-hover:text-dynamic-purple">
                {partner.name}
              </h3>

              <p className="mb-4 line-clamp-2 text-muted-foreground text-sm leading-relaxed">
                {partner.description}
              </p>

              <div className="space-y-1.5">
                {partner.highlights.slice(0, 2).map((highlight) => (
                  <div
                    key={highlight}
                    className="flex items-start gap-1.5 text-xs"
                  >
                    <ArrowRight
                      className={joinClassNames(
                        'mt-0.5 h-3 w-3 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5',
                        colors.icon
                      )}
                    />
                    <span className="line-clamp-1 text-muted-foreground">
                      {highlight}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2 font-medium text-dynamic-purple text-sm opacity-0 transition-all duration-300 group-hover:opacity-100">
                <span>Explore</span>
                <ExternalLink className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
              </div>
            </div>
          </a>
        </PartnersCard>
      </div>
    </div>
  );
}

export function PartnersGridSection() {
  return (
    <section className="container mx-auto px-6 pb-32 sm:px-8 lg:px-12">
      <div className="mb-16 text-center">
        <h2 className="mb-4 font-bold text-3xl text-foreground sm:text-4xl lg:text-5xl xl:text-6xl">
          Our{' '}
          <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
            Ecosystem
          </span>
        </h2>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
          A diverse ecosystem of organizations working together to create impact
          across multiple domains.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {partners.map((partner, index) => (
          <PartnerGridCard index={index} key={partner.name} partner={partner} />
        ))}
      </div>
    </section>
  );
}
