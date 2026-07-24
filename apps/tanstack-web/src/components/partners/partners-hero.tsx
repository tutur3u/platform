import { Globe, Handshake, Users } from '@tuturuuu/icons/lucide';
import { PartnersBadge } from './partners-primitives';

export function PartnersHero() {
  return (
    <section className="container mx-auto px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
      <div className="mx-auto max-w-5xl text-center">
        <div>
          <PartnersBadge className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20 hover:shadow-dynamic-purple/20 hover:shadow-lg">
            <Handshake className="h-4 w-4" />
            Building Together
          </PartnersBadge>
        </div>

        <h1 className="mb-6 text-balance font-bold text-4xl text-foreground tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
          Better{' '}
          <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
            together
          </span>
        </h1>

        <p className="mx-auto mb-12 max-w-3xl text-balance text-base text-muted-foreground leading-relaxed sm:text-lg md:text-xl lg:text-2xl">
          Collaborating with innovative organizations and communities to create
          meaningful impact and drive technological advancement together.
        </p>

        <div className="flex flex-col flex-wrap items-center justify-center gap-4 text-muted-foreground text-sm sm:flex-row sm:gap-6">
          <div className="flex items-center gap-2 transition-colors hover:text-foreground">
            <Handshake className="h-4 w-4 text-dynamic-green" />8 Active
            Partnerships
          </div>
          <div className="flex items-center gap-2 transition-colors hover:text-foreground">
            <Users className="h-4 w-4 text-dynamic-blue" />
            10K+ Community Members
          </div>
          <div className="flex items-center gap-2 transition-colors hover:text-foreground">
            <Globe className="h-4 w-4 text-dynamic-purple" />
            25+ Shared Initiatives
          </div>
        </div>
      </div>
    </section>
  );
}
