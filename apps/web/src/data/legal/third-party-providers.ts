import {
  Bot,
  Cloud,
  CreditCard,
  Database,
  Globe,
  Mail,
  MessageSquare,
  Monitor,
  Server,
  Shield,
} from '@tuturuuu/icons';
import type { ThirdPartyCategory } from '@/components/legal/legal-types';

export const thirdPartyCategories: ThirdPartyCategory[] = [
  {
    name: 'Core Infrastructure',
    icon: Server,
    providers: [
      {
        name: 'Supabase',
        purpose: 'Database, authentication, and real-time subscriptions',
        url: 'https://supabase.com/privacy',
      },
      {
        name: 'Vercel',
        purpose: 'Application hosting, edge functions, and deployment',
        url: 'https://vercel.com/legal/privacy-policy',
      },
      {
        name: 'Upstash',
        purpose: 'Serverless Redis for rate limiting and caching',
        url: 'https://upstash.com/trust/privacy.pdf',
      },
      {
        name: 'Neon',
        purpose: 'Serverless Postgres for additional database needs',
        url: 'https://neon.tech/privacy-policy',
      },
    ],
  },
  {
    name: 'AI Providers',
    icon: Bot,
    providers: [
      {
        name: 'Google Gemini',
        purpose: 'Primary AI model provider for chat and generation',
        url: 'https://ai.google.dev/gemini-api/terms',
      },
      {
        name: 'OpenAI',
        purpose: 'Additional AI model provider',
        url: 'https://openai.com/policies/privacy-policy',
      },
      {
        name: 'Anthropic',
        purpose: 'Additional AI model provider',
        url: 'https://www.anthropic.com/legal/privacy',
      },
      {
        name: 'ElevenLabs',
        purpose: 'Text-to-speech and voice AI',
        url: 'https://elevenlabs.io/privacy-policy',
      },
      {
        name: 'Deepgram',
        purpose: 'Speech-to-text and audio processing',
        url: 'https://deepgram.com/privacy',
      },
    ],
  },
  {
    name: 'Payments',
    icon: CreditCard,
    providers: [
      {
        name: 'Polar.sh',
        purpose: 'Payment processing for subscriptions and one-time purchases',
        url: 'https://polar.sh/legal/privacy',
      },
    ],
  },
  {
    name: 'Calendar Integrations',
    icon: Globe,
    providers: [
      {
        name: 'Google Calendar API',
        purpose: 'Calendar sync and event management',
        url: 'https://policies.google.com/privacy',
      },
      {
        name: 'Microsoft Calendar',
        purpose: 'Calendar sync via Microsoft Graph API',
        url: 'https://privacy.microsoft.com/en-us/privacystatement',
      },
    ],
  },
  {
    name: 'Email',
    icon: Mail,
    providers: [
      {
        name: 'AWS SES',
        purpose: 'Transactional email delivery',
        url: 'https://aws.amazon.com/privacy/',
      },
    ],
  },
  {
    name: 'Background Jobs',
    icon: Database,
    providers: [
      {
        name: 'Trigger.dev',
        purpose: 'Background job processing and scheduling',
        url: 'https://trigger.dev/legal/privacy',
      },
    ],
  },
  {
    name: 'Compute',
    icon: Cloud,
    providers: [
      {
        name: 'Modal',
        purpose: 'Serverless compute for heavy workloads',
        url: 'https://modal.com/legal/privacy-policy',
      },
    ],
  },
  {
    name: 'Communication',
    icon: MessageSquare,
    providers: [
      {
        name: 'Discord',
        purpose: 'Community communication and bot integrations',
        url: 'https://discord.com/privacy',
      },
    ],
  },
  {
    name: 'Security',
    icon: Shield,
    providers: [
      {
        name: 'Cloudflare Turnstile',
        purpose: 'Bot detection and CAPTCHA verification',
        url: 'https://www.cloudflare.com/privacypolicy/',
      },
    ],
  },
  {
    name: 'Analytics',
    icon: Monitor,
    providers: [
      {
        name: 'Vercel Analytics',
        purpose: 'Privacy-friendly website analytics',
        url: 'https://vercel.com/legal/privacy-policy',
      },
      {
        name: 'Vercel Speed Insights',
        purpose: 'Web performance monitoring',
        url: 'https://vercel.com/legal/privacy-policy',
      },
    ],
  },
];
