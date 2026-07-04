import {
  BarChart3,
  Bot,
  Brain,
  Building2,
  Calendar,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  FileText,
  Folder,
  GitBranch,
  Globe,
  GraduationCap,
  Heart,
  Layers,
  Lightbulb,
  Lock,
  MessageSquare,
  Package,
  Rocket,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  Zap,
} from '@tuturuuu/icons/lucide';
import type { ComponentType } from 'react';
import type { Locale } from '../../lib/platform/locale';
import {
  type AboutMessages,
  getAboutMessages,
} from '../../lib/platform/messages';
import type { AboutColor } from './about-primitives';

export type AboutIcon = ComponentType<{ className?: string }>;

export type IconCardContent = {
  color: AboutColor;
  description: string;
  icon: AboutIcon;
  title: string;
};

export type FeatureCardContent = IconCardContent & { features: string[] };

export type TimelineContent = IconCardContent & {
  achievements: string[];
  period: string;
  phase: string;
};

export type AboutCopy = ReturnType<typeof createAboutCopy>;
export type AboutContent = ReturnType<typeof getAboutContent>;

export function getAboutContent(locale: Locale) {
  const messages = getAboutMessages(locale);
  const aboutCopy = createAboutCopy(messages);

  const visionCards: IconCardContent[] = [
    {
      color: 'purple',
      description: messages.vision.mission.description,
      icon: Target,
      title: messages.vision.mission.title,
    },
    {
      color: 'blue',
      description: messages.vision.vision.description,
      icon: Rocket,
      title: messages.vision.vision.title,
    },
  ];

  const coreBeliefs: IconCardContent[] = [
    {
      color: 'yellow',
      description: messages.coreBeliefs.focus.description,
      icon: Zap,
      title: messages.coreBeliefs.focus.title,
    },
    {
      color: 'red',
      description: messages.coreBeliefs.technology.description,
      icon: Heart,
      title: messages.coreBeliefs.technology.title,
    },
    {
      color: 'blue',
      description: messages.coreBeliefs.transparency.description,
      icon: Shield,
      title: messages.coreBeliefs.transparency.title,
    },
    {
      color: 'green',
      description: messages.coreBeliefs.impact.description,
      icon: Target,
      title: messages.coreBeliefs.impact.title,
    },
    {
      color: 'purple',
      description: messages.coreBeliefs.potential.description,
      icon: Globe,
      title: messages.coreBeliefs.potential.title,
    },
    {
      color: 'orange',
      description: messages.coreBeliefs.thirdEra.description,
      icon: Lightbulb,
      title: messages.coreBeliefs.thirdEra.title,
    },
  ];

  const problemCards = [
    {
      color: 'red',
      description: messages.problem.financial.description,
      icon: FileText,
      stat: messages.problem.financial.stat,
      title: messages.problem.financial.title,
    },
    {
      color: 'orange',
      description: messages.problem.cognitive.description,
      icon: Brain,
      stat: messages.problem.cognitive.stat,
      title: messages.problem.cognitive.title,
    },
    {
      color: 'yellow',
      description: messages.problem.innovation.description,
      icon: Lightbulb,
      stat: messages.problem.innovation.stat,
      title: messages.problem.innovation.title,
    },
  ] satisfies Array<IconCardContent & { stat: string }>;

  const ecosystemApps: IconCardContent[] = [
    {
      color: 'blue',
      description: messages.ecosystem.tuplan.description,
      icon: Calendar,
      title: messages.ecosystem.tuplan.name,
    },
    {
      color: 'green',
      description: messages.ecosystem.tudo.description,
      icon: CheckCircle2,
      title: messages.ecosystem.tudo.name,
    },
    {
      color: 'purple',
      description: messages.ecosystem.tumeet.description,
      icon: Users,
      title: messages.ecosystem.tumeet.name,
    },
    {
      color: 'cyan',
      description: messages.ecosystem.tuchat.description,
      icon: MessageSquare,
      title: messages.ecosystem.tuchat.name,
    },
  ];

  const aiCore = [
    {
      color: 'pink',
      icon: Bot,
      name: messages.ecosystem.aiCore.mira.name,
      role: messages.ecosystem.aiCore.mira.role,
    },
    {
      color: 'blue',
      icon: Layers,
      name: messages.ecosystem.aiCore.aurora.name,
      role: messages.ecosystem.aiCore.aurora.role,
    },
    {
      color: 'purple',
      icon: Database,
      name: messages.ecosystem.aiCore.rewise.name,
      role: messages.ecosystem.aiCore.rewise.role,
    },
    {
      color: 'orange',
      icon: Cpu,
      name: messages.ecosystem.aiCore.nova.name,
      role: messages.ecosystem.aiCore.nova.role,
    },
    {
      color: 'cyan',
      icon: Sparkles,
      name: messages.ecosystem.aiCore.crystal.name,
      role: messages.ecosystem.aiCore.crystal.role,
    },
  ] satisfies Array<{
    color: AboutColor;
    icon: AboutIcon;
    name: string;
    role: string;
  }>;

  const techStacks = [
    {
      color: 'cyan',
      icon: Code2,
      category: messages.techStack.frontend.category,
      techs: [
        messages.techStack.frontend.tech1,
        messages.techStack.frontend.tech2,
        messages.techStack.frontend.tech3,
        messages.techStack.frontend.tech4,
      ],
    },
    {
      color: 'green',
      icon: Server,
      category: messages.techStack.backend.category,
      techs: [
        messages.techStack.backend.tech1,
        messages.techStack.backend.tech2,
        messages.techStack.backend.tech3,
        messages.techStack.backend.tech4,
      ],
    },
    {
      color: 'blue',
      icon: Package,
      category: messages.techStack.infrastructure.category,
      techs: [
        messages.techStack.infrastructure.tech1,
        messages.techStack.infrastructure.tech2,
        messages.techStack.infrastructure.tech3,
        messages.techStack.infrastructure.tech4,
      ],
    },
    {
      color: 'purple',
      icon: Brain,
      category: messages.techStack.ai.category,
      techs: [
        messages.techStack.ai.tech1,
        messages.techStack.ai.tech2,
        messages.techStack.ai.tech3,
        messages.techStack.ai.tech4,
      ],
    },
  ] satisfies Array<{
    category: string;
    color: AboutColor;
    icon: AboutIcon;
    techs: string[];
  }>;

  const featureCards: FeatureCardContent[] = [
    createFeatureCard('green', Wallet, messages.features.finance),
    createFeatureCard('orange', Folder, messages.features.inventory),
    createFeatureCard('purple', GraduationCap, messages.features.learning),
    createFeatureCard('blue', BarChart3, messages.features.analytics),
    createFeatureCard('red', Lock, messages.features.security),
    createFeatureCard('cyan', GitBranch, messages.features.openSource),
  ];

  const timelineMilestones: TimelineContent[] = [
    {
      achievements: [
        messages.timeline.foundation.achievement1,
        messages.timeline.foundation.achievement2,
      ],
      color: 'yellow',
      description: messages.timeline.foundation.description,
      icon: Lightbulb,
      period: messages.timeline.foundation.period,
      phase: messages.timeline.foundation.phase,
      title: messages.timeline.foundation.title,
    },
    {
      achievements: [
        messages.timeline.building.achievement1,
        messages.timeline.building.achievement2,
        messages.timeline.building.achievement3,
        messages.timeline.building.achievement4,
      ],
      color: 'blue',
      description: messages.timeline.building.description,
      icon: Rocket,
      period: messages.timeline.building.period,
      phase: messages.timeline.building.phase,
      title: messages.timeline.building.title,
    },
    {
      achievements: [
        messages.timeline.launch.achievement1,
        messages.timeline.launch.achievement2,
      ],
      color: 'purple',
      description: messages.timeline.launch.description,
      icon: Building2,
      period: messages.timeline.launch.period,
      phase: messages.timeline.launch.phase,
      title: messages.timeline.launch.title,
    },
    {
      achievements: [
        messages.timeline.evolution.achievement1,
        messages.timeline.evolution.achievement2,
        messages.timeline.evolution.achievement3,
      ],
      color: 'pink',
      description: messages.timeline.evolution.description,
      icon: Sparkles,
      period: messages.timeline.evolution.period,
      phase: messages.timeline.evolution.phase,
      title: messages.timeline.evolution.title,
    },
  ];

  const communityStats = [
    {
      color: 'blue',
      description: messages.community.openSource.description,
      icon: Users,
      title: messages.community.openSource.title,
      value: messages.community.openSource.value,
    },
    {
      color: 'green',
      description: messages.community.contributions.description,
      icon: GitBranch,
      title: messages.community.contributions.title,
      value: messages.community.contributions.value,
    },
    {
      color: 'yellow',
      description: messages.community.milestones.description,
      icon: Trophy,
      title: messages.community.milestones.title,
      value: messages.community.milestones.value,
    },
  ] satisfies Array<IconCardContent & { value: string }>;

  const cultureValues: IconCardContent[] = [
    {
      color: 'purple',
      description: messages.community.culture.builders.description,
      icon: Settings,
      title: messages.community.culture.builders.title,
    },
    {
      color: 'purple',
      description: messages.community.culture.optimism.description,
      icon: TrendingUp,
      title: messages.community.culture.optimism.title,
    },
    {
      color: 'purple',
      description: messages.community.culture.ownership.description,
      icon: Shield,
      title: messages.community.culture.ownership.title,
    },
    {
      color: 'purple',
      description: messages.community.culture.transparency.description,
      icon: Search,
      title: messages.community.culture.transparency.title,
    },
    {
      color: 'purple',
      description: messages.community.culture.vietnam.description,
      icon: Globe,
      title: messages.community.culture.vietnam.title,
    },
    {
      color: 'purple',
      description: messages.community.culture.innovation.description,
      icon: Rocket,
      title: messages.community.culture.innovation.title,
    },
  ];

  const companyLinks = [
    {
      href: 'https://tuturuuu.com',
      icon: Globe,
      label: messages.companyInfo.links.website,
    },
    {
      href: 'https://github.com/tutur3u/platform',
      icon: Layers,
      label: messages.companyInfo.links.github,
    },
    {
      href: 'mailto:contact@tuturuuu.com',
      icon: MessageSquare,
      label: messages.companyInfo.links.contact,
    },
  ] satisfies { href: string; icon: AboutIcon; label: string }[];

  return {
    aboutCopy,
    aiCore,
    communityStats,
    companyLinks,
    coreBeliefs,
    cultureValues,
    ecosystemApps,
    featureCards,
    problemCards,
    techStacks,
    timelineMilestones,
    visionCards,
  };
}

