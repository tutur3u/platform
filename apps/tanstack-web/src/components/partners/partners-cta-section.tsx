import {
  ArrowRight,
  Globe,
  Handshake,
  Sparkles,
  Users,
} from '@tuturuuu/icons/lucide';
import { PartnersCard, PartnersLinkButton } from './partners-primitives';

export function PartnersCtaSection() {
  return (
    <section className="container mx-auto px-6 pb-32 sm:px-8 lg:px-12">
      <PartnersCard className="relative overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12 backdrop-blur-sm md:p-16 lg:p-20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-50">
          <div
            className="absolute top-0 -left-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-purple/40 to-transparent blur-3xl"
            style={{ animation: 'partners-orb-a 8s ease-in-out infinite' }}
          />
          <div
            className="absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-pink/40 to-transparent blur-3xl"
            style={{ animation: 'partners-orb-b 10s ease-in-out 1s infinite' }}
          />
          <div
            className="absolute bottom-1/4 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-orange/30 to-transparent blur-3xl"
            style={{ animation: 'partners-orb-c 12s ease-in-out 2s infinite' }}
          />
        </div>

        <div className="relative text-center">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-purple/20 to-dynamic-pink/20 backdrop-blur-sm">
            <Handshake className="h-10 w-10 text-dynamic-purple" />
          </div>

          <h2 className="mb-6 font-bold text-3xl text-foreground sm:text-4xl lg:text-5xl xl:text-6xl">
            Interested in{' '}
            <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
              Partnering?
            </span>
          </h2>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground leading-relaxed sm:text-xl">
            We're always looking to collaborate with organizations that share
            our vision for innovation, education, and community building. Let's
            create impact together.
          </p>

          <div className="mb-8 flex flex-col flex-wrap items-center justify-center gap-4 sm:flex-row">
            <PartnersLinkButton
              className="group w-full shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:w-auto"
              href="mailto:partners@tuturuuu.com"
            >
              Get in Touch
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </PartnersLinkButton>
            <PartnersLinkButton
              className="w-full transition-all hover:scale-105 sm:w-auto"
              href="/about"
              variant="outline"
            >
              Learn More About Us
              <Sparkles className="ml-2 h-5 w-5" />
            </PartnersLinkButton>
          </div>

          <div className="flex flex-col flex-wrap items-center justify-center gap-4 text-muted-foreground text-sm sm:flex-row sm:gap-6">
            <div className="flex items-center gap-2 transition-colors hover:text-foreground">
              <Globe className="h-4 w-4 text-dynamic-green" />8 Active
              Partnerships
            </div>
            <div className="flex items-center gap-2 transition-colors hover:text-foreground">
              <Users className="h-4 w-4 text-dynamic-blue" />
              10K+ Community Members
            </div>
            <div className="flex items-center gap-2 transition-colors hover:text-foreground">
              <Sparkles className="h-4 w-4 text-dynamic-purple" />
              Growing Impact
            </div>
          </div>
        </div>
      </PartnersCard>
    </section>
  );
}
