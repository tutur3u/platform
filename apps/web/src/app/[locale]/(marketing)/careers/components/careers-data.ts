import {
  Bot,
  Brain,
  Building2,
  Code2,
  Cpu,
  Database,
  Globe,
  GraduationCap,
  Heart,
  Laptop,
  Layers,
  Lightbulb,
  MapPin,
  Rocket,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from '@tuturuuu/icons/lucide';
import type { ComponentType } from 'react';
import type { SurfaceAccent } from '@/components/landing/shared/surface-card';

type Icon = ComponentType<{ className?: string }>;

export interface CareerCard {
  icon: Icon;
  title: string;
  description: string;
  accent: SurfaceAccent;
}

/** What we argue product decisions from. Mirrors the about page's beliefs. */
export const values: CareerCard[] = [
  {
    icon: Zap,
    title: 'Focus is the new superpower',
    description:
      'In a world engineered for distraction, we build technology that protects and amplifies deep work.',
    accent: 'yellow',
  },
  {
    icon: Heart,
    title: 'Technology serves humanity',
    description:
      'Software should be an extension of human will, not a cage for attention.',
    accent: 'red',
  },
  {
    icon: Shield,
    title: 'Radical transparency',
    description:
      'Open source at the core. Foundational technology should never be a black box.',
    accent: 'blue',
  },
  {
    icon: Target,
    title: 'Impact over activity',
    description:
      'Productivity is about creating value, not doing more. We free minds for breakthroughs.',
    accent: 'green',
  },
  {
    icon: Globe,
    title: 'Potential has no postcode',
    description:
      'World-class tools should be reachable from any street, village, or classroom.',
    accent: 'purple',
  },
  {
    icon: Lightbulb,
    title: 'Building the third era',
    description:
      'Moving from passive tools and attention platforms to proactive AI partners.',
    accent: 'orange',
  },
];

/** How the team actually operates day to day. */
export const culture: CareerCard[] = [
  {
    icon: Building2,
    title: 'Builders, not employees',
    description: 'Each teammate acts like a founder within their domain.',
    accent: 'blue',
  },
  {
    icon: TrendingUp,
    title: 'Pragmatic optimism',
    description: 'Bold ambition paired with rigorous execution.',
    accent: 'green',
  },
  {
    icon: Shield,
    title: 'Relentless ownership',
    description: 'Decisions come with accountability for the outcome.',
    accent: 'purple',
  },
  {
    icon: Sparkles,
    title: 'Transparency by default',
    description: 'Internal operations mirror the open-source ethos.',
    accent: 'cyan',
  },
  {
    icon: MapPin,
    title: 'Vietnam-rooted, globally ambitious',
    description: 'Building from Southeast Asia with world-class conviction.',
    accent: 'pink',
  },
  {
    icon: Rocket,
    title: 'Innovation DNA',
    description: 'We see possibilities where others see limitations.',
    accent: 'orange',
  },
];

export interface AiSystem {
  name: string;
  subtitle: string;
  description: string;
  icon: Icon;
  accent: SurfaceAccent;
  features: string[];
}

export const aiSystems: AiSystem[] = [
  {
    name: 'Mira',
    subtitle: 'The companion',
    description:
      'A proactive assistant that plans, reasons, and acts on your behalf.',
    icon: Bot,
    accent: 'pink',
    features: [
      'Natural conversations',
      'Proactive planning',
      'Cross-app context',
    ],
  },
  {
    name: 'Aurora',
    subtitle: 'Context graph engine',
    description:
      'The nervous system linking emails, tasks, files, and events into one knowledge graph.',
    icon: Cpu,
    accent: 'blue',
    features: ['Contextual intelligence', 'Smart connections', 'Data moat'],
  },
  {
    name: 'Nova',
    subtitle: 'Alignment platform',
    description:
      'The prompt-engineering forge that keeps Mira reasoning safely and effectively.',
    icon: Sparkles,
    accent: 'orange',
    features: ['Prompt evaluation', 'Safety alignment', 'Hands-on challenges'],
  },
  {
    name: 'Rewise',
    subtitle: 'Knowledge federation',
    description:
      'Federating knowledge across the workspace so answers come from what you already have.',
    icon: Database,
    accent: 'purple',
    features: ['Federated retrieval', 'Source grounding', 'Shared memory'],
  },
  {
    name: 'Crystal',
    subtitle: 'Multi-modal interface',
    description:
      'The bridge between the systems and the humans using them, in whatever form fits.',
    icon: Layers,
    accent: 'cyan',
    features: ['Multi-modal input', 'Adaptive surfaces', 'Human handoff'],
  },
  {
    name: 'The app suite',
    subtitle: 'Eighteen products',
    description:
      'Calendar, tasks, meet, chat, finance, docs, drive and the rest, sharing one context.',
    icon: Layers,
    accent: 'green',
    features: ['One workspace', 'One login', 'One bill'],
  },
];

export interface RoleArea {
  icon: Icon;
  area: string;
  description: string;
  positions: string[];
  accent: SurfaceAccent;
}

export const roles: RoleArea[] = [
  {
    icon: Code2,
    area: 'Engineering',
    description:
      'Build the intelligent OS for modern work — Aurora, Mira, and the whole application suite.',
    positions: [
      'Full-stack engineers',
      'AI/ML engineers',
      'Frontend engineers',
      'Backend engineers',
      'DevOps engineers',
    ],
    accent: 'blue',
  },
  {
    icon: Brain,
    area: 'AI and research',
    description: 'Work on Mira, Aurora context graphs, and Nova alignment.',
    positions: [
      'AI researchers',
      'Prompt engineers',
      'ML platform engineers',
      'NLP specialists',
    ],
    accent: 'purple',
  },
  {
    icon: Sparkles,
    area: 'Product and design',
    description:
      'Craft experiences that remove friction, and design how humans and AI actually collaborate.',
    positions: [
      'Product managers',
      'UX/UI designers',
      'Design engineers',
      'User researchers',
    ],
    accent: 'pink',
  },
  {
    icon: Users,
    area: 'Growth and operations',
    description:
      'Scale the impact — build the community flywheel and the operational spine under it.',
    positions: [
      'Growth marketers',
      'Community managers',
      'Operations specialists',
      'Business development',
    ],
    accent: 'green',
  },
];

export const benefits: Array<{
  icon: Icon;
  title: string;
  description: string;
}> = [
  {
    icon: Laptop,
    title: 'Flexible work',
    description:
      'Work when you are most productive. Remote-friendly, with a Vietnam hub.',
  },
  {
    icon: GraduationCap,
    title: 'Learning budget',
    description: 'Resources for courses, conferences, and growth.',
  },
  {
    icon: Heart,
    title: 'Health cover',
    description: 'Health coverage and wellness programmes.',
  },
  {
    icon: Users,
    title: 'Team events',
    description: 'Regular activities to build connections across the team.',
  },
  {
    icon: Rocket,
    title: 'Equity',
    description: 'Meaningful equity, so building it means owning part of it.',
  },
  {
    icon: Globe,
    title: 'Global reach',
    description: 'Work with people from Vietnam outward.',
  },
];

export const techStack: Array<{
  category: string;
  icon: Icon;
  technologies: string[];
  accent: SurfaceAccent;
}> = [
  {
    category: 'Frontend',
    icon: Code2,
    technologies: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
    accent: 'cyan',
  },
  {
    category: 'Backend',
    icon: Database,
    technologies: ['Supabase', 'PostgreSQL', 'Rust', 'Vercel AI SDK'],
    accent: 'green',
  },
  {
    category: 'AI/ML',
    icon: Brain,
    technologies: ['Anthropic', 'OpenAI', 'Google Gemini', 'Vercel AI SDK'],
    accent: 'purple',
  },
  {
    category: 'Infrastructure',
    icon: Layers,
    technologies: ['Vercel', 'Turborepo', 'Bun', 'Docker'],
    accent: 'blue',
  },
];