function createFeatureCard(
  color: AboutColor,
  icon: AboutIcon,
  messages: AboutMessages['features']['finance']
): FeatureCardContent {
  return {
    color,
    description: messages.description,
    features: [messages.feature1, messages.feature2, messages.feature3],
    icon,
    title: messages.title,
  };
}

function createAboutCopy(messages: AboutMessages) {
  return {
    hero: {
      badge: messages.hero.badge,
      titlePart1: messages.hero.title.part1,
      titleHighlight: messages.hero.title.highlight,
      titlePart2: messages.hero.title.part2,
      description: messages.hero.description,
      visionCta: messages.hero.cta.vision,
      openSourceCta: messages.hero.cta.openSource,
    },
    vision: {
      titlePart1: messages.vision.title.part1,
      titleHighlight: messages.vision.title.highlight,
      subtitle: messages.vision.subtitle,
    },
    coreBeliefs: {
      titlePart1: messages.coreBeliefs.title.part1,
      titleHighlight: messages.coreBeliefs.title.highlight,
      subtitle: messages.coreBeliefs.subtitle,
    },
    problem: {
      badge: messages.problem.badge,
      titlePart1: messages.problem.title.part1,
      titleHighlight: messages.problem.title.highlight,
    },
    ecosystem: {
      titlePart1: messages.ecosystem.title.part1,
      titleHighlight: messages.ecosystem.title.highlight,
      subtitle: messages.ecosystem.subtitle,
      aiTitle: messages.ecosystem.aiCore.title,
      aiSubtitle: messages.ecosystem.aiCore.subtitle,
    },
    techStack: {
      titlePart1: messages.techStack.title.part1,
      titleHighlight: messages.techStack.title.highlight,
      subtitle: messages.techStack.subtitle,
    },
    features: {
      titlePart1: messages.features.title.part1,
      titleHighlight: messages.features.title.highlight,
      subtitle: messages.features.subtitle,
    },
    timeline: {
      titlePart1: messages.timeline.title.part1,
      titleHighlight: messages.timeline.title.highlight,
      subtitle: messages.timeline.subtitle,
    },
    community: {
      titlePart1: messages.community.title.part1,
      titleHighlight: messages.community.title.highlight,
      subtitle: messages.community.subtitle,
      cultureTitle: messages.community.culture.title,
      cultureSubtitle: messages.community.culture.subtitle,
    },
    company: {
      title: messages.companyInfo.title,
      subtitle: messages.companyInfo.subtitle,
      detailsTitle: messages.companyInfo.details.title,
      taxCode: messages.companyInfo.details.taxCode,
      taxCodeValue: messages.companyInfo.details.taxCodeValue,
      founded: messages.companyInfo.details.founded,
      foundedValue: messages.companyInfo.details.foundedValue,
      ceo: messages.companyInfo.details.ceo,
      ceoValue: messages.companyInfo.details.ceoValue,
      locationTitle: messages.companyInfo.location.title,
      address: [
        messages.companyInfo.location.address1,
        messages.companyInfo.location.address2,
        messages.companyInfo.location.address3,
        messages.companyInfo.location.address4,
      ],
    },
    cta: {
      title: messages.cta.title,
      description: messages.cta.description,
      contribute: messages.cta.contribute,
      getInTouch: messages.cta.getInTouch,
    },
  };
}
