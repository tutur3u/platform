import { FileText, Globe2, ShieldCheck } from '@tuturuuu/icons/lucide';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import {
  type SurfaceAccent,
  SurfaceCard,
} from '@/components/landing/shared/surface-card';

const commitments: Array<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: SurfaceAccent;
}> = [
  {
    icon: ShieldCheck,
    title: 'Responsible disclosure',
    description:
      'We work with security researchers to disclose vulnerabilities responsibly, on a timeline that protects users first.',
    accent: 'green',
  },
  {
    icon: Globe2,
    title: 'Bug bounty programme',
    description:
      'An open programme that rewards ethical hackers for finding the issues our own testing missed.',
    accent: 'blue',
  },
  {
    icon: FileText,
    title: 'Transparent communication',
    description:
      'The platform is open source, so our security practices are documented in public rather than described in a brochure.',
    accent: 'purple',
  },
];

export function TrustSection() {
  return (
    <SectionShell
      bloom="green"
      eyebrow="Commitments"
      index="03"
      subtitle="Security you cannot inspect is a promise. Ours is in the open."
      title="How we behave when it matters"
    >
      <RevealGroup className="grid gap-3 sm:grid-cols-3" stagger={0.08}>
        {commitments.map((item) => (
          <RevealItem className="h-full" key={item.title}>
            <SurfaceCard
              accent={item.accent}
              description={item.description}
              icon={item.icon}
              size="lg"
              title={item.title}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}
