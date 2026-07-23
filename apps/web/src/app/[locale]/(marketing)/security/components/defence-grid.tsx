import {
  Bug,
  Eye,
  Fingerprint,
  Key,
  Server,
  Shield,
  ShieldCheck,
  UserCheck,
} from '@tuturuuu/icons/lucide';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import {
  type SurfaceAccent,
  SurfaceCard,
} from '@/components/landing/shared/surface-card';

/**
 * The controls behind the rings.
 *
 * Accents come from `SurfaceCard`'s static maps. The page this replaces built
 * them as `bg-dynamic-${feature.color}/10`, which Tailwind's scanner never
 * sees, so every card on the old grid rendered with no accent at all.
 */
const controls: Array<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: SurfaceAccent;
}> = [
  {
    icon: Shield,
    title: 'End-to-end encryption',
    description:
      'Sensitive data is encrypted in transit and at rest using industry-standard protocols.',
    accent: 'blue',
  },
  {
    icon: ShieldCheck,
    title: 'Regular security audits',
    description:
      'Continuous assessment and penetration testing to find weaknesses before anyone else does.',
    accent: 'green',
  },
  {
    icon: UserCheck,
    title: 'Access control',
    description:
      'Role-based access control and multi-factor authentication on every entry point.',
    accent: 'purple',
  },
  {
    icon: Fingerprint,
    title: 'Data privacy',
    description:
      'Strict privacy controls, built to comply with global privacy regulations and standards.',
    accent: 'cyan',
  },
  {
    icon: Key,
    title: 'Key management',
    description:
      'Keys are rotated on a schedule and reachable only under strict access policy.',
    accent: 'orange',
  },
  {
    icon: Server,
    title: 'Infrastructure security',
    description:
      'Cloud infrastructure with layered protection and redundancy at each tier.',
    accent: 'pink',
  },
  {
    icon: Eye,
    title: 'Monitoring and logging',
    description:
      'Continuous security monitoring, with system activity logged for review.',
    accent: 'yellow',
  },
  {
    icon: Bug,
    title: 'Bug bounty programme',
    description:
      'An open programme rewarding researchers who disclose vulnerabilities responsibly.',
    accent: 'red',
  },
];

export function DefenceGrid() {
  return (
    <SectionShell
      bloom="blue"
      eyebrow="Controls"
      index="01"
      subtitle="No single wall. Each control covers a different way things go wrong."
      title="Built in layers, not bolted on"
      width="wide"
    >
      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        stagger={0.05}
      >
        {controls.map((control) => (
          <RevealItem className="h-full" key={control.title}>
            <SurfaceCard
              accent={control.accent}
              description={control.description}
              icon={control.icon}
              title={control.title}
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </SectionShell>
  );
}
