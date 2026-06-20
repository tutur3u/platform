import {
  Brain,
  Clock,
  Github,
  Globe,
  Mail,
  Rocket,
  Star,
  Zap,
} from '@tuturuuu/icons/lucide';
import type { ComponentType } from 'react';
import type enMessages from '../../messages/en.json';

export type ContactMessages = (typeof enMessages)['contact'];

export const inquiryTypeValues = [
  'bug',
  'feature-request',
  'support',
  'job-application',
] as const;

export const productValues = [
  'web',
  'nova',
  'rewise',
  'calendar',
  'finance',
  'tudo',
  'tumeet',
  'shortener',
  'qr',
  'drive',
  'mail',
  'other',
] as const;

export type InquiryType = (typeof inquiryTypeValues)[number];
export type InquiryProduct = (typeof productValues)[number];

export type ContactTone =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'yellow';

export type ContactCardItem = {
  description: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  tone: ContactTone;
  value?: string;
};

export const contactToneClassNames: Record<
  ContactTone,
  {
    border: string;
    hover: string;
    icon: string;
    link: string;
    surface: string;
    symbol: string;
  }
> = {
  blue: {
    border: 'border-dynamic-blue/30',
    hover: 'hover:border-dynamic-blue/50 hover:shadow-dynamic-blue/10',
    icon: 'text-dynamic-blue',
    link: 'text-dynamic-blue hover:text-dynamic-blue/80',
    surface: 'bg-linear-to-br from-dynamic-blue/5 via-background to-background',
    symbol: 'bg-dynamic-blue/10',
  },
  cyan: {
    border: 'border-dynamic-cyan/30',
    hover: 'hover:border-dynamic-cyan/50 hover:shadow-dynamic-cyan/10',
    icon: 'text-dynamic-cyan',
    link: 'text-dynamic-cyan hover:text-dynamic-cyan/80',
    surface: 'bg-linear-to-br from-dynamic-cyan/5 via-background to-background',
    symbol: 'bg-dynamic-cyan/10',
  },
  green: {
    border: 'border-dynamic-green/30',
    hover: 'hover:border-dynamic-green/50 hover:shadow-dynamic-green/10',
    icon: 'text-dynamic-green',
    link: 'text-dynamic-green hover:text-dynamic-green/80',
    surface:
      'bg-linear-to-br from-dynamic-green/5 via-background to-background',
    symbol: 'bg-dynamic-green/10',
  },
  orange: {
    border: 'border-dynamic-orange/30',
    hover: 'hover:border-dynamic-orange/50 hover:shadow-dynamic-orange/10',
    icon: 'text-dynamic-orange',
    link: 'text-dynamic-orange hover:text-dynamic-orange/80',
    surface:
      'bg-linear-to-br from-dynamic-orange/5 via-background to-background',
    symbol: 'bg-dynamic-orange/10',
  },
  pink: {
    border: 'border-dynamic-pink/30',
    hover: 'hover:border-dynamic-pink/50 hover:shadow-dynamic-pink/10',
    icon: 'text-dynamic-pink',
    link: 'text-dynamic-pink hover:text-dynamic-pink/80',
    surface: 'bg-linear-to-br from-dynamic-pink/5 via-background to-background',
    symbol: 'bg-dynamic-pink/10',
  },
  purple: {
    border: 'border-dynamic-purple/30',
    hover: 'hover:border-dynamic-purple/50 hover:shadow-dynamic-purple/10',
    icon: 'text-dynamic-purple',
    link: 'text-dynamic-purple hover:text-dynamic-purple/80',
    surface:
      'bg-linear-to-br from-dynamic-purple/5 via-background to-background',
    symbol: 'bg-dynamic-purple/10',
  },
  yellow: {
    border: 'border-dynamic-yellow/30',
    hover: 'hover:border-dynamic-yellow/50 hover:shadow-dynamic-yellow/10',
    icon: 'text-dynamic-yellow',
    link: 'text-dynamic-yellow hover:text-dynamic-yellow/80',
    surface:
      'bg-linear-to-br from-dynamic-yellow/5 via-background to-background',
    symbol: 'bg-dynamic-yellow/10',
  },
};

export function getContactMethods(messages: ContactMessages) {
  return [
    {
      description: messages.methods.email.description,
      href: 'mailto:contact@tuturuuu.com',
      icon: Mail,
      title: messages.methods.email.title,
      tone: 'blue',
      value: 'contact@tuturuuu.com',
    },
    {
      description: messages.methods.github.description,
      href: 'https://github.com/tutur3u',
      icon: Github,
      title: messages.methods.github.title,
      tone: 'purple',
      value: 'github.com/tutur3u',
    },
    {
      description: messages.methods.support.description,
      icon: Globe,
      title: messages.methods.support.title,
      tone: 'green',
      value: messages.methods.support.value,
    },
    {
      description: messages.methods.response.description,
      icon: Clock,
      title: messages.methods.response.title,
      tone: 'orange',
      value: messages.methods.response.value,
    },
  ] satisfies ContactCardItem[];
}

export function getContactHighlights(messages: ContactMessages) {
  return [
    {
      description: messages.highlights.technical.description,
      icon: Brain,
      title: messages.highlights.technical.title,
      tone: 'cyan',
    },
    {
      description: messages.highlights.premium.description,
      icon: Star,
      title: messages.highlights.premium.title,
      tone: 'yellow',
    },
    {
      description: messages.highlights.beta.description,
      icon: Zap,
      title: messages.highlights.beta.title,
      tone: 'pink',
    },
  ] satisfies ContactCardItem[];
}

export const founderIcon = Rocket;
