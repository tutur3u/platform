import { ArrowRight, Handshake, Mail } from '@tuturuuu/icons/lucide';
import {
  Reveal,
  RevealGroup,
  RevealItem,
} from '@/components/landing/shared/reveal';
import { Panel, SectionShell } from '@/components/landing/shared/section-shell';
import { ActionLink } from '@/components/marketing/action-link';
import { PageHero } from '@/components/marketing/page-hero';
import { StatStrip } from '@/components/marketing/stat-strip';
import { PartnerCard } from './partner-card';
import { featuredPartners, otherPartners, partners } from './partner-data';

/**
 * Figures are counted from the roster itself, so the page can never claim a
 * number the list does not actually contain. The old hero advertised "10K+
 * community members" and "25+ shared initiatives", neither of which is
 * derivable from anything on this page.
 */
const categoryCount = new Set(partners.map((partner) => partner.category)).size;

export function PartnersHero() {
  return (
    <PageHero
      accent="purple"
      actions={
        <>
          <ActionLink href="#roster">
            Meet the partners
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ActionLink>
          <ActionLink href="/contact" variant="ghost">
            <Mail className="h-4 w-4" />
            Partner with us
          </ActionLink>
        </>
      }
      description="Communities, accelerators and founders we build alongside. Different fields, one habit: making the thing rather than talking about it."
      eyebrow="Partners"
      eyebrowIcon={Handshake}
      highlight="together"
      title="Better"
    >
      <StatStrip
        stats={[
          {
            value: String(partners.length),
            label: 'Active partnerships',
            tone: 'purple',
          },
          {
            value: String(categoryCount),
            label: 'Fields represented',
            tone: 'blue',
          },
          {
            value: String(featuredPartners.length),
            label: 'Founding collaborators',
            tone: 'orange',
          },
        ]}
      />
    </PageHero>
  );
}

export function FeaturedPartners() {
  return (
    <SectionShell
      bloom="purple"
      eyebrow="Founding collaborators"
      id="roster"
      index="01"
      subtitle="The organisations that backed this before there was much to back."
      title="Where it started"
      width="wide"
    >
      <RevealGroup className="grid gap-3 lg:grid-cols-3" stagger={0.08}>
        {featuredPartners.map((partner) => (
          <RevealItem className="h-full" key={partner.name}>
            <PartnerCard featured partner={partner} />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}

export function PartnerRoster() {
  return (
    <SectionShell
      bloom="blue"
      eyebrow="The wider network"
      index="02"
      subtitle="Student competitions, wellness platforms, beverage start-ups and a fictional corporation. The range is the point."
      title="Everyone else in the room"
      width="wide"
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.06}
      >
        {otherPartners.map((partner) => (
          <RevealItem className="h-full" key={partner.name}>
            <PartnerCard partner={partner} />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}

export function PartnersClosing() {
  return (
    <SectionShell
      bloom="purple"
      eyebrow="Get in touch"
      index="03"
      subtitle="If you are building something and the overlap is obvious, it probably is."
      title="Want to work together?"
    >
      <Reveal>
        <Panel className="flex flex-col items-center px-6 py-12 text-center sm:px-12 sm:py-16">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dynamic-purple/25 bg-dynamic-purple/10">
            <Handshake className="h-6 w-6 text-dynamic-purple" />
          </span>

          <h3 className="mt-6 max-w-lg text-balance font-display font-semibold text-2xl tracking-[-0.02em] sm:text-3xl">
            Tell us what you are building
          </h3>
          <p className="mt-4 max-w-md text-balance text-foreground/55 leading-relaxed">
            We partner with communities, universities and start-ups that want to
            make something real. No deck required.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ActionLink href="/contact">
              Start a conversation
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ActionLink>
            <ActionLink
              external
              href="https://github.com/tutur3u/platform"
              variant="ghost"
            >
              See the work
            </ActionLink>
          </div>
        </Panel>
      </Reveal>
    </SectionShell>
  );
}
