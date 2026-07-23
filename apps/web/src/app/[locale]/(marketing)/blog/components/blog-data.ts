import {
  Brain,
  Code2,
  Globe,
  Laptop,
  Lightbulb,
  Zap,
} from '@tuturuuu/icons/lucide';
import type { ComponentType } from 'react';
import type { SurfaceAccent } from '@/components/landing/shared/surface-card';

type Icon = ComponentType<{ className?: string }>;

export const categories: Array<{
  name: string;
  icon: Icon;
  description: string;
  accent: SurfaceAccent;
}> = [
  {
    name: 'AI and technology',
    icon: Brain,
    description:
      'What we are learning building assistants that act rather than answer.',
    accent: 'purple',
  },
  {
    name: 'Engineering',
    icon: Code2,
    description:
      'How the platform is actually built, including the parts that went badly.',
    accent: 'blue',
  },
  {
    name: 'Productivity',
    icon: Zap,
    description:
      'Working out what actually protects focus, rather than what sells software.',
    accent: 'yellow',
  },
  {
    name: 'Innovation',
    icon: Lightbulb,
    description: 'Ideas we are chasing and the ones we have abandoned.',
    accent: 'orange',
  },
  {
    name: 'Business',
    icon: Globe,
    description: 'Strategy, growth, and building a company from Vietnam.',
    accent: 'green',
  },
  {
    name: 'Development',
    icon: Laptop,
    description: 'Tooling, monorepo architecture, and the workflows around it.',
    accent: 'cyan',
  },
];

/**
 * Drafts in the queue.
 *
 * The page this replaces printed a read time against each of these — "12 min
 * read" for a post nobody has written. Unwritten drafts do not have a length,
 * so the badge is gone.
 */
export const plannedPosts: Array<{
  title: string;
  category: string;
  icon: Icon;
  accent: SurfaceAccent;
}> = [
  {
    title: 'Building Mira: an assistant that plans instead of replying',
    category: 'AI and technology',
    icon: Brain,
    accent: 'purple',
  },
  {
    title: 'The third era: from passive tools to proactive partners',
    category: 'Innovation',
    icon: Lightbulb,
    accent: 'orange',
  },
  {
    title: 'Open source at scale: lessons from building Tuturuuu',
    category: 'Engineering',
    icon: Code2,
    accent: 'blue',
  },
  {
    title: 'Eliminating digital friction: a product design philosophy',
    category: 'Productivity',
    icon: Zap,
    accent: 'yellow',
  },
  {
    title: 'Building from Vietnam: world-class technology, locally made',
    category: 'Business',
    icon: Globe,
    accent: 'green',
  },
  {
    title: 'Monorepo architecture: the stack, and why each piece is there',
    category: 'Development',
    icon: Laptop,
    accent: 'cyan',
  },
];
