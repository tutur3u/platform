import { ArrowRight, ExternalLink, Sparkles } from '@tuturuuu/icons/lucide';
import {
  type FeaturedPartnerColorClasses,
  featuredPartnerColorClasses,
} from './partners-color-classes';
import type { Partner, PartnerColor } from './partners-data';
import { partners } from './partners-data';
import {
  joinClassNames,
  PartnersBadge,
  PartnersCard,
} from './partners-primitives';

type FeaturedPartnerColor = keyof typeof featuredPartnerColorClasses;
type FeaturedPartner = Partner & {
  color: FeaturedPartnerColor;
  featured: true;
};

function isFeaturedPartnerColor(
  color: PartnerColor
): color is FeaturedPartnerColor {
  return color === 'purple' || color === 'orange' || color === 'red';
}

function isFeaturedPartner(partner: Partner): partner is FeaturedPartner {
  return partner.featured === true && isFeaturedPartnerColor(partner.color);
}

const featuredPartners = partners.filter(isFeaturedPartner);

function FeaturedPartnerCard({
  colors,
  gridClass,
  index,
  partner,
}: {
  colors: FeaturedPartnerColorClasses;
  gridClass: string;
  index: number;
  partner: FeaturedPartner;
}) {
  return (
    <div className={gridClass}>
      <div className="relative h-full">
        <div
          className={joinClassNames(
            'pointer-events-none absolute -inset-1 rounded-2xl opacity-0 transition-opacity duration-700 group-hover:opacity-100',
            colors.ringGlow
          )}
          style={{
            animation: 'partners-ring 2s ease-in-out infinite',
            boxShadow: '0 0 20px 2px currentColor',
          }}
        />

        <PartnersCard
          className={joinClassNames(
            'group relative h-full overflow-hidden bg-linear-to-br to-background backdrop-blur-sm transition-all duration-700 hover:scale-[1.02] hover:shadow-2xl',
            colors.border,
            colors.glow
          )}
        >
          <a
            className="block"
            href={partner.website}
            rel="noopener noreferrer"
            target="_blank"
          >
            <div className="relative overflow-hidden">
              <div
                className={joinClassNames(
                  'absolute inset-0 bg-linear-to-br to-background opacity-40 transition-opacity duration-700 group-hover:opacity-60',
                  colors.gradient
                )}
              />
              <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent opacity-60" />
              <div
                className="absolute top-4 right-4 z-10"
                style={{
                  animation: `partners-pulse-dot 2s ease-in-out ${
                    index * 0.3
                  }s infinite`,
                }}
              >
                <Sparkles className="h-5 w-5 text-foreground/60" />
              </div>
              <div className="relative aspect-[21/9] w-full overflow-hidden bg-linear-to-br from-muted/30 to-background">
                <img
                  alt={partner.name}
                  className="h-full w-full object-cover object-center transition-all duration-700 group-hover:scale-105 group-hover:brightness-110"
                  src={partner.logo}
                />
              </div>
            </div>

            <div className="relative p-6 md:p-8">
              <div className="mb-3 inline-block">
                <div
                  className={joinClassNames(
                    'mb-4 rounded-full border-2 px-4 py-2 font-bold text-xs uppercase tracking-wide shadow-lg backdrop-blur-lg transition-all duration-300 hover:scale-105',
                    colors.badge
                  )}
                >
                  {partner.category}
                </div>
              </div>

              <h3 className="mb-2 font-bold text-2xl text-foreground transition-colors duration-300 group-hover:text-dynamic-purple lg:text-3xl">
                {partner.name}
              </h3>

              <p className="mb-4 line-clamp-2 text-muted-foreground leading-relaxed">
                {partner.description}
              </p>

              <div className="space-y-2">
                {partner.highlights.slice(0, 3).map((highlight) => (
                  <div
                    key={highlight}
                    className="flex items-start gap-2 text-sm"
                  >
                    <ArrowRight
                      className={joinClassNames(
                        'mt-0.5 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1',
                        colors.arrow
                      )}
                    />
                    <span className="text-muted-foreground">{highlight}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-2 font-medium text-dynamic-purple text-sm opacity-0 transition-all duration-300 group-hover:opacity-100">
                <span>Visit Website</span>
                <ExternalLink className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
              </div>
            </div>
          </a>
        </PartnersCard>
      </div>
    </div>
  );
}

export function FeaturedPartnersSection() {
  return (
    <section className="container mx-auto px-6 pb-24 sm:px-8 lg:px-12">
      <div className="mb-16 text-center">
        <PartnersBadge className="mb-6 border-2 border-dynamic-purple/40 bg-dynamic-purple/20 font-semibold text-dynamic-purple shadow-dynamic-purple/30 shadow-lg hover:border-dynamic-purple/60 hover:bg-dynamic-purple/30 hover:shadow-dynamic-purple/40 hover:shadow-xl">
          <Sparkles className="h-4 w-4" />
          Featured Partners
        </PartnersBadge>
        <h2 className="mb-4 font-bold text-3xl text-foreground sm:text-4xl lg:text-5xl xl:text-6xl">
          Leading{' '}
          <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
            Partnerships
          </span>
        </h2>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Working with industry leaders and innovative organizations to drive
          growth and impact.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-6 lg:gap-8">
        {featuredPartners.map((partner, index) => (
          <FeaturedPartnerCard
            colors={featuredPartnerColorClasses[partner.color]}
            gridClass={index === 2 ? 'md:col-span-6' : 'md:col-span-3'}
            index={index}
            key={partner.name}
            partner={partner}
          />
        ))}
      </div>
    </section>
  );
}
